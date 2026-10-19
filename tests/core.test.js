import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCitizen, validateCase, suggestFieldMatches, extractOcrCandidates, interpretPortalError, maskIdentifier, formatINR } from '../packages/core-types/index.js';

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
