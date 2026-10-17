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
  return String(value).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function maskIdentifier(value = '', visible = 4) {
  const raw = String(value).trim();
  if (!raw) return 'Not provided';
  if (raw.length <= visible) return '•'.repeat(Math.max(0, raw.length - 1)) + raw.slice(-1);
  return `${'•'.repeat(Math.max(4, raw.length - visible))}${raw.slice(-visible)}`;
}

export function validateCitizen(citizen = {}, requiredFields = []) {
  const errors = [];
  const warnings = [];
  const required = new Set(requiredFields);
  for (const key of required) {
    if (FIELD_LABELS[key] && !String(citizen[key] ?? '').trim()) {
      errors.push({ field: key, label: FIELD_LABELS[key], message: `${FIELD_LABELS[key]} is required for this service.` });
    }
  }
  const mobile = onlyDigits(citizen.mobile || '');
  if (citizen.mobile && !/^[6-9]\d{9}$/.test(mobile)) errors.push({ field: 'mobile', label: FIELD_LABELS.mobile, message: 'Enter a valid 10-digit Indian mobile number.' });
  const pincode = onlyDigits(citizen.pincode || '');
  if (citizen.pincode && !/^\d{6}$/.test(pincode)) errors.push({ field: 'pincode', label: FIELD_LABELS.pincode, message: 'PIN code must contain exactly 6 digits.' });
  const aadhaar = onlyDigits(citizen.aadhaar || '');
  if (citizen.aadhaar && !/^\d{12}$/.test(aadhaar)) errors.push({ field: 'aadhaar', label: FIELD_LABELS.aadhaar, message: 'Aadhaar number must contain 12 digits, where the selected portal requires it.' });
  if (citizen.dob) {
    const dob = new Date(`${citizen.dob}T00:00:00`);
    if (Number.isNaN(dob.getTime())) errors.push({ field: 'dob', label: FIELD_LABELS.dob, message: 'Enter a valid date of birth.' });
    else if (dob > new Date()) errors.push({ field: 'dob', label: FIELD_LABELS.dob, message: 'Date of birth cannot be in the future.' });
  }
  if (citizen.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(citizen.email).trim())) errors.push({ field: 'email', label: FIELD_LABELS.email, message: 'Enter a valid email address.' });
  if (citizen.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(citizen.ifsc).trim())) errors.push({ field: 'ifsc', label: FIELD_LABELS.ifsc, message: 'IFSC should be 11 characters in the standard format.' });
  if (citizen.aadhaar) warnings.push({ field: 'aadhaar', label: FIELD_LABELS.aadhaar, message: 'Verify whether Aadhaar is required and permitted for this specific service. Avoid storing or entering it when unnecessary.' });
  return { valid: errors.length === 0, errors, warnings };
}

export function validateCase(citizen = {}, service = {}, documents = []) {
  const requiredFields = Array.isArray(service.requiredFields) ? service.requiredFields : [];
  const base = validateCitizen(citizen, requiredFields);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const maxValue = service.maxUploadMB;
  const hasMaxUpload = maxValue !== null && maxValue !== undefined && String(maxValue).trim() !== '' && Number.isFinite(Number(maxValue)) && Number(maxValue) > 0;
  const maxBytes = hasMaxUpload ? Number(maxValue) * 1024 * 1024 : null;
  const allowed = (Array.isArray(service.allowedExtensions) ? service.allowedExtensions : []).map(v => String(v).toLowerCase().replace(/^\./, '')).filter(Boolean);

  if (!requiredFields.length) errors.push({ field: 'requiredFields', label: 'Required fields not configured', message: 'Select the mandatory applicant fields observed on the real official portal before preflight can pass.' });
  if (!hasMaxUpload) warnings.push({ field: 'maxUploadMB', label: 'Maximum file size not configured', message: 'The portal’s maximum upload size is unknown here. Check it on the official portal before selecting documents.' });
  if (!allowed.length) warnings.push({ field: 'allowedExtensions', label: 'Allowed file types not configured', message: 'Accepted file types are unknown here. Check the official portal before uploading a document.' });

  for (const doc of documents || []) {
    const ext = String(doc.name || '').split('.').pop().toLowerCase();
    if (allowed.length && !allowed.includes(ext)) errors.push({ field: 'documents', label: doc.name || 'Document', message: `${doc.name || 'File'} type .${ext} is not in this service's configured allowed list (${allowed.join(', ')}).` });
    if (hasMaxUpload && Number(doc.size || 0) > maxBytes) errors.push({ field: 'documents', label: doc.name || 'Document', message: `${doc.name || 'File'} exceeds the configured ${Number(maxValue)} MB per-file limit.` });
  }
  if (!service.portalUrl) warnings.push({ field: 'portalUrl', label: 'Official portal URL', message: 'Add and verify the official portal URL before starting portal entry.' });
  if (service.officialFee == null || service.operatorCharge == null || !service.feeSourceUrl || !service.feeVerifiedAt) warnings.push({ field: 'fee', label: 'Fee configuration', message: 'Official fee, operator charge, source URL and checked date must all be configured. Do not quote an unverified amount as an official fee.' });
  return { valid: errors.length === 0, errors, warnings };
}

