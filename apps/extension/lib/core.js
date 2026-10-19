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
