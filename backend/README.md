# ACCREDIA — Backend

Django REST API for the **ACCREDIA** AI-Assisted ETEEAP Enrollment System (CIT Institute).

---

## 🧰 Tech Stack

- **Django 5.2** — web framework
- **Django REST Framework** — API
- **PostgreSQL / SQLite** — database (Postgres recommended for production)
- **Gemini API** — primary AI provider
- **PyMuPDF, RapidOCR / EasyOCR** — document text extraction
- **SimpleJWT** — authentication

---

## 📋 Prerequisites

- **Python 3.11+** (3.12 recommended)
- **virtualenv** support
- A **Gemini API key** *(optional)* — AI features work without it using local fallback logic

Check your version:

```powershell
python --version
```

---

## 🚀 Setup & Run

### 1. Create and activate a virtual environment

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux (bash):**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> On Windows, some native packages may require **Visual C++ Build Tools**. On Linux, ensure `libjpeg` / `libpng` dev libraries are installed.

### 3. Configure environment variables

Copy the example file:

```powershell
copy .env.example .env
```

Then fill in your values:

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Django secret key (any random string in dev) |
| `DEBUG` | `True` for development, `False` for production |
| `DATABASE_URL` | e.g. `sqlite:///db.sqlite3` or a Postgres URL |
| `GEMINI_API_KEY` | Gemini AI key (optional; enables AI features) |
| `ALLOWED_HOSTS` | Comma-separated hosts for production |
| `REACT_APP_BACKEND_URL` | Frontend API base URL |

### 4. Run migrations and create a superuser

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
```

### 5. Prepare media folders

```powershell
mkdir backend\media
mkdir backend\media\docs
```

### 6. Start the development server

```bash
cd backend
python manage.py runserver 0.0.0.0:8000
```

API is served at `http://localhost:8000/api/` and the admin panel at `http://localhost:8000/admin/`.

---

## 🔑 AI Provider Stack

1. **Gemini (primary)** — uses `GEMINI_API_KEY`
2. **Emergent (fallback)** — uses `EMERGENT_LLM_KEY` *(if installed)*
3. **Local logic (last resort)** — regex/keyword matching (no key needed)

Safeguards are built in: a 45-second timeout on every AI call (`AI_CALL_TIMEOUT`), and AI is skipped entirely when local matching is ≥90% confident (`LOCAL_MATCH_SKIP_AI_THRESHOLD`).

---

## 🧪 Tests

```bash
cd backend
python manage.py test
```

---

## 📁 Notes

- Development defaults to SQLite; production should use PostgreSQL with `psycopg2-binary`.
- Full project overview and architecture live in the **root [`README.md`](../README.md)**.