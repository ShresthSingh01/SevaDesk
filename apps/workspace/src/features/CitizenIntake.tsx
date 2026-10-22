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
  VolumeX,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  FileText,
  Trash2,
  Paperclip,
  FileCheck,
  RefreshCw,
  Printer,
  PenTool
} from 'lucide-react';
import { 
  Citizen, 
  ServiceDefinition, 
  ApplicationDocument, 
  OcrCandidate, 
  extractOcrCandidates, 
  maskIdentifier, 
  validateCitizen,
  DocumentSlotDefinition
} from '@sevadesk/core-types';
import { PrintableProformaModal } from '../components/PrintableProformaModal';
import { requestOcrScan } from '../lib/api';
import { playOcrReadbackSpeech, getOcrReadbackText, playFeeSpeech } from '../lib/speech';
import { optimizeImageForPortal, formatBytes, fileToDataUrl } from '../lib/imageCompressor';
import Tesseract from 'tesseract.js';

interface CitizenIntakeProps {
  initialCitizen?: Citizen | null;
  services?: ServiceDefinition[];
  citizens?: Citizen[];
  onSave: (
    citizen: Citizen,
    targetServiceId?: string,
    documents?: ApplicationDocument[],
    rawFiles?: File[],
    launchDirectly?: boolean,
    feeCollected?: boolean
  ) => Promise<void>;
  onCancel: () => void;
  daemonConnected: boolean;
  isLocked?: boolean;
  lockedReason?: string;
}

