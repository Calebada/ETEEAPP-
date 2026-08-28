# ACCREDIA

**AI-Assisted ETEEAP Enrollment System**

ACCREDIA is a web-based platform developed for the **Cebu Institute of Technology – University (CIT-U)** to digitize, automate, and intelligently streamline the **Expanded Tertiary Education Equivalency and Accreditation Program (ETEEAP)** enrollment process. The system functions as an AI-powered, document-driven evaluation pipeline specifically designed for the BSIT program.

> ETEEAP allows working professionals to earn academic credit for prior education, industry experience, and life experiences. ACCREDIA automates the manual, document-heavy evaluation that this requires.

---

## 🌐 Live Deployment

The application is deployed and publicly accessible:

| Service | Type | URL |
|---------|------|-----|
| **Frontend** | Vercel (React SPA) | https://accredia-eight.vercel.app |
| **Backend API** | Render (Django) | https://accredia-backend.onrender.com |
| **Health Check** | Backend | https://accredia-backend.onrender.com/api/ |
| **Database** | Supabase PostgreSQL | *(managed via Render `DATABASE_URL` env var)* |

**Note:** The Django API has no homepage route — the root path (`/`) intentionally returns 404. The public health-check/API base is `/api/`.

---

## 💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React.js |
| **Backend** | Django (Python) |
| **Database** | Supabase / PostgreSQL |
| **AI & Parsing Engines** | Gemini API, Apache Tika, PyMuPDF, EasyOCR |

---

## 👥 Role-Based Access Control

| Role | Capabilities |
|------|--------------|
| **Applicant** | Submits personal information, Transcript of Records (TOR), work experience, and job description documents; views AI assessments; tracks application status. |
| **Evaluator (Dept. Chair)** | Accesses an AI-assisted dashboard containing document summaries and TOR-to-curriculum matching results; approves, rejects, or flags specific subject credit recommendations. |
| **Administrator** | Manages system users, BSIT curriculum data, AI matching rules, and accesses system-wide aggregate reports and audit logs. |

---

## ⚙️ Core System Modules

### Module 1: Authentication & Account Management
- Facilitates applicant self-registration with email verification.
- Enforces secure session management and role-based login routing.

### Module 2: Applicant Enrollment Portal
- Provides a guided multi-step application form with save-draft capabilities.
- Validates and processes uploads of TOR and professional documents in PDF, JPEG, or PNG formats.

### Module 3: AI Program Recommendation
- Automatically triggers text extraction (OCR/NLP) upon document upload to identify skills, job titles, and tools.
- Utilizes EasyOCR to extract course codes, grades, and units from the uploaded TOR.
- Maps extracted data against the BSIT curriculum and computes an eligibility and credit-worthiness score.

### Module 4: Evaluator Dashboard
- Presents evaluators with an AI-generated applicant summary and a subject-by-subject comparison table.
- Requires evaluators to provide written justification when rejecting an AI-suggested subject credit.
- Allows evaluators to request missing or clearer documents directly from the applicant.

### Module 5: Results & Reporting
- Generates a standardized, downloadable Evaluation Summary Report (PDF) detailing credited and rejected subjects.
- Maintains a chronological audit trail logging every system action, user ID, and timestamp.

---

## 📁 Repository Structure

```text
├── backend/    # Django REST API
├── frontend/   # React.js application
└── ...         # Supporting docs, curriculum, and test reports
```

---

## 🚀 Getting Started

This is a two-part application. To run it locally, follow the setup guides inside each folder:

- **Backend** → [`backend/README.md`](backend/README.md)
- **Frontend** → [`frontend/README.md`](frontend/README.md)

---

## 📄 License

Developed for academic use at the Cebu Institute of Technology – University.