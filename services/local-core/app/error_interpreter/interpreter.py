import re
from typing import Dict, Any

ERROR_RULES = [
    {
        "test": re.compile(r'file.{0,25}(size|large|limit)|size.{0,25}(exceed|limit)|upload.{0,25}(limit|large)', re.I),
        "category": 'Document upload',
        "title": 'Likely file size or upload constraint',
        "explanation": 'The portal message appears related to an upload size limit. Check the service-specific maximum size and accepted file types before retrying.',
        "action": 'Check the configured portal upload limit and compress/convert only if the official portal allows it.'
    },
    {
        "test": re.compile(r'required|mandatory|cannot be blank|cannot be empty|please enter', re.I),
        "category": 'Required field',
        "title": 'A required field may be missing',
        "explanation": 'The message indicates a mandatory field or section may not be complete. The missing field may be below the visible part of the page.',
        "action": 'Review all required fields, including sections and dropdowns, before attempting submission again.'
    },
    {
        "test": re.compile(r'date.{0,30}(format|invalid|valid)|invalid.{0,20}date|dd[\/-]mm[\/-]yyyy|yyyy[\/-]mm[\/-]dd', re.I),
        "category": 'Date format',
        "title": 'Date format or date value may be invalid',
        "explanation": 'The portal may expect a specific date format or valid date range.',
        "action": 'Use the date format shown beside the exact field. Confirm the value against the source document.'
    },
    {
        "test": re.compile(r'aadhaar|aadhar|uidai|uid number', re.I),
        "category": 'Identity field',
        "title": 'Identity field needs verification',
        "explanation": 'The message appears to reference Aadhaar or a UID field. This heuristic cannot verify identity or portal eligibility.',
        "action": 'Recheck the digits against the original document and confirm the service is authorised to request this identifier.'
    },
    {
        "test": re.compile(r'mobile|phone number|contact number', re.I),
        "category": 'Contact field',
        "title": 'Phone number may be invalid',
        "explanation": 'The portal message appears related to a contact number format or verification state.',
        "action": 'Check the entered number and the portal’s country-code/OTP instructions. Do not attempt to bypass OTP.'
    },
    {
        "test": re.compile(r'invalid format|format is invalid|invalid input|pattern mismatch|not valid', re.I),
        "category": 'Field format',
        "title": 'A field format may not match the portal rule',
        "explanation": 'The portal rejected a value format. This message does not identify the exact rule by itself.',
        "action": 'Inspect field-specific examples and constraints, then compare with the original document.'
    },
    {
        "test": re.compile(r'session.{0,15}(expired|timeout)|login again|log in again', re.I),
        "category": 'Session',
        "title": 'Portal session may have expired',
        "explanation": 'The server may have invalidated the session while the form was being completed.',
        "action": 'Save any available reference details, log in through the official process, and review the form again before resubmitting.'
    },
    {
        "test": re.compile(r'server error|internal server|\b500\b|\b502\b|\b503\b|service unavailable|try again later', re.I),
        "category": 'Portal availability',
        "title": 'The portal may have a server-side issue',
        "explanation": 'The message resembles a server or availability error; it may not be caused by data entry.',
        "action": 'Do not repeatedly submit. Record the time and exact message, then retry later or use the official help channel.'
    },
    {
        "test": re.compile(r'duplicate|already exists|already registered', re.I),
        "category": 'Existing record',
        "title": 'The portal may have detected an existing record',
        "explanation": 'A similar application or identifier may already exist in the portal.',
        "action": 'Check the official application/status lookup before creating another submission.'
    }
]

def interpret_portal_error(message: str = "") -> Dict[str, Any]:
    val = str(message or '').strip()
    if not val:
        return {
            "category": "No message",
            "title": "No portal message provided",
            "explanation": "Paste the exact visible error message. Do not guess the cause.",
            "action": "Inspect the page and copy the exact wording.",
            "confidence": "none"
        }

    for rule in ERROR_RULES:
        if rule["test"].search(val):
            return {
                "category": rule["category"],
                "title": rule["title"],
                "explanation": rule["explanation"],
                "action": rule["action"],
                "confidence": "heuristic"
            }

    return {
        "category": "Unmapped message",
        "title": "Cause not mapped safely",
        "explanation": "The rule library has no reliable match for this message. Do not treat a guess as a diagnosis.",
        "action": "Preserve the exact message, review the official portal help text, and escalate when required.",
        "confidence": "none"
    }
