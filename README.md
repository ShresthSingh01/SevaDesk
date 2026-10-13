# SevaDesk — local-first assisted-service workspace

SevaDesk is a working browser-based operator workspace for assisted application preparation. It is designed to reduce transcription errors, make validation issues visible, and make service charges understandable to citizens. It does **not** pretend to be an official CSC system or submit to any government portal without a verified integration.

## Run locally

**Windows:** double-click `run.bat`.

**macOS / Linux:** run `./run.sh` from this folder.

Or use:

```bash
npm run start
```

Open `http://127.0.0.1:4173`. Do not open `index.html` directly as a `file://` URL; the encrypted vault needs the browser Web Crypto API in a secure context.

On first launch, set an operator name, centre name and a strong passphrase (minimum 10 characters). The passphrase is not saved. Records are encrypted in browser storage using AES-GCM with a PBKDF2-derived key. If the passphrase is lost, the local vault cannot be recovered. Export an encrypted backup from **Services & rules** and keep it secure.

There are no preloaded citizens, applications, service profiles or government fees. Add a real service from the portal you use. Required fields start empty, and file type/size limits remain explicitly unconfigured until you confirm them from that portal. Preflight cannot pass until at least one real required field is configured.

## What works in this build

- Encrypted, local-only storage for citizen records, service rules, application records and the audit trail.
- Consent confirmation before saving citizen details; sensitive identifiers are masked outside the edit form.
- Optional browser-side OCR for uploaded images using Tesseract.js; OCR downloads the engine/language data over the internet, and image/text are not saved by this app. Recognised values are suggestions and are never applied without operator selection.
- Local preflight checks for configured required fields, Indian mobile number format, six-digit PIN, 12-digit Aadhaar where provided, date-of-birth and email/IFSC formats, plus operator-configured file size/type limits.
- Rule-based interpretation of common portal messages; unknown messages are explicitly marked as unmapped rather than guessed.
- Separate official fee and operator-charge line items, source URL / checked date fields, large-text citizen display, browser speech synthesis in selected language, and print-ready disclosure (not a payment receipt).
- Case tracking, explicit manual submission confirmation requiring an acknowledgement/reference number, audit export, encrypted vault backup/restore, configurable inactivity lock, and confirmed deletion of a citizen plus linked applications.
- Chrome/Chromium companion that scans the current page’s visible fields, suggests mappings, checks visible HTML constraints, fills only reviewed values and leaves final submission to the operator.

## Important limits (do not ignore)

1. **Not a universal portal integration.** The browser companion is generic. It cannot guarantee a correct mapping on every portal; custom controls, iframes, shadow DOM, dynamic pages and portal-specific validation may need an authorised adapter and regression tests.
2. **No real government submission API is included.** End-to-end application submission, payment status, receipt verification, rejection status, eligibility checks, and service-specific fee/rule synchronization need documented access to each target portal/API, a data-sharing/security review, and portal owner approval. Without those, this app must remain a preparation and assisted-entry tool.
3. **No bypassing controls.** OTP, CAPTCHA, passwords, biometrics, e-signing and the final Submit action are never automated. The operator and citizen must follow the official portal’s process.
4. **OCR is fallible.** Recognition depends on image quality, font, orientation and language data. Confirm every field from the original document. The build supports image OCR; OCR for PDF scans is not included.
5. **Local browser data is not a production-grade deployment by itself.** Use a managed device, OS disk encryption, account access controls, patched browsers, backups, a documented retention/deletion policy, secure workstation practices and legal/privacy review. Do not deploy on shared machines without an operational policy. Exported payloads and the clipboard may contain PII; clear them after filling.
6. **Fee declaration is manual.** A fee is shown as operator-verified only when a source URL and checked date are saved along with amounts. The app cannot certify that a fee remains current.
7. **Not an official government application or receipt.** Branding and disclosures must remain clear. Do not present this independent tool as government-endorsed.

## Test

```bash
npm test
```

The tests exercise field validation, configured and unconfigured upload rules, field-match safety, OCR candidate parsing, unknown-error handling and sensitive-value masking. They are not a substitute for end-to-end testing against real government portals.

## Architecture

See `ARCHITECTURE.md` for the component design, threat model, data flow, production rollout gates and portal adapter plan.
