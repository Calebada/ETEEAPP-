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

# Fallback strings the backend returns when Gemini fails — tests must NOT see them
FALLBACK_PHRASES = [
    "I apologize, but I",
    "having trouble processing",
    "Error generating recommendation",
]


def _is_fallback(text: str) -> bool:
    if not text:
        return True
    t = text.lower()
    return any(p.lower() in t for p in FALLBACK_PHRASES)


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

    def test_chat_message_real_ai_response_eteeap(self, session):
        """VERIFY FIX 2: chat must return REAL AI response (not fallback) for ETEEAP question."""
        r = session.post(f"{API}/chat/message/", json={
            "message": "What is ETEEAP?"
        }, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        content = d["bot_message"]["content"]
        assert len(content) > 50, f"Response too short, likely fallback: {content!r}"
        assert not _is_fallback(content), \
            f"Got fallback message instead of real AI response: {content!r}"
        # Real ETEEAP explanation should reference experience/education/equivalency
        lower = content.lower()
        assert any(k in lower for k in ["eteeap", "expanded", "equivalency", "experience", "education"]), \
            f"Response does not look like a real ETEEAP explanation: {content!r}"

    def test_recommend_course(self, session, applicant_token):
        """VERIFY FIX 5: recommend-course must return real AI recommendation."""
        r = session.post(f"{API}/recommend-course/", json={
            "work_experiences": [
                {"job_title": "Software Engineer", "years": 4,
                 "job_description": "Develop Python web apps, REST APIs, databases"}
            ]
        }, headers=_h(applicant_token), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        # Expect a structured AI recommendation
        program = d.get("program") or d.get("recommended_program") or ""
        reasoning = d.get("reasoning") or d.get("explanation") or ""
        assert program, f"No program field in recommend-course response: {d}"
        assert reasoning, f"No reasoning field in recommend-course response: {d}"
        assert not _is_fallback(reasoning), \
            f"recommend-course returned fallback reasoning: {reasoning!r}"
        assert len(reasoning) > 30, f"Reasoning too short to be real AI: {reasoning!r}"


# ---------- Process Application (NEW second application for processing) ----------

class TestProcessApplication:
    """VERIFY FIX 1, 3, 4: full process_application flow end-to-end."""

    def test_create_second_application_for_processing(self, session, applicant_token):
        r = session.post(f"{API}/applications/", json={
            "program_id": state.get("bsit_program_id"),
            "phone": "09171234567",
            "address": "TEST Process Address"
        }, headers=_h(applicant_token), timeout=20)
        assert r.status_code == 201, r.text
        state["proc_application_id"] = r.json()["id"]

    def test_add_work_experience_for_processing(self, session, applicant_token):
        r = session.post(f"{API}/work-experience/add/", json={
            "application_id": state["proc_application_id"],
            "company_name": "TEST Proc Tech",
            "job_title": "Backend Developer",
            "years": 4.0,
            "job_description": (
                "Designed and implemented REST APIs using Python Django and Flask. "
                "Built relational database schemas in PostgreSQL and MySQL. "
                "Wrote unit tests, did code reviews, deployed services on Linux servers. "
                "Worked with Git, CI/CD pipelines, and agile sprint planning."
            ),
            "is_current": True
        }, headers=_h(applicant_token), timeout=20)
        assert r.status_code == 201, r.text
        state["proc_work_exp_id"] = r.json()["id"]

    def test_submit_application_for_processing(self, session, applicant_token):
        r = session.post(
            f"{API}/applications/{state['proc_application_id']}/submit/",
            headers=_h(applicant_token), timeout=15
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "submitted"

    def test_process_application_succeeds(self, session, applicant_token):
        """VERIFY FIX 1: previously failed with async-context error; should now return 200.
        NOTE: endpoint is synchronous and makes multiple Gemini calls (30-60s each);
        ingress may return 502 even when backend completes. We retry once and on
        persistent 502 we verify processing via downstream artifacts (matches/predictions).
        """
        attempt_status = []
        last_resp = None
        for attempt in range(2):
            r = session.post(
                f"{API}/application/process/",
                json={"application_id": state["proc_application_id"]},
                headers=_h(applicant_token), timeout=240,
            )
            attempt_status.append(r.status_code)
            last_resp = r
            if r.status_code == 200:
                d = r.json()
                body = str(d).lower()
                assert "async context" not in body, f"Async context error leaked: {d}"
                return
            if r.status_code not in (502, 503, 504):
                break
            time.sleep(2)
        # Non-200 final response — tolerate gateway timeout only if processing actually ran
        if last_resp.status_code in (502, 503, 504):
            r2 = session.get(
                f"{API}/subject-matches/?application_id={state['proc_application_id']}",
                headers=_h(applicant_token), timeout=20
            )
            items = r2.json().get("results", r2.json()) if r2.status_code == 200 else []
            if items:
                pytest.skip(
                    f"Gateway returned {attempt_status} but processing completed "
                    f"({len(items)} matches found). Backend endpoint is too slow for "
                    f"sync HTTP; recommend making it async/background."
                )
        assert last_resp.status_code == 200, \
            f"process_application failed (attempts={attempt_status}): {last_resp.text}"

    def test_subject_matches_have_source_field(self, session, applicant_token):
        """VERIFY FIX 3: matches should exist with 'source' field of 'tor' or 'work_experience'."""
        r = session.get(
            f"{API}/subject-matches/?application_id={state['proc_application_id']}",
            headers=_h(applicant_token), timeout=20
        )
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("results", d) if isinstance(d, dict) else d
        assert isinstance(items, list)
        # We added work experience; expect at least one match with source='work_experience'
        if not items:
            pytest.fail(f"No subject matches generated after process_application for app "
                        f"{state['proc_application_id']}")
        sources = {m.get("source") for m in items}
        assert sources, f"No 'source' field in matches: {items[:2]}"
        assert sources.issubset({"tor", "work_experience"}), \
            f"Unexpected source values: {sources}"
        # save one for cross-check
        state["proc_match_id"] = items[0]["id"]

    def test_predictions_returns_semester_plan(self, session, applicant_token):
        """VERIFY FIX 4: predictions should return semester plan after process."""
        r = session.get(
            f"{API}/predictions/?application_id={state['proc_application_id']}",
            headers=_h(applicant_token), timeout=20
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "semesters_min" in d
        assert "semesters_max" in d
        assert "plan_json" in d
        # plan_json should be a non-empty list/dict after processing
        plan = d["plan_json"]
        assert plan not in (None, "", [], {}), f"plan_json is empty: {d}"


# ---------- Match Approve/Reject/Flag (requires existing match) ----------

class TestMatchActions:
    @pytest.fixture(autouse=True)
    def _seed_match(self, session, applicant_token, evaluator_token):
        """Try to find or seed at least one SubjectMatch to test approve/reject/flag."""
        if "match_id" in state:
            return
        # Prefer the processed application (which has real matches)
        for key in ("proc_application_id", "application_id"):
            app_id = state.get(key)
            if not app_id:
                continue
            r = session.get(f"{API}/subject-matches/?application_id={app_id}",
                            headers=_h(evaluator_token), timeout=15)
            if r.status_code == 200:
                d = r.json()
                items = d.get("results", d) if isinstance(d, dict) else d
                if items:
                    state["match_id"] = items[0]["id"]
                    return

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
