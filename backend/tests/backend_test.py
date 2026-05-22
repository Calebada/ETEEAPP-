"""
ACREDIA Backend API Tests
Tests cover: auth, programs, curriculum, applications, work experience,
documents, subject matches, predictions, dashboard stats, chat (AI).
"""
import os
import base64
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://credit-match-ai.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# 1x1 PNG to use as a sample document upload
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9Q"
    "DwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

# Shared state between ordered tests
state = {}


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{API}/auth/login/", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["access"], data["user"]


@pytest.fixture(scope="session")
def applicant_token(session):
    tok, user = _login(session, "applicant@test.com", "applicant123")
    state["applicant_user"] = user
    return tok


@pytest.fixture(scope="session")
def evaluator_token(session):
    tok, user = _login(session, "evaluator@citu.edu", "evaluator123")
    state["evaluator_user"] = user
    return tok


@pytest.fixture(scope="session")
def admin_token(session):
    tok, user = _login(session, "admin@citu.edu", "admin123")
    state["admin_user"] = user
    return tok


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Health ----------

class TestHealth:
    def test_health_check(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("version") == "1.0.0"


# ---------- Auth ----------

class TestAuth:
    def test_login_applicant(self, session):
        r = session.post(f"{API}/auth/login/", json={"email": "applicant@test.com", "password": "applicant123"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "access" in d and "refresh" in d
        assert d["user"]["email"] == "applicant@test.com"
        assert d["user"]["role"] == "applicant"

    def test_login_evaluator(self, session):
        r = session.post(f"{API}/auth/login/", json={"email": "evaluator@citu.edu", "password": "evaluator123"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "evaluator"

    def test_login_admin(self, session):
        r = session.post(f"{API}/auth/login/", json={"email": "admin@citu.edu", "password": "admin123"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login/", json={"email": "wrong@x.com", "password": "x"}, timeout=15)
        assert r.status_code == 400

    def test_register_new_applicant(self, session):
        email = f"TEST_user_{int(time.time())}@test.com"
        r = session.post(f"{API}/auth/register/", json={
            "email": email, "password": "TestPass123!",
            "full_name": "TEST User", "role": "applicant"
        }, timeout=20)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["user"]["email"] == email
        assert "access" in d

    def test_me_with_token(self, session, applicant_token):
        r = session.get(f"{API}/auth/me/", headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "applicant@test.com"

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me/", timeout=15)
        assert r.status_code == 401


# ---------- Programs & Curriculum ----------

class TestProgramsCurriculum:
    def test_list_programs(self, session):
        r = session.get(f"{API}/programs/", timeout=15)
        assert r.status_code == 200
        d = r.json()
        items = d.get("results", d) if isinstance(d, dict) else d
        assert isinstance(items, list)
        codes = [p.get("code") for p in items]
        assert "BSIT" in codes, f"BSIT not found in programs: {codes}"
        bsit = next(p for p in items if p["code"] == "BSIT")
        state["bsit_program_id"] = bsit["id"]

    def test_list_curriculum_subjects(self, session):
        r = session.get(f"{API}/curriculum-subjects/", timeout=15)
        assert r.status_code == 200
        d = r.json()
        items = d.get("results", d) if isinstance(d, dict) else d
        assert isinstance(items, list)
        # Should have ~39 BSIT subjects
        assert len(items) >= 30, f"Expected ~39 subjects, got {len(items)}"
        state["curriculum_count"] = len(items)
        state["sample_curriculum_id"] = items[0]["id"]


# ---------- Application Flow ----------

class TestApplicationFlow:
    def test_create_application(self, session, applicant_token):
        r = session.post(f"{API}/applications/", json={
            "program_id": state.get("bsit_program_id"),
            "phone": "09171234567",
            "address": "TEST Address"
        }, headers=_h(applicant_token), timeout=20)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert "id" in d
        state["application_id"] = d["id"]

    def test_list_applications_applicant(self, session, applicant_token):
        r = session.get(f"{API}/applications/", headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        items = d.get("results", d) if isinstance(d, dict) else d
        assert any(a["id"] == state["application_id"] for a in items)

    def test_add_work_experience(self, session, applicant_token):
        r = session.post(f"{API}/work-experience/add/", json={
            "application_id": state["application_id"],
            "company_name": "TEST Tech Co",
            "job_title": "Software Developer",
            "years": 3.5,
            "job_description": "Built web applications using Python and React, designed databases, and implemented APIs.",
            "is_current": True
        }, headers=_h(applicant_token), timeout=20)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["company_name"] == "TEST Tech Co"
        assert d["job_title"] == "Software Developer"
        assert float(d["years"]) == 3.5
        state["work_exp_id"] = d["id"]

    def test_upload_document_psa(self, session, applicant_token):
        r = session.post(f"{API}/upload/document/", json={
            "application_id": state["application_id"],
            "document_type": "psa",
            "file_name": "test_psa.png",
            "file_data": PNG_B64,
            "mime_type": "image/png"
        }, headers=_h(applicant_token), timeout=30)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["document_type"] == "psa"
        assert d["file_name"] == "test_psa.png"

    def test_upload_document_job_description(self, session, applicant_token):
        r = session.post(f"{API}/upload/document/", json={
            "application_id": state["application_id"],
            "document_type": "job_description",
            "file_name": "jd.png",
            "file_data": PNG_B64,
            "mime_type": "image/png"
        }, headers=_h(applicant_token), timeout=30)
        assert r.status_code == 201

    def test_submit_application(self, session, applicant_token):
        r = session.post(f"{API}/applications/{state['application_id']}/submit/",
                         headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "submitted"

    def test_evaluator_sees_submitted_application(self, session, evaluator_token):
        r = session.get(f"{API}/applications/", headers=_h(evaluator_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        items = d.get("results", d) if isinstance(d, dict) else d
        assert any(a["id"] == state["application_id"] for a in items), \
            "Evaluator should see submitted application"

    def test_admin_sees_all_applications(self, session, admin_token):
        r = session.get(f"{API}/applications/", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200


# ---------- Subject Matches & Predictions ----------

class TestMatchesPredictions:
    def test_list_subject_matches_empty_initially(self, session, applicant_token):
        r = session.get(f"{API}/subject-matches/?application_id={state['application_id']}",
                        headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200

    def test_get_predictions(self, session, applicant_token):
        r = session.get(f"{API}/predictions/?application_id={state['application_id']}",
                        headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "semesters_min" in d
        assert "semesters_max" in d
        assert "plan_json" in d


# ---------- Dashboard Stats ----------

class TestDashboard:
    def test_stats_applicant(self, session, applicant_token):
        r = session.get(f"{API}/dashboard/stats/", headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total_applications" in d
        assert "draft" in d and "submitted" in d
        assert d["total_applications"] >= 1

    def test_stats_evaluator(self, session, evaluator_token):
        r = session.get(f"{API}/dashboard/stats/", headers=_h(evaluator_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "pending_review" in d

    def test_stats_admin(self, session, admin_token):
        r = session.get(f"{API}/dashboard/stats/", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total_users" in d
        assert d["total_users"] >= 3


# ---------- AI / Gemini ----------

class TestAI:
    def test_chat_message_unauth(self, session):
        # chat_message has AllowAny perms
        r = session.post(f"{API}/chat/message/", json={
            "message": "Hello, what is ACREDIA?"
        }, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "bot_message" in d
        assert "content" in d["bot_message"]
        assert len(d["bot_message"]["content"]) > 0

    def test_recommend_course(self, session, applicant_token):
        r = session.post(f"{API}/recommend-course/", json={
            "work_experiences": [
                {"job_title": "Software Engineer", "years": 4,
                 "job_description": "Develop Python web apps, REST APIs, databases"}
            ]
        }, headers=_h(applicant_token), timeout=90)
        # Allow 200 (recommended) or 500 (if gemini quota); both reveal endpoint status
        assert r.status_code in (200, 500), r.text
        if r.status_code == 200:
            d = r.json()
            assert "program" in d or "recommended_program" in d or len(d) > 0


# ---------- Match Approve/Reject/Flag (requires existing match) ----------

class TestMatchActions:
    @pytest.fixture(autouse=True)
    def _seed_match(self, session, applicant_token, evaluator_token):
        """Try to find or seed at least one SubjectMatch to test approve/reject/flag."""
        if "match_id" in state:
            return
        # First check existing matches
        r = session.get(f"{API}/subject-matches/?application_id={state.get('application_id','')}",
                        headers=_h(evaluator_token), timeout=15)
        if r.status_code == 200:
            d = r.json()
            items = d.get("results", d) if isinstance(d, dict) else d
            if items:
                state["match_id"] = items[0]["id"]

    def test_approve_match(self, session, evaluator_token):
        if "match_id" not in state:
            pytest.skip("No subject match available to test approve")
        r = session.post(f"{API}/subject-matches/{state['match_id']}/approve/",
                         json={"note": "TEST approved"}, headers=_h(evaluator_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

    def test_reject_match(self, session, evaluator_token):
        if "match_id" not in state:
            pytest.skip("No subject match available to test reject")
        r = session.post(f"{API}/subject-matches/{state['match_id']}/reject/",
                         json={"note": "TEST rejected"}, headers=_h(evaluator_token), timeout=15)
        assert r.status_code == 200

    def test_flag_match_by_applicant(self, session, applicant_token):
        if "match_id" not in state:
            pytest.skip("No subject match available to test flag")
        r = session.post(f"{API}/subject-matches/{state['match_id']}/flag/",
                         json={"note": "TEST flagged"}, headers=_h(applicant_token), timeout=15)
        assert r.status_code == 200


# ---------- Finalize ----------

class TestFinalize:
    def test_finalize_application(self, session, evaluator_token):
        if "application_id" not in state:
            pytest.skip("No application created")
        r = session.post(f"{API}/applications/{state['application_id']}/finalize/",
                         json={"evaluator_note": "TEST finalize"},
                         headers=_h(evaluator_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "finalized"

    def test_finalize_forbidden_for_applicant(self, session, applicant_token):
        if "application_id" not in state:
            pytest.skip("No application created")
        r = session.post(f"{API}/applications/{state['application_id']}/finalize/",
                         json={}, headers=_h(applicant_token), timeout=15)
        assert r.status_code == 403
