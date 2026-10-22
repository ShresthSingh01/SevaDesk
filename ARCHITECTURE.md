# SevaDesk — Enterprise-Grade Architecture & Technical Specification

SevaDesk is an enterprise-grade, local-first assisted-service workstation designed for Indian Common Service Centre (CSC) and e-Governance kiosk operators. It combines deterministic document intelligence, explainable preflight validation, declarative portal adapters, bilingual voice transparency, and DPDP Act 2023 compliance—without introducing probabilistic hallucinations or delegating critical government workflows to generic cloud LLMs.

---

## 1. System Topology & Data Flow

```mermaid
flowchart TD
    subgraph OperatorKiosk["Local Kiosk Workstation (Windows / Linux / macOS)"]
        subgraph Frontend["Operator Workspace (React + TS + Vite :5173)"]
            UI["Operator Workspace UI"]
            KioskScreen["Dual-Screen Citizen Display (:5173?view=citizen)"]
            BrowserVault["WebCrypto AES-256-GCM Vault"]
            NativeSpeech["Chromium Indic WebSpeech API (hi, mr, ta, te, bn, gu)"]
        end

        subgraph LocalDaemon["Local Intelligence Core (FastAPI :8765)"]
            API["FastAPI Loopback Router"]
            DocIntel["Document Intelligence\n(PaddleOCR + OpenCV Preprocessor)"]
            VerhoeffEngine["Verhoeff Checksum\n& Format Validator"]
            ErrorEngine["Reverse Portal Error Interpreter"]
            BhashiniClient["BHASHINI / AI4Bharat\nVoice & Translation Engine"]
            BridgeManager["In-Memory IPC Bridge\n(Tokenized Session Dispatch)"]
            SQLiteDB["Encrypted SQLite (WAL Mode)\n+ SHA-256 Hash-Chained Ledger"]
        end

        subgraph BrowserCompanion["Companion Browser Extension (MV3)"]
            MV3Popup["MV3 Popup & Content Script"]
            Adapters["Declarative Portal Adapters\n(MahaDBT, UP e-District, Saral, Delhi)"]
            DOMEngine["DOM State Machine & Event Dispatcher"]
        end
    end

    subgraph StatePortals["Official Government Portals"]
        MahaDBT["mahadbt.maharashtra.gov.in"]
        UPeDistrict["edistrict.up.gov.in"]
        SaralHaryana["saralharyana.gov.in"]
        DelhiEDistrict["edistrict.delhigovt.nic.in"]
    end

    subgraph CentralHub["Central Coordinated Hub (PostgreSQL)"]
        CatalogDB["Scheme Catalog & Official Fee Gazettes"]
        AdapterRegistry["Signed Portal Adapter Distribution"]
        Telemetry["Zero-PII Performance & Metric Telemetry"]
    end

    %% Flows
    Citizen["Citizen / Beneficiary"] -->|Presents physical docs| UI
    Citizen <-->|Views unbundled fees & hears audio| KioskScreen
    KioskScreen --> NativeSpeech
    UI <-->|Loopback REST / HTTP| API
    API --> DocIntel
    API --> VerhoeffEngine
    API --> ErrorEngine
    API --> BhashiniClient
    API <--> SQLiteDB
    API <--> BridgeManager

    UI -->|1. Dispatches session ticket (Zero-Clipboard)| BridgeManager
    MV3Popup <-->|2. Directly fetches active session via loopback| BridgeManager
    MV3Popup --> Adapters
    Adapters --> DOMEngine
    DOMEngine -->|3. Resolves CSS selectors & dispatches synthetic events| StatePortals
    StatePortals -.->|Human enters OTP/CAPTCHA & submits| Citizen

    CentralHub -.->|Syncs verified fee gazettes & adapters| LocalDaemon
```

---

## 2. Core Subsystems

