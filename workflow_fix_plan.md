# SevaDesk — Workflow Flaw Analysis & Fix Plan

> **Scope:** Planning only. No implementation. Every flaw is traced to real code in the repo.

---

## 1. The Ideal Operator Journey (Target)

```
Citizen walks in
    → Operator scans/enters ID (OCR)          ~30 sec
    → Form auto-fills + service auto-selected  ~10 sec
    → Operator attaches physical documents     ~20 sec
    → Documents auto-optimised to portal limit  ~5 sec
    → Operator clicks "Launch Portal"          ~5 sec
    → Portal Simulator opens pre-filled        ~5 sec
    → Operator reviews & clicks Submit in sim   ~2 min
    → Receipt ref recorded → case closed        ~20 sec
```

Total target: **< 5 minutes end-to-end per citizen.**

---

## 2. Major Illogical Flaws (Traced to Code)

---

### Flaw 1 — Citizen Save and Application Launch Are Accidentally Decoupled

**Where:** `App.tsx:445-488` (`handleSaveCitizen`), `App.tsx:560-581` (`handleCreateNewAppSubmit`)

**Problem:**  
- `CitizenIntake` collects a service selection (`selectedServiceId`) and passes it to `onSave`.  
- `handleSaveCitizen` in `App.tsx` correctly creates the application inline when `targetServiceId` is provided.  
- BUT there is also a completely separate "Create New Application" modal (`showNewAppModal`, `handleCreateNewAppSubmit`) that does the **same thing manually** — select a citizen, select a service, create an app.  
- This means there are **two disconnected paths to create the same entity**. Operators who click "New Application" from the Applications page don't go through CitizenIntake at all — they bypass OCR, field validation, and the service-required-field filter. They create a shell application that will then fail preflight.

**Fix Plan:**  
- Remove the standalone "New Application" modal entirely.  
- The **only** way to create an application must be through `CitizenIntake → Save with targetServiceId`. This means the "New Application" button on the Applications page should instead redirect to the CitizenIntake page, pre-selecting the service-picker.  
- Existing citizen records can be re-opened in `CitizenIntake` (edit mode) and a new service selected to launch a fresh application case.

---

### Flaw 2 — Documents Are Attached in ApplicationDetail But Citizen Data Is Collected in CitizenIntake — There Is No Conceptual Bridge

**Where:** `ApplicationDetail.tsx:58-73`, `CitizenIntake.tsx:27-35`

**Problem:**  
- Document collection (file upload, optimisation, download) lives entirely in `ApplicationDetail`.  
- Citizen data collection (OCR, form fill) lives entirely in `CitizenIntake`.  
- When the operator finishes CitizenIntake and arrives at ApplicationDetail, they must **re-learn what documents are needed**, hunt for the upload section, and figure out size limits themselves.  
- More critically: `CitizenIntake` already shows `service.notes` (e.g. *"Photo ≤ 20KB, self-declaration ≤ 100KB"*) but the operator cannot act on it there — documents belong to a different screen.  
- There is **no single screen that shows "here are the documents you need AND here is where you attach them"** until the operator is deep in ApplicationDetail.

**Fix Plan:**  
- Add a **"Required Documents" section** directly inside `CitizenIntake`, rendered after the citizen fields and before the "Save & Launch" button, **only when a service is selected**.  
- This section shows: document name (from service definition), allowed types, size limit, and a file picker.  
- On save, the selected files are passed alongside `citizen` and `targetServiceId` to `onSave`, and stored on the `Application` object.  
- `ApplicationDetail` then shows these already-attached documents (and still allows adding more), but the operator no longer has to hunt.  
- The `Application` type in `core-types` needs a `documents?: Array<{ name, size, type, optimised }>` field.

---

### Flaw 3 — Preflight Runs After Citizen Is Already Saved — Errors Surface Too Late

**Where:** `ApplicationDetail.tsx:102-104` (preflight field-count), `App.tsx:504-528` (`handleSavePreflight`)

**Problem:**  
- The preflight check (`requiredFields` coverage, document size) is only displayed in `ApplicationDetail` — **after** the citizen is saved and the application is created.  
- If the operator forgot to fill `rationCard` (required for Income Certificate), they discover this only after navigating away from CitizenIntake.  
- They must go back to CitizenIntake (edit), find the field, fill it, re-save, then navigate back to ApplicationDetail.  
- This is a 4-step round-trip for what should be a pre-save inline validation.

**Fix Plan:**  
- Move the service-specific field completeness check **into `CitizenIntake`** itself — it already has `isFieldRequired` and `isFieldVisible` logic per service.  
- When the operator clicks "Save & Launch Application", run a local preflight on the form data (`validateCitizen` against `selectedService.requiredFields`) **before** calling `onSave`.  
- Show a summary: "3 of 9 required fields missing: rationCard, district, state. Fill them before proceeding."  
- Only allow save when all required fields for the selected service pass.  
- The `ApplicationDetail` preflight panel then becomes a **confirmation view**, not a discovery view. The operator arrives knowing everything is valid.

