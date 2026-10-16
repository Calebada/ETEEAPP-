# ACCREDIA

**AI-Assisted ETEEAP Enrollment & Credit Evaluation System**  
Developed for the **Cebu Institute of Technology – University (CIT-U)**

---

## 📖 Overview

**ACCREDIA** is an enterprise-grade, web-based platform developed for the **Cebu Institute of Technology – University (CIT-U)** to digitize, automate, and streamline the **Expanded Tertiary Education Equivalency and Accreditation Program (ETEEAP)** evaluation and enrollment pipeline, specifically tailored for the **Bachelor of Science in Information Technology (BSIT)** curriculum.

> **What is ETEEAP?**  
> Under Philippine Republic Act No. 7722 and CHED directives, the ETEEAP allows non-degree holding working professionals with substantial industry experience (minimum 5 years) to convert prior learning, employment experience, and non-formal training into equivalent academic credits toward a bachelor's degree. ACCREDIA automates the traditionally manual, multi-week document evaluation pipeline into an automated, AI-assisted workflow.

---

## 🌐 Live Deployment

The system is deployed and publicly accessible in production:

| Service | Host / Platform | URL | Notes |
|:---|:---|:---|:---|
| **Frontend Web App** | Vercel | [https://accredia-eight.vercel.app](https://accredia-eight.vercel.app) | React SPA with client-side routing |
| **Backend API** | Render | [https://accredia-backend.onrender.com](https://accredia-backend.onrender.com) | Django REST Framework API |
| **API Health Check** | Render | [https://accredia-backend.onrender.com/api/](https://accredia-backend.onrender.com/api/) | Returns status & version |
| **Database** | Supabase | *AWS AP-Northeast (PostgreSQL 15)* | Connection pooling via port 6543 |

> **Note on Backend Routing:** The Django REST API root path (`/`) intentionally returns a `404` or redirects. The public API base and health-check endpoint is `/api/`.

---

## 🏗️ System Architecture

ACCREDIA is structured as a decoupled, multi-tier microservices-ready client-server architecture:

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Presentation Layer (React 19)"]
        A1["Applicant Portal\n(Application Wizard & Tracking)"]
        A2["Department Chair Dashboard\n(Evaluation & Override Matrix)"]
        A3["Admin Portal\n(Curriculum & User Management)"]
        A4["AccrediaBot\n(AI Guidance Widget)"]
    end

    subgraph APILayer ["API & Business Logic (Django 5.2 / DRF)"]
        B1["JWT Auth & RBAC Guard"]
        B2["Document Upload & Storage Service"]
        B3["Text & Table Extraction Pipeline\n(PyMuPDF + RapidOCR / EasyOCR)"]
        B4["AI Matching & Recommendation Service"]
        B5["Prediction & Study Plan Engine"]
        B6["Report Generation (PDF Engine)"]
    end

    subgraph AIEngine ["AI & Parsing Services"]
        C1["Google Gemini Flash / Pro\n(Semantic Subject & Skill Matching)"]
        C2["PyMuPDF / Fitz\n(High-Accuracy PDF Parsing)"]
        C3["RapidOCR ONNX Runtime\n(Scanned Transcript OCR)"]
        C4["Local Heuristic Rule Engine\n(Fallback & 90%+ Confidence Fast-Path)"]
    end

    subgraph DataLayer ["Persistence & Storage"]
        D1[("Supabase PostgreSQL\n(Core Schema, 12 Relational Tables)")]
        D2[("Media Storage\n(TORs, PSA, Portfolios, Certs)")]
    end

    ClientLayer <-->|REST API / JSON / HTTPS| APILayer
    APILayer --> B3
    B3 <--> AIEngine
    APILayer <--> D1
    B2 <--> D2
```

---

## 💻 Tech Stack & Software Languages

### 1. Frontend
- **Language:** JavaScript (ES6+), HTML5, CSS3
- **Framework:** React 19 (`react: ^19.0.0`, `react-dom: ^19.0.0`)
- **Routing:** React Router DOM v7 (`^7.5.1`)
- **Styling & Design System:** Tailwind CSS 3 (`^3.4.17`), `@tailwindcss-animate`
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/) built upon Radix UI primitives (`@radix-ui/react-*`)
- **Icons & Visuals:** Lucide React (`^0.507.0`), Recharts (`^3.6.0`)
- **Document Generation:** jsPDF (`^4.2.1`)
- **HTTP Client:** Axios (`^1.8.4`)
- **Build Tooling:** Create React App with CRACO (`@craco/craco: ^7.1.0`)
- **Color Identity:** CIT-U Maroon (`#7a1e2b`) and Gold (`#d4a747`)

### 2. Backend
- **Language:** Python 3.11+ / Python 3.12
- **Framework:** Django 5.2 (`Django==5.2.14`)
- **API Framework:** Django REST Framework (`djangorestframework==3.17.1`)
- **Authentication:** SimpleJWT (`djangorestframework_simplejwt==5.5.1`) with custom User model
- **CORS Handling:** django-cors-headers (`django-cors-headers==4.9.0`)
- **Database Driver:** `psycopg2-binary==2.9.12`
- **Async Bridging:** `asgiref==3.11.1`

### 3. AI Models & Extraction Engines
- **Primary AI Provider:** Google Gemini API via official SDK (`google-genai==2.4.0` / `google-generativeai==0.8.6`)
  - **Models Utilized:** `gemini-flash-latest`, `gemini-3.6-flash`, `gemini-pro-latest`
  - **Tasks:** TOR course syllabus matching, work experience skill extraction, degree recommendation, chatbot assistance
- **Document Text Extraction:** PyMuPDF (`PyMuPDF==1.26.3`) for digital vector text extraction
- **OCR Engine:** RapidOCR ONNX (`rapidocr-onnxruntime==1.4.4`) / EasyOCR for scanned image and low-DPI PDF transcripts
- **Multi-Tier Fallback:** 
  1. Google Gemini API (with 45s execution timeouts)
  2. Emergent Key Fallback (production redundancy)
  3. Local Regex/Keyword heuristic matching (guarantees 100% system uptime when offline or when local similarity is $\ge 90\%$)

### 4. Database & Infrastructure
- **Production Database:** Supabase Hosted PostgreSQL 15 (AWS Asia Pacific Northeast)
- **Local Database:** PostgreSQL or SQLite 3 (`db.sqlite3`)
- **Frontend Hosting:** Vercel (Edge Network with SPA Rewrites)
- **Backend Hosting:** Render Web Service (Linux container environment)

---

## 👥 Role-Based Access Control (RBAC)

The system enforces three distinct authorization tiers:

| Role | Permissions & Capabilities |
|:---|:---|
| **Applicant** | • Completes 4-step ETEEAP enrollment application wizard.<br>• Uploads TOR, PSA birth certificate, certificate of employment, and job descriptions.<br>• Receives AI-recommended program and view matching results.<br>• Tracks evaluation status and downloads official Evaluation Summary PDF.<br>• Interacts with AccrediaBot for enrollment guidance. |
| **Evaluator**<br>*(Dept. Chair)* | • Accesses Department Chair Evaluation Dashboard.<br>• Reviews pending applications side-by-side with submitted evidence documents.<br>• Approves, rejects, reconsiders, or overrides AI-recommended subject credits.<br>• Performs manual course matching and credits subjects directly from work experience.<br>• Disregards non-creditable transcript subjects with audit notes.<br>• Finalizes or rejects applications with written endorsement remarks. |
| **Administrator** | • Monitors institution-wide enrollment statistics and application distributions.<br>• Manages CIT-U BSIT 2023–2024 curriculum subjects (50 subjects, 151 units).<br>• Administers user accounts, roles, audit trails, and system health. |

---

## ⚖️ Core Academic Rules & Evaluation Logic

ACCREDIA enforces CHED and CIT-U institutional policies programmatically:

1. **Unit Sufficiency Rule (Rule 1):**  
   An applicant's prior transcript course cannot be credited against a BSIT curriculum course if the applicant's course has fewer units than the required BSIT subject (e.g., a 2-unit Programming course cannot credit a 3-unit BSIT course).
2. **Strict 1-to-1 Transcript Matching (Rule 2):**  
   A single TOR subject cannot be matched or credited to more than one BSIT curriculum subject. When a match is approved or overridden, conflicting pending matches for that TOR subject are automatically cleared.
3. **Unlimited Work Experience Crediting (Rule 3):**  
   Unlike transcript courses, a comprehensive professional work experience role (e.g., Senior Full-Stack Developer for 5 years) can match and credit multiple distinct BSIT subjects.
4. **Semester Study Plan Maximum (Rule 4):**  
   The prediction engine calculates remaining uncredited courses and arranges them into semester schedules capped at **21 academic units per semester**, respecting course prerequisites.

---

## 📁 Repository Structure

```text
ETEEAPP-/
├── backend/                       # Django REST API application
│   ├── accredia/                  # Project configuration (settings, urls, wsgi)
│   ├── core/                      # Main application logic
│   │   ├── models.py              # 12 Database models (User, Application, SubjectMatch, etc.)
│   │   ├── views.py               # ViewSets & API controllers
│   │   ├── upload_views.py        # File upload & document processing endpoints
│   │   ├── gemini_service.py      # Multi-tier Gemini AI & heuristic matching engine
│   │   ├── serializers.py         # DRF serializers
│   │   └── ocr_engine.py          # PyMuPDF and RapidOCR pipeline
│   ├── media/                     # Uploaded documents and media files
│   ├── tests/                     # Backend test suite
│   ├── manage.py                  # Django CLI runner
│   ├── requirements.txt           # Python dependencies
│   └── README.md                  # Backend-specific instructions
│
├── frontend/                      # React 19 Single Page Application
│   ├── public/                    # Static assets & index.html
│   ├── src/
│   │   ├── components/            # Reusable UI components & modals
│   │   ├── pages/                 # Route pages (Landing, Login, Dashboard, Review, etc.)
│   │   ├── lib/                   # API client (Axios) and utility functions
│   │   ├── App.js                 # Main router configuration
│   │   └── index.css              # Global styles & Tailwind directives
│   ├── craco.config.js            # CRACO build customization
│   ├── tailwind.config.js         # CIT-U theme & Tailwind configuration
│   ├── package.json               # NPM packages & scripts
│   ├── vercel.json                # Vercel deployment rewrites
│   └── README.md                  # Frontend-specific instructions
│
├── BSIT Curriculum/               # CIT-U Official BSIT Prospectus files
├── docs/                          # Architecture & design documentation
├── test_reports/                  # Automated verification logs
└── README.md                      # Root system documentation (this file)
```

---

## 🚀 Local Development Setup

To run ACCREDIA on your local machine, follow the steps below.

### Prerequisites

| Tool | Minimum Version | Check Command |
|:---|:---|:---|
| **Python** | 3.11+ (3.12 recommended) | `python --version` |
| **Node.js** | 18.0+ (20+ recommended) | `node -v` |
| **npm** | 9.0+ | `npm -v` *(or `npm.cmd -v` on Windows)* |
| **Git** | 2.30+ | `git --version` |

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Calebada/ETEEAPP-.git
cd ETEEAPP-
```

---

### Step 2: Backend Setup (Django API)

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   - **Windows (PowerShell):**
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
     *(If PowerShell blocks script execution, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` or activate using `.\.venv\Scripts\activate.bat` in CMD).*
   - **macOS / Linux:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. **Install Python dependencies:**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables:**  
   Create a `.env` file inside `backend/` (or copy from `.env.example` if present):
   ```env
   SECRET_KEY=your-django-secret-key-here
   DEBUG=True
   DATABASE_URL=sqlite:///db.sqlite3
   # Optional: For production Postgres or Supabase connection:
   # DATABASE_URL=postgresql://user:password@host:port/dbname
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Note: The system functions even without a Gemini API key by utilizing its built-in rule-based heuristic matching engine).*

5. **Run database migrations and seed data:**
   ```bash
   python manage.py migrate
   ```
   *(Optional) Create an administrative superuser:*
   ```bash
   python manage.py createsuperuser
   ```

6. **Create required media directories:**
   - Windows:
     ```powershell
     New-Item -ItemType Directory -Force -Path media\docs
     ```
   - Linux/macOS:
     ```bash
     mkdir -p media/docs
     ```

7. **Start the Django backend server:**
   ```bash
   python manage.py runserver 127.0.0.1:8000
   ```
   *The backend will be running at `http://localhost:8000/api/`.*

---

### Step 3: Frontend Setup (React Application)

Open a **new terminal window** in the project root:

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install Node packages:**
   - Windows PowerShell (if execution policy prevents running `.ps1` scripts, use `npm.cmd`):
     ```powershell
     npm.cmd install
     ```
   - macOS / Linux:
     ```bash
     npm install
     ```
   *(Note: The committed `.npmrc` sets `legacy-peer-deps=true` to ensure clean compatibility with React 19).*

3. **Configure Frontend Environment Variables:**  
   Create or verify `frontend/.env`:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8000
   ```

4. **Start the React development server:**
   - Windows:
     ```powershell
     $env:BROWSER="none"; npm.cmd start
     ```
   - macOS / Linux:
     ```bash
     BROWSER=none npm start
     ```
   *The frontend application will compile and open at `http://localhost:3000`.*

---

## 🧪 Testing

To run backend automated verification tests:

```bash
cd backend
python manage.py test
```

To run individual extraction and matching unit tests:
```bash
python tests/test_matching_verification.py
```

---

## 🌐 Production Deployment Guide

### Deploying the Backend on Render
1. Create a new **Web Service** on [Render](https://render.com) connected to the GitHub repository.
2. Set **Root Directory** to `backend`.
3. Set **Runtime** to `Python 3`.
4. **Build Command:**
   ```bash
   pip install -r requirements.txt && python manage.py migrate
   ```
5. **Start Command:**
   ```bash
   python manage.py runserver 0.0.0.0:$PORT
   ```
   *(or with Gunicorn: `gunicorn accredia.wsgi:application --bind 0.0.0.0:$PORT`).*
6. **Environment Variables:**
   - `SECRET_KEY`: Random 50+ character string
   - `DEBUG`: `False`
   - `ALLOWED_HOSTS`: `accredia-backend.onrender.com,localhost,127.0.0.1`
   - `DATABASE_URL`: Your Supabase PostgreSQL connection string
   - `GEMINI_API_KEY`: Valid Google Gemini API Key

### Deploying the Frontend on Vercel
1. Import the repository on [Vercel](https://vercel.com).
2. Set **Framework Preset** to `Create React App`.
3. Set **Root Directory** to `frontend`.
4. **Build Command:** `npm run build`
5. **Output Directory:** `build`
6. Add the environment variable:
   - `REACT_APP_BACKEND_URL`: `https://accredia-backend.onrender.com`
7. Deploy. Deep links (e.g. `/evaluator/dashboard`, `/login`) are automatically handled by the committed `vercel.json` SPA rewrite rules.

---

## 📄 License & Attribution

Developed for academic equivalency evaluation at the **Cebu Institute of Technology – University (CIT-U)**.  
All curriculum data, subject codes, and institutional branding belong to CIT-University.