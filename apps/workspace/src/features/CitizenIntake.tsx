import React, { useState } from 'react';
import { 
  Camera, 
  Upload, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { Citizen, OcrCandidate, extractOcrCandidates, maskIdentifier, validateCitizen } from '@sevadesk/core-types';
import { requestOcrScan } from '../lib/api';
import Tesseract from 'tesseract.js';

interface CitizenIntakeProps {
  initialCitizen?: Citizen | null;
  onSave: (citizen: Citizen) => Promise<void>;
  onCancel: () => void;
  daemonConnected: boolean;
}

export const CitizenIntake: React.FC<CitizenIntakeProps> = ({
  initialCitizen,
  onSave,
  onCancel,
  daemonConnected
}) => {
  const [formData, setFormData] = useState<Partial<Citizen>>(
    initialCitizen || {
      fullName: '',
      dob: '',
      gender: '',
      mobile: '',
      email: '',
      address: '',
      state: '',
      district: '',
      pincode: '',
      aadhaar: '',
      voterId: '',
      rationCard: '',
      bankAccount: '',
      ifsc: '',
      consentAt: '',
      consentPurpose: ''
    }
  );

  const [consentChecked, setConsentChecked] = useState(Boolean(initialCitizen?.consentAt));
  const [showAadhaar, setShowAadhaar] = useState(false);
  const [showBank, setShowBank] = useState(false);
  
  // OCR State
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrEngineUsed, setOcrEngineUsed] = useState('');
  const [ocrMessage, setOcrMessage] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const handleInputChange = (field: keyof Citizen, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setOcrFile(file);
    setOcrText('');
    setOcrCandidates([]);
    setSelectedCandidateKeys(new Set());
    setOcrMessage('');
  };

  const handleRunOcr = async () => {
    if (!ocrFile && !ocrText) return;
    setOcrLoading(true);
    setOcrMessage('Processing document image with local OCR engine...');

    try {
      let rawExtractedText = ocrText;
      let engineUsed = 'Local-Heuristics';

      if (ocrFile) {
        if (daemonConnected) {
          setOcrMessage('Analyzing document with Local Intelligence Core (PaddleOCR)...');
          try {
            const result = await requestOcrScan(ocrFile, rawExtractedText);
            rawExtractedText = result.text || rawExtractedText;
            engineUsed = result.engine || 'Local-Core (PaddleOCR)';
          } catch (daemonErr) {
            console.warn('Local core OCR error, trying browser Tesseract:', daemonErr);
          }
        }

        // Secondary fallback to browser Tesseract WASM if needed
        if (!rawExtractedText) {
          setOcrMessage('Analyzing image pixels with local browser OCR...');
          try {
            const res = await Tesseract.recognize(ocrFile, 'eng+hin', {
              logger: m => {
                if (m.status === 'recognizing text') {
                  setOcrMessage(`Recognizing document text: ${Math.round((m.progress || 0) * 100)}%`);
                }
              }
            });
            if (res.data?.text && res.data.text.trim()) {
              rawExtractedText = res.data.text;
              engineUsed = 'Tesseract-WASM (Local)';
            }
          } catch (tessErr) {
            console.warn('Browser Tesseract WASM fallback error:', tessErr);
          }
        }
      }

      setOcrText(rawExtractedText || '');
      const candidates = rawExtractedText ? extractOcrCandidates(rawExtractedText) : [];
      setOcrCandidates(candidates);
      setOcrEngineUsed(engineUsed);
      if (candidates.length > 0) {
        setOcrMessage(`Detected ${candidates.length} candidate field(s) using ${engineUsed}. Review and check fields to apply.`);
      } else {
        setOcrMessage('No candidate fields could be confidently extracted. Enter values directly.');
      }
      setSelectedCandidateKeys(new Set(candidates.map(c => c.key)));
    } catch (err: any) {
      setOcrMessage(err.message || 'OCR extraction failed. Enter values manually.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleApplyOcr = () => {
    const updates: Partial<Citizen> = {};
    for (const cand of ocrCandidates) {
      if (selectedCandidateKeys.has(cand.key)) {
        updates[cand.key as keyof Citizen] = cand.value as any;
      }
    }
    setFormData(prev => ({ ...prev, ...updates }));
    setOcrMessage(`Applied ${selectedCandidateKeys.size} field(s) into intake form.`);
  };

  const toggleCandidateKey = (key: string) => {
    setSelectedCandidateKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    if (!consentChecked) {
      setFormErrors(['Citizen consent must be recorded before saving personal records.']);
      return;
    }

    const valResult = validateCitizen(formData, ['fullName']);
    if (!valResult.valid) {
      setFormErrors(valResult.errors.map(err => err.message));
      return;
    }

    const now = new Date().toISOString();
    const citizenToSave: Citizen = {
      id: formData.id || `CIT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      fullName: formData.fullName || '',
      dob: formData.dob || '',
      gender: formData.gender || '',
      mobile: formData.mobile || '',
      email: formData.email || '',
      address: formData.address || '',
      state: formData.state || '',
      district: formData.district || '',
      pincode: formData.pincode || '',
      aadhaar: formData.aadhaar || '',
      voterId: formData.voterId || '',
      rationCard: formData.rationCard || '',
      bankAccount: formData.bankAccount || '',
      ifsc: (formData.ifsc || '').toUpperCase(),
      consentAt: formData.consentAt || now,
      consentPurpose: formData.consentPurpose || 'Assisted-service application intake with explicit consent.',
      createdAt: formData.createdAt || now,
      updatedAt: now
    };

    await onSave(citizenToSave);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            CITIZEN RECORD
          </div>
          <h1>{initialCitizen ? 'Update citizen record' : 'New citizen intake'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Capture source details with citizen consent. Nothing is treated as verified until checked against the original document.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(360px, 1fr)', gap: '24px', alignItems: 'start' }}>
        {/* Left Form */}
        <form onSubmit={handleSubmit} className="panel">
          {formErrors.length > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)', marginBottom: '20px', fontSize: '0.85rem' }}>
              <strong>Please correct the following:</strong>
              <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                {formErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>1</span>
            <h2 style={{ fontSize: '1.1rem' }}>Demographics & Contact</h2>
          </div>

          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label" htmlFor="fullName">Full name *</label>
              <input
                id="fullName"
                className="form-control"
                placeholder="Name as printed on original document"
                value={formData.fullName || ''}
                onChange={e => handleInputChange('fullName', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                className="form-control"
                value={formData.dob || ''}
                onChange={e => handleInputChange('dob', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gender">Gender</label>
              <select
                id="gender"
                className="form-control"
                value={formData.gender || ''}
                onChange={e => handleInputChange('gender', e.target.value)}
              >
                <option value="">Select gender…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mobile">Mobile number (10 digits)</label>
              <input
                id="mobile"
                type="tel"
                maxLength={10}
                className="form-control"
                placeholder="10-digit phone"
                value={formData.mobile || ''}
                onChange={e => handleInputChange('mobile', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="form-control"
                placeholder="Optional"
                value={formData.email || ''}
                onChange={e => handleInputChange('email', e.target.value)}
              />
            </div>

            <div className="form-group full">
              <label className="form-label" htmlFor="address">Address</label>
              <input
                id="address"
                className="form-control"
                placeholder="House / street / village / ward"
                value={formData.address || ''}
                onChange={e => handleInputChange('address', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="district">District</label>
              <input
                id="district"
                className="form-control"
                placeholder="District"
                value={formData.district || ''}
                onChange={e => handleInputChange('district', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="state">State / UT</label>
              <input
                id="state"
                className="form-control"
                placeholder="State"
                value={formData.state || ''}
                onChange={e => handleInputChange('state', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pincode">PIN code (6 digits)</label>
              <input
                id="pincode"
                maxLength={6}
                className="form-control"
                placeholder="6-digit PIN"
                value={formData.pincode || ''}
                onChange={e => handleInputChange('pincode', e.target.value)}
              />
            </div>
          </div>

          <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-light)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>2</span>
            <div>
              <h2 style={{ fontSize: '1.1rem' }}>Identifiers (Only when required)</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Masked outside editing. Stored only in local encrypted vault.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="aadhaar">Aadhaar (12 digits)</label>
                <button
                  type="button"
                  onClick={() => setShowAadhaar(!showAadhaar)}
                  style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {showAadhaar ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showAadhaar ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="aadhaar"
                type={showAadhaar ? 'text' : 'password'}
                maxLength={12}
                className="form-control"
                placeholder="12 digits — only if portal requires it"
                value={formData.aadhaar || ''}
                onChange={e => handleInputChange('aadhaar', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="voterId">Voter ID / EPIC</label>
              <input
                id="voterId"
                className="form-control"
                placeholder="EPIC number"
                value={formData.voterId || ''}
                onChange={e => handleInputChange('voterId', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rationCard">Ration card number</label>
              <input
                id="rationCard"
                className="form-control"
                placeholder="Ration card / Family ID"
                value={formData.rationCard || ''}
                onChange={e => handleInputChange('rationCard', e.target.value)}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="bankAccount">Bank account number</label>
                <button
                  type="button"
                  onClick={() => setShowBank(!showBank)}
                  style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {showBank ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showBank ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="bankAccount"
                type={showBank ? 'text' : 'password'}
                className="form-control"
                placeholder="Only if required for DBT"
                value={formData.bankAccount || ''}
                onChange={e => handleInputChange('bankAccount', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ifsc">IFSC code (11 characters)</label>
              <input
                id="ifsc"
                maxLength={11}
                className="form-control"
                placeholder="e.g. SBIN0001234"
                value={formData.ifsc || ''}
                onChange={e => handleInputChange('ifsc', e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-light)' }} />

          {/* Consent Checkbox */}
          <div style={{
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: consentChecked ? 'var(--status-good-bg)' : 'var(--status-warn-bg)',
            border: `1px solid ${consentChecked ? 'var(--primary-border)' : 'var(--status-warn)'}`,
            marginBottom: '20px'
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                style={{ marginTop: '3px' }}
                required
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                <strong>Explicit Citizen Consent:</strong> I have explained to the applicant why these details are collected, obtained their consent for assisted entry, and will confirm the specific scheme with them before final submission.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save encrypted record <ArrowRight size={16} />
            </button>
          </div>
        </form>

        {/* Right Document OCR Panel */}
        <aside className="panel">
          <div className="panel-header">
            <div>
              <div className="overline">
                <Sparkles size={13} /> LOCAL DOCUMENT INTELLIGENCE
              </div>
              <h2 style={{ fontSize: '1.1rem' }}>Read a document</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {daemonConnected ? 'PaddleOCR-v4 enabled locally' : 'Client-side transcription'}
              </p>
            </div>
          </div>

          <div style={{
            border: '2px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '24px 16px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-subtle)',
            marginBottom: '16px'
          }}>
            <Camera size={28} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
            <strong style={{ display: 'block', fontSize: '0.875rem' }}>Upload or capture ID document</strong>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Aadhaar, Voter ID, PAN card, or Passbook image
            </p>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} /> Select image
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
            {ocrFile && (
              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '8px', fontWeight: 600 }}>
                {ocrFile.name} ({(ocrFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={handleRunOcr}
              disabled={(!ocrFile && !ocrText) || ocrLoading}
            >
              {ocrLoading ? 'Scanning…' : 'Run OCR analysis'}
            </button>
          </div>

          {ocrMessage && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', fontStyle: 'italic' }}>
              {ocrMessage}
            </div>
          )}

          {/* OCR Candidates checklist */}
          {ocrCandidates.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '0.825rem' }}>Detected Candidates:</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Check values to apply</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {ocrCandidates.map(cand => {
                  const isChecked = selectedCandidateKeys.has(cand.key);
                  return (
                    <label
                      key={cand.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isChecked ? 'var(--primary-light)' : 'var(--bg-subtle)',
                        border: `1px solid ${isChecked ? 'var(--primary-border)' : 'var(--border-light)'}`,
                        fontSize: '0.825rem',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCandidateKey(cand.key)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {cand.label}
                        </span>
                        <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cand.sensitive ? maskIdentifier(cand.value) : cand.value}
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {typeof cand.confidence === 'number' ? `${Math.round(cand.confidence * 100)}%` : cand.confidence}
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={handleApplyOcr}
                disabled={selectedCandidateKeys.size === 0}
                style={{ width: '100%', marginTop: '12px' }}
              >
                Apply {selectedCandidateKeys.size} checked value(s) to form
              </button>
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--status-warn-bg)', fontSize: '0.75rem', color: 'var(--status-warn)' }}>
            <strong>Privacy Guarantee:</strong> SevaDesk runs OCR locally. The document photo is never stored on disk or uploaded to any cloud server.
          </div>
        </aside>
      </div>
    </div>
  );
};
