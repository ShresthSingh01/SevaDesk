import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateCitizen, 
  validateCase, 
  suggestFieldMatches, 
  extractOcrCandidates, 
  interpretPortalError, 
  maskIdentifier, 
  formatINR,
  validateStatusTransition,
  isCitizenLocked,
  buildApplicationPayload,
  PROFORMA_TYPES
} from '../packages/core-types/index.js';

test('required fields and common formats are validated', () => {
  const invalid = validateCitizen({ fullName: 'A', mobile: '12345', pincode: '1234', dob: '2099-01-01' }, ['fullName', 'district']);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(e => e.field === 'district'));
  assert.ok(invalid.errors.some(e => e.field === 'mobile'));
  assert.ok(invalid.errors.some(e => e.field === 'pincode'));
  assert.ok(invalid.errors.some(e => e.field === 'dob'));
});

test('a complete generic citizen record passes basic validation', () => {
  const result = validateCitizen({ fullName: 'Asha Verma', dob: '1990-01-01', mobile: '9876543210', address: 'Ward 2', district: 'Indore', pincode: '452001' }, ['fullName', 'dob', 'mobile', 'address', 'district', 'pincode']);
  assert.equal(result.valid, true);
});

test('service validation checks upload constraints and warns on unverified fees', () => {
  const result = validateCase({ fullName: 'Asha Verma', dob: '1990-01-01', mobile: '9876543210', address: 'Ward 2', district: 'Indore', pincode: '452001' }, { requiredFields: ['fullName'], maxUploadMB: 1, allowedExtensions: ['pdf'], portalUrl: '', officialFee: null, feeVerifiedAt: '' }, [{ name: 'photo.png', size: 20 }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'documents'));
  assert.ok(result.warnings.some(e => e.field === 'fee'));
});

test('field matcher never suggests OTP/captcha and prioritizes exact labels', () => {
  const fields = [{ index: 0, label: 'Applicant Full Name', type: 'text' }, { index: 1, label: 'One Time Password', type: 'text' }, { index: 2, label: 'Date of Birth', type: 'date' }];
  const suggestions = suggestFieldMatches({ fullName: 'Asha Verma', dob: '1990-01-01', mobile: '9876543210' }, fields);
  assert.equal(suggestions.find(x => x.key === 'fullName')?.suggestedIndex, 0);
  assert.equal(suggestions.find(x => x.key === 'dob')?.suggestedIndex, 2);
  assert.equal(suggestions.find(x => x.key === 'mobile')?.suggestedIndex, -1);
  assert.ok(!suggestions[0].candidates.some(x => x.field.label.includes('Password')));
});

test('field matcher detects masked Aadhaar and PM-KISAN inputs while rejecting login passwords', () => {
  const fields = [
    { index: 0, label: 'Enter Aadhaar No :', name: 'txtAadharNo', type: 'password' },
    { index: 1, label: 'Enter Mobile No :', name: 'txtMobileNo', type: 'text' },
    { index: 2, label: 'Account Password', name: 'txtPassword', type: 'password' }
  ];
  const suggestions = suggestFieldMatches({ aadhaar: '999999999999', mobile: '9876543210' }, fields);
  const aadhaarMatch = suggestions.find(x => x.key === 'aadhaar');
  const mobileMatch = suggestions.find(x => x.key === 'mobile');

  assert.equal(aadhaarMatch?.suggestedIndex, 0);
  assert.ok(aadhaarMatch?.confidence >= 90);
  assert.equal(mobileMatch?.suggestedIndex, 1);
  assert.ok(!aadhaarMatch.candidates.some(c => c.field.name === 'txtPassword'));
});

test('OCR candidate parser extracts review-only candidates and masks nothing silently', () => {
  const candidates = extractOcrCandidates('Name: Asha Verma\nDOB: 12/04/1990\nMobile: 9876543210\n452001');
  assert.equal(candidates.find(x => x.key === 'fullName')?.value, 'Asha Verma');
  assert.equal(candidates.find(x => x.key === 'dob')?.value, '1990-04-12');
  assert.equal(candidates.find(x => x.key === 'mobile')?.value, '9876543210');
});

test('OCR candidate parser extracts real Aadhaar front with omitted name and gender prefixes', () => {
  const aadhaarFront = `
    भारत सरकार
    GOVERNMENT OF INDIA
    राजेश कुमार शर्मा
    Rajesh Kumar Sharma
    जन्म तिथि / DOB: 15/08/1985
    पुरुष / MALE
    9999 9999 9999
  `;
  const candidates = extractOcrCandidates(aadhaarFront);
  assert.equal(candidates.find(x => x.key === 'fullName')?.value, 'Rajesh Kumar Sharma');
  assert.equal(candidates.find(x => x.key === 'dob')?.value, '1985-08-15');
  assert.equal(candidates.find(x => x.key === 'gender')?.value, 'Male');
  assert.equal(candidates.find(x => x.key === 'aadhaar')?.value, '999999999999');
});

