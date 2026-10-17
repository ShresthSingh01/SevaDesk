// Core shared types and validators bundled for SevaDesk Chrome Extension
// Exported as self-contained ES module

export const FIELD_LABELS = {
  fullName: 'Applicant full name',
  dob: 'Date of birth',
  gender: 'Gender',
  mobile: 'Mobile number',
  aadhaar: 'Aadhaar number (last 4 digits / VID when unmasked)',
  voterId: 'Voter ID (EPIC)',
  rationCard: 'Ration card / Family ID',
  address: 'Address / Residence',
  state: 'State / UT',
  district: 'District',
  pincode: 'PIN code',
  bankAccount: 'Bank account number',
  ifsc: 'Bank IFSC code',
  email: 'Email address'
};

export const SENSITIVE_FIELDS = ['aadhaar', 'bankAccount'];

export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .trim();
}

export function onlyDigits(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

export const KEY_ALIASES = {
  fullName: ['name', 'full name', 'applicant name', 'beneficiary name', 'candidate name', 'first name', 'surname', 'आवेदक का नाम', 'नाव'],
  dob: ['date of birth', 'dob', 'birth date', 'birthdate', 'जन्म तिथि', 'जन्मतारीख'],
  gender: ['gender', 'sex', 'लिंग'],
  mobile: ['mobile', 'mobile number', 'phone', 'phone number', 'contact number', 'registered mobile', 'मोबाइल नंबर'],
  aadhaar: ['aadhaar', 'aadhar', 'uid', 'uid number', 'aadhaar number', 'आधार कार्ड', 'आधार'],
  voterId: ['voter id', 'epic', 'epic number', 'elector photo identity card', 'मतदाता पहचान पत्र'],
  rationCard: ['ration card', 'ration card number', 'family id', 'राशन कार्ड'],
  address: ['address', 'residential address', 'permanent address', 'current address', 'पता', 'पत्ता'],
  state: ['state', 'state name', 'राज्य'],
  district: ['district', 'district name', 'जिला', 'जिल्हा'],
  pincode: ['pin code', 'pincode', 'postal code', 'zip code', 'पिन कोड'],
  bankAccount: ['bank account', 'account number', 'bank account number', 'खाता संख्या'],
  ifsc: ['ifsc', 'ifsc code', 'branch ifsc', 'आईएफएससी कोड'],
  email: ['email', 'email address', 'e mail', 'ईमेल']
};

export function scoreFieldMatch(dataKey, field = {}) {
  const labelText = normalizeText(
    [field.label, field.name, field.id, field.placeholder, field.autocomplete, field['aria-label']].filter(Boolean).join(' ')
  );
  if (!labelText) return 0;
  if (/captcha|one time password|otp|verification code|security code|password|passcode|transaction pin/i.test(labelText)) {
    return 0;
  }
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
    const scored = pageFields
      .map((field, index) => ({
        field,
        index: Number.isInteger(field.index) ? field.index : index,
        score: scoreFieldMatch(key, field)
      }))
      .filter(item => item.score >= 55)
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
      test: /session.{0,20}(expired|timeout)|timed out|logged out/i,
      category: 'Session',
      title: 'Portal session expired',
      explanation: 'Official government portals time out quickly on idle pages.',
      action: 'Log in again in a new tab, return to the relevant form, and rescan.'
    },
    {
      test: /captcha|security code|verification code/i,
      category: 'Security checkpoint',
      title: 'CAPTCHA or human verification challenge',
      explanation: 'The operator must personally inspect and enter the security challenge.',
      action: 'Operator must manually solve and enter the security code on the portal.'
    },
    {
      test: /otp|one time password/i,
      category: 'Authentication',
      title: 'OTP verification required',
      explanation: 'Citizen must provide the OTP sent to their registered mobile number.',
      action: 'Request OTP from the citizen and enter manually.'
    },
    {
      test: /aadhaar.{0,25}(mismatch|not found|invalid)|uid.{0,20}(invalid|error)/i,
      category: 'Identity validation',
      title: 'Aadhaar / UID validation issue',
      explanation: 'The entered Aadhaar number did not match government portal verification records or Verhoeff checksum.',
      action: 'Re-verify with citizen’s physical/masked Aadhaar card and check Verhoeff digit.'
    },
    {
      test: /ifsc|bank.{0,20}(invalid|branch)|account number/i,
      category: 'Banking details',
      title: 'Bank account / IFSC validation failure',
      explanation: 'The bank IFSC code or account number was not recognized by the portal validation service.',
      action: 'Inspect bank passbook first page and check RBI IFSC format (4 letters, 0, 6 characters).'
    }
  ];

  for (const rule of rules) {
    if (rule.test.test(value)) {
      return {
        category: rule.category,
        title: rule.title,
        explanation: rule.explanation,
        action: rule.action,
        confidence: 'high',
        matchedRule: rule.title
      };
    }
  }

  return {
    category: 'Unclassified portal message',
    title: 'Portal returned a notice',
    explanation: 'The portal showed a message not yet in the local pattern index. Review portal instructions carefully.',
    action: 'Read the instructions directly on the portal page and take note of required corrections.',
    confidence: 'low'
  };
}
