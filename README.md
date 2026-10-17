# SevaDesk — Local-First Assisted Service Workstation

> **Empowering Indian CSC & e-Governance Kiosk Operators with Local Document Intelligence, Verhoeff Preflight Validation, Declarative Portal Adapters, and DPDP Act Privacy Guarantees.**

SevaDesk is a specialized assisted-service workstation designed for Common Service Centre (CSC) operators, Gram Panchayat digital assistants, and e-District kiosk operators across India. It solves the critical bottleneck of portal transcription errors, rejected uploads, and fee disputes through **local-first automation and complete transparency**—without sending citizen documents to third-party cloud LLMs.

---

## ⚡ Quick Start

### 1. Requirements
- **Node.js**: v18.0.0 or higher
- **Python**: v3.10+ (Python 3.13 recommended)
- **Browser**: Google Chrome or Chromium-based browser (for the Manifest V3 Companion Extension)

### 2. First-Time Setup
* **Windows:** Double-click `setup.bat` to automatically install all Node.js and Python dependencies.
* **macOS / Linux:** Run `./setup.sh`.

### 3. Launch SevaDesk (One-Click)

#### Windows
Double-click `run.bat` or run in PowerShell:
```powershell
.\run.ps1
```

#### macOS / Linux
```bash
chmod +x run.sh
./run.sh
```

This concurrently starts:
1. **Local Core Daemon (Python / FastAPI):** `http://127.0.0.1:8765` (API docs at `/docs`)
2. **Operator Workstation (React + Vite):** `http://localhost:5173`

> 📘 **Team Reviewers:** See [`TEAM_TESTING_GUIDE.md`](file:///d:/SevaDesk/TEAM_TESTING_GUIDE.md) for a comprehensive step-by-step walkthrough covering citizen intake, Aadhaar Verhoeff validation, dual citizen display, audio disclosures, and browser extension testing.

---

## 🧩 Key Architecture & Components

```
d:/SevaDesk/
├── apps/
│   ├── workspace/            # React 18 + TypeScript + Vite Operator Workspace & Citizen Display
│   └── extension/            # Manifest V3 Chrome Companion with declarative portal adapters
├── packages/
│   ├── core-types/           # Verhoeff Aadhaar validation, format checkers, preflight engine
│   └── portal-adapters/      # Adapters for MahaDBT, UP e-District, Saral Haryana, Delhi
├── services/
│   ├── local-core/           # Python 3.13 FastAPI daemon, PaddleOCR, SQLite WAL, BHASHINI client
│   └── central-hub/          # PostgreSQL schema + Docker Compose for official fee gazettes & sync
├── tests/                    # Original Node.js unit tests (100% backward compatible)
├── run.bat / run.ps1         # Windows launchers with venv & dependency checks
└── run.sh                    # Linux/WSL/macOS launcher
```

---

## 🛡️ Core Capabilities

### 1. Local Document Intelligence & Verhoeff Validation
- **Local OCR Extraction:** Integrates PaddleOCR with layout-aware heuristic fallback for Indian identity cards, caste certificates, and marksheets.
- **Verhoeff Checksum Engine:** Mathematically validates 12-digit Indian Aadhaar numbers using the dihedral group $D_5$ algorithm to catch typos before submission.
- **Human-in-the-Loop:** OCR candidate fields are displayed with individual confirmation checkboxes. No data is applied silently.

### 2. Dual-Screen Citizen Display & Multilingual Voice (BHASHINI)
- **Secondary Display Mode:** Open `http://localhost:5173` and click **"Open citizen display"** (or use the Citizen Display view) to project clean, large fee breakdowns on a secondary citizen-facing monitor.
- **Separate Fee Line Items:** Official portal fee and kiosk service charges are displayed independently; unverified amounts are never combined.
- **Voice Announcement:** Audio readout of fee breakdowns in **Hindi, Marathi, Tamil, Telugu, and English** via the BHASHINI / AI4Bharat audio client or native browser speech.

### 3. Declarative Portal Adapters (Browser Companion)
- **Supported Portals:** Pre-calibrated adapters for **MahaDBT** (Maharashtra), **UP e-District** (Uttar Pradesh), **Antyodaya Saral** (Haryana), and **e-District Delhi**, with heuristic fallback for all other state portals.
- **Installing the Extension:**
  1. Open Chrome and navigate to `chrome://extensions/`.
  2. Enable **Developer mode** (toggle in top right).
  3. Click **Load unpacked** and select the folder: `d:\SevaDesk\apps\extension`.
- **Operator Safety Safeguards:**
  - Never clicks "Submit".
  - Disallows interaction with password, CAPTCHA, or OTP fields.
  - Generates synthetic DOM input events to ensure frameworks (Angular, React, ASP.NET) recognize changed values.

### 4. Zero Cloud PII Leakage & DPDP Act 2023 Compliance
- **Local At-Rest Encryption:** Local records are secured with AES-256-GCM column encryption via a persistent Kiosk Master Key (PBKDF2-SHA-256).
- **Direct Loopback IPC Bridge:** Tokenized in-memory session dispatch between workspace and companion extension—zero PII exposed to the OS clipboard.
- **Cryptographic Audit Ledger:** Tamper-evident SHA-256 hash-chained audit ledger with mathematical non-repudiation verification (`/api/audit/verify`).
- **Zero Cloud Leakage:** All document processing, OCR extraction, and storage occur entirely on the local device.

---

## 🧪 Testing & Verification

Run the entire verification suite with a single command:

```bash
npm run test:all
```

This runs:
1. **Node.js Core Tests:** `node --test tests/*.test.js` (11 passing tests)
2. **Python Daemon Tests:** `pytest services/local-core/tests` (10 passing tests)
3. **TypeScript & Vite Build:** `tsc && vite build` in `apps/workspace` (0 errors)

---

## 🏢 Central Hub (Optional Multi-Centre Coordination)

For multi-kiosk district coordination or enterprise deployments:
```bash
cd services/central-hub
docker compose up -d
```
Starts a PostgreSQL 16 instance with schema for centralized scheme catalogs, official fee gazettes, and signed portal adapter distribution.

---

## 📜 Ethical & Operational Principles

1. **Human-in-the-Loop:** SevaDesk is an operator assistant. The operator must personally verify every value, assist the citizen, and execute the final submission on the official portal.
2. **No Automation of Secrets:** Passwords, OTPs, CAPTCHAs, and biometrics must always be handled directly by the citizen and operator on the official government website.
3. **Not Government Endorsed:** SevaDesk is an independent assisted-service workstation tool. It does not claim official endorsement by any state or central ministry.