test('OCR candidate parser extracts PAN Card without confusing applicant with Father Name', () => {
  const panCard = `
    INCOME TAX DEPARTMENT
    GOVT. OF INDIA
    Name: AMIT VERMA
    Father's Name: RAMESH VERMA
    Date of Birth: 23/11/1988
    Permanent Account Number: ABCDE1234F
  `;
  const candidates = extractOcrCandidates(panCard);
  assert.equal(candidates.find(x => x.key === 'fullName')?.value, 'AMIT VERMA');
  assert.equal(candidates.find(x => x.key === 'dob')?.value, '1988-11-23');
  assert.equal(candidates.find(x => x.key === 'voterId')?.value, 'ABCDE1234F');
});

test('OCR candidate parser extracts multiline address, state and PIN code', () => {
  const backCard = `
    Address:
    S/O Ramesh Sharma
    H No 42, Civil Lines, Varanasi
    Uttar Pradesh - 221001
  `;
  const candidates = extractOcrCandidates(backCard);
  assert.ok(candidates.find(x => x.key === 'address')?.value.includes('Civil Lines'));
  assert.equal(candidates.find(x => x.key === 'pincode')?.value, '221001');
  assert.equal(candidates.find(x => x.key === 'state')?.value, 'Uttar Pradesh');
});

test('error interpreter clearly marks unknown messages rather than inventing a cause', () => {
  const known = interpretPortalError('File size exceeded limit');
  assert.equal(known.category, 'Document upload');
  const unknown = interpretPortalError('ZXQ-44007');
  assert.equal(unknown.category, 'Unmapped message');
  assert.equal(unknown.confidence, 'none');
});

test('identifier masking and currency formatter are safe for empty values', () => {
  assert.equal(maskIdentifier('123456789012'), '••••••••9012');
  assert.equal(maskIdentifier(''), 'Not provided');
  assert.match(formatINR(150), /150/);
  assert.equal(formatINR(null), 'Not configured');
});

test('missing service constraints stay unknown and cannot produce a passing preflight', () => {
  const result = validateCase({ fullName: 'Example Citizen' }, { name: 'Unconfigured service', requiredFields: [], portalUrl: '' }, [{ name: 'document.exe', size: 60 * 1024 * 1024 }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'requiredFields'));
  assert.ok(!result.errors.some(e => e.field === 'documents'));
  assert.ok(result.warnings.some(e => e.field === 'allowedExtensions'));
  assert.ok(result.warnings.some(e => e.field === 'maxUploadMB'));
});

test('submitted applications cannot be reversed to ready, draft or in_portal', () => {
  assert.equal(validateStatusTransition('submitted', 'ready').allowed, false);
  assert.equal(validateStatusTransition('submitted', 'draft').allowed, false);
  assert.equal(validateStatusTransition('submitted', 'needs_correction').allowed, false);
  assert.equal(validateStatusTransition('submitted', 'in_portal').allowed, false);
  assert.equal(validateStatusTransition('submitted', 'rejected').allowed, true);
  assert.equal(validateStatusTransition('submitted', 'closed').allowed, true);
  assert.equal(validateStatusTransition('submitted', 'submitted').allowed, true);
});

test('closed applications are terminal and cannot transition to any other status', () => {
  assert.equal(validateStatusTransition('closed', 'ready').allowed, false);
  assert.equal(validateStatusTransition('closed', 'draft').allowed, false);
  assert.equal(validateStatusTransition('closed', 'submitted').allowed, false);
  assert.equal(validateStatusTransition('closed', 'closed').allowed, true);
});

test('isCitizenLocked identifies citizens attached to submitted or closed applications', () => {
  const apps = [
    { id: 'APP-1', citizenId: 'CIT-1', status: 'draft' },
    { id: 'APP-2', citizenId: 'CIT-2', status: 'ready' },
    { id: 'APP-3', citizenId: 'CIT-3', status: 'submitted' },
    { id: 'APP-4', citizenId: 'CIT-4', status: 'closed' }
  ];
  assert.equal(isCitizenLocked('CIT-1', apps), false);
  assert.equal(isCitizenLocked('CIT-2', apps), false);
  assert.equal(isCitizenLocked('CIT-3', apps), true);
  assert.equal(isCitizenLocked('CIT-4', apps), true);
  assert.equal(isCitizenLocked('NON-EXISTENT', apps), false);
});

