import React, { useState, useRef } from 'react';
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
  EyeOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Citizen, OcrCandidate, extractOcrCandidates, maskIdentifier, validateCitizen } from '@sevadesk/core-types';
import { requestOcrScan } from '../lib/api';
import { playOcrReadbackSpeech, getOcrReadbackText } from '../lib/speech';
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
  const [audioLang, setAudioLang] = useState('hi-IN');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [readbackVerified, setReadbackVerified] = useState(false);

  const previewName = ocrCandidates.find(c => c.key === 'fullName')?.value || formData.fullName || 'नागरिक';
  const previewDob = ocrCandidates.find(c => c.key === 'dob')?.value || formData.dob;
  const previewPin = ocrCandidates.find(c => c.key === 'pincode')?.value || formData.pincode;
  const previewAadhaar = ocrCandidates.find(c => c.key === 'aadhaar')?.value || formData.aadhaar;
  const previewMaskedId = previewAadhaar ? maskIdentifier(previewAadhaar) : undefined;

  const previewReadbackText = getOcrReadbackText({
    fullName: previewName,
    dob: previewDob,
    pincode: previewPin,
    maskedId: previewMaskedId
  }, audioLang);

  const hasReadbackData = ocrCandidates.length > 0 || Boolean(formData.fullName?.trim());

  const handleInputChange = (field: keyof Citizen, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setOcrFile(file);
    setOcrText('');
    setOcrCandidates([]);
    setSelectedCandidateKeys(new Set());
    setOcrMessage('');
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      alert('Could not access webcam/scanner. Please ensure camera permissions are allowed, or choose "Upload image" / "Demo Card".');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `id_camera_scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setOcrFile(file);
        setOcrText('');
        setOcrCandidates([]);
        setSelectedCandidateKeys(new Set());
        setOcrMessage('ID photo captured from camera. Click "Run OCR analysis" to extract details.');
        stopCamera();
      }
    }, 'image/jpeg', 0.92);
  };

  const loadDemoCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Card background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#c8cfbf';
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Top tri-color stripe
    ctx.fillStyle = '#ff9933';
    ctx.fillRect(16, 16, canvas.width - 32, 16);
    ctx.fillStyle = '#138808';
    ctx.fillRect(16, 32, canvas.width - 32, 16);

    // Header
    ctx.fillStyle = '#1f2923';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Government of India / भारत सरकार', 240, 90);

    // Photo box
    ctx.fillStyle = '#e4e8dc';
    ctx.fillRect(50, 130, 190, 240);
    ctx.strokeStyle = '#87978d';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 130, 190, 240);
    ctx.fillStyle = '#5c6b62';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('CITIZEN PHOTO', 80, 255);

    // Identity fields
    ctx.fillStyle = '#1f2923';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Rajesh Kumar Sharma', 270, 170);
    ctx.font = '22px sans-serif';
    ctx.fillText('DOB: 15/08/1985', 270, 220);
    ctx.fillText('Gender: Male / पुरुष', 270, 265);
    ctx.fillText('PIN: 110001', 270, 310);

    // Valid Verhoeff 12-digit number
    ctx.fillStyle = '#c53030';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('9999  9999  9999', 320, 480);

    // Bottom banner
    ctx.fillStyle = '#1b4332';
    ctx.fillRect(16, canvas.height - 40, canvas.width - 32, 24);

    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], 'demo_aadhaar_card.jpg', { type: 'image/jpeg' });
        setOcrFile(file);
        setOcrText('');
        const demoCandidates: OcrCandidate[] = [
          { key: 'fullName', label: 'Full name', value: 'Rajesh Kumar Sharma', confidence: 'High' },
          { key: 'dob', label: 'Date of birth', value: '1985-08-15', confidence: 'High' },
          { key: 'gender', label: 'Gender', value: 'Male', confidence: 'High' },
          { key: 'pincode', label: 'PIN code', value: '110001', confidence: 'High' },
          { key: 'aadhaar', label: 'Aadhaar number', value: '999999999999', confidence: 'High', sensitive: true }
        ];
        setOcrCandidates(demoCandidates);
        setSelectedCandidateKeys(new Set(demoCandidates.map(c => c.key)));
        setFormData(prev => ({
          ...prev,
          fullName: 'Rajesh Kumar Sharma',
          dob: '1985-08-15',
          gender: 'Male',
          pincode: '110001',
          aadhaar: '999999999999'
        }));
        setOcrEngineUsed('Demo Engine (Verhoeff Verified)');
        setOcrMessage('⚡ Demo Aadhaar card loaded & smart auto-filled 5 fields into form!');
        setFormErrors([]);
      }
    }, 'image/jpeg', 0.95);
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
        // Automatically populate form fields for maximum operator speed & smartness!
        const updates: Partial<Citizen> = {};
        for (const cand of candidates) {
          updates[cand.key as keyof Citizen] = cand.value as any;
        }
        setFormData(prev => ({ ...prev, ...updates }));
        setSelectedCandidateKeys(new Set(candidates.map(c => c.key)));
        setOcrMessage(`⚡ Smart Auto-Filled ${candidates.length} field(s) into form (${engineUsed})! Review details.`);
        setFormErrors([]);
      } else {
        setOcrMessage('No candidate fields could be confidently extracted. Enter values directly.');
        setSelectedCandidateKeys(new Set());
      }
    } catch (err: any) {
      setOcrMessage(err.message || 'OCR extraction failed. Enter values manually.');
    } finally {
      setOcrLoading(false);
    }
  };

  const isAutoFilled = (key: string) => {
    return ocrCandidates.some(c => c.key === key && selectedCandidateKeys.has(key) && Boolean(formData[key as keyof Citizen]));
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
      const isRemoving = next.has(key);
      if (isRemoving) {
        next.delete(key);
        setFormData(curr => ({ ...curr, [key]: '' }));
      } else {
        next.add(key);
        const cand = ocrCandidates.find(c => c.key === key);
        if (cand) {
          setFormData(curr => ({ ...curr, [key]: cand.value }));
        }
      }
      return next;
    });
  };

  const handleSpeakReadback = async () => {
    if (isSpeaking) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const nameCand = ocrCandidates.find(c => c.key === 'fullName')?.value || formData.fullName;
    const dobCand = ocrCandidates.find(c => c.key === 'dob')?.value || formData.dob;
    const pinCand = ocrCandidates.find(c => c.key === 'pincode')?.value || formData.pincode;
    const aadhaarCand = ocrCandidates.find(c => c.key === 'aadhaar')?.value || formData.aadhaar;
    const maskedId = aadhaarCand ? maskIdentifier(aadhaarCand) : undefined;

    setIsSpeaking(true);
    try {
      await playOcrReadbackSpeech({
        fullName: nameCand,
        dob: dobCand,
        pincode: pinCand,
        maskedId: maskedId
      }, audioLang);
    } catch (err) {
      console.warn('Speech playback error:', err);
    } finally {
      setIsSpeaking(false);
    }
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
    const consentPurpose = readbackVerified
      ? `Informed consent verified via regional audio readback (${audioLang.split('-')[0].toUpperCase()}).`
      : (formData.consentPurpose || 'Assisted-service application intake with explicit consent.');

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
      consentPurpose: consentPurpose,
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

          {ocrCandidates.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--status-good-bg)',
              color: 'var(--status-good)',
              marginBottom: '20px',
              border: '1px solid var(--primary-border)',
              fontSize: '0.85rem'
            }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Smart OCR Auto-Fill Active:</strong> Demographic fields were automatically extracted from the document scan. Review values below and edit anytime.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>1</span>
            <h2 style={{ fontSize: '1.1rem' }}>Demographics & Contact</h2>
          </div>

          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label" htmlFor="fullName">
                Full name *
                {isAutoFilled('fullName') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
              <label className="form-label" htmlFor="dob">
                Date of birth
                {isAutoFilled('dob') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
              <input
                id="dob"
                type="date"
                className="form-control"
                value={formData.dob || ''}
                onChange={e => handleInputChange('dob', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gender">
                Gender
                {isAutoFilled('gender') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
              <label className="form-label" htmlFor="mobile">
                Mobile number (10 digits)
                {isAutoFilled('mobile') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
              <label className="form-label" htmlFor="address">
                Address
                {isAutoFilled('address') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
              <label className="form-label" htmlFor="pincode">
                PIN code (6 digits)
                {isAutoFilled('pincode') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
                <label className="form-label" htmlFor="aadhaar">
                  Aadhaar (12 digits)
                  {isAutoFilled('aadhaar') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
                </label>
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
              <label className="form-label" htmlFor="ifsc">
                IFSC code (11 characters)
                {isAutoFilled('ifsc') && <span className="status-pill good" style={{ padding: '1px 6px', fontSize: '0.65rem', marginLeft: '6px' }}>⚡ Auto-filled</span>}
              </label>
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
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: consentChecked ? 'var(--status-good-bg)' : 'var(--status-warn-bg)',
            border: `1px solid ${consentChecked ? 'var(--primary-border)' : 'var(--status-warn)'}`,
            marginBottom: '20px',
            transition: 'all 0.2s ease'
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                required
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.4, display: 'block' }}>
                  <strong>Explicit Citizen Consent (DPDP Act 2023):</strong> I have explained to the applicant why these details are collected, obtained informed consent for assisted entry, and verified the accuracy of demographic records.
                </span>
                {readbackVerified && (
                  <div style={{
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}>
                    <CheckCircle2 size={13} />
                    Informed Consent Verified via Spoken Readback ({audioLang.split('-')[0].toUpperCase()})
                  </div>
                )}
              </div>
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
              Aadhaar, Voter ID, PAN card, or Passbook scan
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }} title="Upload image from computer or phone gallery">
                <Upload size={14} /> Upload scan
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>

              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }} title="Directly triggers the phone's native camera shutter on mobile devices">
                <Camera size={14} /> Phone camera
                <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={isCameraActive ? stopCamera : startCamera}
                title="Uses laptop webcam or USB document camera"
              >
                <Camera size={14} /> {isCameraActive ? 'Close Camera' : 'Webcam / Scanner'}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadDemoCard}
                title="Generates a valid test Aadhaar document for instant testing"
              >
                <Sparkles size={14} /> Demo Card
              </button>
            </div>

            {isCameraActive && (
              <div style={{ marginTop: '16px', position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: '#000000' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute',
                  top: '12%',
                  left: '12%',
                  right: '12%',
                  bottom: '12%',
                  border: '2px dashed #52b788',
                  borderRadius: '8px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: '6px'
                }}>
                  <span style={{ color: '#ffffff', fontSize: '0.7rem', backgroundColor: 'rgba(0,0,0,0.65)', padding: '2px 8px', borderRadius: '4px' }}>
                    Hold ID card inside box
                  </span>
                </div>
                <div style={{ padding: '8px', backgroundColor: '#111814', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={capturePhoto}>
                    <Camera size={14} /> Snap ID photo
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {ocrFile && (
              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '8px', fontWeight: 600 }}>
                ✓ {ocrFile.name} ({(ocrFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            <div style={{
              marginTop: '12px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textAlign: 'left'
            }}>
              <Volume2 size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-main)', lineHeight: 1.35 }}>
                <strong>Multimodal Readback:</strong> Automatic speech synthesis in 7 regional languages for non-literate & visually impaired citizens.
              </span>
            </div>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
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
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCandidateKey(cand.key)}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {cand.label}
                        </span>
                        <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cand.sensitive ? maskIdentifier(cand.value) : cand.value}
                        </strong>
                      </div>
                      <span style={{
                        fontSize: '0.7rem',
                        color: 'var(--primary)',
                        fontWeight: 700,
                        backgroundColor: 'var(--primary-light)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--primary-border)'
                      }}>
                        {typeof cand.confidence === 'number' ? `${Math.round(cand.confidence * 100)}%` : cand.confidence}
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleApplyOcr}
                disabled={selectedCandidateKeys.size === 0}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Check size={14} /> Apply {selectedCandidateKeys.size} checked value(s) to form
              </button>
            </div>
          )}

          {/* Multilingual Citizen Audio Readback & Closed-Loop Verification Card */}
          {hasReadbackData ? (
            <div style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(234, 246, 237, 0.75) 0%, #ffffff 100%)',
              border: '1px solid var(--primary-border)',
              boxShadow: '0 2px 8px rgba(27, 67, 50, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {/* Card Header */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    DPDP Inclusivity & Verification
                  </span>
                  <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    7 Regional Languages
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                      flexShrink: 0
                    }}>
                      <Volume2 size={15} />
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Citizen Spoken Readback
                      {isSpeaking && (
                        <div className="soundwave-container active" title="Audio playing to citizen">
                          <span className="soundwave-bar" />
                          <span className="soundwave-bar" />
                          <span className="soundwave-bar" />
                          <span className="soundwave-bar" />
                        </div>
                      )}
                    </div>
                  </div>

                  <select
                    id="ocrAudioLang"
                    value={audioLang}
                    onChange={e => setAudioLang(e.target.value)}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-strong)',
                      backgroundColor: '#ffffff',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="hi-IN">Hindi (हिंदी)</option>
                    <option value="mr-IN">Marathi (मराठी)</option>
                    <option value="ta-IN">Tamil (தமிழ்)</option>
                    <option value="te-IN">Telugu (తెలుగు)</option>
                    <option value="bn-IN">Bengali (বাংলা)</option>
                    <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                    <option value="en-IN">English</option>
                  </select>
                </div>
              </div>

              {/* Spoken Transcript Live Preview */}
              <div style={{
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                border: '1px dashed var(--primary-border)',
                fontSize: '0.75rem',
                color: 'var(--text-main)',
                lineHeight: 1.45
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Spoken Transcript Preview
                  </span>
                  <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {audioLang.split('-')[0].toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-main)' }}>
                  "{previewReadbackText}"
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    backgroundColor: isSpeaking ? 'var(--status-bad-bg)' : '#ffffff',
                    borderColor: isSpeaking ? 'var(--status-bad)' : 'var(--border-strong)',
                    color: isSpeaking ? 'var(--status-bad)' : 'var(--text-main)',
                    fontWeight: 600
                  }}
                  onClick={handleSpeakReadback}
                >
                  {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} color="var(--primary)" />}
                  {isSpeaking ? 'Stop speaking' : 'Read aloud to citizen'}
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${readbackVerified ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    backgroundColor: readbackVerified ? 'var(--primary)' : '#ffffff'
                  }}
                  onClick={() => {
                    const next = !readbackVerified;
                    setReadbackVerified(next);
                    if (next) setConsentChecked(true);
                  }}
                  title="Citizen verbally confirmed identity readback"
                >
                  <CheckCircle2 size={14} />
                  {readbackVerified ? 'Verified ✓' : 'Confirm consent'}
                </button>
              </div>

              {/* Verified Feedback Pill */}
              {readbackVerified && (
                <div style={{
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--status-good-bg)',
                  border: '1px solid var(--primary-border)',
                  fontSize: '0.72rem',
                  color: 'var(--status-good)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={13} color="var(--status-good)" style={{ flexShrink: 0 }} />
                  <span>Informed consent verified via {audioLang.split('-')[0].toUpperCase()} audio readback. Recorded in DPDP audit log.</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px dashed var(--border-strong)',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Volume2 size={18} color="var(--primary)" />
              <span>Enter citizen name or upload an ID document to activate regional spoken readback & closed-loop verification.</span>
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
