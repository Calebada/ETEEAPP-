# ETEEAPP — Local setup & run instructions

This document explains how to install, configure, and run the ETEEAPP system (backend + frontend) locally for development. It covers prerequisites, environment variables, backend and frontend setup, and common troubleshooting tips.

**Quick overview**
- Backend: Django REST API in `backend/` (run on port 8000 by default)
- Frontend: React app in `frontend/` (run on port 3000 by default)

---

**Prerequisites**
- Git
- Python 3.11 (recommended) or 3.10+ with virtualenv support
- Node.js 18+ (or current LTS) and npm or Yarn
- (Optional) PostgreSQL for production; SQLite works out-of-the-box for development

On Windows (PowerShell) you can check versions:

```powershell
git --version
python --version
node --version
npm --version
```

---

## Backend — setup & run

1) Create and activate a Python virtual environment

PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS / Linux (bash):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

2) Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

3) Environment variables

Create a `.env` file (or set env vars in your shell). Minimum variables the app expects:

- `SECRET_KEY` — Django secret key (development: any random string)
- `DEBUG` — `True` or `False`
- `DATABASE_URL` — optional (e.g. `sqlite:///db.sqlite3` or a Postgres URL)
- `ALLOWED_HOSTS` — comma-separated hosts for production
- `GEMINI_API_KEY` — (optional) API key for external LLM/GEMINI if used
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for Google OAuth (optional)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` — if using S3 for media
- `REACT_APP_BACKEND_URL` — base URL for frontend API calls (e.g. `http://localhost:8000`)

Example `.env` (development):

```text
SECRET_KEY=dev-secret
DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
REACT_APP_BACKEND_URL=http://localhost:8000
```

Note: On Windows PowerShell you can set env vars for the session:

```powershell
$env:REACT_APP_BACKEND_URL = 'http://localhost:8000'
```

4) Run migrations and create a superuser

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
```

5) Prepare media folders (if not present)

```powershell
mkdir backend\media
mkdir backend\media\docs
```

6) Run the development server

```bash
cd backend
python manage.py runserver 0.0.0.0:8000
```

Alternative (ASGI/uvicorn):

```bash
pip install uvicorn
uvicorn acredia.asgi:application --reload --host 0.0.0.0 --port 8000
```

7) Optional: OCR / model dependencies

The project includes OCR/LLM integration (PyMuPDF, rapidocr, onnx runtime, etc.) — these are included in `requirements.txt`. Some libraries may require system-level dependencies (Visual C++ Build Tools on Windows, or libjpeg/libpng on Linux). If you encounter installation errors, check the package docs for OS-specific prerequisites.

---

## Frontend — setup & run

1) Install Node dependencies

```bash
cd frontend
npm install    # or `yarn install`
```

2) Set frontend environment variables

Create a `.env` file in `frontend/` or set `REACT_APP_BACKEND_URL` in your shell. Example `.env`:

```text
REACT_APP_BACKEND_URL=http://localhost:8000
```

3) Run the dev server

```bash
cd frontend
npm start   # or `yarn start`
```

This runs the React app on `http://localhost:3000` by default and proxies API calls to the backend base URL you configured.

4) Build for production

```bash
npm run build
# serve the `build/` contents from your webserver or configure Django / Nginx to serve them
```

---

## Running the main workflow (developer/test)

1) Start backend (`http://localhost:8000`) and frontend (`http://localhost:3000`).
2) Create a user or use the Django admin to create an evaluator (Department Chair) user.
3) As an evaluator, create or open an application in the Evaluator Dashboard and run the AI Evaluation from the UI. Only evaluator users can run AI Evaluation and finalize accreditation — applicants will not see matches/predictions until the evaluator finalizes.

Notes:
- The application status controls visibility: applicants only see evaluation results after finalization.
- If you need sample data, run any available seed scripts in `backend/core/seed_data.py` or load fixtures if present.

---

## Common environment / DB notes

- Development uses SQLite by default (DATABASE_URL `sqlite:///db.sqlite3`). For production use Postgres and set `DATABASE_URL` accordingly.
- If switching to Postgres install `psycopg2-binary` and update `requirements.txt` if necessary.
- Keep media files out of git; add `backend/media/` to `.gitignore` (the repo currently contains some media files — consider removing them and committing the `.gitignore` change).

---

## Troubleshooting

- If `pip install` fails for heavy native packages, install Visual C++ Build Tools (Windows) or appropriate system packages (libjpeg, libpng) on Linux.
- If the frontend shows CORS errors, ensure `REACT_APP_BACKEND_URL` matches the backend origin and set CORS allowed origins in Django settings.
- If OCR/LLM endpoints fail, verify API keys (e.g. `GEMINI_API_KEY`) and ensure the environment has internet access to call external services.

---

## Useful commands (copyable)

Start backend (PowerShell):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Start frontend (bash / PowerShell):

```bash
cd frontend
npm install
npm start
```

Create superuser (one-time):

```bash
cd backend
python manage.py createsuperuser
```

---

If you'd like, I can also:
- commit this README update and push it to the repository for you,
- add a sample `.env.example` file with the suggested variables, or
- add a short troubleshooting script that validates Python/Node versions and required env vars.

---

File updated: [README.md](README.md)