test('buildApplicationPayload carries staged application documents', () => {
  const app = {
    id: 'APP-100',
    citizenId: 'CIT-1',
    serviceId: 'srv-up-income',
    status: 'ready',
    documents: [
      { name: 'photo.jpg', size: 18000, type: 'image/jpeg', role: 'photo', optimised: true },
      { name: 'declaration.pdf', size: 65000, type: 'application/pdf', role: 'selfDeclaration', optimised: true }
    ]
  };
  const citizen = {
    id: 'CIT-1',
    fullName: 'Ramesh Verma',
    mobile: '9876543210'
  };
  const service = {
    id: 'srv-up-income',
    name: 'Income Certificate',
    portalUrl: 'https://edistrict.up.gov.in',
    adapterId: 'edistrict-up'
  };

  const payload = buildApplicationPayload(app, citizen, service);
  assert.equal(payload.application.id, 'APP-100');
  assert.equal(payload.citizen.displayName, 'Ramesh Verma');
  assert.equal(payload.documents.length, 2);
  assert.equal(payload.documents[0].role, 'photo');
  assert.equal(payload.documents[0].optimised, true);
});

test('validateCase accepts valid documents under configured size limit', () => {
  const citizen = {
    fullName: 'Asha Verma',
    dob: '1990-01-01',
    mobile: '9876543210',
    address: 'Ward 2',
    district: 'Indore',
    pincode: '452001'
  };
  const service = {
    requiredFields: ['fullName', 'mobile'],
    maxUploadMB: 0.1, // 100 KB
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    portalUrl: 'https://example.gov.in',
    officialFee: 15,
    operatorCharge: 30,
    feeSourceUrl: 'https://example.gov.in',
    feeVerifiedAt: '2026-10-20'
  };
  const docs = [
    { name: 'photo.jpg', size: 20 * 1024, type: 'image/jpeg' }, // 20 KB <= 100 KB
    { name: 'self_dec.pdf', size: 80 * 1024, type: 'application/pdf' } // 80 KB <= 100 KB
  ];

  const result = validateCase(citizen, service, docs);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('streamlined workflow transitions: ready -> in_portal -> submitted -> closed are all valid', () => {
  assert.equal(validateStatusTransition('ready', 'in_portal').allowed, true);
  assert.equal(validateStatusTransition('in_portal', 'submitted').allowed, true);
  assert.equal(validateStatusTransition('submitted', 'closed').allowed, true);
  assert.equal(validateStatusTransition('draft', 'ready').allowed, true);
});

test('buildApplicationPayload preserves fee collection status and payment metadata', () => {
  const citizen = {
    id: 'ctz-101',
    fullName: 'Suresh Raina',
    mobile: '9876543210'
  };
  const service = {
    id: 'srv-income',
    name: 'Income Certificate',
    officialFee: 15,
    operatorCharge: 30
  };
  const app = {
    id: 'app-501',
    citizenId: citizen.id,
    serviceId: service.id,
    status: 'ready',
    feeStatus: 'collected',
    feeCollectedAt: '2026-10-21T10:00:00.000Z',
    feeReceiptNo: 'REC-991823'
  };

  const payload = buildApplicationPayload(app, citizen, service);
  assert.equal(payload.application.id, 'app-501');
  assert.equal(payload.application.feeStatus, 'collected');
  assert.equal(payload.application.serviceName, 'Income Certificate');
});

test('application lifecycle supports post-submission certificate delivery and closure', () => {
  // Step 1: Submission with portal reference
  const submittedApp = {
    id: 'app-601',
    status: 'submitted',
    receiptRef: 'UPED-2026-992143',
    feeStatus: 'collected'
  };

  // Verify transition to closed is allowed
  const transition = validateStatusTransition(submittedApp.status, 'closed');
  assert.equal(transition.allowed, true);

  // Step 2: Attach certificate issued by government department
  const closedApp = {
    ...submittedApp,
    status: 'closed',
    certificateRef: 'CERT/2026/09124',
    deliveredAt: new Date().toISOString()
  };

  assert.equal(closedApp.status, 'closed');
  assert.equal(closedApp.certificateRef, 'CERT/2026/09124');
  assert.ok(closedApp.deliveredAt);

  // Once closed, terminal status protects integrity
  const reopenCheck = validateStatusTransition(closedApp.status, 'ready');
  assert.equal(reopenCheck.allowed, false);
});

test('validateCase enforces slot-specific file size and format limits', () => {
  const citizen = {
    fullName: 'Rajesh Kumar',
    mobile: '9876543210'
  };
  const service = {
    requiredFields: ['fullName', 'mobile'],
    maxUploadMB: 1, // global fallback 1 MB
    allowedExtensions: ['pdf', 'jpg'],
    portalUrl: 'https://example.gov.in',
    officialFee: 20,
    operatorCharge: 30,
    feeSourceUrl: 'https://example.gov.in',
    feeVerifiedAt: '2026-10-21',
    documentSlots: [
      { id: 'photo', label: 'Passport Photo', maxKB: 20, allowedExtensions: ['jpg', 'jpeg'], required: true },
      { id: 'declaration', label: 'Self Declaration', maxKB: 100, allowedExtensions: ['pdf'], required: true }
    ]
  };

  // Test 1: Photo exceeds slot maxKB (25 KB > 20 KB)
  const oversizedPhotoDocs = [
    { name: 'photo.jpg', size: 25 * 1024, type: 'image/jpeg', slotId: 'photo' },
    { name: 'dec.pdf', size: 80 * 1024, type: 'application/pdf', slotId: 'declaration' }
  ];
  const res1 = validateCase(citizen, service, oversizedPhotoDocs);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some(e => e.label === 'Passport Photo' && e.message.includes('exceeds the configured 20 KB limit')));

  // Test 2: Photo has wrong extension for slot (.pdf instead of .jpg)
  const wrongExtDocs = [
    { name: 'photo.pdf', size: 15 * 1024, type: 'application/pdf', slotId: 'photo' },
    { name: 'dec.pdf', size: 80 * 1024, type: 'application/pdf', slotId: 'declaration' }
  ];
  const res2 = validateCase(citizen, service, wrongExtDocs);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some(e => e.label === 'Passport Photo' && e.message.includes('not in allowed list')));

  // Test 3: Perfectly sized and formatted docs pass
  const validDocs = [
    { name: 'photo.jpg', size: 18 * 1024, type: 'image/jpeg', slotId: 'photo' },
    { name: 'dec.pdf', size: 80 * 1024, type: 'application/pdf', slotId: 'declaration' }
  ];
  const res3 = validateCase(citizen, service, validDocs);
  assert.equal(res3.valid, true);
  assert.equal(res3.errors.length, 0);
});

