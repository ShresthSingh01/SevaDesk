import re
import os
import io
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from ..core.security import validate_verhoeff

# Ensure oneDNN PIR executor does not throw unhandled ArrayAttribute error on Windows CPU
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"

class OcrCandidate(BaseModel):
    key: str
    label: str
    value: str
    confidence: float
    sensitive: bool = False
    bbox: Optional[List[List[float]]] = None

STOP_WORDS = {
    'government', 'india', 'govt', 'unique', 'identification', 'authority', 
    'male', 'female', 'dob', 'birth', 'address', 'help', 'yojana', 'praman', 
    'patra', 'revenue', 'department', 'card', 'mera', 'aadhaar', 'meri', 
    'pehchan', 'income', 'tax', 'permanent', 'account', 'number', 'election', 
    'commission', 'elector', 'photo', 'identity', 'signature', 'father', 
    'mother', 'husband', 'uidai', 'enrollment', 'helpdesk', 'download', 'valid'
}

class DocumentIntelligenceEngine:
    def __init__(self):
        self._paddle_ocr = None
        self._paddle_initialized = False

    def _get_paddle(self):
        if not self._paddle_initialized:
            self._paddle_initialized = True
            try:
                from paddleocr import PaddleOCR
                # Disabling mkldnn avoids PIR instruction executor compatibility issues on Windows CPU
                self._paddle_ocr = PaddleOCR(enable_mkldnn=False, use_textline_orientation=True)
            except Exception as e:
                # PaddleOCR not initialized or incompatible; fallback engine handles gracefully
                print(f"[OCR] PaddleOCR init exception: {e}")
                self._paddle_ocr = None
        return self._paddle_ocr

    def extract_from_text(self, text: str) -> List[OcrCandidate]:
        """Runs deterministic heuristics and regexes across OCR-extracted text."""
        raw = text.replace('\r', '')
        lines = [line.strip() for line in raw.split('\n') if line.strip()]
        candidates: List[OcrCandidate] = []

        def pick_line(pattern: re.Pattern) -> str:
            for line in lines:
                if pattern.search(line):
                    parts = re.split(r'[:|]', line)
                    if len(parts) > 1:
                        return ':'.join(parts[1:]).strip()
                    return pattern.sub('', line).strip()
            return ''

        # 1. Date of Birth (DD/MM/YYYY, YYYY-MM-DD, or DD-MM-YYYY, supporting spaces around separators)
        dob_iso = ""
        dob_match = re.search(r'(?:dob|date of birth|birth date|जन्म तिथि|जन्मतारीख)\s*[:\-]?\s*(\d{1,2}\s*[\/\.-]\s*\d{1,2}\s*[\/\.-]\s*\d{4})', raw, re.IGNORECASE)
        if not dob_match:
            dob_match = re.search(r'\b(0?[1-9]|[12]\d|3[01])\s*[\/\.-]\s*(0?[1-9]|1[012])\s*[\/\.-]\s*(19\d\d|20\d\d)\b', raw)
        if not dob_match:
            # Year of birth fallback
            yob_m = re.search(r'(?:year of birth|yob|जन्म का वर्ष)\s*[:\-]?\s*(19\d\d|20\d\d)\b', raw, re.IGNORECASE)
            if yob_m:
                dob_iso = f"{yob_m.group(1)}-01-01"

        if dob_match and not dob_iso:
            clean_date = dob_match.group(1).replace(' ', '')
            parts = [int(p) for p in re.split(r'[\/\.-]', clean_date)]
            if len(parts) == 3:
                d, m, y = parts[0], parts[1], parts[2]
                if d > 1900:  # YYYY-MM-DD format
                    y, m, d = parts[0], parts[1], parts[2]
                if 1900 < y <= 2026 and 1 <= m <= 12 and 1 <= d <= 31:
                    dob_iso = f"{y:04d}-{m:02d}-{d:02d}"

        if dob_iso:
            candidates.append(OcrCandidate(
                key="dob",
                label="Date of birth",
                value=dob_iso,
                confidence=0.94
            ))

        # 2. Gender (Multilingual English & Hindi, handles "Male / पुरुष", "MALE", "FEMALE", etc.)
        detected_gender = ""
        for line in lines:
            if re.search(r'\b(?:male|female|transgender|पुरुष|महिला|स्त्री|तृतीयपंथी)\b', line, re.IGNORECASE):
                if re.search(r'\bfemale|महिला|स्त्री\b', line, re.IGNORECASE):
                    detected_gender = "Female"
                elif re.search(r'\bmale|पुरुष\b', line, re.IGNORECASE):
                    detected_gender = "Male"
                elif re.search(r'\btransgender|तृतीयपंथी\b', line, re.IGNORECASE):
                    detected_gender = "Transgender"
                if detected_gender:
                    break
        if detected_gender:
            candidates.append(OcrCandidate(
                key="gender",
                label="Gender",
                value=detected_gender,
                confidence=0.96
            ))

        # 3. Full Name
        # Priority A: Explicit label (Name:, Applicant Name:, Elector's Name:, नाम:) - excludes father/mother/husband
        name = ""
        for l in lines:
            if re.search(r'^(?:name|applicant name|beneficiary name|elector\'?s? name|आवेदक का नाम|नाम)\b\s*[:\-]?', l, re.IGNORECASE):
                if not re.search(r'father|mother|husband|पिता|पति', l, re.IGNORECASE):
                    parts = re.split(r'[:|]', l)
                    name = ':'.join(parts[1:]).strip() if len(parts) > 1 else re.sub(r'^(?:name|applicant name|beneficiary name|elector\'?s? name|आवेदक का नाम|नाम)\s*[:\-]?', '', l, flags=re.IGNORECASE).strip()
                    break

        # Priority B: Position-based before DOB line (standard on 90% of Aadhaar and PAN cards)
        if not name and dob_iso:
            dob_idx = -1
            for idx, l in enumerate(lines):
                if re.search(r'dob|birth|\d{4}', l, re.IGNORECASE) and any(str(p) in l for p in dob_iso.split('-')):
                    dob_idx = idx
                    break
            if dob_idx > 0:
                for offset in [1, 2]:
                    if dob_idx - offset >= 0:
                        cand_line = lines[dob_idx - offset]
                        clean = re.sub(r'[^\w\s.\'-]', ' ', cand_line, flags=re.UNICODE).strip()
                        words = [w for w in clean.split() if w.lower() not in STOP_WORDS]
                        if 2 <= len(words) <= 4 and all(re.match(r'^[A-Za-z\u0900-\u097F]', w) for w in words):
                            name = ' '.join(words)
                            break

        # Priority C: Scan for 2-4 capitalized words that are not headers or stop words
        if not name:
            for l in lines:
                clean = re.sub(r'[^\w\s.\'-]', ' ', l, flags=re.UNICODE).strip()
                words = [w for w in clean.split() if w.lower() not in STOP_WORDS]
                if 2 <= len(words) <= 4 and all(len(w) >= 2 and re.match(r'^[A-Z][a-zA-Z]*$', w) for w in words):
                    name = ' '.join(words)
                    break

        if name:
            clean_name = re.sub(r'[^\w\s.\'-]', ' ', name, flags=re.UNICODE)
            clean_name = re.sub(r'\s+', ' ', clean_name).strip()
            if 2 < len(clean_name) < 90:
                candidates.append(OcrCandidate(
                    key="fullName",
                    label="Full name",
                    value=clean_name,
                    confidence=0.92
                ))

        # 4. 6-digit Indian PIN code (100000 - 899999)
        pin_match = re.search(r'(?:pin|pincode|pin code|postal code)?\s*[:\-]?\s*\b([1-8]\d{5})\b', raw, re.IGNORECASE)
        if pin_match:
            candidates.append(OcrCandidate(
                key="pincode",
                label="PIN code",
                value=pin_match.group(1),
                confidence=0.95
            ))

        # 5. Indian Mobile Number (10 digits starting with 6-9, with optional +91 or spaces)
        mob_match = re.search(r'(?:(?:\+91|0)[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b', raw)
        if mob_match:
            clean_mob = re.sub(r'\D', '', mob_match.group(1))
            if len(clean_mob) == 10:
                candidates.append(OcrCandidate(
                    key="mobile",
                    label="Mobile number",
                    value=clean_mob,
                    confidence=0.94
                ))

        # 6. 12-digit Aadhaar number with Verhoeff validation
        aadhaar_matches = re.findall(r'\b(?:\d[\s-]?){12}\b', raw)
        for cand in aadhaar_matches:
            digits = re.sub(r'\D', '', cand)
            if len(digits) == 12:
                is_valid = validate_verhoeff(digits)
                candidates.append(OcrCandidate(
                    key="aadhaar",
                    label="Aadhaar number",
                    value=digits,
                    confidence=0.99 if is_valid else 0.88,
                    sensitive=True
                ))
                break

        # 7. Voter ID / EPIC (3 letters + 7 digits)
        voter_match = re.search(r'\b([A-Z]{3}[0-9]{7})\b', raw)
        if voter_match:
            candidates.append(OcrCandidate(
                key="voterId",
                label="Voter ID / EPIC",
                value=voter_match.group(1),
                confidence=0.96
            ))

        # 8. PAN Card (5 letters, 4 digits, 1 letter)
        pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', raw)
        if pan_match and "voterId" not in [c.key for c in candidates]:
            candidates.append(OcrCandidate(
                key="voterId",
                label="PAN Card / Tax ID",
                value=pan_match.group(1),
                confidence=0.96
            ))

        # 9. IFSC Code (4 letters, '0', 6 alphanumeric)
        ifsc_match = re.search(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', raw)
        if ifsc_match:
            candidates.append(OcrCandidate(
                key="ifsc",
                label="IFSC code",
                value=ifsc_match.group(1).upper(),
                confidence=0.95
            ))

        # 10. Address (multiline capture from Address / S/O / C/O until PIN or Aadhaar)
        addr_lines = []
        in_address = False
        for l in lines:
            if re.search(r'^(?:address|residential address|permanent address|पता|पत्ता|c\/o|s\/o|w\/o|d\/o)\b\s*[:\-]?', l, re.IGNORECASE):
                in_address = True
                first_part = re.sub(r'^(?:address|residential address|permanent address|पता|पत्ता)\s*[:\-]?', '', l, flags=re.IGNORECASE).strip()
                if first_part:
                    addr_lines.append(first_part)
                continue
            if in_address:
                if re.search(r'\b(?:\d[\s-]?){12}\b|www\.|uidai|help@|1947', l, re.IGNORECASE):
                    break
                addr_lines.append(l)
                if re.search(r'\b[1-8]\d{5}\b', l):
                    break

        if addr_lines:
            full_addr = ', '.join([p.strip().rstrip(',') for p in addr_lines if p.strip()])
            if len(full_addr) > 5:
                candidates.append(OcrCandidate(
                    key="address",
                    label="Address",
                    value=full_addr,
                    confidence=0.88
                ))

        # 11. State and District
        INDIAN_STATES = [
            'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
            'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 
            'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 
            'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
            'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 
            'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
        ]
        for st in INDIAN_STATES:
            if re.search(rf'\b{re.escape(st)}\b', raw, re.IGNORECASE):
                candidates.append(OcrCandidate(
                    key="state",
                    label="State / UT",
                    value=st,
                    confidence=0.92
                ))
                break

        dist_match = re.search(r'(?:district|dist|ज़िला|जिल्हा)\s*[:\-]?\s*([A-Za-z\u0900-\u097F]+)', raw, re.IGNORECASE)
        if dist_match:
            candidates.append(OcrCandidate(
                key="district",
                label="District",
                value=dist_match.group(1).strip(),
                confidence=0.90
            ))

        # Deduplicate candidates by key
        seen_keys = set()
        deduped = []
        for c in candidates:
            if c.key not in seen_keys:
                seen_keys.add(c.key)
                deduped.append(c)
        return deduped

    def process_image(self, image_bytes: bytes, raw_text_hint: str = "") -> Dict[str, Any]:
        """
        Executes OCR on provided image bytes, extracts candidates,
        and returns structured result.
        """
        paddle = self._get_paddle()
        extracted_text = raw_text_hint or ""
        bboxes = []

        if paddle and image_bytes:
            try:
                import numpy as np
                import cv2
                nparr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                lines = []
                try:
                    # PaddleX / PaddleOCR 3.7+ predict pipeline
                    predict_res = list(paddle.predict(img))
                    for item in predict_res:
                        if isinstance(item, dict):
                            rec_texts = item.get('rec_texts', [])
                            rec_scores = item.get('rec_scores', [])
                            for idx, t in enumerate(rec_texts):
                                conf = float(rec_scores[idx]) if idx < len(rec_scores) else 1.0
                                lines.append(str(t))
                                bboxes.append({"text": str(t), "conf": conf})
                        elif hasattr(item, 'get') and 'rec_text' in item:
                            t = item.get('rec_text', '')
                            lines.append(str(t))
                except Exception as pred_err:
                    print(f"[OCR] predict exception: {pred_err}, trying legacy ocr()")
                    try:
                        legacy_res = paddle.ocr(img)
                        if isinstance(legacy_res, list):
                            for item in legacy_res:
                                if isinstance(item, list):
                                    for line in item:
                                        if isinstance(line, (list, tuple)) and len(line) >= 2:
                                            bbox, text_tuple = line[0], line[1]
                                            if isinstance(text_tuple, (list, tuple)) and len(text_tuple) >= 1:
                                                t = str(text_tuple[0])
                                                conf = float(text_tuple[1]) if len(text_tuple) > 1 else 1.0
                                                lines.append(t)
                                                bboxes.append({"bbox": bbox, "text": t, "conf": conf})
                    except Exception as leg_err:
                        print(f"[OCR] legacy ocr error: {leg_err}")

                if lines:
                    extracted_text = "\n".join(lines)
            except Exception as e:
                print(f"[OCR] Image processing error: {e}")

        candidates = self.extract_from_text(extracted_text)
        return {
            "engine": "PaddleOCR-v6" if paddle and extracted_text else "Deterministic-IndicLayout",
            "text": extracted_text,
            "candidates": [c.model_dump() for c in candidates],
            "bboxes": bboxes
        }

document_intelligence = DocumentIntelligenceEngine()

