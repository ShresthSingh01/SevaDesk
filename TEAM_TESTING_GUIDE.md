# SevaDesk — Team Testing & Evaluator Review Guide

> **A comprehensive step-by-step walkthrough for team members, evaluators, and peer reviewers to test every feature of SevaDesk in real time.**

---

## 🚀 Quick Launch (30 Seconds)

### Step 1: Automated Setup (First-Time Only)
* **Windows:** Double-click [`setup.bat`](file:///d:/SevaDesk/setup.bat).
* **macOS / Linux:** Run `./setup.sh`.
*(Installs all npm packages, creates Python `.venv`, installs requirements, and runs the test suite).*

### Step 2: Start SevaDesk
* **Windows:** Double-click [`run.bat`](file:///d:/SevaDesk/run.bat) or execute in PowerShell:
  ```powershell
  .\run.ps1
  ```
* **macOS / Linux:**
  ```bash
  ./run.sh
  ```

This concurrently launches:
* **Operator Workspace:** `http://localhost:5173`
* **Local Core Daemon (FastAPI):** `http://127.0.0.1:8765` (Swagger Docs: `http://127.0.0.1:8765/docs`)

---

## 🧪 Comprehensive Feature Test Walkthrough

---

### Test 1: Cryptographic Vault Setup & Master Passphrase
1. Open `http://localhost:5173` in your browser.
2. You will be greeted by the **SevaDesk Lock Screen**.
3. Enter your operator credentials:
   * **Operator Name:** `Arun Patel`
   * **Centre Name:** `Kisan Seva Kendra #104`
   * **Master Passphrase:** Enter any passphrase of your choice *(minimum 10 characters)*
4. Click **"Initialize encrypted vault"**.
5. **Expected Result:**
   * The workspace unlocks into the **Overview Dashboard**.
   * Notice the status pill in the top header displays **"Local Core connected"** in green.
   * Your master key is derived locally in memory via **PBKDF2-SHA-256 (100,000 iterations)** and never stored in plaintext.

---

### Test 2: Service Rules & Verified Fee Configuration
*(SevaDesk enforces real portal constraints rather than guessing fees or rules).*

1. Navigate to **"Services & rules"** in the sidebar.
2. Click **"+ Add new service"**.
3. Fill in the following real government service details:
   * **Service Name:** `Income Certificate (आय प्रमाण पत्र)`
   * **Department:** `Revenue Department / e-District`
   * **Verified Portal URL:** `https://edistrict.up.gov.in`
   * **Mandatory Portal Fields:** Select `Full Name`, `Date of Birth`, `Gender`, `Mobile Number`, `PIN Code`, `Aadhaar Number`.
   * **Accepted File Extensions:** Select `.pdf`, `.jpg`, `.jpeg`.
   * **Max Upload Size:** `0.2` MB *(200 KB — the real state portal upload limit)*.
   * **Official Government Portal Fee:** `₹50.00`.
   * **Kiosk Operator Charge:** `₹30.00`.
   * **Fee Source / Gazette URL:** `https://edistrict.up.gov.in/fee-notification.pdf`.
   * **Verified Date:** Today's date.
4. Click **"Save service definition"**.
5. **Expected Result:** The service appears in your catalog, marked with a green **"Operator verified"** badge.

---

### Test 3: Citizen Intake & Mathematical Verhoeff Aadhaar Verification
*(Tests DPDP Act consent and the dihedral group $D_5$ Aadhaar error catcher).*

1. Click **"Citizen intake"** in the sidebar.
2. Try clicking **"Save citizen details"** immediately without checking consent:
   * **Expected Result:** Blocked with an error: *"Citizen consent must be recorded before saving personal records."*
3. Check the **"I confirm the applicant was informed of this purpose..."** affirmative consent box.
4. Fill in the applicant's details:
   * **Full Name:** `Rajesh Kumar Sharma`
   * **Date of Birth:** `1988-06-15`
   * **Gender:** `Male`
   * **Mobile Number:** `9876543210`
   * **PIN Code:** `110001`
5. **Test the Verhoeff Error Catcher:**
   * In the **Aadhaar Number** field, enter: `999999999991` (an invalid checksum).
   * Click **"Save citizen details"**.
   * **Expected Result:** The system flags an instant blocking error: *"Aadhaar number failed Verhoeff checksum validation. Check for typos or transposed digits."*
6. **Enter a Mathematically Valid Aadhaar:**
   * Replace with: `999999999999` (a valid Verhoeff number).
   * Click **"Save citizen details"**.
   * **Expected Result:** The citizen record is encrypted into the vault and synchronized to the local SQLite database.

---

### Test 4: Physical Document OCR (Local Pixel Extraction)
1. In the **Citizen Intake** screen, look at the **"Physical Document Intelligence"** section.
2. Select an image file from your computer (e.g., an ID card photo or any sample JPEG/PNG).
3. Click **"Run document scan"**.
4. **Expected Result:**
   * The in-browser **Tesseract WASM worker** initializes in the background.
   * A progress indicator shows pixel text recognition progress.
   * Extracted fields appear as candidate chips with individual checkboxes.
   * The operator reviews the fields and clicks **"Apply checked candidates"** to auto-populate the form without manual re-typing.

---

### Test 5: Explainable Preflight Validation
1. Click **"New application"** in the top bar.
2. Select `Rajesh Kumar Sharma` and `Income Certificate`.
3. Click **"Create application"**. You will be taken to the **Application Detail** screen.
4. Click **"Run preflight checks"**.
5. **Expected Result:**
   * If all required fields are filled, you receive a green **"Preflight Passed"** banner.
   * If you attach a file larger than `0.2 MB` (200 KB), the validator flags a blocking error: *"Document exceeds configured maximum upload size of 0.2 MB."*
   * Once valid, click **"Send to Companion"** (Direct Loopback IPC).
   * A toast notification confirms: *"Dispatched to SevaDesk Companion! Open extension puzzle icon on portal."* (Zero OS clipboard exposure).

---

### Test 6: Dual-Screen Citizen Fee Transparency & Voice Readout
1. Open a new browser window or secondary monitor.
2. Navigate to: `http://localhost:5173?view=citizen` *(or click "Open citizen display" from the Fee Transparency page)*.
3. Select `Income Certificate`.
4. **Expected Result:**
   * A clean, full-screen dark green kiosk display (`#0f1712`) renders in large typography:
     * **Official Government Portal Fee:** `₹50.00`
     * **Centre Service Charge:** `₹30.00`
     * **Total Amount Payable:** `₹80.00`
5. Select **Hindi (हिन्दी)** and click **"Listen to fee disclosure"**.
6. **Expected Result:**
   * The workstation streams real spoken voice audio:
     > *"इस सेवा का नाम Income Certificate है। सरकारी पोर्टल शुल्क: 50.00 रुपये। केंद्र सेवा शुल्क: 30.00 रुपये। कुल देय राशि: 80.00 रुपये।"*

---

### Test 7: Manifest V3 Browser Companion Extension
1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in upper right).
4. Click **"Load unpacked"** and select the folder:
   ```
   d:\SevaDesk\apps\extension
   ```
5. Open any web page (e.g., `https://edistrict.up.gov.in` or a test form).
6. Click the **SevaDesk Companion** puzzle icon in your Chrome toolbar.
7. **Expected Result:**
   * The extension automatically connects to the Local Core daemon via loopback (`http://127.0.0.1:8765/api/bridge/active-session`).
   * Displays green status: *"Bridge Active: Loaded reviewed data for Rajesh Kumar Sharma (Income Certificate)"* with zero manual copy-pasting.
   * Matches fields using native CSS selector resolution (`element.matches()`) and stable element fingerprints.
   * Click **"Fill reviewed fields"** to inject the reviewed values with native framework event dispatchers.
   * Password, CAPTCHA, OTP, and submit controls are strictly excluded, keeping the operator in complete control.

---

### Test 8: Reverse Portal Error Diagnostics
1. In the **Application Detail** page, scroll down to the **"Portal Error Diagnostics"** panel.
2. Paste this common government portal error into the box:
   ```text
   Upload Failed: Attached file size exceeds portal limit (200KB).
   ```
3. Click **"Interpret message"**.
4. **Expected Result:**
   * The rule engine classifies the issue as **"Document upload"**.
   * It provides exact remediation guidance: *"The portal message appears related to an upload size limit. Compress or rescan under 200 KB."*

---

### Test 9: Real At-Rest SQLite Column Encryption
1. In a terminal, run:
   ```bash
   services\local-core\.venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('services/local-core/data/sevadesk_local.db'); print(conn.execute('SELECT aadhaar_encrypted FROM citizens LIMIT 1;').fetchone()[0])"
   ```
2. **Expected Result:** Outputs a base64 AES-256-GCM encrypted envelope (e.g. `...==`). Plaintext Aadhaar or bank numbers are strictly NEVER stored in plaintext on disk.

---

### Test 10: Cryptographic Hash-Chained Audit Ledger
1. Navigate to **"Audit trail"** in the sidebar.
2. Click the **"Verify Cryptographic Chain"** button at the top right.
3. **Expected Result:** A banner immediately appears displaying:
   > *"Cryptographic Non-Repudiation Verified — SHA-256 Merkle chain verified across X events."*

---

### Test 11: Automated Test Suite (All Green)
Run the full test suite across the entire monorepo:
```bash
npm run test:all
```
* **Node.js Core Tests:** `tests/*.test.js` ➔ **11/11 Passed**
* **Python Daemon Tests:** `services/local-core/tests` ➔ **10/10 Passed**
* **TypeScript & Vite Compilation:** `apps/workspace` ➔ **0 errors, 1,963 modules transformed cleanly**