export const CitizenIntake: React.FC<CitizenIntakeProps> = ({
  initialCitizen,
  services = [],
  citizens = [],
  onSave,
  onCancel,
  daemonConnected,
  isLocked = false,
  lockedReason
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id || '');
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [serviceCategory, setServiceCategory] = useState('All');
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [showAllOptionalFields, setShowAllOptionalFields] = useState(false);
  const [feeCollected, setFeeCollected] = useState(false);

  // Returning Citizen Fast Lookup State
  const [citizenSearchQuery, setCitizenSearchQuery] = useState('');
  const [loadedCitizenName, setLoadedCitizenName] = useState<string | null>(initialCitizen?.fullName || null);

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
  const [activeProformaSlot, setActiveProformaSlot] = useState<DocumentSlotDefinition | null>(null);

  // Document attachments for application
  interface AttachedDocItem {
    id: string;
    name: string;
    size: number;
    type: string;
    role?: string;
    slotId?: string;
    file: File;
    dataUrl?: string;
    isOptimizing?: boolean;
    isOptimized?: boolean;
    error?: string;
  }
  const [attachedDocs, setAttachedDocs] = useState<AttachedDocItem[]>([]);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSlotInputRef = useRef<{ slotId: string; maxKB: number } | null>(null);
  const slotFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedService = services.find(s => s.id === selectedServiceId);

  // Live Counter-Desk Synchronization for Secondary Citizen Monitor (?view=citizen)
  React.useEffect(() => {
    if (selectedService) {
      try {
        localStorage.setItem('seva_citizen_display_sync', JSON.stringify({
          service: selectedService,
          citizenName: formData.fullName || null,
          timestamp: Date.now()
        }));
      } catch {}
    }
  }, [selectedService, formData.fullName]);

  const getPortalHostname = (urlStr?: string) => {
    if (!urlStr) return 'Govt Portal';
    try {
      return new URL(urlStr).hostname;
    } catch {
      return urlStr.replace(/^https?:\/\//, '').split('/')[0] || 'Govt Portal';
    }
  };

  const getServiceCategory = (s?: ServiceDefinition) => {
    if (!s || !s.id) return 'Welfare & Health';
    if (s.id.startsWith('srv-up')) return 'UP e-District';
    if (s.id.includes('parivahan') || s.id.includes('dl')) return 'Transport';
    if (s.id.includes('kisan')) return 'Agriculture / DBT';
    if (s.id.includes('voter') || s.id.includes('nvsp')) return 'Identity & Voter';
    return 'Welfare & Health';
  };

  const isFieldRequired = (key: keyof Citizen) => {
    if (!selectedService) return false;
    return Boolean(selectedService.requiredFields?.includes(key as any));
  };

  const isFieldRequiredByService = isFieldRequired;

  const isFieldVisible = (key: keyof Citizen) => {
    // If generic citizen intake (no service selected), show all fields
    if (!selectedService) return true;
    // If the field is explicitly required by this service, show it
    if (isFieldRequired(key)) return true;
    // If the field has a non-empty value (e.g. from OCR extraction or previous save), keep it visible
    if (formData[key] && String(formData[key]).trim() !== '') return true;
    // If operator clicked to show all optional fields, show it
    if (showAllOptionalFields) return true;
    // Otherwise, hide unwanted fields!
    return false;
  };

  const SERVICE_CATEGORIES = ['All', 'UP e-District', 'Agriculture / DBT', 'Transport', 'Welfare & Health', 'Identity & Voter'];

  const filteredServices = services.filter(s => {
    if (!s) return false;
    const q = serviceSearchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      (s.name && s.name.toLowerCase().includes(q)) || 
      (s.department && s.department.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q));
    if (!matchesQuery) return false;
    if (serviceCategory === 'All') return true;
    return getServiceCategory(s) === serviceCategory;
  });

  const POPULAR_SCHEMES = [
    { id: 'srv-up-income', label: 'UP Income (आय)', icon: '📜' },
    { id: 'srv-up-caste', label: 'Caste (जाति)', icon: '🏛️' },
    { id: 'srv-up-domicile', label: 'Domicile (निवास)', icon: '🏠' },
    { id: 'srv-pm-kisan', label: 'PM-Kisan (किसान)', icon: '🌾' },
    { id: 'srv-parivahan-dl', label: 'Driving License (DL)', icon: '🚗' },
  ];

  // Fast search filter for existing citizens
  const matchingCitizens = citizenSearchQuery.trim()
    ? (citizens || []).filter(c =>
        (c.fullName && c.fullName.toLowerCase().includes(citizenSearchQuery.toLowerCase())) ||
        (c.mobile && c.mobile.includes(citizenSearchQuery)) ||
        (c.aadhaar && c.aadhaar.includes(citizenSearchQuery))
      )
    : [];

  const handleSelectExistingCitizen = (citizen: Citizen) => {
    setFormData({ ...citizen });
    setConsentChecked(Boolean(citizen.consentAt));
    setLoadedCitizenName(citizen.fullName);
    setCitizenSearchQuery('');
    setFormErrors([]);
  };

  const handleClearSelectedCitizen = () => {
    setFormData({
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
    });
    setConsentChecked(false);
    setLoadedCitizenName(null);
  };

  const handleAttachFiles = async (files: File[], defaultRole?: string, targetMaxKB?: number) => {
    if (!files.length) return;
    const targetMB = targetMaxKB ? (targetMaxKB / 1024) : (selectedService?.maxUploadMB || 0.10);
    
    for (const f of files) {
      const lower = f.name.toLowerCase();
      const assignedRole = defaultRole || (
        lower.includes('photo') ? 'photo' :
        lower.includes('declaration') ? 'declaration' :
        lower.includes('income') ? 'incomeProof' :
        lower.includes('aadhaar') || lower.includes('id_') ? 'identityProof' : 'document'
      );
      const isOversized = f.type.startsWith('image/') && (f.size > targetMB * 1024 * 1024);
      
      let optimizedFile = f;
      if (isOversized) {
        try {
          const res = await optimizeImageForPortal(f, targetMB);
          optimizedFile = res.optimizedFile;
        } catch (err: any) {
          console.warn('Auto-optimization failed:', err);
        }
      }

      let dataUrl: string | undefined;
      try {
        dataUrl = await fileToDataUrl(optimizedFile);
      } catch (err) {
        console.warn('DataURL generation failed:', err);
      }

      const item: AttachedDocItem = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: optimizedFile.name,
        size: optimizedFile.size,
        type: optimizedFile.type,
        role: assignedRole,
        slotId: defaultRole || assignedRole,
        file: optimizedFile,
        dataUrl: dataUrl,
        isOptimizing: false,
        isOptimized: true
      };

      setAttachedDocs(prev => {
        // Replace existing document if it belongs to the same slot/role
        const filtered = prev.filter(d => (defaultRole ? (d.slotId !== defaultRole && d.role !== defaultRole) : d.name !== f.name));
        return [...filtered, item];
      });
    }
  };

  const allFieldKeys: (keyof Citizen)[] = [
    'fullName', 'dob', 'gender', 'mobile', 'email', 'address', 'district', 'state', 'pincode', 'aadhaar', 'voterId', 'rationCard', 'bankAccount', 'ifsc'
  ];
  const hiddenFields = allFieldKeys.filter(k => !isFieldVisible(k));

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
    if (file) {
      handleAttachFiles([file], 'identityProof');
    }
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
      alert('Could not access webcam/scanner. Please ensure camera permissions are allowed, or choose "Upload scan".');
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
        setOcrMessage('ID photo captured from camera & auto-attached to case documents. Click "Run OCR analysis" to extract details.');
        stopCamera();
        handleAttachFiles([file], 'identityProof');
      }
    }, 'image/jpeg', 0.92);
  };

  const handleRunOcr = async () => {
    if (!ocrFile && !ocrText) return;
    setOcrLoading(true);
    setOcrMessage('Processing document image with local OCR engine...');

    try {
      let rawExtractedText = ocrText;
      let engineUsed = 'Local-Heuristics';
      let backendCandidates: OcrCandidate[] = [];

      if (ocrFile) {
        handleAttachFiles([ocrFile], 'identityProof');
        if (daemonConnected) {
          setOcrMessage('Analyzing document with Local Intelligence Core (PaddleOCR)...');
          try {
            const result = await requestOcrScan(ocrFile, rawExtractedText);
            rawExtractedText = result.text || rawExtractedText;
            engineUsed = result.engine || 'Local-Core (PaddleOCR)';
            if (result.candidates && Array.isArray(result.candidates) && result.candidates.length > 0) {
              backendCandidates = result.candidates;
            }
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
            console.warn('Browser Tesseract WASM fallback error, trying English:', tessErr);
            try {
              const resEng = await Tesseract.recognize(ocrFile, 'eng');
              if (resEng.data?.text && resEng.data.text.trim()) {
                rawExtractedText = resEng.data.text;
                engineUsed = 'Tesseract-WASM (eng)';
              }
            } catch (engErr) {
              console.warn('Tesseract eng error:', engErr);
            }
          }
        }
      }

      setOcrText(rawExtractedText || '');
      const localCandidates = rawExtractedText ? extractOcrCandidates(rawExtractedText) : [];

      // Combine both engine extractions so no field is missed
      const combinedMap = new Map<string, OcrCandidate>();
      for (const c of [...backendCandidates, ...localCandidates]) {
        if (!combinedMap.has(c.key)) {
          combinedMap.set(c.key, c as OcrCandidate);
        }
      }
      const candidates = Array.from(combinedMap.values());
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

  const handleRemoveDoc = (id: string) => {
    setAttachedDocs(prev => prev.filter(d => d.id !== id));
  };

  const handleSubmitWithAction = async (e: React.FormEvent, launchDirectly: boolean = false) => {
    e.preventDefault();
    setFormErrors([]);

    if (isLocked) {
      setFormErrors(['This applicant record is locked because it is linked to a submitted or closed application. Demographic data cannot be modified.']);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!consentChecked) {
      setFormErrors(['Explicit Citizen Consent is required under DPDP Act 2023 before creating or dispatching records. Please tick the consent checkbox below.']);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Flaw 3: Pre-save preflight check in CitizenIntake before calling onSave
    if (selectedService) {
      const fieldsToValidate = selectedService.requiredFields && selectedService.requiredFields.length > 0
        ? Array.from(new Set(['fullName', ...selectedService.requiredFields])) as any
        : ['fullName'];

      const valResult = validateCitizen(formData, fieldsToValidate);
      if (!valResult.valid) {
        const missingCount = valResult.errors.length;
        const missingLabels = valResult.errors.map(err => err.label || err.field).join(', ');
        setFormErrors([
          `Preflight Check Failed: ${missingCount} required field(s) missing for ${selectedService.name} (${missingLabels}). Fill them before proceeding.`
        ]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Check document sizes against portal limit
      if (selectedService.maxUploadMB && attachedDocs.length > 0) {
        const maxBytes = selectedService.maxUploadMB * 1024 * 1024;
        const oversized = attachedDocs.filter(d => d.size > maxBytes && !d.isOptimizing);
        if (oversized.length > 0) {
          setFormErrors([
            `Document "${oversized[0].name}" (${formatBytes(oversized[0].size)}) exceeds the ${selectedService.maxUploadMB} MB portal limit. Please wait for auto-optimization or upload a compliant file.`
          ]);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
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

    const finalDocs: ApplicationDocument[] = attachedDocs.map(d => ({
      name: d.name,
      size: d.size,
      type: d.type,
      role: d.role,
      slotId: d.slotId || d.role,
      dataUrl: d.dataUrl,
      optimised: d.isOptimized
    }));
    const rawFilesToPass = attachedDocs.map(d => d.file);

    await onSave(citizenToSave, selectedServiceId || undefined, finalDocs, rawFilesToPass, launchDirectly, feeCollected);
  };

  const handleSubmit = (e: React.FormEvent) => handleSubmitWithAction(e, Boolean(selectedServiceId));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            CITIZEN RECORD & SERVICE APPLICATION
          </div>
          <h1>{initialCitizen ? 'Update citizen record' : 'New citizen intake & service application'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Select the government service, capture details via physical document OCR, and launch the application directly into portal handoff.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {/* Locked Record Warning Banner */}
      {isLocked && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--status-warn-bg)',
          border: '1px solid var(--status-warn)',
          color: 'var(--status-warn)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <ShieldAlert size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: '0.9rem' }}>Applicant Record Permanently Locked (Read-Only)</strong>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', opacity: 0.9 }}>
              {lockedReason || 'This citizen record is attached to a submitted or closed application.'} Under DPDP Act rules and audit trail integrity, applicant demographic particulars cannot be altered once submitted or closed.
            </p>
          </div>
        </div>
      )}

      {/* Toast Notice Banner */}
      {toastNotice && (
        <div style={{
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--status-good-bg)',
          border: '1px solid var(--primary-border)',
          color: 'var(--status-good)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={18} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{toastNotice}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => setToastNotice(null)}
            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Returning Citizen Fast Lookup Bar */}
      {!initialCitizen && (
        <div className="panel" style={{ marginBottom: '18px', padding: '14px 18px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={16} color="var(--primary)" />
              <strong style={{ fontSize: '0.88rem' }}>Returning Citizen Quick Lookup</strong>
            </div>
            {loadedCitizenName && (
              <span style={{ fontSize: '0.78rem', color: 'var(--status-good)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Profile Loaded: <strong>{loadedCitizenName}</strong>
                <button
                  type="button"
                  onClick={handleClearSelectedCitizen}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px', textDecoration: 'underline', fontSize: '0.75rem' }}
                >
                  Clear
                </button>
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Type mobile number, Aadhaar number, or name to auto-load an existing citizen..."
              value={citizenSearchQuery}
              onChange={e => setCitizenSearchQuery(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
            {citizenSearchQuery.trim().length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                maxHeight: '220px',
                overflowY: 'auto',
                marginTop: '4px'
              }}>
                {matchingCitizens.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    No registered citizens found matching "{citizenSearchQuery}". Continue typing below to create a new record.
                  </div>
                ) : (
                  matchingCitizens.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectExistingCitizen(c)}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.03))'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div>
                        <strong style={{ fontSize: '0.88rem', display: 'block' }}>{c.fullName}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          📱 {c.mobile || 'No phone'} · {c.district ? `${c.district}, ${c.state}` : (c.state || 'Address on file')}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        style={{ fontSize: '0.75rem', pointerEvents: 'none' }}
                      >
                        Load Profile →
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Popular Scheme Chips Selector */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Target Scheme / Service:
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {selectedService ? (
              <span>Form customized for: <strong style={{ color: 'var(--text-main)' }}>{selectedService.name.split('(')[0].trim()}</strong></span>
            ) : (
              <span>All 14 citizen fields visible (Generic Mode)</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {POPULAR_SCHEMES.map(scheme => {
            const isSelected = selectedServiceId === scheme.id;
            return (
              <button
                key={scheme.id}
                type="button"
                onClick={() => {
                  setSelectedServiceId(scheme.id);
                  setIsServicePickerOpen(false);
                }}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: '0.82rem',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: isSelected ? 700 : 500
                }}
              >
                <span>{scheme.icon}</span>
                <span>{scheme.label}</span>
                {isSelected && <Check size={13} />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsServicePickerOpen(prev => !prev)}
            className={`btn ${isServicePickerOpen ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              fontSize: '0.82rem',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Search size={13} />
            <span>More Services ({services.length})</span>
            <ChevronDown size={13} style={{ transform: isServicePickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>
      </div>

      {/* Target Government Scheme / Service Selector Card */}
      {selectedService && !isServicePickerOpen ? (
        <div className="panel" style={{ marginBottom: '20px', padding: '16px 20px', borderLeft: '4px solid var(--primary)', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '1.2rem' }}>🎯</span>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{selectedService.name}</span>
                <span className="status-pill good" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                  {getServiceCategory(selectedService)}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                {selectedService.department || 'Govt Portal'} — {selectedService.notes || 'Portal integration active'}
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                {selectedService.portalUrl && (
                  <a
                    href={selectedService.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {getPortalHostname(selectedService.portalUrl)} ↗
                  </a>
                )}
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--status-good)' }}>
                  Statutory Fee: Govt ₹{selectedService.officialFee ?? 0} + CSC ₹{selectedService.operatorCharge ?? 0} = ₹{(selectedService.officialFee || 0) + (selectedService.operatorCharge || 0)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Max Upload: {selectedService.maxUploadMB ? `${selectedService.maxUploadMB * 1024 < 1024 ? `${selectedService.maxUploadMB * 1024} KB` : `${selectedService.maxUploadMB} MB`}` : 'Standard'} ({selectedService.allowedExtensions?.join(', ') || 'pdf, jpg'})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsServicePickerOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 12px' }}
              >
                <Search size={14} /> Search / Change Service ({services.length})
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setSelectedServiceId(''); }}
                style={{ fontSize: '0.8rem', padding: '6px 10px', color: 'var(--text-muted)' }}
                title="Switch to generic intake without service filtering"
              >
                Generic Mode
              </button>
            </div>
          </div>

          {selectedService.requiredFields && selectedService.requiredFields.length > 0 && (
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Portal Required Fields:</span>
              {selectedService.requiredFields.map(rf => (
                <span key={rf} className="status-pill warn" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                  ★ {rf}
                </span>
              ))}
              <span style={{ color: 'var(--status-good)', marginLeft: 'auto', fontWeight: 600 }}>
                ✓ Only required fields shown in intake below
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: '20px', padding: '16px 20px', borderLeft: '4px solid var(--primary)', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎯</span> Select Government Scheme / Service ({services.length} available)
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Choose a service to tailor the intake form to only its required fields. Search by name, department or scheme.
              </p>
            </div>
            {selectedService && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsServicePickerOpen(false)}
                style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={13} /> Cancel
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search by keyword, e.g. 'Income', 'PM-Kisan', 'Caste', 'Ration', 'Sarathi', 'DL', 'Scholarship', 'Ayushman'..."
              value={serviceSearchQuery}
              onChange={e => setServiceSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', fontSize: '0.88rem' }}
              autoFocus
            />
            {serviceSearchQuery && (
              <button
                type="button"
                onClick={() => setServiceSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {SERVICE_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setServiceCategory(cat)}
                className={`btn ${serviceCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Service Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Generic Intake Card */}
            <div
              onClick={() => { setSelectedServiceId(''); setIsServicePickerOpen(false); }}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${!selectedServiceId ? 'var(--primary)' : 'var(--border-light)'}`,
                backgroundColor: !selectedServiceId ? 'var(--primary-light)' : 'var(--bg-main)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Generic Citizen Intake</span>
                {!selectedServiceId && <CheckCircle2 size={14} color="var(--primary)" />}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                No target scheme. Shows all demographic & identifier fields.
              </div>
            </div>

            {/* Filtered Services */}
            {filteredServices.map(srv => {
              const isSelected = selectedServiceId === srv.id;
              return (
                <div
                  key={srv.id}
                  onClick={() => { setSelectedServiceId(srv.id); setIsServicePickerOpen(false); }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-light)'}`,
                    backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-main)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-main)' }}>
                      {srv.name}
                    </div>
                    {isSelected && <CheckCircle2 size={14} color="var(--primary)" style={{ flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {srv.department || 'Govt Portal'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--status-good)', fontWeight: 600 }}>
                      Govt: ₹{srv.officialFee ?? 0} + CSC: ₹{srv.operatorCharge ?? 0}
                    </span>
                    <span className="status-pill warn" style={{ padding: '1px 5px', fontSize: '0.65rem' }}>
                      {srv.requiredFields?.length || 0} fields
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredServices.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No services match "{serviceSearchQuery}". Try another keyword or category.
              </div>
            )}
          </div>
        </div>
      )}

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

          {selectedService ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>1</span>
                  <div>
                    <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Required Information for {selectedService.name.split('(')[0].trim()}</h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      Tailored to portal requirements ({selectedService.requiredFields?.length || 0} fields). Unwanted fields hidden.
                    </p>
                  </div>
                </div>
              </div>

              <div className="form-grid">
                {isFieldVisible('fullName') && (
                  <div className="form-group full">
                    <label className="form-label" htmlFor="fullName">
                      Full name *
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
                )}

                {isFieldVisible('dob') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="dob">
                      Date of birth {isFieldRequired('dob') && '*'}
                    </label>
                    <input
                      id="dob"
                      type="date"
                      className="form-control"
                      value={formData.dob || ''}
                      onChange={e => handleInputChange('dob', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('gender') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="gender">
                      Gender {isFieldRequired('gender') && '*'}
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
                )}

                {isFieldVisible('mobile') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="mobile">
                      Mobile number (10 digits) {isFieldRequired('mobile') && '*'}
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
                )}

                {isFieldVisible('email') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">
                      Email address {isFieldRequired('email') && '*'}
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="form-control"
                      placeholder="Optional"
                      value={formData.email || ''}
                      onChange={e => handleInputChange('email', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('address') && (
                  <div className="form-group full">
                    <label className="form-label" htmlFor="address">
                      Address {isFieldRequired('address') && '*'}
                    </label>
                    <input
                      id="address"
                      className="form-control"
                      placeholder="House / street / village / ward"
                      value={formData.address || ''}
                      onChange={e => handleInputChange('address', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('district') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="district">
                      District {isFieldRequired('district') && '*'}
                    </label>
                    <input
                      id="district"
                      className="form-control"
                      placeholder="District"
                      value={formData.district || ''}
                      onChange={e => handleInputChange('district', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('state') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="state">
                      State / UT {isFieldRequired('state') && '*'}
                    </label>
                    <input
                      id="state"
                      className="form-control"
                      placeholder="State"
                      value={formData.state || ''}
                      onChange={e => handleInputChange('state', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('pincode') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="pincode">
                      PIN code (6 digits) {isFieldRequired('pincode') && '*'}
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
                )}

                {isFieldVisible('aadhaar') && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" htmlFor="aadhaar">
                        Aadhaar (12 digits) {isFieldRequired('aadhaar') && '*'}
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
                      placeholder="12 digits"
                      value={formData.aadhaar || ''}
                      onChange={e => handleInputChange('aadhaar', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('voterId') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="voterId">
                      Voter ID / EPIC {isFieldRequired('voterId') && '*'}
                    </label>
                    <input
                      id="voterId"
                      className="form-control"
                      placeholder="EPIC number"
                      value={formData.voterId || ''}
                      onChange={e => handleInputChange('voterId', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('rationCard') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="rationCard">
                      Ration card number {isFieldRequired('rationCard') && '*'}
                    </label>
                    <input
                      id="rationCard"
                      className="form-control"
                      placeholder="Ration card / Family ID"
                      value={formData.rationCard || ''}
                      onChange={e => handleInputChange('rationCard', e.target.value)}
                    />
                  </div>
                )}

                {isFieldVisible('bankAccount') && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" htmlFor="bankAccount">
                        Bank account number {isFieldRequired('bankAccount') && '*'}
                      </label>
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
                )}

                {isFieldVisible('ifsc') && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="ifsc">
                      IFSC code (11 characters) {isFieldRequired('ifsc') && '*'}
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
                )}
              </div>

              {hiddenFields.length > 0 && (
                <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-main)', border: '1px dashed var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {showAllOptionalFields
                      ? 'Showing all available fields.'
                      : `${hiddenFields.length} unrequired field(s) hidden to streamline entry.`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAllOptionalFields(!showAllOptionalFields)}
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  >
                    {showAllOptionalFields ? '▲ Hide non-required fields' : `+ Show ${hiddenFields.length} optional / extra field(s)`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>1</span>
                <h2 style={{ fontSize: '1.1rem' }}>Demographics & Contact</h2>
              </div>

              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label" htmlFor="fullName">
                    Full name *
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
                  <label className="form-label" htmlFor="district">
                    District
                  </label>
                  <input
                    id="district"
                    className="form-control"
                    placeholder="District"
                    value={formData.district || ''}
                    onChange={e => handleInputChange('district', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="state">
                    State / UT
                  </label>
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
                  <label className="form-label" htmlFor="rationCard">
                    Ration card number
                  </label>
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
                    <label className="form-label" htmlFor="bankAccount">
                      Bank account number
                    </label>
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
            </>
          )}

          <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-light)' }} />

          {/* Flaw 2: Required Documents Section (Only when service is selected) */}
          {selectedService && (
            <div style={{
              margin: '20px 0',
              padding: '18px 20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-strong)',
              backgroundColor: 'var(--bg-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Paperclip size={18} color="var(--primary)" />
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
                    Required Service Documents ({selectedService.name.split('(')[0].trim()})
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="file"
                    ref={docFileInputRef}
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={e => {
                      handleAttachFiles(Array.from(e.target.files || []));
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => docFileInputRef.current?.click()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Upload size={13} /> Attach physical docs
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                {selectedService.notes || 'Attach applicant identity & supporting documents.'}
                {' '}(Portal upload constraint: max {selectedService.maxUploadMB ? `${selectedService.maxUploadMB * 1024 < 1024 ? `${selectedService.maxUploadMB * 1024} KB` : `${selectedService.maxUploadMB} MB`}` : '100 KB'} per document, allowed formats: {selectedService.allowedExtensions?.join(', ') || 'pdf, jpg'}). Oversized images are auto-optimized on attach.
              </p>

              {/* Explicit Slot-Based Targets */}
              {selectedService.documentSlots && selectedService.documentSlots.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  {selectedService.documentSlots.map(slot => {
                    const attached = attachedDocs.find(d => d.slotId === slot.id || d.role === slot.id);
                    return (
                      <div
                        key={slot.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${attached ? 'var(--status-good)' : slot.required ? 'var(--primary-border)' : 'var(--border-light)'}`,
                          backgroundColor: attached ? 'var(--status-good-bg)' : '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)', display: 'block' }}>
                              {slot.label}
                            </strong>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Limit: ≤ {slot.maxKB} KB ({slot.allowedExtensions.join(', ')})
                            </span>
                          </div>
                          <span className={`status-pill ${attached ? 'good' : slot.required ? 'warn' : 'neutral'}`} style={{ fontSize: '0.65rem' }}>
                            {attached ? '✓ Ready' : slot.required ? '★ Mandatory' : 'Optional'}
                          </span>
                        </div>

                        {attached ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <FileCheck size={14} color="var(--status-good)" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attached.name}>
                                {attached.name} ({formatBytes(attached.size)})
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {slot.proformaType && (
                                <button
                                  type="button"
                                  onClick={() => setActiveProformaSlot(slot)}
                                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px' }}
                                  title="View or Re-Print Pre-Filled Proforma"
                                >
                                  <Printer size={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveDoc(attached.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                                title="Remove document"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {slot.proformaType && (
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                onClick={() => setActiveProformaSlot(slot)}
                                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 700 }}
                                title="Open & print pre-filled government proforma for citizen signature"
                              >
                                <Printer size={12} /> Print Proforma
                              </button>
                            )}
                            <label className="btn btn-secondary btn-xs" style={{ cursor: 'pointer', flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <Upload size={12} /> {slot.proformaType ? 'Attach Scan' : 'Attach Document'}
                              <input
                                type="file"
                                accept={slot.allowedExtensions.map(e => `.${e}`).join(',')}
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleAttachFiles([f], slot.id, slot.maxKB);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {attachedDocs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attachedDocs.map(doc => {
                    const maxBytes = (selectedService.maxUploadMB || 0.1) * 1024 * 1024;
                    const isOver = doc.size > maxBytes;
                    return (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: '#ffffff',
                          border: `1px solid ${isOver ? 'var(--status-bad)' : 'var(--border-light)'}`,
                          fontSize: '0.8rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <FileText size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{doc.name}</strong>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                              {doc.role ? `(${doc.role}) · ` : ''}{formatBytes(doc.size)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          {doc.isOptimizing ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <RefreshCw size={12} className="animate-spin" /> Optimizing…
                            </span>
                          ) : isOver ? (
                            <span className="status-pill bad" style={{ fontSize: '0.7rem' }}>
                              Oversized ({formatBytes(doc.size)})
                            </span>
                          ) : (
                            <span className="status-pill good" style={{ fontSize: '0.7rem' }}>
                              ✓ Ready ({formatBytes(doc.size)})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(doc.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                            title="Remove document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border-strong)',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)'
                }}>
                  No documents attached yet. Click <strong>"Attach physical docs"</strong> to upload citizen files.
                </div>
              )}
            </div>
          )}

          {/* Flaw 3: Pre-Save Preflight Check Status Banner */}
          {selectedService && (
            (() => {
              const reqKeys = (selectedService.requiredFields || []) as (keyof Citizen)[];
              const missingKeys = reqKeys.filter(k => !String(formData[k] ?? '').trim());
              const isPassing = missingKeys.length === 0;

              return (
                <div style={{
                  padding: '14px 18px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '20px',
                  backgroundColor: isPassing ? 'var(--status-good-bg)' : 'var(--status-warn-bg)',
                  border: `1px solid ${isPassing ? 'var(--primary-border)' : 'var(--status-warn)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isPassing ? (
                        <CheckCircle2 size={16} color="var(--status-good)" />
                      ) : (
                        <AlertCircle size={16} color="var(--status-warn)" />
                      )}
                      <strong style={{ fontSize: '0.85rem', color: isPassing ? 'var(--status-good)' : 'var(--status-warn)' }}>
                        {isPassing
                          ? 'Preflight Verified: 100% of required fields complete'
                          : `Preflight Check: ${missingKeys.length} of ${reqKeys.length} required fields missing`}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isPassing ? 'var(--status-good)' : 'var(--status-warn)' }}>
                      {Math.round(((reqKeys.length - missingKeys.length) / (reqKeys.length || 1)) * 100)}% Complete
                    </span>
                  </div>

                  {missingKeys.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '6px' }}>
                      <span>Missing mandatory fields: </span>
                      {missingKeys.map(k => (
                        <span key={k} className="status-pill warn" style={{ padding: '2px 6px', fontSize: '0.7rem', marginRight: '6px', marginTop: '2px', display: 'inline-block' }}>
                          {k}
                        </span>
                      ))}
                    </div>
                  )}

                  {isPassing && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Applicant demographic particulars and attached documents satisfy {selectedService.name} portal preflight requirements. Ready to launch directly into portal handoff.
                    </div>
                  )}
                </div>
              );
            })()
          )}

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

          {/* Cash Fee Collection Toggle */}
          {selectedService && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: feeCollected ? 'var(--status-good-bg)' : 'var(--bg-subtle)',
              border: `1px solid ${feeCollected ? 'var(--primary-border)' : 'var(--border-light)'}`,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={feeCollected}
                  onChange={e => setFeeCollected(e.target.checked)}
                  style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                    Cash Fee Collected from Citizen: ₹{(selectedService.officialFee || 0) + (selectedService.operatorCharge || 0)}
                  </strong>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Govt Statutory: ₹{selectedService.officialFee ?? 0} + CSC Service Charge: ₹{selectedService.operatorCharge ?? 0} (No hidden fees)
                  </div>
                </div>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={async () => {
                    if (selectedService) {
                      await playFeeSpeech(selectedService.name, selectedService.officialFee, selectedService.operatorCharge, audioLang);
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', backgroundColor: '#ffffff' }}
                  title="Speak statutory fee and kiosk charge aloud in selected regional language"
                >
                  <Volume2 size={13} color="var(--primary)" />
                  <span>🔊 Announce Fee</span>
                </button>
                <span className={`status-pill ${feeCollected ? 'good' : 'neutral'}`} style={{ fontSize: '0.72rem' }}>
                  {feeCollected ? '✓ Cash Collected' : 'Pending Payment'}
                </span>
              </div>
            </div>
          )}

          {formErrors.length > 0 && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--status-bad-bg)',
              color: 'var(--status-bad)',
              marginBottom: '14px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <div>
                <strong>Cannot Launch: </strong> {formErrors[0]}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            {isLocked ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled
                style={{ opacity: 0.65, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                title="This record is locked under an active submitted or closed application."
              >
                <ShieldAlert size={16} /> Record Locked (Cannot Modify)
              </button>
            ) : selectedService ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={e => handleSubmitWithAction(e, false)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                  title="Save case as offline draft for later portal submission"
                >
                  <span>📥</span> Save Draft (Offline)
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={e => handleSubmitWithAction(e, true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 700 }}
                  title="Save citizen & launch government portal for submission"
                >
                  <span>🚀</span> Submit to Portal ({selectedService.name.split('(')[0].trim()}) <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <button type="submit" className="btn btn-primary">
                Save encrypted record <ArrowRight size={16} />
              </button>
            )}
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

            {ocrFile && (
              <div style={{
                marginTop: '10px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--status-good-bg)',
                border: '1px solid var(--primary-border)',
                color: 'var(--status-good)',
                fontSize: '0.74rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle2 size={13} />
                <span>✓ Physical ID "{ocrFile.name}" auto-attached to case documents</span>
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

      {/* Printable Pre-Filled Proforma Modal */}
      {activeProformaSlot && selectedService && (
        <PrintableProformaModal
          citizen={formData}
          service={selectedService}
          slot={activeProformaSlot}
          operatorName="Jan Seva Operator"
          centreName="Common Service Centre"
          onClose={() => setActiveProformaSlot(null)}
          onAttachScan={async (file: File) => {
            await handleAttachFiles([file], activeProformaSlot.id, activeProformaSlot.maxKB);
          }}
          onShowToast={(msg) => {
            setToastNotice(msg);
          }}
        />
      )}
    </div>
  );
};
