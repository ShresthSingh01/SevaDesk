// Portal Adapters bundled for SevaDesk Chrome Extension
// Provides declarative CSS selectors and value transformations for verified Indian e-District portals

export const PORTAL_ADAPTERS = [
  {
    id: 'mahadbt-post-matric-v1',
    name: 'MahaDBT (Maharashtra Direct Benefit Transfer)',
    state: 'Maharashtra',
    portalDomain: 'mahadbt.maharashtra.gov.in',
    version: '1.2.0',
    description: 'Post-matric scholarships, farmer schemes, and social justice welfare benefits.',
    fields: {
      fullName: {
        targetSelector: '#txtApplicantName, input[name="ApplicantName"], #ApplicantName',
        fallbackSelectors: ['input[aria-label="Applicant Name"]', 'input[placeholder*="Applicant Name"]'],
        required: true
      },
      dob: {
        targetSelector: '#txtDOB, input[name="DOB"], #BirthDate',
        fallbackSelectors: ['input[placeholder*="DD/MM/YYYY"]', 'input[type="date"]'],
        transform: 'date_dmy',
        required: true
      },
      gender: {
        targetSelector: '#ddlGender, select[name="Gender"], #Gender',
        fallbackSelectors: ['select[aria-label="Gender"]'],
        required: true
      },
      mobile: {
        targetSelector: '#txtMobileNumber, input[name="MobileNo"], #MobileNo',
        fallbackSelectors: ['input[type="tel"]'],
        transform: 'digits_only',
        required: true
      },
      email: {
        targetSelector: '#txtEmail, input[name="EmailId"], #EmailId',
        required: false
      },
      address: {
        targetSelector: '#txtAddress, textarea[name="Address"], #Address',
        required: true
      },
      district: {
        targetSelector: '#ddlDistrict, select[name="District"], #District',
        required: true
      },
      pincode: {
        targetSelector: '#txtPinCode, input[name="Pincode"], #PinCode',
        transform: 'digits_only',
        required: true
      },
      bankAccount: {
        targetSelector: '#txtAccountNumber, input[name="BankAccount"], #AccountNumber',
        required: true
      },
      ifsc: {
        targetSelector: '#txtIFSCCode, input[name="IFSC"], #IFSCCode',
        transform: 'uppercase',
        required: true
      }
    },
    disallowedSelectors: [
      'input[type="password"]',
      '#txtCaptcha',
      '.captcha-input',
      '#btnFinalSubmit',
      'input[name*="OTP"]'
    ]
  },
  {
    id: 'up-edistrict-v1',
    name: 'UP e-District (Uttar Pradesh Citizen Services)',
    state: 'Uttar Pradesh',
    portalDomain: 'edistrict.up.gov.in',
    version: '1.1.0',
    description: 'Income, Caste, Domicile, and Birth/Death certificates for Uttar Pradesh.',
    fields: {
      fullName: {
        targetSelector: '#txtApplicantNameEng, input[name="txtNameEng"], #txtApplicantName',
        fallbackSelectors: ['input[name*="NameEng"]', 'input[placeholder*="Name in English"]'],
        required: true
      },
      dob: {
        targetSelector: '#txtDOB, input[name="txtDOB"]',
        fallbackSelectors: ['input[name*="DOB"]'],
        transform: 'date_dmy',
        required: true
      },
      gender: {
        targetSelector: '#ddlGender, select[name="ddlGender"]',
        required: true
      },
      mobile: {
        targetSelector: '#txtMobile, input[name="txtMobile"]',
        transform: 'digits_only',
        required: true
      },
      address: {
        targetSelector: '#txtAddressPermanent, textarea[name="txtAddress"]',
        required: true
      },
      district: {
        targetSelector: '#ddlDistrict, select[name="ddlDistrict"]',
        required: true
      },
      pincode: {
        targetSelector: '#txtPin, input[name="txtPinCode"]',
        transform: 'digits_only',
        required: true
      },
      rationCard: {
        targetSelector: '#txtRationCard, input[name="txtRationCard"]',
        required: false
      }
    },
    disallowedSelectors: [
      'input[type="password"]',
      '#txtCaptcha',
      '#btnSubmit',
      'input[name*="OTP"]'
    ]
  },
  {
    id: 'saral-haryana-v1',
    name: 'Antyodaya Saral Haryana',
    state: 'Haryana',
    portalDomain: 'saralharyana.gov.in',
    version: '1.0.0',
    description: 'Unified citizen delivery portal for Haryana social security and certificates.',
    fields: {
      fullName: {
        targetSelector: 'input[name="applicant_name"], #applicant_name, #txt_name',
        required: true
      },
      dob: {
        targetSelector: 'input[name="dob"], #dob, #txt_dob',
        transform: 'date_dmy',
        required: true
      },
      gender: {
        targetSelector: 'select[name="gender"], #gender',
        required: true
      },
      mobile: {
        targetSelector: 'input[name="mobile_no"], #mobile_no',
        transform: 'digits_only',
        required: true
      },
      pincode: {
        targetSelector: 'input[name="pin_code"], #pin_code',
        transform: 'digits_only',
        required: true
      },
      address: {
        targetSelector: 'textarea[name="address"], #address',
        required: true
      }
    },
    disallowedSelectors: [
      'input[type="password"]',
      'input[name*="captcha"]',
      'button[type="submit"]'
    ]
  },
  {
    id: 'edistrict-delhi-v1',
    name: 'e-District Delhi',
    state: 'Delhi',
    portalDomain: 'edistrict.delhigovt.nic.in',
    version: '1.0.0',
    description: 'Revenue, Social Welfare, and SC/ST department citizen services.',
    fields: {
      fullName: {
        targetSelector: '#txt_ApplicantName, input[name="ApplicantName"]',
        required: true
      },
      dob: {
        targetSelector: '#txt_DOB, input[name="DOB"]',
        transform: 'date_dmy',
        required: true
      },
      gender: {
        targetSelector: '#ddl_Gender, select[name="Gender"]',
        required: true
      },
      mobile: {
        targetSelector: '#txt_Mobile, input[name="MobileNo"]',
        transform: 'digits_only',
        required: true
      },
      pincode: {
        targetSelector: '#txt_PinCode, input[name="PinCode"]',
        transform: 'digits_only',
        required: true
      },
      aadhaar: {
        targetSelector: '#txt_Aadhaar, input[name="AadhaarNo"]',
        transform: 'digits_only',
        required: false
      }
    },
    disallowedSelectors: [
      '#txt_Captcha',
      '#btn_Submit'
    ]
  },
  {
    id: 'pm-kisan-v1',
    name: 'PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)',
    state: 'Central / All States',
    portalDomain: 'pmkisan.gov.in',
    version: '1.0.0',
    description: 'Farmer registration, e-KYC, and installment status portal.',
    fields: {
      aadhaar: {
        targetSelector: '#txtAadharNo, #txtAadhar, #txtAadhaar, input[name*="Aadhar" i], input[name*="Aadhaar" i]',
        fallbackSelectors: ['input[placeholder*="Aadhaar" i]', 'input[placeholder*="Aadhar" i]'],
        transform: 'digits_only',
        required: true
      },
      mobile: {
        targetSelector: '#txtMobileNo, #txtMobile, input[name*="Mobile" i]',
        fallbackSelectors: ['input[placeholder*="Mobile" i]', 'input[type="tel"]'],
        transform: 'digits_only',
        required: true
      },
      state: {
        targetSelector: '#ddlState, select[name*="State" i]',
        required: true
      },
      district: {
        targetSelector: '#ddlDistrict, select[name*="District" i]',
        required: true
      },
      bankAccount: {
        targetSelector: '#txtAccountNo, input[name*="Account" i]',
        required: false
      },
      ifsc: {
        targetSelector: '#txtIFSC, input[name*="IFSC" i]',
        transform: 'uppercase',
        required: false
      }
    },
    disallowedSelectors: [
      '#txtCaptcha',
      'input[name*="captcha" i]',
      '#btnGetOTP',
      'input[name*="otp" i]'
    ]
  },
  {
    id: 'generic-fallback',
    name: 'Universal Heuristic Adapter',
    state: 'All States',
    portalDomain: '*',
    version: '1.0.0',
    description: 'Dynamic fallback using heuristic label and autocomplete inspection.',
    fields: {},
    disallowedSelectors: [
      'input[type="password"]',
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'button[type="submit"]',
      'input[name*="otp" i]'
    ]
  }
];