---

### Flaw 4 — Document Optimisation Is a Manual Multi-Step Process Hidden Behind Multiple Clicks

**Where:** `ApplicationDetail.tsx:198-267`

**Problem:**  
- Operator uploads a file → sees a list with file sizes.  
- Operator must notice that a file is oversized.  
- Operator must click "Optimise Oversized Documents".  
- Operator must then click "Download Optimised" to get the compressed file.  
- Operator must then manually re-upload that file to the portal.  
- This is **5 separate operator decisions** for what should be automatic.

**Fix Plan:**  
- Auto-optimise immediately on file selection: when `handleFileChange` is called, if any file exceeds `service.maxUploadMB`, kick off optimisation immediately in the background without requiring a button click.  
- Show a non-blocking spinner "Optimising X.jpg..." inline in the file list row.  
- When optimisation completes, update the file row in-place showing "✓ Ready (45KB)".  
- The "Download" step is only needed when the operator wants to keep a copy — make it optional and secondary.  
- The optimised `File` objects are already in `rawFiles` state and can go directly to the Portal Simulator dispatch — no manual download/re-upload.

---

### Flaw 5 — Portal Simulator Has No Knowledge of Which Documents to Upload — The Bridge Only Carries Text Data

**Where:** `ApplicationDetail.tsx:107-172` (dispatch to companion), `PortalSimulator.tsx` (auto-fill logic)

**Problem:**  
- The companion dispatch payload (`window.__SEVA_COMPANION_PAYLOAD__`) carries citizen field values (name, dob, aadhaar etc.) for form auto-fill.  
- It does **not** carry document File objects or blob references.  
- The Portal Simulator opens the real government portal, but when the portal form asks the operator to attach a photo or self-declaration, there is **nothing pre-staged** — the operator must manually select files from their file system again.  
- The whole document collection effort in ApplicationDetail is wasted from the simulator's perspective.

**Fix Plan:**  
- When dispatching to the Portal Simulator, convert the optimised `File` objects to `ObjectURL` strings and include them in the companion payload under a `documents` key with role labels (`{ role: 'photo', objectUrl: '...' }`, `{ role: 'selfDeclaration', objectUrl: '...' }`).  
- The Portal Simulator bridge script should detect portal file-input fields matching expected roles (by `accept` attribute or field name heuristics) and programmatically set those file inputs using the companion `File` objects via `DataTransfer`.  
- This makes document attachment as automatic as form field fill — the operator watches it happen.

---

### Flaw 6 — "Load Real Example" Button in CitizenIntake Fills Demo Data But Does Not Select a Service

**Where:** `CitizenIntake.tsx:516-543` (`handleLoadRealExample`)

**Problem:**  
- `handleLoadRealExample` does call `setSelectedServiceId(upIncomeService.id)` (line 518-521), but only if `upIncomeService` is found.  
- If `services` is empty (e.g., daemon not yet loaded), the service stays unselected, the field-filter collapses to "show all fields" mode, and the service-specific document hints never appear.  
- When run in the correct state, the demo fills perfect citizen data and consent — but the operator must still manually navigate to ApplicationDetail, optimise docs, and dispatch. There is no "proceed to next step" CTA surfaced at that point.  
- Demo mode is effectively useless for end-to-end testing because it stops halfway.

**Fix Plan:**  
- After `handleLoadRealExample` fills form data, automatically show a prominent "Review & Save to Launch Application" CTA that scrolls to the Submit button.  
- Guard against missing service: if `services` is empty, show an inline warning "Loading services..." and disable the example button.  
- Optionally: for full end-to-end demo, after saving, auto-load sample documents in ApplicationDetail by triggering `handleLoadSampleDocs`.

---

### Flaw 7 — Status Update ("Submitted") Requires Manual Receipt Entry But There Is No Prompt From the Simulator

**Where:** `ApplicationDetail.tsx:273-295`, `PortalSimulator.tsx`

**Problem:**  
- After the Portal Simulator completes form submission, the government portal shows an acknowledgement reference number.  
- The operator must manually read this number from the simulator screen, switch back to ApplicationDetail, open the "Update Status" modal, type the reference number, check a checkbox, and save.  
- The Portal Simulator has no mechanism to capture the acknowledgement text from the portal DOM and relay it back to ApplicationDetail automatically.  
- This is the last mile of the workflow and it is entirely manual copy-paste.

