import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from ..core.security import validate_verhoeff

FIELD_LABELS = {
    'fullName': 'Full name',
    'dob': 'Date of birth',
    'gender': 'Gender',
    'mobile': 'Mobile number',
    'aadhaar': 'Aadhaar number',
    'voterId': 'Voter ID',
    'rationCard': 'Ration card number',
    'address': 'Address',
    'state': 'State',
    'district': 'District',
    'pincode': 'PIN code',
    'bankAccount': 'Bank account number',
    'ifsc': 'IFSC code',
    'email': 'Email address'
}

def validate_citizen(citizen: Dict[str, Any], required_fields: List[str]) -> Dict[str, Any]:
    errors = []
    warnings = []
    required_set = set(required_fields)

    for key in required_set:
        val = str(citizen.get(key) or '').strip()
        if key in FIELD_LABELS and not val:
            errors.append({
                "field": key,
                "label": FIELD_LABELS[key],
                "message": f"{FIELD_LABELS[key]} is required for this service."
            })

    mobile = re.sub(r'\D', '', str(citizen.get('mobile') or ''))
    if citizen.get('mobile') and not re.match(r'^[6-9]\d{9}$', mobile):
        errors.append({"field": "mobile", "label": FIELD_LABELS['mobile'], "message": "Enter a valid 10-digit Indian mobile number."})

    pincode = re.sub(r'\D', '', str(citizen.get('pincode') or ''))
    if citizen.get('pincode') and not re.match(r'^\d{6}$', pincode):
        errors.append({"field": "pincode", "label": FIELD_LABELS['pincode'], "message": "PIN code must contain exactly 6 digits."})

    aadhaar = re.sub(r'\D', '', str(citizen.get('aadhaar') or ''))
    if citizen.get('aadhaar') and not re.match(r'^\d{12}$', aadhaar):
        errors.append({
            "field": "aadhaar",
            "label": FIELD_LABELS['aadhaar'],
            "message": "Aadhaar number must contain 12 digits, where the selected portal requires it."
        })

    email = str(citizen.get('email') or '').strip()
    if email and not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        errors.append({"field": "email", "label": FIELD_LABELS['email'], "message": "Enter a valid email address."})

    ifsc = str(citizen.get('ifsc') or '').strip()
    if ifsc and not re.match(r'^[A-Z]{4}0[A-Z0-9]{6}$', ifsc, re.IGNORECASE):
        errors.append({"field": "ifsc", "label": FIELD_LABELS['ifsc'], "message": "IFSC should be 11 characters in the standard format."})

    if citizen.get('aadhaar'):
        warnings.append({
            "field": "aadhaar",
            "label": FIELD_LABELS['aadhaar'],
            "message": "Verify whether Aadhaar is required and permitted for this specific service. Avoid storing or entering it when unnecessary."
        })

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}

def validate_case(citizen: Dict[str, Any], service: Dict[str, Any], documents: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    docs = documents or []
    req_fields = service.get('requiredFields') or []
    base = validate_citizen(citizen, req_fields)
    errors = list(base["errors"])
    warnings = list(base["warnings"])

    max_mb = service.get('maxUploadMB')
    has_max_upload = max_mb is not None and str(max_mb).strip() != '' and float(max_mb) > 0
    max_bytes = float(max_mb) * 1024 * 1024 if has_max_upload else None

    allowed = [str(ext).lower().lstrip('.') for ext in (service.get('allowedExtensions') or []) if str(ext).strip()]

    if not req_fields:
        errors.append({
            "field": "requiredFields",
            "label": "Required fields not configured",
            "message": "Select the mandatory applicant fields observed on the real official portal before preflight can pass."
        })

    if not has_max_upload:
        warnings.append({
            "field": "maxUploadMB",
            "label": "Maximum file size not configured",
            "message": "The portal’s maximum upload size is unknown here. Check it on the official portal before selecting documents."
        })

    if not allowed:
        warnings.append({
            "field": "allowedExtensions",
            "label": "Allowed file types not configured",
            "message": "Accepted file types are unknown here. Check the official portal before uploading a document."
        })

    for doc in docs:
        name = doc.get('name', '')
        ext = name.split('.')[-1].lower() if '.' in name else ''
        if allowed and ext not in allowed:
            errors.append({
                "field": "documents",
                "label": name or "Document",
                "message": f"File type .{ext} is not in this service's configured allowed list ({', '.join(allowed)})."
            })
        if has_max_upload and doc.get('size', 0) > max_bytes:
            errors.append({
                "field": "documents",
                "label": name or "Document",
                "message": f"File exceeds the configured {max_mb} MB per-file limit."
            })

    if not service.get('portalUrl'):
        warnings.append({
            "field": "portalUrl",
            "label": "Official portal URL",
            "message": "Add and verify the official portal URL before starting portal entry."
        })

    if service.get('officialFee') is None or service.get('operatorCharge') is None or not service.get('feeSourceUrl') or not service.get('feeVerifiedAt'):
        warnings.append({
            "field": "fee",
            "label": "Fee configuration",
            "message": "Official fee, operator charge, source URL and checked date must all be configured. Do not quote an unverified amount as an official fee."
        })

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}