test('buildApplicationPayload carries base64 dataUrl and slotId for bridge transfer', () => {
  const citizen = {
    id: 'CIT-200',
    fullName: 'Meena Sharma',
    mobile: '9123456789'
  };
  const service = {
    id: 'srv-caste',
    name: 'Caste Certificate',
    portalUrl: 'https://edistrict.gov.in',
    adapterId: 'edistrict'
  };
  const app = {
    id: 'APP-555',
    citizenId: citizen.id,
    serviceId: service.id,
    status: 'ready',
    documents: [
      {
        name: 'photo.jpg',
        size: 15200,
        type: 'image/jpeg',
        slotId: 'photo',
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        optimised: true
      }
    ]
  };

  const payload = buildApplicationPayload(app, citizen, service);
  assert.equal(payload.application.id, 'APP-555');
  assert.equal(payload.documents.length, 1);
  assert.equal(payload.documents[0].slotId, 'photo');
  assert.ok(payload.documents[0].dataUrl.startsWith('data:image/jpeg;base64,'));
});

test('document slots support printable proforma configuration and type validation', () => {
  assert.ok(PROFORMA_TYPES.includes('self_declaration'));
  assert.ok(PROFORMA_TYPES.includes('income_affidavit'));
  assert.ok(PROFORMA_TYPES.includes('caste_declaration'));
  assert.ok(PROFORMA_TYPES.includes('general_proforma'));

  const service = {
    requiredFields: ['fullName'],
    maxUploadMB: 1,
    allowedExtensions: ['pdf', 'jpg'],
    portalUrl: 'https://edistrict.up.gov.in',
    officialFee: 15,
    operatorCharge: 30,
    feeSourceUrl: 'https://edistrict.up.gov.in',
    feeVerifiedAt: '2026-10-21',
    documentSlots: [
      {
        id: 'declaration',
        label: 'Self-Declaration Form',
        maxKB: 100,
        allowedExtensions: ['pdf', 'jpg', 'jpeg'],
        required: true,
        proformaType: 'self_declaration',
        proformaTitle: 'स्वप्रमाणित घोषणा पत्र (आय प्रमाण पत्र हेतु)'
      }
    ]
  };

  const citizen = { fullName: 'Ramesh Kumar Verma', mobile: '9876543210' };
  const docs = [{ name: 'self_declaration_signed.jpg', size: 85 * 1024, type: 'image/jpeg', slotId: 'declaration' }];
  const res = validateCase(citizen, service, docs);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(service.documentSlots[0].proformaType, 'self_declaration');
});



