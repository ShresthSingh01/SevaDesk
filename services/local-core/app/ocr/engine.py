import re
import io
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from ..core.security import validate_verhoeff

class OcrCandidate(BaseModel):
    key: str
    label: str
    value: str
    confidence: float
    sensitive: bool = False
    bbox: Optional[List[List[float]]] = None

class DocumentIntelligenceEngine:
    def __init__(self):
        self._paddle_ocr = None
        self._paddle_initialized = False

    def _get_paddle(self):
        if not self._paddle_initialized:
            self._paddle_initialized = True
            try:
                from paddleocr import PaddleOCR
                self._paddle_ocr = PaddleOCR(lang='hi')
            except Exception as e:
                # PaddleOCR not initialized or incompatible; fallback engine handles gracefully
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

        # 1. Full Name
        name = pick_line(re.compile(r'^(?:name|applicant name|beneficiary name|नाम)\b\s*[:\-]?', re.IGNORECASE))
        if name:
            clean_name = re.sub(r'[^\w\s.\'-]', ' ', name, flags=re.UNICODE)
            clean_name = re.sub(r'\s+', ' ', clean_name).strip()
            if 2 < len(clean_name) < 90:
                candidates.append(OcrCandidate(
                    key="fullName",
                    label="Full name",
                    value=clean_name,
                    confidence=0.88
                ))

        # 2. Date of Birth (DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY)
        dob = pick_line(re.compile(r'^(?:dob|date of birth|birth date|जन्म तिथि|जन्मतारीख)\b\s*[:\-]?', re.IGNORECASE))
        if not dob:
            m = re.search(r'\b(0[1-9]|[12]\d|3[01])[\/\.-](0[1-9]|1[012])[\/\.-](19\d\d|20\d\d)\b', raw)
            if m:
                dob = m.group(0)
            else:
                m_iso = re.search(r'\b(19\d\d|20\d\d)-(0[1-9]|1[012])-(0[1-9]|[12]\d|3[01])\b', raw)
                if m_iso:
                    dob = m_iso.group(0)

        if dob:
            ymd_m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', dob)
            dmy_m = re.match(r'^(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})$', dob)
            iso = ""
            if ymd_m:
                iso = f"{ymd_m.group(1)}-{ymd_m.group(2)}-{ymd_m.group(3)}"
            elif dmy_m:
                iso = f"{dmy_m.group(3)}-{dmy_m.group(2)}-{dmy_m.group(1)}"
            if iso:
                candidates.append(OcrCandidate(
                    key="dob",
                    label="Date of birth",
                    value=iso,
                    confidence=0.92
                ))

        # 3. 6-digit PIN code
        pin_match = re.search(r'\b([1-8]\d{5})\b', raw)
        if pin_match:
            candidates.append(OcrCandidate(
                key="pincode",
                label="PIN code",
                value=pin_match.group(1),
                confidence=0.95
            ))

        # 4. Indian Mobile Number (10 digits starting with 6-9)
        mob_match = re.search(r'(?:\+91[\s-]?)?\b([6-9]\d{9})\b', raw)
        if mob_match:
            candidates.append(OcrCandidate(
                key="mobile",
                label="Mobile number",
                value=mob_match.group(1),
                confidence=0.94
            ))

        # 5. 12-digit Aadhaar number with Verhoeff validation
        aadhaar_matches = re.findall(r'\b(?:\d[ -]?){12}\b', raw)
        for cand in aadhaar_matches:
            digits = re.sub(r'\D', '', cand)
            if len(digits) == 12:
                is_valid = validate_verhoeff(digits)
                candidates.append(OcrCandidate(
                    key="aadhaar",
                    label="Aadhaar number",
                    value=digits,
                    confidence=0.99 if is_valid else 0.85,
                    sensitive=True
                ))
                break

        # 6. PAN Card (Permanent Account Number - 10 chars: 5 letters, 4 digits, 1 letter)
        pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', raw)
        if pan_match:
            candidates.append(OcrCandidate(
                key="voterId", # can be mapped or added as PAN
                label="PAN Card / Tax ID",
                value=pan_match.group(1),
                confidence=0.96
            ))

        # 7. IFSC Code (11 alphanumeric: 4 letters, '0', 6 alphanumeric)
        ifsc_match = re.search(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', raw)
        if ifsc_match:
            candidates.append(OcrCandidate(
                key="ifsc",
                label="IFSC code",
                value=ifsc_match.group(1).upper(),
                confidence=0.95
            ))

        # 8. Gender (Multilingual English & Hindi)
        gender_line = ""
        for line in lines:
            if re.search(r'^(?:gender|sex|लिंग)\b', line, re.IGNORECASE):
                gender_line = line
                break
        if gender_line:
            clean_g = gender_line.lower()
            val = ""
            if re.search(r'female|महिला|स्त्री', clean_g):
                val = "Female"
            elif re.search(r'male|पुरुष', clean_g):
                val = "Male"
            elif re.search(r'transgender|trans|तृतीयपंथी', clean_g):
                val = "Transgender"
            if val:
                candidates.append(OcrCandidate(
                    key="gender",
                    label="Gender",
                    value=val,
                    confidence=0.95
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
                try:
                    result = paddle.ocr(img)
                except TypeError:
                    result = paddle.ocr(img, cls=True)

                lines = []
                if isinstance(result, list):
                    for item in result:
                        if isinstance(item, list):
                            for line in item:
                                if isinstance(line, (list, tuple)) and len(line) >= 2:
                                    bbox, text_tuple = line[0], line[1]
                                    if isinstance(text_tuple, (list, tuple)) and len(text_tuple) >= 1:
                                        t = str(text_tuple[0])
                                        conf = float(text_tuple[1]) if len(text_tuple) > 1 else 1.0
                                        lines.append(t)
                                        bboxes.append({"bbox": bbox, "text": t, "conf": conf})
                        elif hasattr(item, 'get') and 'rec_text' in item:
                            t = item.get('rec_text', '')
                            lines.append(t)
                if lines:
                    extracted_text = "\n".join(lines)
            except Exception as e:
                # In case of paddle execution failure, fall back to text hint
                pass

        candidates = self.extract_from_text(extracted_text)
        return {
            "engine": "PaddleOCR-v5" if paddle else "Deterministic-IndicLayout",
            "text": extracted_text,
            "candidates": [c.model_dump() for c in candidates],
            "bboxes": bboxes
        }

document_intelligence = DocumentIntelligenceEngine()
