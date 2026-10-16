# ACCREDIA — Backend Service

Django REST API and AI evaluation pipeline for the **ACCREDIA** AI-Assisted ETEEAP Enrollment System (Cebu Institute of Technology – University).

---

## 🧰 Tech Stack & Engines

- **Python 3.11+ / 3.12** — core language
- **Django 5.2** (`Django==5.2.14`) — web framework
- **Django REST Framework** (`djangorestframework==3.17.1`) — RESTful API layer
- **PostgreSQL / SQLite** — database (PostgreSQL via Supabase in production, SQLite or Postgres in dev)
- **Google Gemini API** (`google-genai==2.4.0`, `google-generativeai==0.8.6`) — primary LLM provider (`gemini-flash-latest`, `gemini-3.6-flash`, `gemini-pro-latest`)
- **PyMuPDF (fitz)** (`PyMuPDF==1.26.3`) — digital PDF vector text & layout extraction
- **RapidOCR ONNX Runtime** (`rapidocr-onnxruntime==1.4.4`) — high-performance OCR for scanned transcripts
- **SimpleJWT** (`djangorestframework_simplejwt==5.5.1`) — token-based authentication with role enforcement
- **django-cors-headers** (`django-cors-headers==4.9.0`) — CORS configuration

---

## 📋 Prerequisites

- **Python 3.11+** installed (`python --version`)
- **virtualenv** or Python's built-in `venv`
- A **Gemini API Key** *(optional; if omitted, the system seamlessly falls back to its local heuristic rule engine)*

---

## 🚀 Local Setup & Run

### 1. Create and Activate Virtual Environment

**Windows (PowerShell):**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```
*(If PowerShell restricts script execution, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` or activate with `.\.venv\Scripts\activate.bat` in CMD).*

**macOS / Linux:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create `.env` in `backend/`:

```env
SECRET_KEY=django-insecure-your-secret-key
DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
# For Supabase/PostgreSQL connection:
# DATABASE_URL=postgresql://user:password@host:port/dbname
SUPABASE_URL=
SUPABASE_ANON_KEY=
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run Migrations & Setup Media

```bash
python manage.py migrate
```

Create media folders:
- Windows PowerShell: `New-Item -ItemType Directory -Force -Path media\docs`
- Linux / macOS: `mkdir -p media/docs`

### 5. Start Development Server

```bash
python manage.py runserver 127.0.0.1:8000
```

- API Base: `http://localhost:8000/api/`
- Health check: `http://localhost:8000/api/`
- Django Admin: `http://localhost:8000/admin/`

---

## 🔑 AI Fallback Pipeline

The backend includes a resilient 3-tier fallback architecture:
1. **Google Gemini API (Primary):** Analyzes course syllabi, matches industry skills to BSIT competencies, and powers AccrediaBot.
2. **Emergent Fallback:** Redundant provider support.
3. **Local Heuristic Rule Engine (Offline Fallback):** Regex-based code and title similarity with unit verification. Automatically skips external AI calls if local match confidence is $\ge 90\%$.

All external AI requests are bounded by a 45-second timeout safeguard (`AI_CALL_TIMEOUT`).

---

## 🧪 Testing

```bash
python manage.py test
python tests/test_matching_verification.py
```

---

## 📖 Global Architecture

For comprehensive system architecture, database schema, and live deployment details, refer to the [Root README](../README.md).