const KEY_ALIASES = {
  fullName: ['name', 'full name', 'applicant name', 'beneficiary name', 'candidate name', 'first name', 'surname'],
  dob: ['date of birth', 'dob', 'birth date', 'birthdate'],
  gender: ['gender', 'sex'],
  mobile: ['mobile', 'mobile number', 'phone', 'phone number', 'contact number', 'registered mobile'],
  aadhaar: ['aadhaar', 'aadhar', 'uid', 'uid number', 'aadhaar number'],
  voterId: ['voter id', 'epic', 'epic number', 'elector photo identity card'],
  rationCard: ['ration card', 'ration card number', 'family id'],
  address: ['address', 'residential address', 'permanent address', 'current address'],
  state: ['state', 'state name'],
  district: ['district', 'district name'],
  pincode: ['pin code', 'pincode', 'postal code', 'zip code'],
  bankAccount: ['bank account', 'account number', 'bank account number'],
  ifsc: ['ifsc', 'ifsc code', 'branch ifsc'],
  email: ['email', 'email address', 'e mail']
};

export function scoreFieldMatch(dataKey, field = {}) {
  const labelText = normalizeText([field.label, field.name, field.id, field.placeholder, field.autocomplete].filter(Boolean).join(' '));
  if (!labelText) return 0;
  if (/captcha|one time password|otp|verification code|security code|password|passcode|transaction pin/.test(labelText)) return 0;
  const key = normalizeText(dataKey);
  const aliases = [key, ...(KEY_ALIASES[dataKey] || [])].map(normalizeText).filter(Boolean);
  let best = 0;
  for (const alias of aliases) {
    if (labelText === alias) best = Math.max(best, 100);
    else if (labelText.includes(alias) || alias.includes(labelText)) best = Math.max(best, 78);
    const parts = alias.split(' ').filter(x => x.length > 2);
    if (parts.length && parts.every(p => labelText.includes(p))) best = Math.max(best, 65 + parts.length * 4);
  }
  if (dataKey === 'dob' && field.type === 'date') best = Math.max(best, 82);
  if (dataKey === 'mobile' && field.type === 'tel') best = Math.max(best, 70);
  if (dataKey === 'email' && field.type === 'email') best = Math.max(best, 78);
  return Math.min(100, best);
}

export function suggestFieldMatches(dataFields = {}, pageFields = []) {
  const suggestions = [];
  for (const [key, value] of Object.entries(dataFields)) {
    if (value == null || String(value).trim() === '' || !FIELD_LABELS[key]) continue;
    const scored = pageFields.map((field, index) => ({ field, index: Number.isInteger(field.index) ? field.index : index, score: scoreFieldMatch(key, field) }))
      .filter(item => item.score >= 55)
      .sort((a, b) => b.score - a.score);
    suggestions.push({ key, label: FIELD_LABELS[key] || key, value: String(value), candidates: scored.slice(0, 5), suggestedIndex: scored[0]?.index ?? -1, confidence: scored[0]?.score ?? 0 });
  }
  return suggestions;
}

