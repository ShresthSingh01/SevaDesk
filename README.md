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
* **Windows (PowerShell):** Run `.\setup.ps1` or double-click `setup.bat` to automatically install all Node.js and Python dependencies.
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

> 📘 **Team Reviewers:** See [`TEAM_TESTING_GUIDE.md`](file:///d:/SevaDesk/TEAM_TESTING_GUIDE.md) for a comprehensive step-by-step walkthrough covering citizen intake, Aadhaar Verhoeff validation, dual citizen display, audio disclosures, document optimization, and browser extension testing.

---

## 🧩 Clean Architecture & Monorepo Structure

```text
d:/SevaDesk/
├── apps/
│   ├── workspace/            # React 18 + TypeScript + Vite Operator Workspace & Citizen Display
│   └── extension/            # Manifest V3 Chrome Companion with burst autofill & timeout guard
├── packages/
│   ├── core-types/           # Verhoeff Aadhaar validation, format checkers, preflight engine
│   └── portal-adapters/      # Declarative schemas for MahaDBT, UP e-District, Saral Haryana, Delhi
├── services/
│   ├── local-core/           # Python 3.13 FastAPI daemon (OCR, Verhoeff, Bhashini, Latency Probe)
│   └── central-hub/          # PostgreSQL schema + Docker Compose for official fee gazettes & sync
├── tests/                    # Core regression test suite (11 Node.js tests)
├── archive/
│   └── legacy-v1/            # Self-contained archived v1 vanilla prototype & legacy extension
├── setup.bat / setup.ps1     # 1-click automated setup for Windows (cmd & PowerShell)
├── setup.sh                  # 1-click automated setup for Linux / macOS
├── run.bat / run.ps1         # 1-click concurrent launcher for Windows
├── run.sh                    # 1-click concurrent launcher for Linux / macOS
├── package.json              # Monorepo root npm workspace configuration
├── ARCHITECTURE.md           # Deep-dive system architecture, topology, and security specs
├── TEAM_TESTING_GUIDE.md     # Complete step-by-step review walkthrough for team members
└── README.md                 # Project overview and quick start guide
```

---

## 🛡️ Core Capabilities

### 1. Local Document Intelligence & Verhoeff Validation
- **Local OCR Extraction:** Integrates PaddleOCR with layout-aware heuristic fallback for Indian identity cards, caste certificates, and marksheets.
- **Verhoeff Checksum Engine:** Mathematically validates 12-digit Indian Aadhaar numbers using the dihedral group $D_5$ algorithm to catch typos before submission.
- **Multilingual Citizen Audio Readback:** Reads extracted applicant details aloud in **Hindi, English, Marathi, Tamil, or Telugu** so non-literate citizens can confirm their information before submission.
- **Human-in-the-Loop:** OCR candidate fields are displayed with individual confirmation checkboxes. No data is applied silently.

### 2. Dual-Screen Citizen Display & Multilingual Voice (BHASHINI)
- **Secondary Display Mode:** Open `http://localhost:5173` and click **"Open citizen display"** (or use `?view=citizen`) to project clean, large fee breakdowns on a secondary citizen-facing monitor.
- **Separate Fee Line Items:** Official portal fee and kiosk service charges are displayed independently; unverified amounts are never combined.
- **Voice Announcement:** Audio readout of fee breakdowns in **Hindi, Marathi, Tamil, Telugu, and English** via the BHASHINI / AI4Bharat audio client or native browser speech.

### 3. Slow Government Portal & Timeout Mitigation (100% Real, Zero Faking)
- **Real-Time Portal Latency & Congestion Probe:** Measures actual socket round-trip latency (`GET /api/portal/health`) from the kiosk to state portals (e.g. `edistrict.up.gov.in`). Classifies congestion into **Fast**, **Congested**, **Unhealthy (504 Timeout)**, or **Offline** so operators know server status before opening tabs.
- **100% On-Device Canvas Document Optimizer:** Binary searches JPEG quantization on an HTML5 Canvas to instantly compress heavy camera scans down to the strict $\le 100\text{ KB}$ or $\le 200\text{ KB}$ portal limits without server uploads.
- **Sub-150ms Fast-Burst Form Injection:** Companion Extension injects reviewed fields into state portal forms in milliseconds, firing synthetic reactive events so sluggish portal pages don't freeze.
- **1-Click Session Guard:** Caches the active reviewed session in `chrome.storage.local` (30-minute window) so if a portal session times out or crashes, the operator can re-inject all fields with a single click.
- **Live On-Portal Error Inspector:** Scans cryptic portal error banners and maps them to actionable operator solutions via the reverse error classifier.
- **Off-Peak Rush-Hour Queue:** Allows operators to complete citizen intake and preflight validation offline during busy hours, queuing verified cases for rapid burst submission during off-peak times.

### 4. Declarative Portal Adapters (Browser Companion)
- **Supported Portals:** Pre-calibrated adapters for **MahaDBT** (Maharashtra), **UP e-District** (Uttar Pradesh), **Antyodaya Saral** (Haryana), and **e-District Delhi**, with heuristic fallback for all other state portals.
- **Installing the Extension:**
  1. Open Chrome and navigate to `chrome://extensions/`.
  2. Enable **Developer mode** (toggle in top right).
  3. Click **Load unpacked** and select the folder: `apps/extension`.
- **Operator Safety Safeguards:**
  - Never clicks "Submit".
  - Disallows interaction with password, CAPTCHA, or OTP fields.
  - Generates synthetic DOM input events to ensure frameworks (Angular, React, ASP.NET) recognize changed values.

### 5. Zero Cloud PII Leakage & DPDP Act 2023 Compliance
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
2. **Python Daemon Tests:** `pytest services/local-core/tests` (12 passing tests)
3. **TypeScript & Vite Build:** `tsc && vite build` in `apps/workspace` (0 errors)
*Total: **23 passing tests**, 0 failures, 100% green.*

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