**Fix Plan:**  
- In the Portal Simulator bridge script, after the portal submit button is clicked, observe the DOM for common acknowledgement patterns (elements containing text like "Application No.", "Reference No.", "Acknowledgement", "एप्लीकेशन नंबर").  
- When detected, send a `postMessage` event from the simulator iframe/window back to the parent (`SEVA_ACK_DETECTED: { ref: '...', text: '...' }`).  
- `ApplicationDetail` listens for this message and auto-populates `receiptRef` and sets status to `submitted` after a one-click confirmation from the operator (a toast saying "Portal returned Ref No. XXXX — Confirm to close this case?").  
- This reduces the receipt-recording from a 5-step modal to a 1-click confirmation.

---

### Flaw 8 — Two Different Paths to Edit a Citizen Create Data Inconsistency

**Where:** `App.tsx:240-242`, `CitizenDisplay.tsx`, `CitizenIntake.tsx:27-34`

**Problem:**  
- `CitizenDisplay` shows citizen details read-only.  
- There is an `onEditCitizen` callback that sets `editingCitizenId` and switches page to CitizenIntake in edit mode.  
- `ApplicationDetail` also has an `onEditCitizen` callback.  
- But when a citizen is edited from ApplicationDetail (e.g., to add a missing field), saving the citizen does NOT return the operator to ApplicationDetail — it returns to `overview` (line 485 in App.tsx: `setCurrentPage('overview')`).  
- The operator loses their place in the application workflow and must navigate back manually.

**Fix Plan:**  
- Pass a `returnPage` and `returnApplicationId` to `CitizenIntake` when launching in edit mode from ApplicationDetail.  
- After save, if `returnPage` is set, navigate back there and restore `selectedApplicationId`.  
- In `App.tsx`, `handleSaveCitizen` should check if a `returnContext` is set and route accordingly instead of always defaulting to `overview`.

---

## 3. Consolidated Fix Sequence (Implementation Order)

| Priority | Flaw | Change Surface | Effort |
|----------|------|----------------|--------|
| P0 | Flaw 3 — Pre-save preflight in CitizenIntake | `CitizenIntake.tsx` | Small |
| P0 | Flaw 1 — Remove duplicate New App modal | `App.tsx`, `Applications.tsx` | Small |
| P1 | Flaw 2 — Document attach in CitizenIntake | `CitizenIntake.tsx`, `core-types`, `App.tsx` | Medium |
| P1 | Flaw 8 — Return-to-context after citizen edit | `App.tsx`, `CitizenIntake.tsx` | Small |
| P1 | Flaw 4 — Auto-optimise on file select | `ApplicationDetail.tsx` | Small |
| P2 | Flaw 5 — Documents in simulator bridge | `ApplicationDetail.tsx`, bridge script | Medium |
| P2 | Flaw 7 — Auto-capture portal ACK ref | Bridge script, `ApplicationDetail.tsx` | Medium |
| P3 | Flaw 6 — Demo mode end-to-end | `CitizenIntake.tsx`, `ApplicationDetail.tsx` | Small |

---

## 4. The Corrected Linear Flow (After Fixes)

```
[1] Operator opens CitizenIntake
     ├─ Scans ID → OCR auto-fills fields
     ├─ Selects service → only required fields shown
     ├─ Attaches required documents (inline, auto-optimised)
     ├─ Pre-save preflight confirms 100% field coverage + doc sizes OK
     └─ Clicks "Save & Launch Application"  ← SINGLE ACTION

[2] App.tsx handleSaveCitizen
     ├─ Citizen saved to vault
     ├─ Application created (draft → ready automatically since preflight passed)
     └─ Navigates directly to ApplicationDetail with documents pre-loaded

[3] ApplicationDetail (confirmation + dispatch)
     ├─ Shows: citizen ✓ | service ✓ | documents ✓ | preflight ✓
     ├─ Operator clicks "Launch in Portal Simulator"
     └─ Bridge carries: fields + documents + service adapter

[4] Portal Simulator
     ├─ Opens portal URL
     ├─ Auto-fills all text fields from payload
     ├─ Auto-attaches documents to file inputs
     └─ Operator clicks submit on portal form

[5] ACK capture
     ├─ Bridge detects reference number in DOM
     ├─ postMessage relays ref to ApplicationDetail
     └─ Operator clicks one-click "Confirm & Close Case"

[6] Case closed — audit trail complete
```

---

## 5. What Must NOT Change

- **Vault encryption** — keep as-is, no workflow impact.
- **Daemon health check** — keep as-is, already correct fallback logic.
- **Status transition validation** (`validateStatusTransition`) — keep as-is.
- **OCR pipeline** (PaddleOCR → Tesseract fallback) — keep as-is, already optimal.
- **Fee Transparency display** — keep as-is, not in the critical workflow path.
- **Audit trail** — keep as-is, every action is already logged.
