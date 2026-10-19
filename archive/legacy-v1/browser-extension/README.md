# SevaDesk Browser Companion (Chrome / Chromium)

This is an unpacked Manifest V3 extension. It uses only `activeTab` and `scripting` permissions, and has no network requests or persistent storage.

## Install

1. Start SevaDesk at `http://127.0.0.1:4173` and unlock your workspace.
2. Open Chrome/Chromium and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `browser-extension` folder.
5. Open an official portal page in a normal tab.

## Use

1. In SevaDesk, open an application, run preflight, then select **Copy fill payload**.
2. On the official portal tab, open the extension icon.
3. Paste the copied JSON payload into the first text area and choose **Load payload**.
4. Choose **Scan visible fields**. Review every target and value. Low-confidence suggestions are left unselected.
5. Choose **Fill reviewed fields**. Review every field on the portal, handle OTP/CAPTCHA and other verification normally, then submit manually.

The extension does not click Submit, upload files, fill password/OTP/CAPTCHA controls, call portal APIs, bypass authentication, or claim that a form has been accepted. Some portals use custom components, shadow DOM, strict input handlers or nonstandard field formats; those may require a portal-specific, authorised adapter.

## Privacy

Data is held in popup memory while the popup is open. The extension doesn't save the payload. Close the popup and clear the clipboard after use. Inspect the browser’s extensions policy before deploying on shared/public computers.
