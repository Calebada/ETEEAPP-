import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import django
import asyncio

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accredia.settings')
django.setup()

from core.gemini_service import gemini_service
from core.models import CurriculumSubject, Program

async def test_matching(cur_subjects):
    print(f"Total Curriculum Subjects loaded: {len(cur_subjects)}")

    test_cases = [
        {"code": "IT 112", "title": "Computer Programming 1", "units": 3, "expected": "CSIT121"},
        {"code": "CS 102", "title": "Intermediate Programming", "units": 3, "expected": "CSIT122"},
        {"code": "CS 201", "title": "Object-Oriented Programming", "units": 3, "expected": "CSIT227"},
        {"code": "MATH 101", "title": "College Algebra", "units": 3, "expected": "MATH031"},
        {"code": "IT 204", "title": "Data Communications and Networking", "units": 3, "expected": "IT227"},
        {"code": "IT 301", "title": "Systems Analysis and Design", "units": 3, "expected": "IT342"},
        {"code": "CS 105", "title": "Discrete Mathematics", "units": 3, "expected": "CSIT112"},
        {"code": "IT 101", "title": "PC Hardware and Troubleshooting", "units": 3, "expected": "CS132"},
        {"code": "WEB 101", "title": "Web Page Design and Development", "units": 3, "expected": "CSIT201"},
        {"code": "DB 201", "title": "Database Management Systems", "units": 3, "expected": "CSIT226"},
    ]

    all_passed = True
    for tc in test_cases:
        matches = await gemini_service.match_subject(tc, cur_subjects)
        if matches:
            best = matches[0]
            matched_code = best.get('curriculum_code')
            matched_reason = best.get('reasoning')
            is_ok = (matched_code == tc['expected'])
            status = "PASS" if is_ok else "FAIL"
            print(f"[{status}] TOR '{tc['code']} - {tc['title']}' -> Matched: {matched_code} (Expected: {tc['expected']}) | {matched_reason}")
            if not is_ok:
                all_passed = False
        else:
            print(f"[FAIL] TOR '{tc['code']} - {tc['title']}' -> No match found! (Expected: {tc['expected']})")
            all_passed = False

    print(f"\nOverall Match Test Status: {'ALL PASSED' if all_passed else 'SOME FAILED'}")

if __name__ == '__main__':
    prog = Program.objects.filter(code='BSIT').first()
    cur_subjects = list(CurriculumSubject.objects.filter(program=prog).values('id', 'code', 'title', 'description', 'units'))
    asyncio.run(test_matching(cur_subjects))