export function findAdapterByUrl(url = '') {
  if (!url) return PORTAL_ADAPTERS.find(a => a.id === 'generic-fallback');
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();
    const fullHref = url.toLowerCase();

    // Check if query parameter explicitly targets a portal (e.g. ?portal=edistrict.up.gov.in or ?portal=up-edistrict-v1)
    const portalParam = parsed.searchParams?.get('portal')?.toLowerCase();
    if (portalParam) {
      const paramMatch = PORTAL_ADAPTERS.find(a => 
        a.id.toLowerCase() === portalParam ||
        a.portalDomain.toLowerCase().includes(portalParam) ||
        portalParam.includes(a.portalDomain.toLowerCase())
      );
      if (paramMatch) return paramMatch;
    }

    const match = PORTAL_ADAPTERS.find(a => a.portalDomain !== '*' && (
      domain.includes(a.portalDomain.toLowerCase()) ||
      fullHref.includes(a.portalDomain.toLowerCase())
    ));
    return match || PORTAL_ADAPTERS.find(a => a.id === 'generic-fallback');
  } catch {
    return PORTAL_ADAPTERS.find(a => a.id === 'generic-fallback');
  }
}

export function transformValue(value = '', transform) {
  const str = String(value ?? '').trim();
  if (!transform) return str;
  if (transform === 'digits_only') return str.replace(/\D/g, '');
  if (transform === 'uppercase') return str.toUpperCase();
  if (transform === 'date_dmy') {
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    return str;
  }
  if (transform === 'date_ymd') {
    const dmy = str.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return str;
  }
  return str;
}
