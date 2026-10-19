# SevaDesk Browser Companion (Chrome / Chromium Manifest V3)

> **Assisted Form-Filling & Session Guard for Indian Common Service Centre (CSC) Operators**

The SevaDesk Browser Companion is a Manifest V3 browser extension designed specifically for operators navigating slow, congested, or timeout-prone Indian state government portals (such as MahaDBT, UP e-District, Antyodaya Saral Haryana, and e-District Delhi).

---

## ⚡ Key Capabilities

### 1. Direct Loopback IPC Bridge (Zero-Clipboard PII Safety)
Instead of forcing the operator to copy sensitive citizen demographic data to the operating system clipboard (which exposes PII to all running background apps and keyloggers), the extension directly communicates with the SevaDesk Local Core daemon via local loopback (`http://127.0.0.1:8765/api/bridge/active-session`).
* When the operator clicks **"Send to Companion"** in the SevaDesk Workspace, an in-memory session ticket is queued.
* Opening the extension popup immediately fetches the reviewed case and pre-selects the appropriate portal adapter.

### 2. Declarative Portal Adapters
Pre-calibrated, declarative field-mapping schemas tailored to state e-governance portals:
* **MahaDBT** (`mahadbt.maharashtra.gov.in`)
* **UP e-District** (`edistrict.up.gov.in`)
* **Antyodaya Saral Haryana** (`saralharyana.gov.in`)
* **e-District Delhi** (`edistrict.delhigovt.nic.in`)
* **Generic Fallback:** Heuristic fuzzy matcher for any other national or state portal (`serviceonline.gov.in`, state portals).

The engine uses native W3C `element.matches(selector)` against live DOM trees and stable element fingerprints rather than fragile array indices.

### 3. Sub-150ms Fast-Burst Form Injection
Government portals frequently freeze, lag, or timeout if field values are typed slowly. SevaDesk's burst injector:
* Locates target input fields in parallel.
* Populates reviewed values in **under 150 milliseconds**.
* Invokes native React/Angular prototype property setters and dispatches synthetic `input`, `change`, and `blur` events so modern reactive web frameworks detect updated values.
* Displays a live stopwatch timer: `⚡ Injected N fields in X ms`.

### 4. 1-Click Session Guard (Timeout Recovery)
State government portals frequently crash with `504 Gateway Timeout` or `Session Expired` after an operator has spent 15 minutes entering documents.
* SevaDesk automatically preserves the last injected session in `chrome.storage.local` with a 30-minute rolling expiration.
* If a session expires or the page reloads, the operator clicks **"⚡ Restore Last Session"** to re-inject all reviewed fields in a single click without returning to the workspace.

### 5. On-Portal Error Inspector
When a portal rejects an upload or displays an obscure error code (e.g., `ERR_DOC_INVALID_LEN_OR_FORMAT`), the operator can click **"Scan On-Screen Portal Errors"**.
* Extracts active error banners, alerts, and inline form feedback directly from the page DOM.
* Queries the SevaDesk Local Core reverse error classifier (`POST /api/error-interpreter/analyze`).
* Renders clear, actionable remediation guidance in plain English and Hindi (e.g., *"Upload exceeds 200 KB limit. Re-scan or compress using SevaDesk Canvas Optimizer."*).

---

## 🔒 Security & Privacy Guarantees

* **Zero Cloud Analytics / Tracking:** Has zero telemetry, zero analytics scripts, and makes no network requests outside `http://127.0.0.1:8765`.
* **Zero Authentication Tampering:** The extension **NEVER**:
  * Touches password fields (`type="password"`).
  * Automates or fills One-Time Passwords (OTP).
  * Bypasses or solves CAPTCHAs.
  * Clicks the final "Submit" or "Payment" button.
* **Human-in-the-Loop:** All field matches are displayed with individual confirmation toggles before injection. The operator remains in full control.

---

## 🛠️ Installation & Setup

1. Open Google Chrome or any Chromium-based browser (Brave, Edge, Chromium).
2. Navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select this folder:
   ```text
   d:\SevaDesk\apps\extension
   ```
6. The **SevaDesk Companion** icon will appear in your Chrome toolbar. Pin it for quick access!

---

## 📋 Directory Structure

```text
apps/extension/
├── manifest.json         # Manifest V3 configuration with activeTab & scripting permissions
├── package.json          # Monorepo workspace definition
├── popup.html            # Extension popup interface with burst injection & error inspector
├── popup.js              # State machine, IPC bridge client, burst timer, & timeout cache
├── popup.css             # High-contrast accessible kiosk theme
├── lib/
│   ├── core.js           # Core field matcher and heuristic fallback engine
│   └── adapters.js       # Declarative schemas for MahaDBT, UP, Saral, and Delhi
└── icons/
    ├── icon16.png        # 16x16 toolbar icon
    ├── icon48.png        # 48x48 extensions management icon
    └── icon128.png       # 128x128 Chrome web store icon
```
