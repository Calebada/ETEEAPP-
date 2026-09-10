# ACCREDIA — Frontend

React.js frontend for the **ACCREDIA** AI-Assisted ETEEAP Enrollment System (CIT-U).

---

## 🧰 Tech Stack

- **React 19** — UI framework
- **Create React App + CRACO** — build tooling
- **Tailwind CSS** — styling
- **shadcn/ui (Radix)** — component library
- **React Router** — routing
- **Axios** — API communication
- **Recharts** — charts

---

## 📋 Prerequisites

- **Node.js 18+** (or current LTS)
- **npm** or **Yarn**

Check your versions:

```powershell
node --version
npm  --version
```

---

## 🚀 Setup & Run

### 1. Install dependencies

```bash
cd frontend
npm install        # or: yarn install
```

> A `.npmrc` file is committed with `legacy-peer-deps=true` to keep installs conflict-free with React 19. No action needed.

### 2. Configure the environment

Create a `.env` file in `frontend/`:

```text
REACT_APP_BACKEND_URL=http://localhost:8000
```

- `REACT_APP_BACKEND_URL` — URL of the running backend (no trailing slash).

> ⚠️ CRA bakes env vars **at build time**. If you change this later, rebuild/redeploy.

### 3. Run the development server

```bash
cd frontend
npm start
```

Open [http://localhost:3000](http://localhost:3000). The page auto-reloads on edits and shows lint errors in the console.

### 4. Build for production

```bash
cd frontend
npm run build
```

Output is emitted to the `build/` folder — a static site ready to deploy (serving this folder is enough; no server-side rendering).

---

## 🌐 Deploying to Vercel

1. Import the repository in Vercel.
2. Set the **Root Directory** to `frontend`.
3. **Build Command:** `npm run build` · **Output Directory:** `build`.
4. Add the environment variable `REACT_APP_BACKEND_URL` pointing to your deployed backend.
5. Deploy — every push to `main` automatically triggers a new production deployment, and any branch/PR gets a preview URL.

The committed `frontend/vercel.json` contains SPA rewrites so that refreshing deep links (e.g. `/login`) does not 404.

---

## 📁 Notes

- Full project overview and architecture live in the **root [`README.md`](../README.md)**.