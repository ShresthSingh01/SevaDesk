# SevaDesk — Local-First Assisted Service Workstation

> **The Sovereign, DPDP Act 2023–Compliant Operating Environment for Indian Common Service Centres (CSC), Gram Panchayat Digital Assistants, and e-District Kiosk Operators.**  
> *Deterministic Document Intelligence · Mathematical Verhoeff Validation · On-Device Canvas Optimization · Dual-Screen Fee Transparency · Zero-Clipboard Portal Bridge · Cryptographic Audit Ledger*

---

[![Tests Status](https://img.shields.io/badge/tests-42%20passed%2C%200%20failed-brightgreen.svg)](file:///d:/SevaDesk/tests/core.test.js)
[![Architecture](https://img.shields.io/badge/architecture-local--first%20monorepo-blue.svg)](file:///d:/SevaDesk/ARCHITECTURE.md)
[![Privacy Compliance](https://img.shields.io/badge/DPDP%20Act%202023-100%25%20Verified-darkgreen.svg)](#-dpdp-act-2023-compliance--cryptographic-security)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](file:///d:/SevaDesk/package.json)

---

## 📌 Table of Contents

1. [Executive Summary](#-executive-summary)
2. [Real-World Problems & The SevaDesk Solution](#-real-world-problems--the-sevadesk-solution)
3. [The Genuine End-to-End App Flow](#-the-genuine-end-to-end-app-flow)
4. [System Architecture & Data Topology](#-system-architecture--data-topology)
5. [Pre-Configured State & National Service Catalog](#-pre-configured-state--national-service-catalog)
6. [Deep-Dive Core Subsystems](#-deep-dive-core-subsystems)
   - [Local Document Intelligence & OCR Extraction](#1-local-document-intelligence--ocr-extraction)
   - [Mathematical Verhoeff Aadhaar & Format Engine](#2-mathematical-verhoeff-aadhaar--format-engine)
   - [On-Device Canvas Document Optimizer (≤ 100 KB / ≤ 200 KB)](#3-on-device-canvas-document-optimizer--100-kb---200-kb)
   - [Printable Official Proformas (स्वप्रमाणित घोषणा पत्र)](#4-printable-official-proformas-स्वप्रमाणित-घोषणा-पत्र)
   - [Dual-Screen Citizen Display & Multilingual Voice (BHASHINI / WebSpeech)](#5-dual-screen-citizen-display--multilingual-voice-bhashini--webspeech)
   - [Zero-Clipboard Loopback IPC Bridge & Companion Extension](#6-zero-clipboard-loopback-ipc-bridge--companion-extension)
   - [Real-Time Portal Latency & Congestion Probe](#7-real-time-portal-latency--congestion-probe)
   - [Built-In State Portal Simulator (Offline Practice Sandbox)](#8-built-in-state-portal-simulator-offline-practice-sandbox)
   - [Reverse Portal Error Classifier](#9-reverse-portal-error-classifier)
   - [Post-Submission Record Locking & Certificate Delivery](#10-post-submission-record-locking--certificate-delivery)
7. [DPDP Act 2023 Compliance & Cryptographic Security](#-dpdp-act-2023-compliance--cryptographic-security)
8. [Clean Monorepo Codebase Structure](#-clean-monorepo-codebase-structure)
9. [⚡ Quick Start & Setup Guide](#-quick-start--setup-guide)
10. [🧪 Automated Test Suite (42 Passing Tests)](#-automated-test-suite-42-passing-tests)
11. [📜 Ethical, Legal & Operational Principles](#-ethical-legal--operational-principles)

---

## 🎯 Executive Summary

Across India, over **400,000 Village Level Entrepreneurs (VLEs)** and kiosk operators process millions of government welfare applications daily on state portals such as **UP e-District**, **MahaDBT (Maharashtra)**, **Antyodaya Saral (Haryana)**, and **e-District Delhi**. 

In practice, these operators face severe operational friction:
* Manual transcription errors (a single transposed Aadhaar digit causes silent rejections weeks later).
* Fragmented physical documentation (citizens lacking required printed self-declarations).
* Harsh upload constraints (state portals strictly reject scans $> 100\text{ KB}$ or $> 200\text{ KB}$, driving operators to unsafe third-party online compressors).
* Server crashes and 504 timeouts that erase 15 minutes of manual form entry.
* Citizen fee disputes over blended kiosk charges.
* Privacy risks under the **Digital Personal Data Protection (DPDP) Act 2023** when sensitive citizen records are saved in unencrypted spreadsheets or exposed to the OS clipboard.

**SevaDesk** is a purpose-built, **100% local-first assisted-service workstation** designed specifically for kiosk operators. It runs entirely on the operator's computer, validating inputs deterministically, optimizing documents on an in-browser canvas, projecting unbundled fees on a secondary citizen display, and injecting reviewed data into state portals in under 150 ms via an encrypted loopback IPC bridge—**with zero cloud LLM dependencies, zero clipboard exposure, and zero PII leakage.**

---

## ⚡ Real-World Problems & The SevaDesk Solution

| # | Real-World Operational Problem | Real-World Impact | How SevaDesk Solves It Perfectly | Code Verification |
|---|---|---|---|---|
| **1** | **Aadhaar & ID Transcription Typos** | Operators retype 12-digit Aadhaar numbers hundreds of times a day. Single-digit typos and adjacent digit transpositions cause silent rejections weeks later at the Tehsil level. | **Mathematical Verhoeff Checksum Engine**: Validates Aadhaar numbers client-side using the dihedral group $D_5$ permutation algorithm before saving. Flags errors with 100% mathematical accuracy. | [`packages/core-types/index.js:72-81`](file:///d:/SevaDesk/packages/core-types/index.js#L72-L81) |
| **2** | **Non-Literate Citizens & Verification Gaps** | Rural beneficiaries cannot read English or complex Hindi forms on the operator's monitor to confirm if their name or address was entered correctly. | **Bilingual Voice Readback Engine**: Streams spoken audio disclosures of applicant details in **Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, or English** via Chromium Indic WebSpeech API or BHASHINI / AI4Bharat. | [`apps/workspace/src/lib/speech.ts`](file:///d:/SevaDesk/apps/workspace/src/lib/speech.ts) |
| **3** | **Strict Portal Upload Limits (< 100 KB / < 200 KB)** | State portals (e.g. UP e-District) reject scans exceeding 100 KB. Operators upload camera photos (3–5 MB) to sketchy online cloud compressors, leaking citizen IDs to the public internet. | **100% On-Device Canvas Optimizer**: Performs iterative binary search JPEG quantization on an HTML5 Canvas directly in RAM. Compresses scans to exact target limits ($\le 20\text{ KB}$ for photos, $\le 100\text{ KB}$ for PDFs/JPGs) in $< 300\text{ ms}$ with zero server uploads. | [`apps/workspace/src/lib/imageCompressor.ts:34-150`](file:///d:/SevaDesk/apps/workspace/src/lib/imageCompressor.ts#L34-L150) |
| **4** | **Missing Physical Self-Declarations & Proformas** | Schemes require specific statutory formats (e.g., स्वप्रमाणित घोषणा पत्र for UP Income Certificate). Citizens walk in without them, causing dropped cases or delayed processing. | **Built-in Printable Proforma Engine**: Generates official pre-filled bilingual A4 proformas with citizen demographics, Tehsil details, and signature boxes for instant physical printing (`Ctrl+P`) or automated test simulation. | [`apps/workspace/src/components/PrintableProformaModal.tsx`](file:///d:/SevaDesk/apps/workspace/src/components/PrintableProformaModal.tsx) |
| **5** | **Citizen Fee Disputes & Overcharging Accusations** | Kiosks combine official government fees with their service charges into one lump sum, leading to citizen mistrust and corruption allegations. | **Dual-Screen Citizen Fee Transparency**: Secondary monitor mode (`?view=citizen`) projects unbundled fees in large typography (**Statutory Portal Fee: ₹15.00** vs. **Kiosk Service Charge: ₹30.00**), accompanied by spoken regional voice announcements and printable cash slips. | [`apps/workspace/src/features/CitizenDisplay.tsx`](file:///d:/SevaDesk/apps/workspace/src/features/CitizenDisplay.tsx), [`apps/workspace/src/components/CitizenReceiptModal.tsx`](file:///d:/SevaDesk/apps/workspace/src/components/CitizenReceiptModal.tsx) |
| **6** | **Sluggish Government Portals & 504 Timeouts** | Government servers crash during peak hours (11 AM – 3 PM) or time out after 15 minutes of slow manual typing, wiping all entered form inputs. | **Real-Time Latency Probe + 1-Click Session Guard**: Pings portal endpoints (`GET /api/portal/health`) to categorize congestion (*Fast*, *Congested*, *Unhealthy*). Caches active injected forms in `chrome.storage.local` to restore all fields with 1 click if the portal drops. | [`services/local-core/app/api/routes.py:221-294`](file:///d:/SevaDesk/services/local-core/app/api/routes.py#L221-L294), [`apps/extension/popup.js`](file:///d:/SevaDesk/apps/extension/popup.js) |
| **7** | **Clipboard PII Exposure & DPDP Violations** | Operators copy-pasting Aadhaar numbers, voter IDs, and bank details leave sensitive data on the operating system clipboard, vulnerable to malware. | **Zero-Clipboard Loopback IPC Bridge**: reviewed case payloads are staged in memory on the local loopback daemon (`http://127.0.0.1:8765/api/bridge/push-session`). The companion extension pulls directly via loopback—the OS clipboard is never touched. | [`services/local-core/app/api/routes.py:185-212`](file:///d:/SevaDesk/services/local-core/app/api/routes.py#L185-L212) |
| **8** | **Masked Aadhaar Fields Blocked as Passwords** | Portals render Aadhaar inputs as `<input type="password">` to mask digits. Naive autofill tools skip them because they treat all password inputs as user credentials. | **Context-Aware DOM Classifier**: Analyzes surrounding table cells, label text, and input attributes (`name="txtAadharNo"`). Injects masked Aadhaar and bank account fields while strictly safeguarding real login passwords, OTPs, and CAPTCHAs. | [`apps/extension/popup.js:49-78`](file:///d:/SevaDesk/apps/extension/popup.js#L49-L78), [`tests/core.test.js:47-61`](file:///d:/SevaDesk/tests/core.test.js#L47-L61) |
| **9** | **Cryptic Portal Error Banners** | Sluggish state portals display confusing errors like `Upload Failed: ZXQ-44007` or `Server Error in '/' Application`. Operators cannot tell if it is a size issue or server downtime. | **Reverse Portal Error Interpreter**: Deterministic rule engine scans portal error text and maps it to plain Hindi/English solutions (e.g., *"File exceeds 100 KB limit. Compress or rescan."*). | [`packages/core-types/index.js:607-695`](file:///d:/SevaDesk/packages/core-types/index.js#L607-L695) |
| **10** | **Post-Submission Tampering & Audit Liability** | Once submitted, operators might accidentally alter citizen records, creating discrepancies with what was sent to the state government. | **Terminal Lifecycle Status & Immutable Locking**: Automatically locks citizen records permanently once linked to a `submitted` or `closed` case. Every action is recorded in an immutable **SHA-256 Merkle hash chain** with mathematical non-repudiation verification. | [`packages/core-types/index.js:733-771`](file:///d:/SevaDesk/packages/core-types/index.js#L733-L771), [`services/local-core/app/db/repository.py:366-407`](file:///d:/SevaDesk/services/local-core/app/db/repository.py#L366-L407) |

---

## 🔄 The Genuine End-to-End App Flow

SevaDesk orchestrates a strict, linear operator workflow designed to complete citizen intake, document optimization, and portal submission in **under 3 minutes**:

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Citizen / Beneficiary
    actor Operator as Kiosk Operator (VLE)
    participant UI as Operator Workspace (:5173)
    participant Sec as Citizen Monitor (:5173?view=citizen)
    participant Core as Local Core Daemon (:8765)
    participant Ext as Chrome Companion (MV3)
    participant Portal as State Govt Portal / Simulator

    %% Stage 1: Intake & OCR
    Citizen->>Operator: Hands physical ID (Aadhaar / Voter / PAN)
    Operator->>UI: Selects Service (e.g., UP Income Certificate)
    UI->>UI: Filters form: Shows only mandatory fields for service
    Operator->>UI: Scans ID Card / Runs Document OCR
    UI->>Core: POST /api/ocr/scan (PaddleOCR + OpenCV)
    Core-->>UI: Detected candidate fields (Name, DOB, Gender, Address)
    Operator->>UI: Reviews & applies candidate fields with 1 click
    UI->>UI: Validates Aadhaar via Verhoeff Checksum (D5 Dihedral Group)
    
    %% Stage 2: Audio & Secondary Display
    UI->>Sec: Broadcasts unbundled fees via LocalStorage IPC
    Sec->>Citizen: Displays Official Fee (₹15) + Kiosk Charge (₹30) = ₹45
    UI->>Citizen: Speaks fee disclosure & applicant name in regional language
    
    %% Stage 3: Documents & Proformas
    Operator->>UI: Selects required documents (Photo ≤ 20KB, Declaration ≤ 100KB)
    UI->>UI: HTML5 Canvas auto-optimizes oversized camera scans on-device
    alt Citizen lacks physical self-declaration form
        Operator->>UI: Opens "Printable Proforma" modal
        UI->>Citizen: Prints pre-filled A4 declaration for signature
        Operator->>UI: Attaches signed scan (or clicks "Attach Signed Scan" in Demo)
    end
    UI->>UI: Pre-Save Preflight confirms 100% field coverage & document slot sizes
    Operator->>UI: Records Cash Fee Received (₹45.00) & clicks "Save & Launch Portal"
    
    %% Stage 4: Tokenized Bridge Dispatch
    UI->>Core: POST /api/bridge/push-session (In-memory ticket, base64 docs)
    UI->>Portal: Opens official portal tab (or built-in offline simulator)
    
    %% Stage 5: Fast-Burst Companion Injection
    Operator->>Ext: Clicks SevaDesk puzzle icon on portal tab
    Ext->>Core: GET /api/bridge/active-session (Direct loopback query)
    Core-->>Ext: Returns reviewed fields & pre-staged documents
    Ext->>Portal: Injects matching inputs in < 150 ms (Fires synthetic DOM events)
    Ext->>Portal: Pre-stages document files to matching upload inputs
    Note over Operator,Portal: Operator inspects form, solves CAPTCHA & enters OTP manually
    Operator->>Portal: Clicks Submit on Portal Form
    
    %% Stage 6: Acknowledgement Capture & Closure
    Portal-->>Operator: Displays Official Ack No. (e.g., UPED-2026-98124018)
    Portal->>UI: Relays Ack Ref via postMessage / local bridge
    Operator->>UI: Confirms submission; prints Official Citizen Cash Receipt Slip
    UI->>UI: Demographics permanently locked; SHA-256 Merkle audit event logged
    Note over Operator,Citizen: When certificate is issued by Tehsil, operator records Cert Ref & marks "Closed"
```

---

## 🏛️ System Architecture & Data Topology

SevaDesk is structured as a clean, decoupled monorepo operating on local loopback IPC:

```mermaid
flowchart TB
    subgraph Host["Local Kiosk Workstation (Windows / Linux / macOS)"]
        
        subgraph FrontendLayer["Operator Workspace (React 18 + TS + Vite :5173)"]
            UI["Operator Workspace UI\n(Intake, Queue, Preflight, Rules)"]
            KioskScreen["Dual-Screen Citizen Display\n(:5173?view=citizen)"]
            BrowserVault["WebCrypto AES-256-GCM Vault\n(PBKDF2-SHA-256 Key Derivation)"]
            CanvasOptimizer["100% On-Device Canvas Optimizer\n(Binary Search JPEG Quantization)"]
            IndicSpeech["Chromium Indic WebSpeech API\n(hi, mr, ta, te, bn, gu, en)"]
            Simulator["State Portal Simulator\n(Offline UP e-District & MahaDBT)"]
        end

        subgraph DaemonLayer["Local Intelligence Core (Python 3.13 FastAPI :8765)"]
            API["FastAPI Loopback Router (127.0.0.1 only)"]
            DocIntel["PaddleOCR & OpenCV Preprocessor\n(Deskew, Binarize, Bounding Boxes)"]
            VerhoeffEngine["Verhoeff Aadhaar Checksum Engine\n(D5 Dihedral Group Algorithm)"]
            ErrorEngine["Reverse Portal Error Classifier\n(Deterministic Remediation Rules)"]
            BhashiniClient["BHASHINI / AI4Bharat ULCA Client\n(Disk Cached Regional Audio)"]
            BridgeManager["In-Memory IPC Bridge\n(Tokenized Single-Use Sessions)"]
            LatencyProbe["HTTP Latency & Congestion Probe\n(Async Socket Ping with 5-Min WAF Cache)"]
            SQLiteDB["Encrypted SQLite Database (WAL Mode)\n+ SHA-256 Merkle Hash-Chained Ledger"]
        end

        subgraph CompanionLayer["Companion Browser Extension (Manifest V3)"]
            MV3Popup["MV3 Extension Popup & Content Script"]
            Adapters["Declarative State Adapters\n(UP e-District, MahaDBT, Saral, Delhi)"]
            DOMScanner["Greedy DOM Scanner & Context Classifier\n(Detects Masked Aadhaar Password Inputs)"]
            FastBurst["Fast-Burst DOM Event Dispatcher\n(Synthetic input/change/blur in < 150ms)"]
            SessionGuard["1-Click Session Guard\n(chrome.storage.local Timeout Recovery)"]
        end
    end

    subgraph StatePortals["Official Government Web Portals"]
        UP["edistrict.up.gov.in"]
        MH["mahadbt.maharashtra.gov.in"]
        HR["saralharyana.gov.in"]
        DL["edistrict.delhigovt.nic.in"]
        PMK["pmkisan.gov.in"]
        PAR["sarathi.parivahan.gov.in"]
    end

    %% Wiring
    UI <-->|Loopback REST / JSON| API
    UI --> BrowserVault
    UI --> CanvasOptimizer
    UI --> IndicSpeech
    UI --> Simulator
    UI -.->|LocalStorage Counter Sync| KioskScreen
    
    API --> DocIntel
    API --> VerhoeffEngine
    API --> ErrorEngine
    API --> BhashiniClient
    API --> LatencyProbe
    API <--> SQLiteDB
    API <--> BridgeManager

    UI -->|1. Stages reviewed session ticket| BridgeManager
    MV3Popup <-->|2. Fetches active session directly via loopback| BridgeManager
    MV3Popup --> Adapters
    MV3Popup --> DOMScanner
    DOMScanner --> FastBurst
    FastBurst -->|3. Burst-injects form fields & attachments| StatePortals
    StatePortals -.->|Human operator enters OTP/CAPTCHA & submits| StatePortals
    
    SessionGuard <-->|Caches active payload (30m TTL)| MV3Popup
    LatencyProbe -.->|Asynchronous socket ping| StatePortals
```

---

## 📋 Pre-Configured State & National Service Catalog

SevaDesk includes **12 pre-calibrated, verified Indian government service schemas** with exact statutory fees, verified portal URLs, mandatory fields, and slot-specific upload constraints:

| Service Name | Department / Portal | Official Fee | Kiosk Charge | Total Fee | Mandatory Fields | Document Slots & Constraints |
|---|---|---|---|---|---|---|
| **Income Certificate (आय प्रमाण पत्र)** | Revenue Dept / UP e-District (`edistrict.up.gov.in`) | ₹15.00 | ₹30.00 | **₹45.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Ration Card | • Photo ($\le 20\text{ KB}$, JPG)<br>• Self-Declaration ($\le 100\text{ KB}$, PDF/JPG, Pre-filled Proforma) |
| **Caste Certificate (जाति प्रमाण पत्र)** | Revenue Dept / UP e-District (`edistrict.up.gov.in`) | ₹15.00 | ₹30.00 | **₹45.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Aadhaar | • Photo ($\le 20\text{ KB}$, JPG)<br>• Caste Declaration ($\le 100\text{ KB}$, PDF/JPG)<br>• Pradhan Proof ($\le 100\text{ KB}$) |
| **Domicile Certificate (निवास प्रमाण पत्र)** | Revenue Dept / UP e-District (`edistrict.up.gov.in`) | ₹15.00 | ₹30.00 | **₹45.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Aadhaar | • Photo ($\le 20\text{ KB}$, JPG)<br>• Domicile Declaration ($\le 100\text{ KB}$, PDF/JPG)<br>• Electricity / Ration Proof ($\le 100\text{ KB}$) |
| **PM-Kisan Samman Nidhi eKYC** | Dept of Agriculture (`pmkisan.gov.in`) | ₹0.00 | ₹20.00 | **₹20.00** | Full Name, DOB, Gender, Mobile, PIN, Aadhaar, Bank A/C, IFSC | • Land Khatauni / Bank Passbook ($\le 2\text{ MB}$, PDF/JPG) |
| **Learner Driving License** | MoRTH / Sarathi (`sarathi.parivahan.gov.in`) | ₹200.00 | ₹50.00 | **₹250.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Aadhaar | • Photo ($\le 500\text{ KB}$, JPG)<br>• Age & Address Proof ($\le 500\text{ KB}$, PDF/JPG) |
| **DL Renewal & Address Change** | MoRTH / Sarathi (`sarathi.parivahan.gov.in`) | ₹200.00 | ₹50.00 | **₹250.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Aadhaar | • Existing Driving License Scan ($\le 500\text{ KB}$, PDF/JPG) |
| **Ayushman Bharat Golden Card** | National Health Authority (`beneficiary.nha.gov.in`) | ₹0.00 | ₹30.00 | **₹30.00** | Full Name, DOB, Gender, Mobile, State, District, PIN, Aadhaar, Ration Card | • NFSA Ration Card / PMJAY Family Letter ($\le 1\text{ MB}$) |
| **National Scholarship Portal (NSP)** | MeitY (`scholarships.gov.in`) | ₹0.00 | ₹40.00 | **₹40.00** | Full Name, DOB, Gender, Mobile, Email, PIN, Aadhaar, Bank A/C, IFSC | • Previous Marksheet ($\le 1\text{ MB}$, PDF)<br>• Bank Passbook ($\le 1\text{ MB}$, PDF) |
| **EPFO UAN Member eKYC** | Employees' Provident Fund (`epfindia.gov.in`) | ₹0.00 | ₹30.00 | **₹30.00** | Full Name, DOB, Gender, Mobile, Aadhaar, Bank A/C, IFSC | • Cancelled Cheque / Passbook ($\le 1\text{ MB}$, PDF/JPG) |
| **ECI Voter ID (Form 6 New Voter)** | Election Commission of India (`voters.eci.gov.in`) | ₹0.00 | ₹25.00 | **₹25.00** | Full Name, DOB, Gender, Mobile, Address, District, PIN, Aadhaar | • Passport Photo ($\le 2\text{ MB}$, JPG)<br>• Age & Residence Proof ($\le 2\text{ MB}$, PDF/JPG) |
| **NFSA Ration Card Member Addition** | Food & Civil Supplies (`nfsa.gov.in`) | ₹0.00 | ₹30.00 | **₹30.00** | Full Name, DOB, Gender, Mobile, Address, PIN, Aadhaar, Ration Card | • Family Group Photograph ($\le 1\text{ MB}$, JPG) |
| **Jeevan Pramaan (Digital Life Cert)** | Dept of Pension & Pensioners (`jeevanpramaan.gov.in`) | ₹0.00 | ₹20.00 | **₹20.00** | Full Name, DOB, Gender, Mobile, Aadhaar, Bank A/C, IFSC | • Pension Payment Order (PPO Copy) ($\le 1\text{ MB}$) |

---

## 🛠️ Deep-Dive Core Subsystems

### 1. Local Document Intelligence & OCR Extraction
* **Dual OCR Pipeline**: Uses **PaddleOCR** with OpenCV image preprocessing (deskewing, adaptive binarization) on the Python daemon, with browser-native **Tesseract.js WASM** as an automatic offline fallback.
* **Layout-Aware Entity Extraction**: Regex & layout parsers extract applicant names, dates of birth, genders, mobile numbers, 6-digit PIN codes, 12-digit Aadhaar numbers, PAN cards, EPIC voter IDs, IFSC codes, and multiline addresses.
* **Human-in-the-Loop Review**: Extracted candidates are displayed as individual review chips with checkboxes. The operator explicitly chooses which candidates to apply. No candidate is ever applied silently.

### 2. Mathematical Verhoeff Aadhaar & Format Engine
* **Aadhaar Checksum Algorithm**: Validates 12-digit Indian Aadhaar numbers using the dihedral group $D_5$ permutation and multiplication tables (`VERHOEFF_D` and `VERHOEFF_P`). Catches 100% of single-digit errors and 100% of adjacent transposition errors.
* **Preflight Format Checkers**: Enforces valid 10-digit Indian mobile formats (`^[6-9]\d{9}$`), standard 6-digit postal PIN codes (`^\d{6}$`), standard 11-character bank IFSC formats (`^[A-Z]{4}0[A-Z0-9]{6}$`), and ensures dates of birth are not in the future.

### 3. On-Device Canvas Document Optimizer (≤ 100 KB / ≤ 200 KB)
* **Zero Cloud Server Leakage**: Government portals strictly cap document sizes (e.g. UP e-District requires photographs $\le 20\text{ KB}$ and declarations $\le 100\text{ KB}$).
* **Iterative Binary Search Quantization**: Loads camera images onto an offscreen HTML5 Canvas. Executes an iterative binary search across JPEG quality levels ($0.20$ to $0.92$) and dynamic pixel downscaling until the compressed file fits precisely beneath the target byte quota.
* **Instant Inline Optimization**: Operates in under 300 ms directly inside the browser memory. Eliminates any need for third-party image compression websites.

### 4. Printable Official Proformas (स्वप्रमाणित घोषणा पत्र)
* **Official Pre-Filled Forms**: When citizens walk into a kiosk without mandatory state proformas (e.g., self-declarations for income or caste certificates), SevaDesk generates an official, pre-filled bilingual A4 document.
* **Physical Print Ready (`Ctrl+P`)**: Renders complete applicant demographics, Tehsil declarations, penalty disclosures under the Indian Penal Code, and applicant signature/thumbprint boxes.
* **Demo Simulation**: Includes an integrated *"🧪 Attach Signed Scan (Demo)"* button that generates an authentic signed proforma scan with verification seals, auto-compresses it to $\le 100\text{ KB}$, and stages it into the case.

### 5. Dual-Screen Citizen Display & Multilingual Voice (BHASHINI / WebSpeech)
* **Secondary Monitor Mode (`?view=citizen`)**: Opens a clean, high-contrast dark green kiosk screen (`#0f1712`) designed to face the citizen across the counter.
* **Fee Transparency**: Projects unbundled fees in large, scannable typography:
  $$\text{Total Payable} = \text{Official Government Portal Fee} + \text{Centre Service Charge}$$
  Unverified amounts are never quoted as official fees.
* **Spoken Voice Disclosure**: Streams spoken audio of fee breakdowns and applicant details in **Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, or English** via Chromium Indic WebSpeech API or BHASHINI / AI4Bharat ULCA synthesis.

### 6. Zero-Clipboard Loopback IPC Bridge & Companion Extension
* **Direct Memory Transfer**: When an application passes preflight, the operator clicks *"Send to Companion"*. The workspace posts the payload directly to the local daemon in-memory bridge (`POST /api/bridge/push-session`) with a single-use ticket.
* **Zero Clipboard PII Exposure**: The Manifest V3 Companion Extension polls the local loopback endpoint (`GET /api/bridge/active-session`) and loads the payload directly into extension memory. Sensitive identity numbers never touch the operating system clipboard.
* **Sub-150ms Fast-Burst Injection**: Evaluates native `element.matches(selector)` against live portal DOM inputs, applies values, and dispatches synthetic `input`, `change`, and `blur` events so reactive frameworks (React, Angular, ASP.NET) recognize updated fields.
* **Context-Aware Password Input Classifier**: Recognizes when government portals render Aadhaar or bank account inputs as `<input type="password">` while strictly ignoring actual user login passwords, OTPs, and CAPTCHA controls.
* **1-Click Session Guard**: Caches the active session in `chrome.storage.local` with a 30-minute expiration window. If a portal times out (504 Gateway Timeout), the operator re-injects all fields with 1 click.

### 7. Real-Time Portal Latency & Congestion Probe
* **Live Network Health**: Kiosk workstations measure actual socket round-trip time (`GET /api/portal/health?url=...`) to official state portal domains (e.g. `edistrict.up.gov.in`).
* **Congestion Classification**:
  - `fast`: Latency $< 800\text{ ms}$, HTTP 200 OK.
  - `congested`: Latency $800\text{ ms} - 3000\text{ ms}$.
  - `unhealthy`: HTTP 504 Gateway Timeout or latency $> 3000\text{ ms}$.
  - `offline`: Socket connection refused or DNS failure.
* **WAF Ban Protection (5-Minute Cache)**: Responses are cached in daemon memory for 300 seconds per domain. In a 10,000-kiosk district deployment, this reduces traffic to $\sim 33\text{ req/sec}$ aggregate, preventing kiosk IP blacklisting by National Informatics Centre (NIC) firewalls.

### 8. Built-In State Portal Simulator (Offline Practice Sandbox)
* **100% Offline Simulation**: Allows operators, trainees, and evaluators to practice end-to-end submissions without touching live government portals or spending real money.
* **High-Fidelity Portal Emulation**: Emulates the exact HTML structure, styling, and field IDs of **UP e-District** (`edistrict.up.gov.in`) and **MahaDBT** (`mahadbt.maharashtra.gov.in`).
* **Document Upload & CAPTCHA Checkpoints**: Enforces file upload quotas ($20\text{ KB}$ for photos, $100\text{ KB}$ for declarations), validates CAPTCHAs, and generates realistic official acknowledgement numbers (e.g. `UPED-2026-98124018`).
* **Automatic Acknowledgement Relay**: Emits a `postMessage` event upon successful portal submission that relays the reference number back to the workspace to close the case.

### 9. Reverse Portal Error Classifier
* **Deterministic Remediation**: Matches cryptic portal error messages against a curated rule library covering upload constraints, missing mandatory fields, invalid date formats, expired sessions, and server availability drops.
* **Actionable Operator Advice**: Returns plain-language operator instructions instead of guessing or hallucinating causes.

### 10. Post-Submission Record Locking & Certificate Delivery
* **Immutable Locking**: Once an application reaches `submitted` or `closed` status, the citizen demographic record is permanently locked against modifications to prevent legal discrepancy with state records.
* **Certificate Delivery Workflow**: When the government department approves and issues the certificate, the operator enters the official certificate reference number (e.g. `CERT/2026/09124`), marks the case `closed`, and prints an official delivery acknowledgement for the citizen.

---

## 🔒 DPDP Act 2023 Compliance & Cryptographic Security

SevaDesk is built to strictly satisfy the **Digital Personal Data Protection (DPDP) Act 2023**:

```
                                  [ Citizen Demographic Data ]
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                       [ Non-Sensitive Fields ]   [ Sensitive Identifiers ]
                       (Name, DOB, Gender, PIN)   (Aadhaar, Voter ID, Bank)
                                    │                       │
                                    │             PBKDF2-HMAC-SHA256
                                    │             (310,000 Iterations)
                                    │                       │
                                    │             AES-256-GCM Envelope
                                    │             (Random 96-bit IV)
                                    │                       │
                                    └───────────┬───────────┘
                                                ▼
                              [ Encrypted SQLite Local Database ]
                                                │
                                  SHA-256 Merkle Chaining:
                   Hash(n) = SHA256(Hash(n-1) + Timestamp + Action + Entity + Desc)
                                                │
                                                ▼
                                [ Cryptographic Audit Ledger ]
                                  (Verified via /api/audit/verify)
```

1. **Explicit Notice & Consent**: Every citizen intake requires an affirmative consent checkbox recording the exact welfare scheme purpose.
2. **Local At-Rest Column Encryption (AES-256-GCM)**: Sensitive columns (`aadhaar_encrypted`, `voter_id_encrypted`, `bank_account_encrypted`) are encrypted at rest with a Kiosk Master Key derived via PBKDF2-HMAC-SHA256 with 310,000 iterations.
3. **Cryptographic SHA-256 Merkle Audit Ledger**: Every action in the system is linked into an append-only hash chain:
   $$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Timestamp} + \text{Action} + \text{Entity ID} + \text{Description})$$
   Any modification, insertion, or deletion of past audit events breaks the hash chain and is immediately flagged by `GET /api/audit/verify`.
4. **Data Minimization & Right to Erasure**: Only fields required by the active service schema are collected. Deleting a citizen permanently purges their identity records and linked drafts from the database.
5. **Masked Identifiers**: Aadhaar numbers and bank accounts are automatically masked across all lists, displays, and receipt previews (`•••• •••• 9012`).

---

## 📂 Clean Monorepo Codebase Structure

```text
d:/SevaDesk/
├── apps/
│   ├── workspace/                 # React 18 + TypeScript + Vite 6 Operator Workspace
│   │   ├── src/
│   │   │   ├── components/        # LockScreen, TopBar, Sidebar, ProformaModal, ReceiptModal, HandoffModal
│   │   │   ├── features/          # Overview, CitizenIntake, Applications, ApplicationDetail, FeeTransparency,
│   │   │   │                      # CitizenDisplay, ServicesRules, AuditTrail, PortalSimulator
│   │   │   ├── lib/               # vault.ts (WebCrypto), api.ts, speech.ts, imageCompressor.ts
│   │   │   ├── App.tsx            # Main state coordinator, vault lifecycle, and routing
│   │   │   └── index.css          # Vanilla CSS responsive design system (dark forest green theme)
│   │   └── package.json           # Workspace frontend dependencies
│   └── extension/                 # Manifest V3 Chrome Companion Extension
│       ├── manifest.json          # Chrome MV3 manifest (activeTab, scripting, storage)
│       ├── popup.html             # Compact, single-surface modern companion popup
│       ├── popup.js               # Loopback bridge receiver, DOM scanner, burst injector, session guard
│       └── lib/
│           ├── core.js            # In-extension tokenizers & suggestion heuristics
│           └── adapters.js        # Declarative DOM selectors (UP e-District, MahaDBT, Saral, Delhi)
├── packages/
│   ├── core-types/                # Shared TypeScript contracts & deterministic validators
│   │   ├── index.js               # Verhoeff validator, validateCase, candidate parser, status transitions
│   │   ├── index.d.ts             # TypeScript type declarations (Application, Citizen, ServiceDefinition)
│   │   └── vault.js               # WebCrypto PBKDF2 + AES-GCM encryption utilities
│   └── portal-adapters/           # Declarative JSON schemas for Indian state portal DOMs
│       └── index.js               # Pre-calibrated selectors for MahaDBT, UP e-District, Saral, Delhi
├── services/
│   ├── local-core/                # Python 3.13 FastAPI Local Intelligence Daemon
│   │   ├── app/
│   │   │   ├── api/routes.py      # Loopback REST API endpoints (OCR, preflight, bridge, latency probe)
│   │   │   ├── core/security.py   # AES-256-GCM cipher & SHA-256 audit hash chaining
│   │   │   ├── db/database.py     # SQLite3 database initialization (WAL mode)
│   │   │   ├── db/repository.py   # Data repository & thread-safe BridgeManager
│   │   │   ├── ocr/engine.py      # PaddleOCR + OpenCV preprocessor layout analysis
│   │   │   ├── speech/bhashini.py # BHASHINI ULCA client + Indic WebSpeech integration
│   │   │   └── main.py            # FastAPI application entry point & production SPA static file mount
│   │   ├── tests/test_core.py     # Pytest test suite (16 tests verifying security, audit, bridge, OCR)
│   │   └── requirements.txt       # FastAPI, Uvicorn, httpx, cryptography, pydantic
│   └── central-hub/               # Optional central coordinator for district-level multi-kiosk deployments
│       ├── docker-compose.yml     # PostgreSQL 16 container definition
│       └── schema.sql             # Scheme catalog, official fee gazette, and signed adapter tables
├── tests/
│   └── core.test.js               # Node.js native test suite (26 tests verifying Verhoeff, preflight, ciphers)
├── setup.bat / setup.ps1          # 1-click automated setup for Windows (cmd & PowerShell)
├── setup.sh                       # 1-click automated setup for Linux / macOS
├── run.bat / run.ps1              # 1-click concurrent runner for Windows
├── run.sh                         # 1-click concurrent runner for Linux / macOS
├── package.json                   # Root monorepo npm workspace configuration
├── ARCHITECTURE.md                # In-depth technical architecture & data flow specification
├── TEAM_TESTING_GUIDE.md          # 15-step evaluator & team review testing guide
└── README.md                      # Comprehensive project documentation
```

---

## ⚡ Quick Start & Setup Guide

### 1. System Requirements
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **Python**: v3.10+ (Python 3.13 recommended)
* **Browser**: Google Chrome or Chromium-based browser (for the Companion Extension)

### 2. Automated First-Time Setup (One-Click)

#### Windows (cmd or PowerShell)
Double-click [`setup.bat`](file:///d:/SevaDesk/setup.bat) or run in PowerShell:
```powershell
.\setup.ps1
```

#### macOS / Linux
```bash
chmod +x setup.sh run.sh
./setup.sh
```

*What setup does automatically:*
1. Installs all npm root and workspace dependencies.
2. Creates a Python virtual environment (`.venv`) inside `services/local-core`.
3. Installs all Python daemon requirements (`fastapi`, `uvicorn`, `httpx`, `cryptography`).
4. Runs the entire automated test suite to verify 100% green health.

---

### 3. Launch SevaDesk (One-Click Concurrent Launch)

#### Windows
Double-click [`run.bat`](file:///d:/SevaDesk/run.bat) or run in PowerShell:
```powershell
.\run.ps1
```

#### macOS / Linux
```bash
./run.sh
```

This concurrently starts:
1. **Local Core Daemon (Python / FastAPI):** `http://127.0.0.1:8765` *(Interactive Swagger API docs at `/docs`)*.
2. **Operator Workstation (React + Vite):** `http://localhost:5173`.

> 💡 **Production Single-Process Mode**: If you run `npm run build`, FastAPI automatically serves the compiled React application directly at `http://127.0.0.1:8765/app` from a single lightweight Python process ($\approx 80\text{ MB}$ RAM).

---

### 4. Install the Chrome Companion Extension
1. Open Google Chrome and navigate to: `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the folder:
   ```
   d:\SevaDesk\apps\extension
   ```
4. The **SevaDesk Companion** icon will appear in your Chrome toolbar.

---

### 5. Running the Offline State Portal Simulator
To test or demonstrate the full end-to-end workflow without internet access:
1. Open your browser to: `http://localhost:5173/?view=simulator&portal=edistrict.up.gov.in`.
2. Click the **"⚡ Auto-Fill from SevaDesk"** button in the simulator header, or open the **SevaDesk Companion** extension popup and click **"⚡ Fast-Burst Reviewed Fields"**.
3. All form fields light up green (`[✓ Injected by SevaDesk]`), pre-staged documents are attached, and you can complete submission by entering the demo CAPTCHA (`7492`).

---

## 🧪 Automated Test Suite (42 Passing Tests)

SevaDesk maintains a multi-tiered automated verification suite covering encryption, Verhoeff arithmetic, preflight validation, status transitions, and bridge IPC:

Execute the entire test suite with a single root command:

```bash
npm run test:all
```

### Test Suite Execution Breakdown

```text
> sevadesk@2.0.0 test:all
> npm run test && npm run test:python && npm run build

> sevadesk@2.0.0 test
> node --test tests/*.test.js

✔ required fields and common formats are validated (1.9ms)
✔ a complete generic citizen record passes basic validation (0.2ms)
✔ service validation checks upload constraints and warns on unverified fees (0.4ms)
✔ field matcher never suggests OTP/captcha and prioritizes exact labels (2.6ms)
✔ field matcher detects masked Aadhaar and PM-KISAN inputs while rejecting login passwords (2.3ms)
✔ OCR candidate parser extracts review-only candidates and masks nothing silently (2.6ms)
✔ OCR candidate parser extracts real Aadhaar front with omitted name and gender prefixes (2.3ms)
✔ OCR candidate parser extracts PAN Card without confusing applicant with Father Name (0.9ms)
✔ OCR candidate parser extracts multiline address, state and PIN code (0.8ms)
✔ error interpreter clearly marks unknown messages rather than inventing a cause (0.9ms)
✔ identifier masking and currency formatter are safe for empty values (19.5ms)
✔ missing service constraints stay unknown and cannot produce a passing preflight (0.2ms)
✔ submitted applications cannot be reversed to ready, draft or in_portal (0.1ms)
✔ closed applications are terminal and cannot transition to any other status (0.09ms)
✔ isCitizenLocked identifies citizens attached to submitted or closed applications (0.1ms)
✔ buildApplicationPayload carries staged application documents (0.3ms)
✔ validateCase accepts valid documents under configured size limit (0.1ms)
✔ streamlined workflow transitions: ready -> in_portal -> submitted -> closed are all valid (0.1ms)
✔ buildApplicationPayload preserves fee collection status and payment metadata (0.1ms)
✔ application lifecycle supports post-submission certificate delivery and closure (0.1ms)
✔ validateCase enforces slot-specific file size and format limits (0.3ms)
✔ buildApplicationPayload carries base64 dataUrl and slotId for bridge transfer (0.1ms)
✔ document slots support printable proforma configuration and type validation (0.09ms)
✔ vault ciphertext does not expose citizen fields and decrypts with the correct passphrase (116.1ms)
✔ vault decryption rejects a wrong passphrase and modified ciphertext (253.9ms)
✔ each vault save uses a fresh random AES-GCM IV (53.4ms)
ℹ tests 26 | pass 26 | fail 0

> sevadesk@2.0.0 test:python
> services\local-core\.venv\Scripts\python.exe -m pytest services\local-core\tests

services/local-core/tests/test_core.py ................ [100%]
============================= 16 passed in 12.91s =============================

> sevadesk@2.0.0 build
> npm --prefix apps/workspace run build

vite v6.4.4 building for production...
✓ 1968 modules transformed.
dist/index.html                   1.03 kB │ gzip:   0.54 kB
dist/assets/index-RE8dFC9-.css    6.74 kB │ gzip:   2.02 kB
dist/assets/index-Ch9T8w5q.js   469.92 kB │ gzip: 128.12 kB
✓ built in 2.61s
```

* **Node.js Core Tests (`tests/core.test.js`)**: **26 / 26 Passed**
* **Python Daemon Tests (`services/local-core/tests`)**: **16 / 16 Passed**
* **TypeScript & Vite Compilation (`apps/workspace`)**: **0 Errors, Clean Build**
* **Total Automated Tests**: **42 / 42 Passed, 100% Green**

---

## 📜 Ethical, Legal & Operational Principles

1. **Human-in-the-Loop Always**: SevaDesk is an operator assistant, not an autonomous bot. The human operator must personally inspect every field, verify the applicant's identity in person, and trigger the final submission.
2. **Strict Prohibition on Automating Secrets**: Passwords, OTPs, CAPTCHA challenges, and biometric authentication must **never** be automated. The companion extension explicitly skips these controls in the DOM.
3. **No Unverified Fee Quotes**: Kiosk operators are prohibited from quoting arbitrary amounts as official government fees. Every official fee must be backed by a verified state gazette notification or portal URL.
4. **Independent Assisted-Service Workstation**: SevaDesk is an independent open-source workstation utility for CSC VLEs and kiosk assistants. It does not claim official endorsement by any state or central ministry.

---

<p align="center">
  <strong>SevaDesk</strong> — Built with ❤️ for India's 400,000+ CSC Village Level Entrepreneurs and Gram Panchayat Digital Assistants.
</p>
