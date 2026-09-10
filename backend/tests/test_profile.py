import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accredia.settings')
django.setup()

from django.test import RequestFactory
from rest_framework.test import force_authenticate
from core.models import User
from core.views import me, change_password

def run_profile_tests():
    print("--- Running Profile & Password Management Tests ---")
    factory = RequestFactory()

    # 1. Create or retrieve test user
    user, _ = User.objects.get_or_create(
        email='test_profile_user@citu.edu',
        defaults={'full_name': 'Original Full Name', 'role': 'applicant'}
    )
    user.set_password('OldPassword123!')
    user.full_name = 'Original Full Name'
    user.save()

    # 2. Test GET /auth/me/
    get_req = factory.get('/api/auth/me/')
    force_authenticate(get_req, user=user)
    get_res = me(get_req)
    assert get_res.status_code == 200, f"GET me failed: {get_res.data}"
    assert get_res.data['full_name'] == 'Original Full Name'
    print("[PASS] GET /api/auth/me/ returned user details.")

    # 3. Test PATCH /auth/profile/ (Change Full Name)
    patch_req = factory.patch(
        '/api/auth/profile/',
        data={'full_name': 'Dr. Juan Dela Cruz, PhD'},
        content_type='application/json'
    )
    force_authenticate(patch_req, user=user)
    patch_res = me(patch_req)
    assert patch_res.status_code == 200, f"PATCH profile failed: {patch_res.data}"
    user.refresh_from_db()
    assert user.full_name == 'Dr. Juan Dela Cruz, PhD'
    print(f"[PASS] PATCH /api/auth/profile/ updated full name to: '{user.full_name}'.")

    # 4. Test POST /auth/change-password/ with wrong current password -> Should fail
    wrong_pw_req = factory.post(
        '/api/auth/change-password/',
        data={
            'current_password': 'IncorrectPassword!',
            'new_password': 'NewPassword123!',
            'confirm_password': 'NewPassword123!'
        },
        content_type='application/json'
    )
    force_authenticate(wrong_pw_req, user=user)
    wrong_pw_res = change_password(wrong_pw_req)
    assert wrong_pw_res.status_code == 400, f"Expected 400 for incorrect password: {wrong_pw_res.data}"
    print("[PASS] POST /api/auth/change-password/ rejected invalid current password.")

    # 5. Test POST /auth/change-password/ with valid credentials -> Should succeed
    valid_pw_req = factory.post(
        '/api/auth/change-password/',
        data={
            'current_password': 'OldPassword123!',
            'new_password': 'NewPassword123!',
            'confirm_password': 'NewPassword123!'
        },
        content_type='application/json'
    )
    force_authenticate(valid_pw_req, user=user)
    valid_pw_res = change_password(valid_pw_req)
    assert valid_pw_res.status_code == 200, f"Password change failed: {valid_pw_res.data}"
    assert 'access' in valid_pw_res.data and 'refresh' in valid_pw_res.data
    user.refresh_from_db()
    assert user.check_password('NewPassword123!')
    assert not user.check_password('OldPassword123!')
    print("[PASS] POST /api/auth/change-password/ successfully updated password and returned new tokens.")

    # Cleanup test user
    user.delete()
    print("\n[SUCCESS] ALL PROFILE & PASSWORD MANAGEMENT TESTS PASSED CLEANLY!")
    return True

if __name__ == '__main__':
    run_profile_tests()