export function extractOcrCandidates(text = '') {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  const candidates = [];
  const pickLine = (regex) => {
    const line = lines.find(item => regex.test(item));
    if (!line) return '';
    const parts = line.split(/[:|]/);
    return parts.length > 1 ? parts.slice(1).join(':').trim() : line.replace(regex, '').trim();
  };
  let name = pickLine(/^(?:name|applicant name|beneficiary name)\b\s*[:\-]?/i);
  if (name) {
    name = name.replace(/[^\p{L}\p{M} .'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (name.length > 2 && name.length < 90) candidates.push({ key: 'fullName', label: FIELD_LABELS.fullName, value: name, confidence: 'Review' });
  }
  let dob = pickLine(/^(?:dob|date of birth|birth date)\b\s*[:\-]?/i);
  if (!dob) {
    const match = raw.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    dob = match?.[1] || '';
  }
  if (dob) {
    let iso = '';
    const ymd = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dmy = dob.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    if (ymd) iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    else if (dmy) iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const date = iso ? new Date(`${iso}T00:00:00`) : null;
    if (date && !Number.isNaN(date.getTime()) && date.getFullYear() > 1900 && date <= new Date()) candidates.push({ key: 'dob', label: FIELD_LABELS.dob, value: iso, confidence: 'Review' });
  }
  const pin = raw.match(/\b([1-8]\d{5})\b/);
  if (pin) candidates.push({ key: 'pincode', label: FIELD_LABELS.pincode, value: pin[1], confidence: 'Review' });
  const mobile = raw.match(/(?:\+91[\s-]?)?\b([6-9]\d{9})\b/);
  if (mobile) candidates.push({ key: 'mobile', label: FIELD_LABELS.mobile, value: mobile[1], confidence: 'Review' });
  const aadhaar = raw.match(/\b(?:\d[ -]?){12}\b/g)?.map(s => s.replace(/\D/g, '')).find(s => s.length === 12);
  if (aadhaar) candidates.push({ key: 'aadhaar', label: FIELD_LABELS.aadhaar, value: aadhaar, confidence: 'Review', sensitive: true });
  const genderLine = lines.find(line => /^(?:gender|sex)\b/i.test(line));
  if (genderLine) {
    const rawGender = genderLine.split(/[:|]/).slice(1).join(':').trim() || genderLine.replace(/^(?:gender|sex)\s*/i, '').trim();
    const normalized = rawGender.toLowerCase();
    const val = /female|महिला|स्त्री/i.test(normalized) ? 'Female' : /male|पुरुष/i.test(normalized) ? 'Male' : /transgender|trans/i.test(normalized) ? 'Transgender' : '';
    if (val) candidates.push({ key: 'gender', label: FIELD_LABELS.gender, value: val, confidence: 'Review' });
  }
  return candidates.filter((item, index, arr) => arr.findIndex(other => other.key === item.key) === index);
}

export function interpretPortalError(message = '') {
  const value = String(message || '').trim();
  if (!value) return { category: 'No message', title: 'No portal message provided', explanation: 'Paste the exact visible error message. Do not guess the cause.', action: 'Inspect the page and copy the exact wording.', confidence: 'none' };
  const rules = [
    { test: /file.{0,25}(size|large|limit)|size.{0,25}(exceed|limit)|upload.{0,25}(limit|large)/i, category: 'Document upload', title: 'Likely file size or upload constraint', explanation: 'The portal message appears related to an upload size limit. Check the service-specific maximum size and accepted file types before retrying.', action: 'Check the configured portal upload limit and compress/convert only if the official portal allows it.' },
    { test: /required|mandatory|cannot be blank|cannot be empty|please enter/i, category: 'Required field', title: 'A required field may be missing', explanation: 'The message indicates a mandatory field or section may not be complete. The missing field may be below the visible part of the page.', action: 'Review all required fields, including sections and dropdowns, before attempting submission again.' },
    { test: /date.{0,30}(format|invalid|valid)|invalid.{0,20}date|dd[\/-]mm[\/-]yyyy|yyyy[\/-]mm[\/-]dd/i, category: 'Date format', title: 'Date format or date value may be invalid', explanation: 'The portal may expect a specific date format or valid date range.', action: 'Use the date format shown beside the exact field. Confirm the value against the source document.' },
    { test: /aadhaar|aadhar|uidai|uid number/i, category: 'Identity field', title: 'Identity field needs verification', explanation: 'The message appears to reference Aadhaar or a UID field. This heuristic cannot verify identity or portal eligibility.', action: 'Recheck the digits against the original document and confirm the service is authorised to request this identifier.' },
    { test: /mobile|phone number|contact number/i, category: 'Contact field', title: 'Phone number may be invalid', explanation: 'The portal message appears related to a contact number format or verification state.', action: 'Check the entered number and the portal’s country-code/OTP instructions. Do not attempt to bypass OTP.' },
    { test: /invalid format|format is invalid|invalid input|pattern mismatch|not valid/i, category: 'Field format', title: 'A field format may not match the portal rule', explanation: 'The portal rejected a value format. This message does not identify the exact rule by itself.', action: 'Inspect field-specific examples and constraints, then compare with the original document.' },
    { test: /session.{0,15}(expired|timeout)|login again|log in again/i, category: 'Session', title: 'Portal session may have expired', explanation: 'The server may have invalidated the session while the form was being completed.', action: 'Save any available reference details, log in through the official process, and review the form again before resubmitting.' },
    { test: /server error|internal server|\b500\b|\b502\b|\b503\b|service unavailable|try again later/i, category: 'Portal availability', title: 'The portal may have a server-side issue', explanation: 'The message resembles a server or availability error; it may not be caused by data entry.', action: 'Do not repeatedly submit. Record the time and exact message, then retry later or use the official help channel.' },
    { test: /duplicate|already exists|already registered/i, category: 'Existing record', title: 'The portal may have detected an existing record', explanation: 'A similar application or identifier may already exist in the portal.', action: 'Check the official application/status lookup before creating another submission.' }
  ];
  const found = rules.find(rule => rule.test.test(value));
  return found ? { ...found, confidence: 'heuristic' } : { category: 'Unmapped message', title: 'Cause not mapped safely', explanation: 'The rule library has no reliable match for this message. Do not treat a guess as a diagnosis.', action: 'Preserve the exact message, review the official portal help text, and escalate when required.', confidence: 'none' };
}

export function formatINR(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'Not configured';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
}

export function buildApplicationPayload(application, citizen, service) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const value = citizen?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') fields[key] = String(value);
  }
  return {
    schemaVersion: 1,
    source: 'SevaDesk',
    application: { id: application.id, serviceName: service?.name || 'Unconfigured service', portalUrl: service?.portalUrl || '' },
    citizen: { id: citizen?.id, displayName: citizen?.fullName || '', fields },
    generatedAt: new Date().toISOString(),
    notice: 'Review every mapping. This payload does not submit an application. OTP, CAPTCHA, passwords, and final submission remain manual.'
  };
}
