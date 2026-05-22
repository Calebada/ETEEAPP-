# ACREDIA - CIT-U AI Credit Evaluation System

## Original Problem Statement
Build ACREDIA, a CIT-University AI-powered credit evaluation system for ETEEAP (Expanded Tertiary Education Equivalency and Accreditation Program) with:
- **Frontend**: React.js (Vite-style with create-react-app)
- **Backend**: Django Python with REST framework
- **Database**: Supabase PostgreSQL
- **AI**: Gemini 3 Pro for OCR, subject matching, and chatbot
- **Auth**: JWT + Custom Google OAuth
- **Design**: CIT-U Maroon (#7a1e2b) + Gold (#d4a747), Playfair Display + Inter

## User Personas

### 1. Applicant (Working Professional)
- Submits ETEEAP application
- Inputs work experience with years and job descriptions
- Uploads TOR, PSA, Job Description, Certificates
- Receives AI-recommended program based on work experience
- Views evaluation results with color-coded matches
- Downloads accreditation report
- Chats with AcrediaBot for help

### 2. Department Chair (Evaluator role)
- Reviews submitted applications queue
- Sees applicant info, documents, work experience side-by-side
- Validates AI-generated subject matches (TOR + Work Experience)
- Approves/Rejects/Overrides individual matches
- Re-runs AI evaluation if needed
- Finalizes accreditation with notes
- Rejects applications with reason

### 3. Administrator
- Views system-wide stats (users, applications)
- Manages all applications across the institution
- Views BSIT curriculum (50 subjects, 151 units)
- Monitors user roles distribution

## Architecture

### Database Schema (PostgreSQL via Supabase)
1. **users** - Custom Django auth user with role enum (applicant/evaluator/admin)
2. **programs** - BSIT, BSCS, etc.
3. **curriculum_subjects** - 50 BSIT 2023-2024 curriculum subjects with prerequisites
4. **applications** - Main application with personal info + AI recommendation
5. **work_experiences** - Job titles, years, descriptions
6. **applicant_documents** - TOR, PSA, Job Description, Certificates
7. **tor_documents** - Legacy TOR storage
8. **tor_subjects** - Subjects extracted from TOR via OCR
9. **subject_matches** - AI matches with source field (tor/work_experience), confidence, status
10. **predictions** - Semester-by-semester study plan
11. **reports** - Generated evaluation reports
12. **chat_conversations** + **chat_messages** - AcrediaBot chat history

### Backend (Django + DRF)
- **Auth**: JWT via SimpleJWT, register/login/google_auth/me endpoints
- **CRUD**: Full CRUD for applications, work-experiences, documents, subject-matches
- **AI Endpoints**: 
  - `/api/recommend-course/` - AI program recommendation
  - `/api/upload/document/` - Document upload + auto-OCR for TORs
  - `/api/application/process/` - Full AI evaluation (TOR matching + work matching + predictions)
  - `/api/chat/message/` - AcrediaBot chat
- **AI Service**: Gemini 2.5 Pro via EMERGENT_LLM_KEY for production reliability

### Frontend (React + React Router)
- **Public**: Landing page, Login, Register
- **Applicant**: Dashboard, Apply (4-step wizard), Evaluation results, PDF report download
- **Department Chair**: Review Queue, Side-by-side review with TOR/Work tabs
- **Admin**: Stats dashboard, applications list, curriculum view
- **Global**: Floating AcrediaBot chatbot widget

## What's Been Implemented (May 22, 2026)

### ✅ Backend
- Django 5.2 project with Supabase PostgreSQL connection
- Custom User model with role-based access (applicant/evaluator/admin)
- 12 database models with migrations applied
- JWT authentication + Google OAuth endpoints
- CIT-U BSIT 2023-2024 curriculum seeded (50 subjects, 151 units)
- Demo accounts seeded: applicant, department chair, admin
- Gemini AI integration with EMERGENT_LLM_KEY (gemini-2.5-pro)
- Async/sync ORM bridge using async_to_sync
- Course recommendation AI based on work experience
- Multi-source subject matching (TOR + Work Experience)
- Document upload with auto-OCR for TOR
- Predictions engine with 21-units-per-semester limit
- Chatbot integration with conversation history

### ✅ Frontend
- Beautiful landing page with hero section, features, process steps
- Login/Register with demo account hints
- Applicant dashboard with stats grid
- 4-step Apply wizard:
  - Step 1: Personal Info
  - Step 2: Upload Documents (TOR, PSA, Job Description, Certificates)
  - Step 3: Work Experience with AI recommendation
  - Step 4: Review & Submit
- Evaluation page with color-coded matches (Green ≥85, Yellow 60-84, Red <60)
- Source labels: "Credited from TOR" or "Credited from Work Experience"
- Department Chair dashboard with filters (All/Pending/Finalized/Rejected)
- Side-by-side review with applicant info + matches panel
- Run/Re-run AI Evaluation button
- PDF report generation with jsPDF
- Floating AcrediaBot chatbot on every page
- Admin dashboard with curriculum view

### ✅ Testing
- Backend: 37/37 tests passing (100%)
- Critical async/sync bug fixed
- Gemini quota issue resolved via EMERGENT_LLM_KEY
- All AI endpoints functional

## Test Credentials

### Department Chair (Evaluator role)
- chair@citu.edu / chair123 (Dr. Maria Santos)
- chair2@citu.edu / chair123 (Dr. Juan Reyes)
- evaluator@citu.edu / evaluator123

### Applicant
- applicant@test.com / applicant123 (Pedro Reyes)

### Administrator
- admin@citu.edu / admin123 (Juan Dela Cruz)

## Prioritized Backlog (P0/P1/P2)

### P1 (Important - Future Iterations)
- Background job queue (Celery) for /api/application/process/ to avoid gateway timeouts
- Real-time evaluation status updates via WebSockets
- Email notifications on application status changes
- Curriculum upload UI for admin (currently seeded only)
- Custom Google OAuth UI flow integration in frontend
- Supabase Storage integration for document files (currently local Django storage)

### P2 (Nice to Have)
- Detailed analytics and reporting for admin
- Multi-language support (English/Filipino)
- Mobile app via React Native
- ETEEAP rules version tracking
- Additional programs beyond BSIT
- Bulk application processing

## Next Action Items
1. Convert /api/application/process/ to background task to avoid gateway timeouts
2. Add Supabase Storage integration for production file storage
3. Implement email notifications via SendGrid/Resend
4. Add admin curriculum upload UI
5. Polish PDF report design (more institutional-looking)