### A. Operator Workspace (`apps/workspace`)
- **Technology:** React 18, TypeScript 5.7, Vite 6, Vanilla CSS design system.
- **Visual Design:** Dark forest green theme (`#0d1410`), high-contrast typography, responsive layout with dedicated views for:
  1. **Overview:** Daily case count, pending applications, fees collected, and daemon connection status.
  2. **Citizen Intake:** Structured intake with mandatory DPDP consent recording, physical document scanning, OCR candidate review, and Verhoeff-validated inputs.
  3. **Applications:** Queue management, status filtering (`Draft`, `Ready for Portal`, `Submitted`, `Rejected`), and detail view.
  4. **Fee Transparency:** Side-by-side disclosure of government portal fees vs. CSC operator service charges, with direct audio synthesis in Hindi, Marathi, Tamil, Telugu, and English.
  5. **Citizen Display Mode:** Dedicated full-screen kiosk view designed for dual-monitor or secondary citizen-facing displays (`?view=citizen`).
  6. **Services & Rules:** Configuration of portal schemas, required fields, maximum file upload sizes, accepted extensions, and verified fee sources.
  7. **Audit Trail:** Append-only timeline of operational actions with real-time SHA-256 cryptographic chain integrity verification.

### B. Local Intelligence Daemon (`services/local-core`)
- **Technology:** Python 3.13, FastAPI, Uvicorn, SQLite with Write-Ahead Logging (WAL).
- **Binding:** Binds strictly to `127.0.0.1:8765` (loopback only, zero public exposure).
- **At-Rest Column Encryption (AES-256-GCM):**
  - Manages a persistent Kiosk Master Key derived via PBKDF2-HMAC-SHA256 (310,000 iterations).
  - Encrypts sensitive citizen identity fields (`aadhaar`, `voterId`, `rationCard`, `bankAccount`) before persisting to SQLite.
- **Cryptographic Hash-Chained Audit Ledger:**
  - Every event is linked via SHA-256: $\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Timestamp} + \text{Action} + \text{Entity ID} + \text{Description})$.
  - Exposes `GET /api/audit/verify` to prove mathematical non-repudiation for DPDP Act 2023 compliance.
- **Tokenized In-Memory IPC Bridge:**
  - Manages single-use session tickets (`POST /api/bridge/push-session` & `GET /api/bridge/active-session`) for seamless zero-clipboard data transfer to the browser extension companion.
- **Document Intelligence:**
  - Multi-engine layout-aware extraction with PaddleOCR, OpenCV preprocessing (deskew, binarization), and fallback heuristics.
  - Emits candidate bounding boxes and confidence scores without persisting raw biometric or document images to disk.
- **Verhoeff Checksum Engine:**
  - Mathematical Verhoeff dihedral group $D_5$ multiplication table validation for 12-digit Indian Aadhaar numbers.
  - Detects all single-digit transcription errors and adjacent transpositions before transmission.
- **Reverse Portal Error Interpreter:**
  - Deterministic classification of portal responses (file upload constraints, expired sessions, CAPTCHA checkpoints, OTP requirements, Aadhaar mismatches, IFSC errors).
  - Categorizes issues with actionable operator remedies instead of ambiguous warnings.
- **Multilingual Voice Engine:**
  - Native Chromium Indic WebSpeech synthesis (`hi-IN`, `mr-IN`, `ta-IN`, `te-IN`, `bn-IN`, `gu-IN`, `en-IN`) as primary offline engine.
  - BHASHINI / AI4Bharat ULCA client with disk-backed cache and Windows SAPI5 as secondary fallback.
- **Real-Time Portal Latency & Congestion Probe:**
  - Asynchronous HTTP socket ping (`GET /api/portal/health`) measuring actual round-trip latency to official portal endpoints.
  - Indian CCA root certificate tolerance (`verify=False`) to prevent false outage alerts on state NIC portals.
  - Categorizes portal status into `fast`, `congested`, `unhealthy` (504 timeout), and `offline`.

### C. Manifest V3 Browser Companion (`apps/extension`)
- **Technology:** Chrome Extensions Manifest V3 (`activeTab`, `scripting`, `storage`, `webNavigation`).
- **Direct Loopback Bridge (Zero Clipboard PII Exposure):**
  - On open, queries `http://127.0.0.1:8765/api/bridge/active-session` to automatically load the active reviewed case payload into memory.
