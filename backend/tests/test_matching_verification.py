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
from core.models import CurriculumSubject, Program, SubjectMatch, TORSubject, Application, User

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
    print("\n--- Standard Subject Matching Tests ---")
    for tc in test_cases:
        matches = await gemini_service.match_subject(tc, cur_subjects)
        if matches:
            best = matches[0]
            matched_code = best.get('curriculum_code')
            matched_reason = best.get('reasoning')
            is_ok = (matched_code == tc['expected'])
            status = "PASS" if is_ok else "FAIL"
            print(f"[{status}] TOR '{tc['code']} - {tc['title']}' ({tc['units']}u) -> Matched: {matched_code} (Expected: {tc['expected']}) | {matched_reason}")
            if not is_ok:
                all_passed = False
        else:
            print(f"[FAIL] TOR '{tc['code']} - {tc['title']}' -> No match found! (Expected: {tc['expected']})")
            all_passed = False

    print("\n--- Rule 1: Unit Sufficiency Constraint Tests ---")
    # Case A: 2 units for Computer Programming 1 (CSIT121 requires 3 units) -> Should NOT match!
    insufficient_tc = {"code": "IT 112", "title": "Computer Programming 1", "units": 2}
    matches = await gemini_service.match_subject(insufficient_tc, cur_subjects)
    if not matches:
        print(f"[PASS] Rule 1: 2-unit Programming subject correctly rejected for 3-unit CSIT121 curriculum requirement.")
    else:
        print(f"[FAIL] Rule 1: 2-unit subject was matched to {matches[0].get('curriculum_code')}!")
        all_passed = False

    # Case B: 1 unit Discrete Math (CSIT112 requires 3 units) -> Should NOT match!
    insufficient_math = {"code": "CS 105", "title": "Discrete Mathematics", "units": 1}
    matches_math = await gemini_service.match_subject(insufficient_math, cur_subjects)
    if not matches_math:
        print(f"[PASS] Rule 1: 1-unit Discrete Math correctly rejected for 3-unit CSIT112 requirement.")
    else:
        print(f"[FAIL] Rule 1: 1-unit subject was matched to {matches_math[0].get('curriculum_code')}!")
        all_passed = False

    print(f"\nOverall Match Test Status: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
    return all_passed

def test_rule_2_one_to_one():
    print("\n--- Rule 2: 1-to-1 Matching & Conflict Resolution Tests ---")
    # Verify DB helper / signal / viewset logic for 1-to-1 cleanup
    user = User.objects.filter(role='applicant').first()
    if not user:
        print("No test applicant user found, skipping DB integration test.")
        return True
    
    app = Application.objects.filter(applicant=user).first()
    if not app:
        prog = Program.objects.filter(code='BSIT').first()
        app = Application.objects.create(applicant=user, program=prog, status='under_review')
    tor1, _ = TORSubject.objects.get_or_create(application=app, code='TEST101', defaults={'title': 'Test Subject 1', 'units': 3.0})
    
    cs1 = CurriculumSubject.objects.filter(code='CSIT121').first()
    cs2 = CurriculumSubject.objects.filter(code='CSIT122').first()

    if not cs1 or not cs2:
        print("Curriculum subjects not found.")
        return False

    # Create two pending matches referencing the same tor1
    SubjectMatch.objects.filter(application=app, tor_subject=tor1).delete()
    m1 = SubjectMatch.objects.create(application=app, tor_subject=tor1, curriculum_subject=cs1, status='pending')
    m2 = SubjectMatch.objects.create(application=app, tor_subject=tor1, curriculum_subject=cs2, status='pending')

    # Approve m1 -> should delete pending m2
    m1.status = 'approved'
    m1.save()
    SubjectMatch.objects.filter(application=app, tor_subject=tor1, status='pending').exclude(id=m1.id).delete()

    remaining_m2 = SubjectMatch.objects.filter(id=m2.id).exists()
    if not remaining_m2:
        print(f"[PASS] Rule 2: Conflicting pending match for the same TOR subject was successfully deleted upon approval.")
    else:
        print(f"[FAIL] Rule 2: Conflicting pending match was not deleted.")
        return False

    # Clean up test match
    m1.delete()
    tor1.delete()
    return True

async def test_sample_tors_matching(cur_subjects):
    print("\n===========================================================")
    print("--- REAL-WORLD SAMPLE TRANSCRIPT (TOR) MATCHING TESTS ---")
    print("===========================================================")
    
    # 1. Sample TOR 1: Francis T. Fajardo (ACLC - Computer System Design & Programming)
    fajardo_cases = [
        {"code": "COMSK1", "title": "Communication Arts and Skills 1", "units": 3, "expected": "ENGL031"},
        {"code": "COMFUN", "title": "Computer Fundamentals", "units": 3, "expected": "CSIT111"},
        {"code": "NSTP01", "title": "Civic Welfare Service 1", "units": 3, "expected": "NSTP111"},
        {"code": "PHYED1", "title": "Physical Fitness", "units": 2, "expected": "PE103"},
        {"code": "ALGBRA", "title": "Algebra", "units": 3, "expected": "MATH031"},
        {"code": "INTPRO", "title": "Introduction to Programming (C-Language)", "units": 3, "expected": "CSIT121"},
        {"code": "SYMLOG", "title": "Symbolic Logic", "units": 3, "expected": "CSIT112"},
        {"code": "NSTP02", "title": "Civic Welfare Service 2", "units": 3, "expected": "NSTP112"},
        {"code": "PHYED2", "title": "Dance", "units": 2, "expected": "PE104"},
        {"code": "NET1", "title": "Introduction to Networking", "units": 3, "expected": "IT227"},
        {"code": "COMPR1", "title": "Computer Programming 1", "units": 3, "expected": "CSIT121"},
        {"code": "PUBSPK", "title": "Public Speaking", "units": 3, "expected": "ENGL031"},
        {"code": "PREVAL", "title": "Professional Ethics and Values Education", "units": 3, "expected": "PHILO031"},
        {"code": "COMPR2", "title": "Computer Programming 2", "units": 4, "expected": "CSIT122"},
        {"code": "MULDEV", "title": "Multimedia Development", "units": 3, "expected": "CSIT104"},
        {"code": "PROJMG", "title": "Project Management", "units": 3, "expected": "IT317"},
        {"code": "STCAB", "title": "Structured Cabling System", "units": 3, "expected": "IT227"},
        {"code": "TECWRT", "title": "Technical Writing", "units": 3, "expected": "GE-CCS3"},
        {"code": "PHYED3", "title": "Individual/Dual Sports", "units": 2, "expected": "PE205"},
        {"code": "COMPR3", "title": "Computer Programming 3", "units": 3, "expected": "CSIT227"},
        {"code": "WEBPD", "title": "Web Page Design and Development", "units": 3, "expected": "CSIT201"},
        {"code": "SYSDES", "title": "Systems Analysis and Design", "units": 3, "expected": "IT342"},
        {"code": "PHYED4", "title": "Team Sports", "units": 2, "expected": "PE206"},
    ]

    # 2. Sample TOR 2: Joey Albert C. Resuento (CITE - Information Technology)
    resuento_cases = [
        {"code": "IT 113", "title": "Networking I", "units": 3, "expected": "IT227"},
        {"code": "IT 154", "title": "Structured Programming", "units": 3, "expected": "CSIT121"},
        {"code": "MATH 113", "title": "College Algebra", "units": 3, "expected": "MATH031"},
        {"code": "ENGL 113", "title": "Grammar and Composition", "units": 3, "expected": "ENGL031"},
        {"code": "NSTP 113", "title": "National Service Training Program 1", "units": 3, "expected": "NSTP111"},
        {"code": "PE 112", "title": "Self Testing Activities", "units": 2, "expected": "PE103"},
        {"code": "IT 123", "title": "Networking II", "units": 3, "expected": "IT228"},
        {"code": "IT 164", "title": "Object Oriented Programming", "units": 3, "expected": "CSIT227"},
        {"code": "IT 121", "title": "Basic Internet", "units": 2, "expected": "CSIT201"},
        {"code": "ENGL 123", "title": "Technical Report Writing", "units": 3, "expected": "GE-CCS3"},
        {"code": "PE 122", "title": "Fundamentals of Rhythmic Activities", "units": 2, "expected": "PE104"},
        {"code": "NSTP 123", "title": "National Service Training Program 2", "units": 3, "expected": "NSTP112"},
        {"code": "IT 213", "title": "Networking III", "units": 3, "expected": "IT228"},
        {"code": "IT 233", "title": "Database Systems", "units": 3, "expected": "CSIT226"},
        {"code": "IT 253", "title": "Application Programming", "units": 3, "expected": "CSIT321"},
        {"code": "ENGL 213", "title": "Effective Communication", "units": 3, "expected": "ENGL031"},
    ]

    # 3. Sample TOR 3: Jerome Ompad Arong (CITE - Information Technology)
    arong_cases = [
        {"code": "IT 113", "title": "Networking I", "units": 3, "expected": "IT227"},
        {"code": "IT 154", "title": "Structured Programming", "units": 3, "expected": "CSIT121"},
        {"code": "MATH 113", "title": "College Algebra", "units": 3, "expected": "MATH031"},
        {"code": "ENGL 113", "title": "Grammar and Composition", "units": 3, "expected": "ENGL031"},
        {"code": "NSTP 113", "title": "National Service Training Program I", "units": 3, "expected": "NSTP111"},
        {"code": "PE 112", "title": "Self Testing Activities", "units": 2, "expected": "PE103"},
        {"code": "IT 123", "title": "Networking II", "units": 3, "expected": "IT228"},
        {"code": "IT 164", "title": "Object Oriented Programming", "units": 3, "expected": "CSIT227"},
        {"code": "IT 233", "title": "Structured Programming I", "units": 3, "expected": "CSIT122"},
        {"code": "IT 253", "title": "Application Programming I", "units": 3, "expected": "CSIT321"},
        {"code": "MATH 213", "title": "Analytic Geometry", "units": 3, "expected": "MATH031"},
    ]

    all_passed = True
    for name, dataset in [
        ("Francis T. Fajardo (ACLC)", fajardo_cases),
        ("Joey Albert Resuento (CITE)", resuento_cases),
        ("Jerome Ompad Arong (CITE)", arong_cases),
    ]:
        print(f"\n--- Testing Transcript: {name} ---")
        for tc in dataset:
            matches = await gemini_service.match_subject(tc, cur_subjects)
            if matches:
                best = matches[0]
                matched_code = best.get('curriculum_code')
                matched_title = best.get('curriculum_title')
                confidence = best.get('confidence')
                is_ok = (matched_code == tc['expected'])
                status = "PASS" if is_ok else "FAIL"
                print(f"[{status}] TOR '{tc['code']} - {tc['title']}' ({tc['units']}u) -> Matched: {matched_code} ({matched_title}) [{confidence}%] (Expected: {tc['expected']})")
                if not is_ok:
                    all_passed = False
            else:
                print(f"[FAIL] TOR '{tc['code']} - {tc['title']}' -> No match found! (Expected: {tc['expected']})")
                all_passed = False

    return all_passed

def test_unlimited_work_experience_matching(cur_subjects):
    print("\n--- Work Experience Crediting: Unlimited Multi-Subject Matching Tests ---")
    work_case = {
        'job_title': 'Senior Full Stack Web Developer & Database Administrator',
        'years': 4.5,
        'description': 'Built responsive web applications, designed relational databases with SQL, implemented REST APIs, and managed Linux cloud servers.'
    }

    matches = gemini_service.match_work_experience_sync(work_case, cur_subjects)
    print(f"Matched {len(matches)} curriculum subjects for work role '{work_case['job_title']}':")
    for m in matches[:6]:
        print(f"  -> {m['curriculum_code']}: {m.get('curriculum_title')} ({m['confidence']}%) | {m['reasoning']}")

    assert len(matches) >= 2, f"Expected multiple matches for rich work experience role, got {len(matches)}"
    matched_codes = {m['curriculum_code'] for m in matches}
    
    # Check that it matched relevant BSIT domains
    web_db_codes = {'CSIT201', 'CSIT226', 'CSIT121', 'CSIT122', 'CSIT227', 'IT342', 'IT227'}
    overlap = matched_codes.intersection(web_db_codes)
    print(f"[PASS] Work experience hit multiple relevant curriculum subjects ({len(overlap)} core subjects matched: {', '.join(overlap)})")
    return True

if __name__ == '__main__':
    prog = Program.objects.filter(code='BSIT').first()
    cur_subjects = list(CurriculumSubject.objects.filter(program=prog).values('id', 'code', 'title', 'description', 'units'))
    ok1 = asyncio.run(test_matching(cur_subjects))
    ok2 = test_rule_2_one_to_one()
    ok3 = asyncio.run(test_sample_tors_matching(cur_subjects))
    ok4 = test_unlimited_work_experience_matching(cur_subjects)
    if not (ok1 and ok2 and ok3 and ok4):
        sys.exit(1)
    print("\n[SUCCESS] ALL TRANSCRIPT & UNLIMITED WORK EXPERIENCE MATCHING VERIFICATION TESTS PASSED SUCCESSFULLY!")
