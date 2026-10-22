/**
 * SevaDesk Core Types & Deterministic Validators
 * Privacy-first, local-only validation logic for Indian assisted-service workspaces.
 */

export const FIELD_LABELS = {
  fullName: 'Full name',
  dob: 'Date of birth',
  gender: 'Gender',
  mobile: 'Mobile number',
  aadhaar: 'Aadhaar number',
  voterId: 'Voter ID',
  rationCard: 'Ration card number',
  address: 'Address',
  state: 'State',
  district: 'District',
  pincode: 'PIN code',
  bankAccount: 'Bank account number',
  ifsc: 'IFSC code',
  email: 'Email address'
};

export const FIELD_KEYS = Object.keys(FIELD_LABELS);

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function maskIdentifier(value = '', visible = 4) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Not provided';
  if (raw.length <= visible) return '•'.repeat(Math.max(0, raw.length - 1)) + raw.slice(-1);
  return `${'•'.repeat(Math.max(4, raw.length - visible))}${raw.slice(-visible)}`;
}

/**
 * Standard Verhoeff Checksum algorithm used by UIDAI for 12-digit Aadhaar numbers.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export function validateVerhoeff(numStr) {
  const digits = String(numStr).replace(/\D/g, '');
  if (digits.length !== 12) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

export function validateCitizen(citizen = {}, requiredFields = []) {
  const errors = [];
  const warnings = [];
  const required = new Set(requiredFields);

  for (const key of required) {
    if (FIELD_LABELS[key] && !String(citizen[key] ?? '').trim()) {
      errors.push({
        field: key,
        label: FIELD_LABELS[key],
        message: `${FIELD_LABELS[key]} is required for this service.`
      });
    }
  }

  const mobile = onlyDigits(citizen.mobile || '');
  if (citizen.mobile && !/^[6-9]\d{9}$/.test(mobile)) {
    errors.push({ field: 'mobile', label: FIELD_LABELS.mobile, message: 'Enter a valid 10-digit Indian mobile number.' });
  }

  const pincode = onlyDigits(citizen.pincode || '');
  if (citizen.pincode && !/^\d{6}$/.test(pincode)) {
    errors.push({ field: 'pincode', label: FIELD_LABELS.pincode, message: 'PIN code must contain exactly 6 digits.' });
  }

  const aadhaar = onlyDigits(citizen.aadhaar || '');
  if (citizen.aadhaar && !/^\d{12}$/.test(aadhaar)) {
    errors.push({
      field: 'aadhaar',
      label: FIELD_LABELS.aadhaar,
      message: 'Aadhaar number must contain 12 digits, where the selected portal requires it.'
    });
  }

  if (citizen.dob) {
    const dob = new Date(`${citizen.dob}T00:00:00`);
    if (Number.isNaN(dob.getTime())) {
      errors.push({ field: 'dob', label: FIELD_LABELS.dob, message: 'Enter a valid date of birth.' });
    } else if (dob > new Date()) {
      errors.push({ field: 'dob', label: FIELD_LABELS.dob, message: 'Date of birth cannot be in the future.' });
    }
  }

  if (citizen.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(citizen.email).trim())) {
    errors.push({ field: 'email', label: FIELD_LABELS.email, message: 'Enter a valid email address.' });
  }

  if (citizen.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(citizen.ifsc).trim())) {
    errors.push({ field: 'ifsc', label: FIELD_LABELS.ifsc, message: 'IFSC should be 11 characters in the standard format.' });
  }

  if (citizen.aadhaar) {
    warnings.push({
      field: 'aadhaar',
      label: FIELD_LABELS.aadhaar,
      message: 'Verify whether Aadhaar is required and permitted for this specific service. Avoid storing or entering it when unnecessary.'
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateCase(citizen = {}, service = {}, documents = []) {
  const requiredFields = Array.isArray(service.requiredFields) ? service.requiredFields : [];
  const base = validateCitizen(citizen, requiredFields);
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  const maxValue = service.maxUploadMB;
  const hasMaxUpload =
    maxValue !== null &&
    maxValue !== undefined &&
    String(maxValue).trim() !== '' &&
    Number.isFinite(Number(maxValue)) &&
    Number(maxValue) > 0;
  const maxBytes = hasMaxUpload ? Number(maxValue) * 1024 * 1024 : null;
  const allowed = (Array.isArray(service.allowedExtensions) ? service.allowedExtensions : [])
    .map(v => String(v).toLowerCase().replace(/^\./, ''))
    .filter(Boolean);

  if (!requiredFields.length) {
    errors.push({
      field: 'requiredFields',
      label: 'Required fields not configured',
      message: 'Select the mandatory applicant fields observed on the real official portal before preflight can pass.'
    });
  }

  if (!hasMaxUpload) {
    warnings.push({
      field: 'maxUploadMB',
      label: 'Maximum file size not configured',
      message: 'The portal’s maximum upload size is unknown here. Check it on the official portal before selecting documents.'
    });
  }

  if (!allowed.length) {
    warnings.push({
      field: 'allowedExtensions',
      label: 'Allowed file types not configured',
      message: 'Accepted file types are unknown here. Check the official portal before uploading a document.'
    });
  }

  for (const doc of documents || []) {
    const ext = String(doc.name || '').split('.').pop().toLowerCase();
    let slotAllowed = allowed;
    let slotMaxBytes = maxBytes;
    let slotLabel = doc.name || 'Document';

    if (service.documentSlots && (doc.slotId || doc.role)) {
      const slot = service.documentSlots.find(s => s.id === doc.slotId || s.id === doc.role);
      if (slot) {
        slotLabel = slot.label || slotLabel;
        if (slot.allowedExtensions && slot.allowedExtensions.length > 0) {
          slotAllowed = slot.allowedExtensions.map(e => e.toLowerCase().replace(/^\./, ''));
        }
        if (slot.maxKB) {
          slotMaxBytes = slot.maxKB * 1024;
        }
      }
    }

    if (slotAllowed.length && !slotAllowed.includes(ext)) {
      errors.push({
        field: 'documents',
        label: slotLabel,
        message: `${doc.name || 'File'} type .${ext} is not in allowed list (${slotAllowed.join(', ')}).`
      });
    }
    if (slotMaxBytes && Number(doc.size || 0) > slotMaxBytes) {
      const maxKBDisplay = Math.round(slotMaxBytes / 1024);
      errors.push({
        field: 'documents',
        label: slotLabel,
        message: `${doc.name || 'File'} (${Math.round((doc.size || 0) / 1024)} KB) exceeds the configured ${maxKBDisplay} KB limit.`
      });
    }
  }

  if (!service.portalUrl) {
    warnings.push({
      field: 'portalUrl',
      label: 'Official portal URL',
      message: 'Add and verify the official portal URL before starting portal entry.'
    });
  }

  if (
    service.officialFee == null ||
    service.operatorCharge == null ||
    !service.feeSourceUrl ||
    !service.feeVerifiedAt
  ) {
    warnings.push({
      field: 'fee',
      label: 'Fee configuration',
      message: 'Official fee, operator charge, source URL and checked date must all be configured. Do not quote an unverified amount as an official fee.'
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export const KEY_ALIASES = {
  fullName: [
    'name', 'full name', 'applicant name', 'citizen name', 'beneficiary name', 'candidate name',
    'first name', 'student name', 'holder name', 'person name', 'fname', 'c_name', 'txtname',
    'txtapplicantname', 'applicant_name', 'beneficiary_name', 'आवेदक का नाम', 'नाम', 'नाव'
  ],
  dob: [
    'date of birth', 'dob', 'birth date', 'birthdate', 'date_of_birth', 'birth_date', 'txtdob',
    'txt_dob', 'd_o_b', 'birthyear', 'year of birth', 'जन्म तिथि', 'जन्मतारीख'
  ],
  gender: ['gender', 'sex', 'ddlgender', 'selgender', 'txtgender', 'लिंग'],
  mobile: [
    'mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'contact', 'contact number',
    'contact no', 'cell', 'registered mobile', 'mobile_no', 'mobile_number', 'txtmobile',
    'txt_mobile', 'txtmobileno', 'मोबाइल', 'मोबाइल नंबर'
  ],
  aadhaar: [
    'aadhaar', 'aadhar', 'adhar', 'uid', 'uidai', 'uid number', 'uid no', 'aadhaar number',
    'aadhar number', 'adhar number', 'aadhaar no', 'aadhar no', 'adhar no', 'aadhaarno',
    'aadharno', 'adharno', 'masked aadhaar', 'txtaadhaar', 'txtaadhar', 'txtadhar',
    'txtaadhaarno', 'txtaadharno', 'txtadharno', 'txt_aadhaar', 'txt_aadhar', 'txt_adhar',
    'txt_aadhaar_no', 'txt_aadhar_no', 'txt_adhar_no', 'txtuid', 'txt_uid', 'txtuidno',
    'txt_uid_no', 'enter aadhaar', 'enter aadhar', 'enter adhar', 'enter aadhaar no',
    'enter aadhar no', 'enter adhar no', 'aadhaar card', 'aadhar card', 'adhar card',
    'आधार कार्ड', 'आधार', 'आधार नंबर', 'आधार क्रमांक', 'आधार संख्या'
  ],
  voterId: [
    'voter id', 'epic', 'epic number', 'voter card', 'elector photo identity card', 'voter_id',
    'epic_no', 'txtepic', 'मतदाता पहचान पत्र'
  ],
  rationCard: [
    'ration card', 'ration card number', 'ration_card', 'family id', 'family_id', 'bpl card',
    'txtrationcard', 'राशन कार्ड'
  ],
  address: [
    'address', 'residential address', 'permanent address', 'current address', 'correspondence address',
    'communication address', 'street', 'house no', 'address line 1', 'address1', 'txtaddress',
    'txt_address', 'पता', 'पत्ता'
  ],
  state: ['state', 'state name', 'rajya', 'state_id', 'state_name', 'ddlstate', 'selstate', 'राज्य'],
  district: [
    'district', 'district name', 'zila', 'ddldistrict', 'seldistrict', 'district_id', 'district_name',
    'districtcode', 'txtdistrict', 'जिला', 'जिल्हा'
  ],
  pincode: [
    'pin code', 'pincode', 'pin', 'postal code', 'zip code', 'txtpin', 'txtpincode', 'pin_code',
    'postalcode', 'पिन कोड'
  ],
  bankAccount: [
    'bank account', 'account number', 'account no', 'account_no', 'bank account number', 'acc no',
    'bank_account', 'txtaccountno', 'खाता संख्या'
  ],
  ifsc: ['ifsc', 'ifsc code', 'branch ifsc', 'ifsc_code', 'txtifsc', 'आईएफएससी कोड'],
  email: ['email', 'email address', 'email id', 'e mail', 'email_id', 'emailid', 'txtemail', 'ईमेल']
};

export function tokenizeText(str = '') {
  return String(str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/ctl\d+[\$_]?/gi, ' ')
    .replace(/[_\-\.\$\:\/\\\[\]]/g, ' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .trim();
}

export function scoreFieldMatch(dataKey, field = {}) {
  const rawCombined = [field.label, field.name, field.id, field.placeholder, field.autocomplete, field['aria-label']].filter(Boolean).join(' ');
  if (!rawCombined.trim()) return 0;

  // Never fill CAPTCHA or OTP challenges
  if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code/i.test(rawCombined)) {
    return 0;
  }

  // Check login passwords - but DO NOT reject if it's an Aadhaar or Bank account field!
  const isAadhaarOrBank = /aadhaar|aadhar|adhar|\buid\b|uidai|bank[\s_-]?account|account[\s_-]?no|खाता/i.test(rawCombined);
  if (!isAadhaarOrBank && /\bpassword\b|passcode|transaction.?pin/i.test(rawCombined)) {
    return 0;
  }

  const labelText = normalizeText(rawCombined);
  const tokenized = tokenizeText(rawCombined);
  if (!labelText && !tokenized) return 0;

  const key = normalizeText(dataKey);
  const aliases = [key, ...(KEY_ALIASES[dataKey] || [])].map(normalizeText).filter(Boolean);
  let best = 0;

  for (const alias of aliases) {
    if (labelText === alias || tokenized === alias) {
      best = Math.max(best, 100);
    } else {
      const aliasWords = alias.split(' ').filter(x => x.length > 1);
      const regex = new RegExp(`\\b${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(tokenized) || regex.test(labelText)) {
        best = Math.max(best, 95);
      } else if (labelText.includes(alias) || tokenized.includes(alias)) {
        best = Math.max(best, 85);
      } else if (aliasWords.length > 1 && aliasWords.every(w => tokenized.includes(w) || labelText.includes(w))) {
        best = Math.max(best, 75 + Math.min(20, aliasWords.length * 5));
      }
    }
  }

  // Type & Option bonuses
  if (dataKey === 'dob' && field.type === 'date') best = Math.max(best, 88);
  if (dataKey === 'mobile' && field.type === 'tel') best = Math.max(best, 85);
  if (dataKey === 'email' && field.type === 'email') best = Math.max(best, 88);
  if (dataKey === 'address' && field.type === 'textarea') best = Math.max(best, 78);
  if (dataKey === 'gender' && Array.isArray(field.options) && field.options.length) {
    const hasGenderOpts = field.options.some(o => /^(male|female|other|transgender|पुरुष|महिला)$/i.test((o.label || o.value || '').trim()));
    if (hasGenderOpts) best = Math.max(best, 96);
  }
  if (dataKey === 'aadhaar' && isAadhaarOrBank) {
    best = Math.max(best, 95);
  }

  return Math.min(100, best);
}

export function suggestFieldMatches(dataFields = {}, pageFields = []) {
  const suggestions = [];
  for (const [key, value] of Object.entries(dataFields)) {
    if (value == null || String(value).trim() === '' || !FIELD_LABELS[key]) continue;
    const scored = pageFields
      .map((field, index) => ({
        field,
        index: Number.isInteger(field.index) ? field.index : index,
        score: scoreFieldMatch(key, field)
      }))
      .filter(item => item.score >= 40)
      .sort((a, b) => b.score - a.score);

    suggestions.push({
      key,
      label: FIELD_LABELS[key] || key,
      value: String(value),
      candidates: scored.slice(0, 5),
      suggestedIndex: scored[0]?.index ?? -1,
      confidence: scored[0]?.score ?? 0
    });
  }
  return suggestions;
}

const OCR_STOP_WORDS = new Set([
  'government', 'india', 'govt', 'unique', 'identification', 'authority', 
  'male', 'female', 'dob', 'birth', 'address', 'help', 'yojana', 'praman', 
  'patra', 'revenue', 'department', 'card', 'mera', 'aadhaar', 'meri', 
  'pehchan', 'income', 'tax', 'permanent', 'account', 'number', 'election', 
  'commission', 'elector', 'photo', 'identity', 'signature', 'father', 
  'mother', 'husband', 'uidai', 'enrollment', 'helpdesk', 'download', 'valid'
]);

export function extractOcrCandidates(text = '') {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  const candidates = [];

  // 1. Date of Birth (DD/MM/YYYY, YYYY-MM-DD, or DD-MM-YYYY, supporting spaces around separators)
  let dobIso = '';
  const explicitDobMatch = raw.match(/(?:dob|date of birth|birth date|जन्म तिथि|जन्मतारीख)\s*[:\-]?\s*(\d{1,2}\s*[\/\.-]\s*\d{1,2}\s*[\/\.-]\s*\d{4})/i);
  const generalDobMatch = raw.match(/\b(0?[1-9]|[12]\d|3[01])\s*[\/\.-]\s*(0?[1-9]|1[012])\s*[\/\.-]\s*(19\d\d|20\d\d)\b/);
  const rawDob = explicitDobMatch?.[1] || generalDobMatch?.[0] || '';

  if (rawDob) {
    const cleanDate = rawDob.replace(/\s+/g, '');
    const parts = cleanDate.split(/[\/\.-]/).map(Number);
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (d > 1900) {
        [y, m, d] = parts;
      }
      if (y > 1900 && y <= 2026 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        dobIso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  } else {
    // Year of birth fallback
    const yobMatch = raw.match(/(?:year of birth|yob|जन्म का वर्ष)\s*[:\-]?\s*(19\d\d|20\d\d)\b/i);
    if (yobMatch) {
      dobIso = `${yobMatch[1]}-01-01`;
    }
  }

  if (dobIso) {
    candidates.push({ key: 'dob', label: FIELD_LABELS.dob, value: dobIso, confidence: 'Review' });
  }

  // 2. Gender (Multilingual English & Hindi, handles "Male / पुरुष", "MALE", "FEMALE", etc.)
  let detectedGender = '';
  for (const line of lines) {
    if (/\b(?:male|female|transgender|पुरुष|महिला|स्त्री|तृतीयपंथी)\b/i.test(line)) {
      if (/\bfemale|महिला|स्त्री\b/i.test(line)) {
        detectedGender = 'Female';
      } else if (/\bmale|पुरुष\b/i.test(line)) {
        detectedGender = 'Male';
      } else if (/\btransgender|तृतीयपंथी\b/i.test(line)) {
        detectedGender = 'Transgender';
      }
      if (detectedGender) break;
    }
  }
  if (detectedGender) {
    candidates.push({ key: 'gender', label: FIELD_LABELS.gender, value: detectedGender, confidence: 'Review' });
  }

  // 3. Full Name
  // Priority A: Explicit label (Name:, Applicant Name:, Elector's Name:, नाम:) - excludes father/mother/husband
  let name = '';
  for (const l of lines) {
    if (/^(?:name|applicant name|beneficiary name|elector'?s? name|आवेदक का नाम|नाम)\b\s*[:\-]?/i.test(l)) {
      if (!/father|mother|husband|पिता|पति/i.test(l)) {
        const parts = l.split(/[:|]/);
        name = parts.length > 1 ? parts.slice(1).join(':').trim() : l.replace(/^(?:name|applicant name|beneficiary name|elector'?s? name|आवेदक का नाम|नाम)\s*[:\-]?/i, '').trim();
        break;
      }
    }
  }

  // Priority B: Position-based before DOB line (standard on 90% of Aadhaar and PAN cards)
  if (!name && dobIso) {
    let dobIdx = -1;
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      if (/dob|birth|\d{4}/i.test(l) && dobIso.split('-').some(p => l.includes(p))) {
        dobIdx = idx;
        break;
      }
    }
    if (dobIdx > 0) {
      for (const offset of [1, 2]) {
        if (dobIdx - offset >= 0) {
          const candLine = lines[dobIdx - offset];
          const clean = candLine.replace(/[^\p{L}\p{M}\s.'-]/gu, ' ').trim();
          const words = clean.split(/\s+/).filter(w => !OCR_STOP_WORDS.has(w.toLowerCase()));
          if (words.length >= 2 && words.length <= 4 && words.every(w => /^[\p{L}\p{M}]/u.test(w))) {
            name = words.join(' ');
            break;
          }
        }
      }
    }
  }

  // Priority C: Scan for 2-4 capitalized words that are not headers or stop words
  if (!name) {
    for (const l of lines) {
      const clean = l.replace(/[^\p{L}\p{M}\s.'-]/gu, ' ').trim();
      const words = clean.split(/\s+/).filter(w => !OCR_STOP_WORDS.has(w.toLowerCase()));
      if (words.length >= 2 && words.length <= 4 && words.every(w => w.length >= 2 && /^[A-Z\p{Lu}]/u.test(w))) {
        name = words.join(' ');
        break;
      }
    }
  }

  if (name) {
    name = name.replace(/[^\p{L}\p{M} .'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (name.length > 2 && name.length < 90) {
      candidates.push({ key: 'fullName', label: FIELD_LABELS.fullName, value: name, confidence: 'Review' });
    }
  }

  // 4. 6-digit Indian PIN code (100000 - 899999)
  const pinMatch = raw.match(/(?:pin|pincode|pin code|postal code)?\s*[:\-]?\s*\b([1-8]\d{5})\b/i);
  if (pinMatch) {
    candidates.push({ key: 'pincode', label: FIELD_LABELS.pincode, value: pinMatch[1], confidence: 'Review' });
  }

  // 5. Indian Mobile Number (10 digits starting with 6-9)
  const mobMatch = raw.match(/(?:(?:\+91|0)[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/);
  if (mobMatch) {
    const cleanMob = mobMatch[1].replace(/\D/g, '');
    if (cleanMob.length === 10) {
      candidates.push({ key: 'mobile', label: FIELD_LABELS.mobile, value: cleanMob, confidence: 'Review' });
    }
  }

  // 6. 12-digit Aadhaar number
  const aadhaarMatches = raw.match(/\b(?:\d[\s-]?){12}\b/g);
  if (aadhaarMatches) {
    for (const cand of aadhaarMatches) {
      const digits = cand.replace(/\D/g, '');
      if (digits.length === 12) {
        candidates.push({ key: 'aadhaar', label: FIELD_LABELS.aadhaar, value: digits, confidence: 'Review', sensitive: true });
        break;
      }
    }
  }

  // 7. Voter ID / EPIC (3 letters + 7 digits)
  const voterMatch = raw.match(/\b([A-Z]{3}[0-9]{7})\b/);
  if (voterMatch) {
    candidates.push({ key: 'voterId', label: FIELD_LABELS.voterId, value: voterMatch[1], confidence: 'Review' });
  }

  // 8. PAN Card (5 letters, 4 digits, 1 letter)
  const panMatch = raw.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  if (panMatch && !candidates.some(c => c.key === 'voterId')) {
    candidates.push({ key: 'voterId', label: 'PAN Card / Tax ID', value: panMatch[1], confidence: 'Review' });
  }

  // 9. IFSC Code
  const ifscMatch = raw.match(/\b([A-Za-z]{4}0[A-Za-z0-9]{6})\b/);
  if (ifscMatch) {
    candidates.push({ key: 'ifsc', label: FIELD_LABELS.ifsc, value: ifscMatch[1].toUpperCase(), confidence: 'Review' });
  }

  // 10. Address (multiline capture from Address / S/O / C/O until PIN or Aadhaar)
  const addrLines = [];
  let inAddress = false;
  for (const l of lines) {
    if (/^(?:address|residential address|permanent address|पता|पत्ता|c\/o|s\/o|w\/o|d\/o)\b\s*[:\-]?/i.test(l)) {
      inAddress = true;
      const firstPart = l.replace(/^(?:address|residential address|permanent address|पता|पत्ता)\s*[:\-]?/i, '').trim();
      if (firstPart) addrLines.push(firstPart);
      continue;
    }
    if (inAddress) {
      if (/\b(?:\d[\s-]?){12}\b|www\.|uidai|help@|1947/i.test(l)) break;
      addrLines.push(l);
      if (/\b[1-8]\d{5}\b/.test(l)) break;
    }
  }

  if (addrLines.length > 0) {
    const fullAddr = addrLines.map(p => p.trim().replace(/,+$/, '')).filter(Boolean).join(', ');
    if (fullAddr.length > 5) {
      candidates.push({ key: 'address', label: FIELD_LABELS.address, value: fullAddr, confidence: 'Review' });
    }
  }

  // 11. State and District
  const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
  ];
  for (const st of INDIAN_STATES) {
    if (new RegExp(`\\b${st}\\b`, 'i').test(raw)) {
      candidates.push({ key: 'state', label: FIELD_LABELS.state, value: st, confidence: 'Review' });
      break;
    }
  }

  const distMatch = raw.match(/(?:district|dist|ज़िला|जिल्हा)\s*[:\-]?\s*([A-Za-z\u0900-\u097F]+)/i);
  if (distMatch) {
    candidates.push({ key: 'district', label: FIELD_LABELS.district, value: distMatch[1].trim(), confidence: 'Review' });
  }

  return candidates.filter((item, index, arr) => arr.findIndex(other => other.key === item.key) === index);
}

export function interpretPortalError(message = '') {
  const value = String(message || '').trim();
  if (!value) {
    return {
      category: 'No message',
      title: 'No portal message provided',
      explanation: 'Paste the exact visible error message. Do not guess the cause.',
      action: 'Inspect the page and copy the exact wording.',
      confidence: 'none'
    };
  }

  const rules = [
    {
      test: /file.{0,25}(size|large|limit)|size.{0,25}(exceed|limit)|upload.{0,25}(limit|large)/i,
      category: 'Document upload',
      title: 'Likely file size or upload constraint',
      explanation: 'The portal message appears related to an upload size limit. Check the service-specific maximum size and accepted file types before retrying.',
      action: 'Check the configured portal upload limit and compress/convert only if the official portal allows it.'
    },
    {
      test: /required|mandatory|cannot be blank|cannot be empty|please enter/i,
      category: 'Required field',
      title: 'A required field may be missing',
      explanation: 'The message indicates a mandatory field or section may not be complete. The missing field may be below the visible part of the page.',
      action: 'Review all required fields, including sections and dropdowns, before attempting submission again.'
    },
    {
      test: /date.{0,30}(format|invalid|valid)|invalid.{0,20}date|dd[\/-]mm[\/-]yyyy|yyyy[\/-]mm[\/-]dd/i,
      category: 'Date format',
      title: 'Date format or date value may be invalid',
      explanation: 'The portal may expect a specific date format or valid date range.',
      action: 'Use the date format shown beside the exact field. Confirm the value against the source document.'
    },
    {
      test: /aadhaar|aadhar|uidai|uid number/i,
      category: 'Identity field',
      title: 'Identity field needs verification',
      explanation: 'The message appears to reference Aadhaar or a UID field. This heuristic cannot verify identity or portal eligibility.',
      action: 'Recheck the digits against the original document and confirm the service is authorised to request this identifier.'
    },
    {
      test: /mobile|phone number|contact number/i,
      category: 'Contact field',
      title: 'Phone number may be invalid',
      explanation: 'The portal message appears related to a contact number format or verification state.',
      action: 'Check the entered number and the portal’s country-code/OTP instructions. Do not attempt to bypass OTP.'
    },
    {
      test: /invalid format|format is invalid|invalid input|pattern mismatch|not valid/i,
      category: 'Field format',
      title: 'A field format may not match the portal rule',
      explanation: 'The portal rejected a value format. This message does not identify the exact rule by itself.',
      action: 'Inspect field-specific examples and constraints, then compare with the original document.'
    },
    {
      test: /session.{0,15}(expired|timeout)|login again|log in again/i,
      category: 'Session',
      title: 'Portal session may have expired',
      explanation: 'The server may have invalidated the session while the form was being completed.',
      action: 'Save any available reference details, log in through the official process, and review the form again before resubmitting.'
    },
    {
      test: /server error|internal server|\b500\b|\b502\b|\b503\b|service unavailable|try again later/i,
      category: 'Portal availability',
      title: 'The portal may have a server-side issue',
      explanation: 'The message resembles a server or availability error; it may not be caused by data entry.',
      action: 'Do not repeatedly submit. Record the time and exact message, then retry later or use the official help channel.'
    },
    {
      test: /duplicate|already exists|already registered/i,
      category: 'Existing record',
      title: 'The portal may have detected an existing record',
      explanation: 'A similar application or identifier may already exist in the portal.',
      action: 'Check the official application/status lookup before creating another submission.'
    }
  ];

  const found = rules.find(rule => rule.test.test(value));
  return found
    ? { ...found, confidence: 'heuristic' }
    : {
        category: 'Unmapped message',
        title: 'Cause not mapped safely',
        explanation: 'The rule library has no reliable match for this message. Do not treat a guess as a diagnosis.',
        action: 'Preserve the exact message, review the official portal help text, and escalate when required.',
        confidence: 'none'
      };
}

export function formatINR(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    return 'Not configured';
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
}

export function buildApplicationPayload(application, citizen, service) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const value = citizen?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      fields[key] = String(value);
    }
  }
  return {
    schemaVersion: 1,
    source: 'SevaDesk',
    application: {
      id: application.id,
      serviceName: service?.name || 'Unconfigured service',
      portalUrl: service?.portalUrl || '',
      adapterId: service?.adapterId || 'generic-fallback',
      feeStatus: application?.feeStatus || 'pending'
    },
    citizen: {
      id: citizen?.id,
      displayName: citizen?.fullName || '',
      fields
    },
    documents: Array.isArray(application?.documents) ? application.documents : [],
    generatedAt: new Date().toISOString(),
    notice: 'Review every mapping. This payload does not submit an application. OTP, CAPTCHA, passwords, and final submission remain manual.'
  };
}

export const STATUS_TRANSITIONS = {
  draft: ['draft', 'needs_correction', 'ready', 'closed'],
  needs_correction: ['needs_correction', 'draft', 'ready', 'closed'],
  ready: ['ready', 'needs_correction', 'in_portal', 'draft', 'closed'],
  in_portal: ['in_portal', 'ready', 'needs_correction', 'submitted', 'closed'],
  submitted: ['submitted', 'rejected', 'closed'],
  rejected: ['rejected', 'needs_correction', 'ready', 'closed'],
  closed: ['closed']
};

export function validateStatusTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) {
    return { allowed: false, reason: 'Status is required.' };
  }
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }
  if (currentStatus === 'closed') {
    return { allowed: false, reason: 'Closed applications are terminal and cannot be modified.' };
  }
  if (currentStatus === 'submitted') {
    if (['draft', 'needs_correction', 'ready', 'in_portal'].includes(targetStatus)) {
      return { 
        allowed: false, 
        reason: `Cannot reverse submitted application back to ${targetStatus.replace('_', ' ')}. Only rejection or closure is permitted.` 
      };
    }
  }
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return { allowed: false, reason: `Disallowed transition from ${currentStatus} to ${targetStatus}.` };
  }
  return { allowed: true };
}

export function isCitizenLocked(citizenId, applications = []) {
  if (!citizenId || !Array.isArray(applications)) return false;
  return applications.some(a => a.citizenId === citizenId && (a.status === 'submitted' || a.status === 'closed'));
}

export const PROFORMA_TYPES = [
  'self_declaration',
  'income_affidavit',
  'caste_declaration',
  'general_proforma'
];

export { deriveVaultKey, encryptVault, decryptVault, base64ToBytes } from './vault.js';