- **Declarative Portal Adapters:**
  - Pre-calibrated selectors for **MahaDBT**, **UP e-District**, **Antyodaya Saral Haryana**, and **e-District Delhi**.
  - Evaluates native W3C `element.matches(selector)` against live DOM nodes rather than fragile substring comparisons.
- **Sub-150ms Fast-Burst DOM Injection:**
  - Injects reviewed values in under 150 ms with live stopwatch benchmarking.
  - Dispatches standard synthetic DOM events (`input`, `change`, `blur`) and invokes native React/Angular prototype property setters.
  - Strict safety invariants: disallows interaction with password inputs, OTP fields, CAPTCHA controls, and final submit buttons.
- **1-Click Session Guard (Timeout Recovery):**
  - Automatically caches the last active injected session in `chrome.storage.local` with a 30-minute expiration window.
  - Allows instantaneous re-injection with a single click if the government portal session expires.
- **On-Portal Error Inspector:**
  - Captures on-screen error banners and queries the local reverse error classifier (`POST /api/error-interpreter/analyze`) to provide plain-language operator remedies.

### D. Central Coordination Hub (`services/central-hub`)
- **Technology:** PostgreSQL 16+, Docker Compose.
- **Responsibilities:**
  - **Verified Fee Gazettes:** Official state government fee tables indexed with official gazette notification numbers and effective dates.
  - **Dynamic Adapter Distribution:** Signed declarative JSON schemas for state portal DOM structures.
  - **Zero-PII Telemetry:** Statistical performance metrics (success rate, average processing duration, common portal error frequencies) without storing citizen identities.

---

## 3. Security, Privacy & DPDP Act 2023 Compliance

| Requirement | Implementation in SevaDesk |
|---|---|
| **Data Minimisation** | Only fields explicitly required by the configured portal service are collected. |
| **Notice & Consent** | Explicit affirmative consent checkbox and purpose specification required before saving intake records. |
| **Zero Cloud PII Leakage** | All OCR, document parsing, and record validation execute entirely on the local workstation. |
| **At-Rest Column Encryption** | Local database encrypts Aadhaar, voter ID, and bank account columns with AES-256-GCM. |
| **Cryptographic Non-Repudiation** | Hash-chained audit ledger mathematically detects any modification, insertion, or deletion of audit logs. |
| **Zero-Clipboard IPC** | Reviewed case payloads are transferred via in-memory loopback tokens without touching the OS clipboard. |
| **Masked Identifiers** | Aadhaar numbers and bank accounts are masked (`•••• •••• 1234`) across all list views and secondary screens. |
| **Human-in-the-Loop** | Companion extension never automates OTP, CAPTCHA, passwords, or final form submission. |
| **Right to Erasure** | Confirmed deletion purges citizen demographics and active application links instantly. |

---

## 4. Test Strategy & Quality Verification

SevaDesk maintains multi-tiered automated verification:

1. **Shared Core & Logic (`packages/core-types`):**
   - Node.js native test runner (`node --test tests/*.test.js`).
   - 18 unit tests verifying Verhoeff checksums, preflight rules, candidate parsers, status transitions, locked applications, and cipher safety.
2. **Local Python Daemon (`services/local-core`):**
   - Pytest suite (`pytest services/local-core/tests`).
   - 16 unit tests verifying Verhoeff checksums, AES-256-GCM encryption/decryption, SHA-256 audit chaining and tamper detection, in-memory bridge session dispatch, SQLite transactions, multilingual audio synthesis, and real-time portal health socket probing.
3. **Workspace Frontend & Simulator (`apps/workspace`):**
   - TypeScript compiler (`tsc --noEmit`) and Vite production bundle compilation (`vite build`).
   - Integrated State Portal Simulator with direct SevaDesk bridge auto-fill (`⚡ Auto-Fill from SevaDesk`), document size compliance checking, and receipt generation.
4. **End-to-End Orchestration:**
   - Single root command: `npm run test:all` executes all test suites sequentially (34 passed tests, 0 failures, 100% clean production bundle).
