# ACCREDIA — Frontend Application

React Single Page Application (SPA) for the **ACCREDIA** AI-Assisted ETEEAP Enrollment System (Cebu Institute of Technology – University).

---

## 🧰 Tech Stack

- **React 19** (`react: ^19.0.0`, `react-dom: ^19.0.0`) — modern React UI foundation
- **React Router DOM v7** (`react-router-dom: ^7.5.1`) — declarative client-side routing
- **Tailwind CSS 3** (`tailwindcss: ^3.4.17`) — utility-first CSS styling
- **shadcn/ui (Radix Primitives)** — accessible, customizable component layer
- **CRACO & Create React App** (`@craco/craco: ^7.1.0`) — configuration override & build tooling
- **Lucide React** (`lucide-react: ^0.507.0`) — iconography
- **Recharts** (`recharts: ^3.6.0`) — data visualization for academic progress & evaluation metrics
- **jsPDF** (`jspdf: ^4.2.1`) — client-side PDF Evaluation Summary report generation
- **Axios** (`axios: ^1.8.4`) — REST API client with JWT interceptors
- **CIT-U Palette:** Maroon (`#7a1e2b`) and Gold (`#d4a747`)

---

## 📋 Prerequisites

- **Node.js 18+** or **20+ LTS** (`node -v`)
- **npm** or **Yarn** (`npm -v` / `npm.cmd -v`)

---

## 🚀 Local Setup & Run

### 1. Install Dependencies

```bash
cd frontend
npm install
```
*(On Windows PowerShell, use `npm.cmd install` if script execution policies are restricted).*

> **Note:** A `.npmrc` file is included with `legacy-peer-deps=true` to avoid dependency peer conflicts with React 19.

### 2. Configure Environment

Create `.env` inside `frontend/`:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

> **Note:** `REACT_APP_BACKEND_URL` is baked in at build time. When deploying to staging or production, point this to your deployed backend URL (no trailing slash).

### 3. Run Development Server

- **Windows PowerShell:**
  ```powershell
  $env:BROWSER="none"; npm.cmd start
  ```
- **macOS / Linux:**
  ```bash
  BROWSER=none npm start
  ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
```

This generates an optimized static build in the `build/` directory ready for deployment.

---

## 🌐 Deploying to Vercel

1. Import the Git repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Create React App`.
4. Configure Build & Output:
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`
5. Under **Environment Variables**, add:
   - `REACT_APP_BACKEND_URL`: `https://accredia-backend.onrender.com`
6. Deploy. Deep links (such as `/evaluator/review/:id`) work seamlessly due to SPA rewrite rules defined in `frontend/vercel.json`.

---

## 📖 System Overview

For full architectural diagrams, academic credit rules, and backend integration, see the [Root README](../README.md).