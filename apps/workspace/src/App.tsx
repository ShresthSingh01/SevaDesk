import React, { useState, useEffect, useRef } from 'react';
import { 
  Citizen, 
  ServiceDefinition, 
  Application, 
  ApplicationDocument,
  AuditEvent,
  validateStatusTransition,
  isCitizenLocked,
  buildApplicationPayload
} from '@sevadesk/core-types';
import { 
  deriveVaultKey, 
  encryptVault, 
  decryptVault, 
  base64ToBytes 
} from './lib/vault';
import { LockScreen } from './components/LockScreen';
import { Sidebar, PageId } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { checkDaemonHealth, syncCitizenToDaemon, syncServiceToDaemon, syncApplicationToDaemon, pushBridgeSession } from './lib/api';
import { Overview } from './features/Overview';
import { CitizenIntake } from './features/CitizenIntake';
import { Applications } from './features/Applications';
import { ApplicationDetail } from './features/ApplicationDetail';
import { FeeTransparency } from './features/FeeTransparency';
import { CitizenDisplay } from './features/CitizenDisplay';
import { ServicesRules } from './features/ServicesRules';
import { AuditTrail } from './features/AuditTrail';
import { PortalSimulator } from './features/PortalSimulator';
import { CitizenReceiptModal } from './components/CitizenReceiptModal';
import { PortalHandoffModal } from './components/PortalHandoffModal';

export const DEFAULT_SERVICES: ServiceDefinition[] = [
  {
    id: 'srv-up-income',
    name: 'Income Certificate (आय प्रमाण पत्र)',
    department: 'Revenue Department / UP e-District',
    portalUrl: 'https://edistrict.up.gov.in',
    officialFee: 15,
    operatorCharge: 30,
    feeSourceUrl: 'https://edistrict.up.gov.in/edistrictup/FeeDetails.html',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 0.1,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'rationCard'],
    adapterId: 'edistrict-up',
    notes: 'Official portal fee ₹15. Photo ≤ 20KB, self-declaration ≤ 100KB.',
    documentSlots: [
      { id: 'photo', label: 'Applicant Photograph (पासपोर्ट फ़ोटो)', maxKB: 20, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Passport size color photograph (Strictly ≤ 20 KB)' },
      { 
        id: 'declaration', 
        label: 'Self-Declaration / Income Proof (स्वप्रमाणित घोषणा)', 
        maxKB: 100, 
        allowedExtensions: ['pdf', 'jpg', 'jpeg'], 
        required: true, 
        description: 'Tehsildar income declaration or certified affidavit (≤ 100 KB)',
        proformaType: 'self_declaration',
        proformaTitle: 'स्वप्रमाणित घोषणा पत्र (आय प्रमाण पत्र हेतु)'
      }
    ]
  },
  {
    id: 'srv-up-caste',
    name: 'Caste Certificate (जाति प्रमाण पत्र)',
    department: 'Revenue Department / UP e-District',
    portalUrl: 'https://edistrict.up.gov.in',
    officialFee: 15,
    operatorCharge: 30,
    feeSourceUrl: 'https://edistrict.up.gov.in/edistrictup/FeeDetails.html',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 0.1,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'aadhaar'],
    adapterId: 'edistrict-up',
    notes: 'Official fee ₹15. Caste verification and self-declaration required.',
    documentSlots: [
      { id: 'photo', label: 'Applicant Photograph (पासपोर्ट फ़ोटो)', maxKB: 20, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Passport size color photograph (≤ 20 KB)' },
      { 
        id: 'declaration', 
        label: 'Self-Declaration Form (स्वप्रमाणित घोषणा पत्र)', 
        maxKB: 100, 
        allowedExtensions: ['pdf', 'jpg', 'jpeg'], 
        required: true, 
        description: 'Mandatory applicant caste declaration proforma (≤ 100 KB)',
        proformaType: 'caste_declaration',
        proformaTitle: 'स्वप्रमाणित घोषणा पत्र (जाति प्रमाण पत्र हेतु)'
      },
      { id: 'casteProof', label: 'Caste Proof / Verification (जाति प्रमाण पत्र)', maxKB: 100, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: false, description: 'Gram Pradhan / Parshad certificate or family caste copy (≤ 100 KB)' }
    ]
  },
  {
    id: 'srv-up-domicile',
    name: 'Domicile / Residence Certificate (निवास प्रमाण पत्र)',
    department: 'Revenue Department / UP e-District',
    portalUrl: 'https://edistrict.up.gov.in',
    officialFee: 15,
    operatorCharge: 30,
    feeSourceUrl: 'https://edistrict.up.gov.in/edistrictup/FeeDetails.html',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 0.1,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'aadhaar'],
    adapterId: 'edistrict-up',
    notes: 'Official fee ₹15. Electricity bill, ration card or school certificate required.',
    documentSlots: [
      { id: 'photo', label: 'Applicant Photograph (पासपोर्ट फ़ोटो)', maxKB: 20, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Passport size color photograph (≤ 20 KB)' },
      { 
        id: 'declaration', 
        label: 'Self-Declaration Form (स्वप्रमाणित घोषणा पत्र)', 
        maxKB: 100, 
        allowedExtensions: ['pdf', 'jpg', 'jpeg'], 
        required: true, 
        description: 'Domicile self-declaration proforma (≤ 100 KB)',
        proformaType: 'self_declaration',
        proformaTitle: 'स्वप्रमाणित घोषणा पत्र (निवास प्रमाण पत्र हेतु)'
      },
      { id: 'residenceProof', label: 'Residence / Address Proof (निवास प्रमाण)', maxKB: 100, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: false, description: 'Electricity bill, ration card, or voter ID (≤ 100 KB)' }
    ]
  },
  {
    id: 'srv-pm-kisan',
    name: 'PM-Kisan Samman Nidhi eKYC & Registration (पीएम किसान)',
    department: 'Department of Agriculture & Farmers Welfare',
    portalUrl: 'https://pmkisan.gov.in',
    officialFee: 0,
    operatorCharge: 20,
    feeSourceUrl: 'https://pmkisan.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 2.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'pincode', 'aadhaar', 'bankAccount', 'ifsc'],
    adapterId: 'pm-kisan',
    notes: 'Official portal fee is FREE (₹0). Aadhaar-linked bank account required for DBT transfer.',
    documentSlots: [
      { id: 'bankPassbook', label: 'Bank Passbook / Land Document (खतौनी / पासबुक)', maxKB: 2000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Land Khatauni or Aadhaar-linked bank passbook (≤ 2 MB)' }
    ]
  },
  {
    id: 'srv-parivahan-dl',
    name: 'Learner License / Driving License (लर्नर लाइसेंस)',
    department: 'Ministry of Road Transport & Highways / Sarathi',
    portalUrl: 'https://sarathi.parivahan.gov.in',
    officialFee: 200,
    operatorCharge: 50,
    feeSourceUrl: 'https://parivahan.gov.in/parivahan/en/content/fees-user-charges',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 0.5,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'aadhaar'],
    adapterId: 'parivahan-sarathi',
    notes: 'Official fee ₹200. Age and address proofs required.',
    documentSlots: [
      { id: 'photo', label: 'Applicant Photograph (पासपोर्ट फ़ोटो)', maxKB: 500, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Clear frontal passport photograph (≤ 500 KB)' },
      { id: 'ageAddressProof', label: 'Age & Address Proof (आयु एवं निवास प्रमाण)', maxKB: 500, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: '10th marksheet or Aadhaar / Voter card (≤ 500 KB)' }
    ]
  },
  {
    id: 'srv-parivahan-renew',
    name: 'Driving License Renewal & Address Change (डीएल नवीनीकरण)',
    department: 'Ministry of Road Transport & Highways / Sarathi',
    portalUrl: 'https://sarathi.parivahan.gov.in',
    officialFee: 200,
    operatorCharge: 50,
    feeSourceUrl: 'https://parivahan.gov.in/parivahan/en/content/fees-user-charges',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 0.5,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'aadhaar'],
    adapterId: 'parivahan-sarathi',
    notes: 'Official fee ₹200. Existing DL number, medical certificate (Form 1A if >40 yrs).',
    documentSlots: [
      { id: 'existingDL', label: 'Existing Driving License (मौजूदा डीएल प्रति)', maxKB: 500, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Front & back scan of existing Driving License (≤ 500 KB)' }
    ]
  },
  {
    id: 'srv-ayushman-pmjay',
    name: 'Ayushman Bharat Golden Health Card (आयुष्मान कार्ड)',
    department: 'National Health Authority (NHA) / PM-JAY',
    portalUrl: 'https://beneficiary.nha.gov.in',
    officialFee: 0,
    operatorCharge: 30,
    feeSourceUrl: 'https://pmjay.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 1.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'state', 'district', 'pincode', 'aadhaar', 'rationCard'],
    adapterId: 'ayushman-pmjay',
    notes: 'Official fee FREE (₹0). Eligible families under SECC / NFSA Ration Card.',
    documentSlots: [
      { id: 'rationCardProof', label: 'Ration Card / NFSA Document (राशन कार्ड)', maxKB: 1000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Active NFSA Ration Card or PM-JAY Family letter (≤ 1 MB)' }
    ]
  },
  {
    id: 'srv-nsp-scholarship',
    name: 'National Scholarship Portal - Post/Pre Matric (छात्रवृत्ति)',
    department: 'Ministry of Electronics & IT / NSP',
    portalUrl: 'https://scholarships.gov.in',
    officialFee: 0,
    operatorCharge: 40,
    feeSourceUrl: 'https://scholarships.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 1.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'email', 'pincode', 'aadhaar', 'bankAccount', 'ifsc'],
    adapterId: 'nsp-scholarship',
    notes: 'Official fee FREE (₹0). Student Aadhaar, Marksheet, and Bank passbook required.',
    documentSlots: [
      { id: 'marksheet', label: 'Previous Exam Marksheet (अंकतालिका)', maxKB: 1000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Passed exam marksheet (≤ 1 MB)' },
      { id: 'bankPassbook', label: 'Student Bank Passbook (बैंक पासबुक)', maxKB: 1000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Student self-account passbook (≤ 1 MB)' }
    ]
  },
  {
    id: 'srv-epfo-uan',
    name: 'EPFO UAN Member eKYC & Passbook (ईपीएफओ सदस्य सेवा)',
    department: 'Employees Provident Fund Organisation',
    portalUrl: 'https://unifiedportal-mem.epfindia.gov.in',
    officialFee: 0,
    operatorCharge: 30,
    feeSourceUrl: 'https://epfindia.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 1.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'aadhaar', 'bankAccount', 'ifsc'],
    adapterId: 'epfo-uan',
    notes: 'Official fee FREE (₹0). Aadhaar OTP authentication and bank account linking.',
    documentSlots: [
      { id: 'panBankProof', label: 'Cancelled Cheque / Bank Passbook (चेक / पासबुक)', maxKB: 1000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: false, description: 'Bank proof for KYC validation (≤ 1 MB)' }
    ]
  },
  {
    id: 'srv-voter-nvsp',
    name: 'ECI Voter Portal - Form 6 New Voter ID (मतदाता पहचान पत्र)',
    department: 'Election Commission of India / Voter Services',
    portalUrl: 'https://voters.eci.gov.in',
    officialFee: 0,
    operatorCharge: 25,
    feeSourceUrl: 'https://voters.eci.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 2.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'district', 'state', 'pincode', 'aadhaar'],
    adapterId: 'eci-voter',
    notes: 'Official fee FREE (₹0). Age 18+ declaration and address proof required.',
    documentSlots: [
      { id: 'photo', label: 'Passport Photograph (पासपोर्ट फ़ोटो)', maxKB: 2000, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Passport color photo (≤ 2 MB)' },
      { id: 'ageAddressProof', label: 'Age & Address Proof (आयु एवं निवास प्रमाण)', maxKB: 2000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'Age and residential proof (≤ 2 MB)' }
    ]
  },
  {
    id: 'srv-ration-nfsa',
    name: 'NFSA Ration Card - Member Addition & eKYC (राशन कार्ड)',
    department: 'Food & Civil Supplies Department',
    portalUrl: 'https://nfsa.gov.in',
    officialFee: 0,
    operatorCharge: 30,
    feeSourceUrl: 'https://nfsa.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 1.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'address', 'pincode', 'aadhaar', 'rationCard'],
    adapterId: 'nfsa-ration',
    notes: 'Official fee FREE (₹0). Head of family ration card number and member Aadhaar.',
    documentSlots: [
      { id: 'familyPhoto', label: 'Family Group Photograph (परिवार का फ़ोटो)', maxKB: 1000, allowedExtensions: ['jpg', 'jpeg'], required: true, description: 'Head of family group photograph (≤ 1 MB)' }
    ]
  },
  {
    id: 'srv-jeevan-pramaan',
    name: 'Jeevan Pramaan - Digital Life Certificate (जीवन प्रमाण पत्र)',
    department: 'Department of Pension & Pensioners Welfare',
    portalUrl: 'https://jeevanpramaan.gov.in',
    officialFee: 0,
    operatorCharge: 20,
    feeSourceUrl: 'https://jeevanpramaan.gov.in',
    feeVerifiedAt: new Date().toISOString(),
    maxUploadMB: 1.0,
    allowedExtensions: ['pdf', 'jpg', 'jpeg'],
    requiredFields: ['fullName', 'dob', 'gender', 'mobile', 'aadhaar', 'bankAccount', 'ifsc'],
    adapterId: 'jeevan-pramaan',
    notes: 'Official fee FREE (₹0). Biometric / Iris authentication for pensioner DLC.',
    documentSlots: [
      { id: 'ppoCopy', label: 'Pension Payment Order (PPO Copy)', maxKB: 1000, allowedExtensions: ['pdf', 'jpg', 'jpeg'], required: true, description: 'PPO copy or pensioner identity card (≤ 1 MB)' }
    ]
  }
];

const VAULT_STORAGE_KEY = 'sevadesk.vault.v1';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(true);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [vaultSalt, setVaultSalt] = useState<Uint8Array | null>(null);
  const [daemonConnected, setDaemonConnected] = useState(false);

  // Core Data
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [profile, setProfile] = useState({
    operatorName: 'Operator',
    centreName: 'SevaDesk Service Centre',
    language: 'hi-IN',
    autoLockMinutes: 15
  });

  // Routing & Selection
  const [currentPage, setCurrentPage] = useState<PageId>('overview');
  const [editingCitizenId, setEditingCitizenId] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [selectedFeeServiceId, setSelectedFeeServiceId] = useState<string>('');
  const [selectedFeeAppId, setSelectedFeeAppId] = useState<string>('');
  const [returnContext, setReturnContext] = useState<{ page: PageId; applicationId?: string } | null>(null);
  const [handoffModalAppId, setHandoffModalAppId] = useState<string | null>(null);
  const [receiptModalAppId, setReceiptModalAppId] = useState<string | null>(null);
  
  // Feedback
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Auto-lock timer
  const autoLockTimerRef = useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3800);
  };

  const addAuditEvent = (action: string, description: string, entityType: string = 'workspace', entityId: string = 'local') => {
    const newEvent: AuditEvent = {
      id: `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      action,
      description,
      entityType,
      entityId
    };
    setAuditEvents(prev => [newEvent, ...prev.slice(0, 4999)]);
  };

  // Check daemon connectivity on load
  useEffect(() => {
    checkDaemonHealth().then(setDaemonConnected);
    const interval = setInterval(() => {
      checkDaemonHealth().then(setDaemonConnected);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Reset auto lock on user interaction
  const resetAutoLockTimer = () => {
    if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
    if (!isLocked && profile.autoLockMinutes > 0) {
      autoLockTimerRef.current = window.setTimeout(() => {
        handleLock();
        showToast('Workspace locked due to inactivity.', 'error');
      }, profile.autoLockMinutes * 60 * 1000);
    }
  };

  useEffect(() => {
    const handleActivity = () => resetAutoLockTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
    };
  }, [isLocked, profile.autoLockMinutes]);

  // Persist encrypted vault when state changes
  useEffect(() => {
    if (vaultKey && vaultSalt && !isLocked) {
      const dataToSave = {
        schemaVersion: 1,
        profile,
        citizens,
        services,
        applications,
        audit: auditEvents,
        settings: { autoLockMinutes: profile.autoLockMinutes, version: 2 }
      };
      encryptVault(dataToSave, vaultKey, vaultSalt).then(envelope => {
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
      }).catch(err => {
        console.error('Failed to encrypt vault:', err);
      });
    }
  }, [citizens, services, applications, auditEvents, profile, vaultKey, vaultSalt, isLocked]);

  const existingEnvelope = (() => {
    try {
      return JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  })();

  const handleUnlock = async (passphrase: string, opName?: string, cName?: string) => {
    const envelope = existingEnvelope;
    if (!envelope) {
      // First-time setup
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveVaultKey(passphrase, salt);
      const initialProfile = {
        operatorName: opName || 'Operator',
        centreName: cName || 'CSC Centre',
        language: 'hi-IN',
        autoLockMinutes: 15
      };
      const initialData = {
        schemaVersion: 1,
        profile: initialProfile,
        citizens: [],
        services: DEFAULT_SERVICES,
        applications: [],
        audit: [{
          id: `EVT-${Date.now().toString(36).toUpperCase()}`,
          timestamp: new Date().toISOString(),
          action: 'workspace_created',
          description: 'Encrypted local workspace created.',
          entityType: 'workspace',
          entityId: 'local'
        }],
        settings: { autoLockMinutes: 15, version: 2 }
      };
      const newEnvelope = await encryptVault(initialData, key, salt);
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(newEnvelope));
      setVaultKey(key);
      setVaultSalt(salt);
      setProfile(initialProfile);
      setCitizens([]);
      setServices(DEFAULT_SERVICES);
      setApplications([]);
      setAuditEvents(initialData.audit);
      setIsLocked(false);
      showToast('Encrypted workspace created. Welcome to SevaDesk!');
    } else {
      // Existing envelope
      const { key, data, salt } = await decryptVault(envelope, passphrase);
      setVaultKey(key);
      setVaultSalt(salt);
      setProfile(data.profile || profile);
      setCitizens(data.citizens || []);
      // Merge any new default services not yet in the vault
      const existingServices: ServiceDefinition[] = data.services || [];
      const mergedServices = [...existingServices];
      for (const def of DEFAULT_SERVICES) {
        if (!mergedServices.some(s => s.id === def.id)) {
          mergedServices.push(def);
        }
      }
      setServices(mergedServices.length > 0 ? mergedServices : DEFAULT_SERVICES);
      setApplications(data.applications || []);
      setAuditEvents(data.audit || []);
      setIsLocked(false);
      showToast('Workspace decrypted successfully.');
    }
  };

  const handleLock = () => {
    setVaultKey(null);
    setVaultSalt(null);
    setIsLocked(true);
    setCurrentPage('overview');
  };

  const handleRestoreBackup = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const envelope = parsed.encryptedVault || parsed;
    if (!envelope.ciphertext || !envelope.salt || !envelope.iv) {
      throw new Error('Invalid SevaDesk backup file envelope.');
    }
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
    showToast('Backup envelope imported. Enter your passphrase to decrypt.');
  };

  const handleExportBackup = () => {
    const envelope = existingEnvelope;
    if (!envelope) return;
    const blob = new Blob(
      [JSON.stringify({ product: 'SevaDesk', backupVersion: 2, exportedAt: new Date().toISOString(), encryptedVault: envelope }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sevadesk-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addAuditEvent('encrypted_backup_exported', 'Exported encrypted vault backup. Ciphertext only, no plaintext PII.', 'workspace', 'local');
    showToast('Encrypted backup exported. Store it securely.');
  };

  const handleExportAuditCsv = () => {
    const headers = ['id', 'timestamp', 'action', 'description', 'entityType', 'entityId'];
    const rows = auditEvents.map(e => headers.map(h => `"${String((e as any)[h] || '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sevadesk-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit CSV exported.');
  };

  const handleSaveCitizen = async (
    citizen: Citizen, 
    targetServiceId?: string, 
    documents?: ApplicationDocument[],
    rawFiles?: File[],
    launchDirectly?: boolean,
    feeCollected?: boolean
  ) => {
    const isEdit = citizens.some(c => c.id === citizen.id);
    if (isEdit) {
      if (!targetServiceId) {
        const lockedApp = applications.find(
          a => a.citizenId === citizen.id && (a.status === 'submitted' || a.status === 'closed')
        );
        if (lockedApp) {
          showToast(`Cannot modify applicant data: Record is locked under ${lockedApp.status} case ${lockedApp.id}.`, 'error');
          return;
        }
      }
      setCitizens(prev => prev.map(c => (c.id === citizen.id ? citizen : c)));
      addAuditEvent('citizen_updated', 'Updated citizen details with confirmed consent. Field values excluded.', 'citizen', citizen.id);
    } else {
      setCitizens(prev => [citizen, ...prev]);
      addAuditEvent('citizen_created', 'Created citizen record after consent confirmation.', 'citizen', citizen.id);
    }
    if (daemonConnected) {
      syncCitizenToDaemon(citizen);
    }
    setEditingCitizenId(null);

    if (targetServiceId) {
      const targetService = services.find(s => s.id === targetServiceId);
      const newApp: Application = {
        id: `SD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        citizenId: citizen.id,
        serviceId: targetServiceId,
        status: 'ready', // Preflight verification completed inline in CitizenIntake before launch
        feeStatus: feeCollected ? 'collected' : 'pending',
        feeCollectedAt: feeCollected ? new Date().toISOString() : undefined,
        feeReceiptNo: feeCollected ? `REC-${Date.now().toString(36).toUpperCase()}` : undefined,
        documents: documents || [],
        preflight: {
          valid: true,
          errors: [],
          warnings: [],
          checkedAt: new Date().toISOString(),
          rulesSnapshot: {
            requiredFields: targetService?.requiredFields || [],
            maxUploadMB: targetService?.maxUploadMB || null,
            allowedExtensions: targetService?.allowedExtensions || []
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setApplications(prev => [newApp, ...prev]);
      if (daemonConnected) {
        syncApplicationToDaemon(newApp);
      }
      addAuditEvent('application_created', `Application case launched directly from intake for ${targetService?.name || targetServiceId}. Fee: ${newApp.feeStatus}.`, 'application', newApp.id);
      setSelectedApplicationId(newApp.id);
      setReturnContext(null);

      if (launchDirectly) {
        await handleLaunchApplicationInPortal(newApp.id, true, newApp, citizen);
      } else {
        setCurrentPage('applications');
        showToast(`📥 Saved draft: ${targetService?.name?.split('(')[0].trim() || 'case'}. Ready for submission.`);
      }
    } else {
      if (returnContext) {
        setCurrentPage(returnContext.page);
        if (returnContext.applicationId) {
          setSelectedApplicationId(returnContext.applicationId);
        }
        setReturnContext(null);
      } else {
        setCurrentPage('overview');
      }
      showToast(isEdit ? 'Citizen record updated.' : 'Citizen record encrypted & saved.');
    }
  };

  const handleSaveService = async (service: ServiceDefinition) => {
    const isEdit = services.some(s => s.id === service.id);
    if (isEdit) {
      setServices(prev => prev.map(s => (s.id === service.id ? service : s)));
      addAuditEvent('service_rules_updated', `Updated rules for service: ${service.name}.`, 'service', service.id);
    } else {
      setServices(prev => [...prev, service]);
      addAuditEvent('service_created', `Added new service rules for: ${service.name}.`, 'service', service.id);
    }
    if (daemonConnected) {
      syncServiceToDaemon(service);
    }
  };

  const handleSavePreflight = async (appId: string, snapshot: any) => {
    const existing = applications.find(a => a.id === appId);
    if (!existing) return;
    if (existing.status === 'submitted' || existing.status === 'closed') {
      showToast('Cannot modify preflight: Application is already submitted or closed.', 'error');
      return;
    }
    let updatedApp: Application | undefined;
    setApplications(prev => prev.map(a => {
      if (a.id === appId) {
        updatedApp = {
          ...a,
          preflight: snapshot,
          status: snapshot.valid ? 'ready' : 'needs_correction',
          updatedAt: new Date().toISOString()
        };
        return updatedApp;
      }
      return a;
    }));
    if (daemonConnected && updatedApp) {
      syncApplicationToDaemon(updatedApp);
    }
    addAuditEvent('preflight_validation_run', `Preflight check: ${snapshot.valid ? 'Passed' : `${snapshot.errors.length} blocking issues`}.`, 'application', appId);
  };

  const handleUpdateStatus = async (appId: string, status: string, ref?: string, note?: string) => {
    const existingApp = applications.find(a => a.id === appId);
    if (!existingApp) return;

    const check = validateStatusTransition(existingApp.status, status);
    if (!check.allowed) {
      showToast(check.reason || 'Status transition not allowed.', 'error');
      return;
    }

    let updatedApp: Application | undefined;
    setApplications(prev => prev.map(a => {
      if (a.id === appId) {
        updatedApp = {
          ...a,
          status: status as any,
          receiptRef: ref || a.receiptRef,
          statusNote: note || a.statusNote,
          updatedAt: new Date().toISOString()
        };
        return updatedApp;
      }
      return a;
    }));
    if (daemonConnected && updatedApp) {
      syncApplicationToDaemon(updatedApp);
    }
    addAuditEvent('status_updated', `Application status changed from ${existingApp.status} to ${status}. ${status === 'submitted' ? `Portal Ref: ${ref}` : ''}`, 'application', appId);
  };

  const handleUpdateFeeStatus = async (appId: string, status: 'pending' | 'collected') => {
    let updatedApp: Application | undefined;
    setApplications(prev => prev.map(a => {
      if (a.id === appId) {
        updatedApp = {
          ...a,
          feeStatus: status,
          feeCollectedAt: status === 'collected' ? (a.feeCollectedAt || new Date().toISOString()) : undefined,
          feeReceiptNo: status === 'collected' ? (a.feeReceiptNo || `REC-${Date.now().toString(36).toUpperCase()}`) : undefined,
          updatedAt: new Date().toISOString()
        };
        return updatedApp;
      }
      return a;
    }));
    if (daemonConnected && updatedApp) {
      syncApplicationToDaemon(updatedApp);
    }
    addAuditEvent('fee_status_updated', `Fee collection status updated to "${status}" for case ${appId}.`, 'application', appId);
    showToast(`Fee status: ${status === 'collected' ? '✓ Collected (Paid)' : '⏳ Pending'}`);
  };

  const handleLaunchApplicationInPortal = async (
    appId: string, 
    directToSimulator: boolean = false,
    overrideApp?: Application,
    overrideCitizen?: Citizen
  ) => {
    const app = overrideApp || applications.find(a => a.id === appId);
    if (!app) {
      showToast(`Cannot launch: Application ${appId} not found.`, 'error');
      return;
    }
    const citizen = overrideCitizen || citizens.find(c => c.id === app.citizenId);
    const service = services.find(s => s.id === app.serviceId);
    if (!citizen || !service) {
      showToast(`Cannot launch: Citizen or Service definition missing.`, 'error');
      return;
    }

    // 1. Immediately open official portal URL in new browser tab if live launch requested and URL is valid
    if (directToSimulator && service.portalUrl && service.portalUrl.startsWith('http')) {
      try {
        window.open(service.portalUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.warn('Portal window open blocked or failed:', e);
      }
    }

    if (app.status === 'ready' || app.status === 'draft') {
      await handleUpdateStatus(app.id, 'in_portal');
    }

    const payload = buildApplicationPayload({ ...app, status: 'in_portal' }, citizen, service);
    (window as any).__SEVA_COMPANION_PAYLOAD__ = payload;
    try {
      localStorage.setItem('seva_active_bridge_payload', JSON.stringify(payload));
    } catch {}

    try {
      await pushBridgeSession(payload);
    } catch {}

    setSelectedApplicationId(app.id);
    if (directToSimulator) {
      setCurrentPage('simulator');
      showToast(`🚀 Launched ${service.name.split('(')[0].trim()}! Portal opened & simulator bridge active.`);
    } else {
      setHandoffModalAppId(app.id);
    }
  };

  const handleRecordSubmission = async (receiptRef: string) => {
    let targetApp = selectedApplicationId ? applications.find(a => a.id === selectedApplicationId) : null;
    if (!targetApp || ['submitted', 'closed'].includes(targetApp.status)) {
      targetApp = applications.find(a => a.status === 'in_portal' || a.status === 'ready') || applications[0];
    }
    if (!targetApp) return;

    await handleUpdateStatus(targetApp.id, 'submitted', receiptRef, 'Confirmed and recorded from Portal Simulator.');
    setReceiptModalAppId(targetApp.id);
    showToast(`✓ Case ${targetApp.id} submitted! Ref: ${receiptRef}`);
  };

  const handleDeliverCertificate = async (appId: string, certRef: string, note?: string) => {
    let updatedApp: Application | undefined;
    setApplications(prev => prev.map(a => {
      if (a.id === appId) {
        updatedApp = {
          ...a,
          certificateRef: certRef,
          deliveredAt: new Date().toISOString(),
          status: 'closed',
          statusNote: note || `Certificate ${certRef} delivered to citizen.`,
          updatedAt: new Date().toISOString()
        };
        return updatedApp;
      }
      return a;
    }));
    if (daemonConnected && updatedApp) {
      syncApplicationToDaemon(updatedApp);
    }
    addAuditEvent('certificate_delivered', `Certificate ${certRef} delivered and case closed.`, 'application', appId);
    showToast(`✓ Certificate ${certRef} delivered and case sealed!`);
  };



  // Standalone Dual-Screen Citizen Monitor Mode (?view=citizen)
  const isCitizenMonitorView = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'citizen';
  if (isCitizenMonitorView) {
    const defaultCitizenService = services.find(s => s.id === selectedFeeServiceId) || services[0] || {
      id: 'srv-income-demo',
      name: 'Income Certificate (आय प्रमाण पत्र)',
      department: 'Revenue Department / e-District',
      officialFee: 50,
      operatorCharge: 30,
      feeSourceUrl: 'https://edistrict.up.gov.in',
      feeVerifiedAt: new Date().toISOString(),
      requiredFields: ['fullName', 'dob', 'mobile', 'pincode', 'aadhaar'],
      maxUploadMB: 0.2,
      allowedExtensions: ['pdf', 'jpg', 'jpeg'],
      portalUrl: 'https://edistrict.up.gov.in'
    };
    return (
      <CitizenDisplay
        service={defaultCitizenService}
        onClose={() => {
          window.location.href = window.location.pathname;
        }}
        daemonConnected={daemonConnected}
      />
    );
  }

  // Standalone State Portal Simulator Mode (?view=simulator)
  const isSimulatorView = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'simulator';
  if (isSimulatorView) {
    return (
      <PortalSimulator
        onBackToWorkspace={() => {
          window.location.href = window.location.pathname;
        }}
      />
    );
  }

  if (isLocked) {
    return (
      <LockScreen
        isSetup={!existingEnvelope}
        onUnlock={handleUnlock}
        onRestoreBackup={handleRestoreBackup}
      />
    );
  }

  // Selected sub-entities
  const activeApp = applications.find(a => a.id === selectedApplicationId);
  const activeCitizen = activeApp ? citizens.find(c => c.id === activeApp.citizenId) : undefined;
  const activeService = activeApp ? services.find(s => s.id === activeApp.serviceId) : undefined;
  const editingCitizen = citizens.find(c => c.id === editingCitizenId) || null;
  const feeService = services.find(s => s.id === selectedFeeServiceId) || services[0];

  return (
    <div className="app-container">
      {/* Toast Region */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: t.type === 'error' ? 'var(--status-bad-bg)' : 'var(--primary)',
              color: t.type === 'error' ? 'var(--status-bad)' : '#ffffff',
              boxShadow: 'var(--shadow-md)',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>{t.type === 'error' ? '!' : '✓'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      <Sidebar
        currentPage={currentPage}
        onNavigate={page => {
          if (page === 'intake') setEditingCitizenId(null);
          setCurrentPage(page);
        }}
        operatorName={profile.operatorName}
        centreName={profile.centreName}
        applicationCount={applications.length}
        onLock={handleLock}
      />

      <div className="main-content">
        <TopBar
          currentPage={currentPage}
          onNewApplication={() => {
            setEditingCitizenId(null);
            setReturnContext(null);
            setCurrentPage('intake');
          }}
          daemonConnected={daemonConnected}
        />

        <main className="page-body">
          {currentPage === 'overview' && (
            <Overview
              citizens={citizens}
              applications={applications}
              services={services}
              onNavigate={setCurrentPage}
              onEditCitizen={id => {
                setReturnContext({ page: 'overview' });
                setEditingCitizenId(id);
                setCurrentPage('intake');
              }}
              onOpenApplication={id => {
                setSelectedApplicationId(id);
                setCurrentPage('applications');
              }}
              onLaunchPortal={handleLaunchApplicationInPortal}
              onCreateCaseForCitizen={id => {
                setReturnContext({ page: 'overview' });
                setEditingCitizenId(id);
                setCurrentPage('intake');
              }}
              operatorProfile={profile}
              onUpdateProfile={(op, c) => {
                setProfile(p => ({ ...p, operatorName: op, centreName: c }));
                addAuditEvent('profile_updated', `Quick-updated kiosk identity: ${c} (Operator: ${op})`, 'workspace', 'local');
                showToast('Kiosk credentials updated.');
              }}
            />
          )}

          {currentPage === 'intake' && (
            (() => {
              const editingCitizenLockedApp = editingCitizenId ? applications.find(
                a => a.citizenId === editingCitizenId && (a.status === 'submitted' || a.status === 'closed')
              ) : undefined;
              return (
                <CitizenIntake
                  initialCitizen={editingCitizen}
                  services={services}
                  citizens={citizens}
                  onSave={handleSaveCitizen}
                  onCancel={() => {
                    setEditingCitizenId(null);
                    if (returnContext) {
                      setCurrentPage(returnContext.page);
                      if (returnContext.applicationId) {
                        setSelectedApplicationId(returnContext.applicationId);
                      }
                      setReturnContext(null);
                    } else {
                      setCurrentPage('overview');
                    }
                  }}
                  daemonConnected={daemonConnected}
                  isLocked={Boolean(editingCitizenLockedApp)}
                  lockedReason={editingCitizenLockedApp ? `Attached to ${editingCitizenLockedApp.status.toUpperCase()} case (${editingCitizenLockedApp.id})` : undefined}
                />
              );
            })()
          )}

          {currentPage === 'applications' && (
            selectedApplicationId && activeApp ? (
              <ApplicationDetail
                application={activeApp}
                citizen={activeCitizen}
                service={activeService}
                onBack={() => setSelectedApplicationId(null)}
                onEditCitizen={id => {
                  const lockedApp = applications.find(
                    a => a.citizenId === id && (a.status === 'submitted' || a.status === 'closed')
                  );
                  if (lockedApp) {
                    showToast(`Cannot edit applicant data: Record is locked under ${lockedApp.status} case ${lockedApp.id}.`, 'error');
                    return;
                  }
                  setReturnContext({ page: 'applications', applicationId: activeApp?.id });
                  setEditingCitizenId(id);
                  setCurrentPage('intake');
                }}
                onUpdateStatus={handleUpdateStatus}
                onUpdateFeeStatus={handleUpdateFeeStatus}
                onSavePreflight={handleSavePreflight}
                onShowToast={showToast}
                onNavigateToSimulator={() => setCurrentPage('simulator')}
                operatorName={profile.operatorName}
                centreName={profile.centreName}
              />
            ) : (
              <Applications
                applications={applications}
                citizens={citizens}
                services={services}
                onOpenApplication={id => setSelectedApplicationId(id)}
                onLaunchPortal={handleLaunchApplicationInPortal}
                onNewApplication={() => {
                  setEditingCitizenId(null);
                  setReturnContext(null);
                  setCurrentPage('intake');
                }}
                onDeliverCertificate={handleDeliverCertificate}
              />
            )
          )}

          {currentPage === 'fees' && (
            <FeeTransparency
              services={services}
              applications={applications}
              citizens={citizens}
              selectedServiceId={selectedFeeServiceId || (services[0]?.id || '')}
              selectedApplicationId={selectedFeeAppId}
              onSelectService={setSelectedFeeServiceId}
              onSelectApplication={setSelectedFeeAppId}
              onOpenCitizenDisplay={() => setCurrentPage('citizenDisplay')}
              onShowToast={showToast}
              daemonConnected={daemonConnected}
            />
          )}

          {currentPage === 'citizenDisplay' && (
            <CitizenDisplay
              service={feeService}
              onClose={() => setCurrentPage('fees')}
              daemonConnected={daemonConnected}
            />
          )}

          {currentPage === 'services' && (
            <ServicesRules
              services={services}
              onSaveService={handleSaveService}
              operatorName={profile.operatorName}
              centreName={profile.centreName}
              audioLang={profile.language}
              autoLockMinutes={profile.autoLockMinutes}
              onSaveProfile={async (op, c, l, al) => {
                setProfile({ operatorName: op, centreName: c, language: l, autoLockMinutes: al });
                addAuditEvent('profile_updated', 'Updated operator profile settings.', 'workspace', 'local');
              }}
              onExportBackup={handleExportBackup}
              onLock={handleLock}
              onShowToast={showToast}
            />
          )}

          {currentPage === 'audit' && (
            <AuditTrail
              events={auditEvents}
              onExportCsv={handleExportAuditCsv}
            />
          )}

          {currentPage === 'simulator' && (() => {
            const nextReadyApp = applications.find(a => a.status === 'ready' && a.id !== selectedApplicationId);
            const nextBurstAppInfo = nextReadyApp ? {
              id: nextReadyApp.id,
              citizenName: citizens.find(c => c.id === nextReadyApp.citizenId)?.fullName || 'Citizen',
              serviceName: services.find(s => s.id === nextReadyApp.serviceId)?.name?.split('(')[0].trim() || 'Service'
            } : null;

            return (
              <PortalSimulator
                activeApplicationId={selectedApplicationId || undefined}
                onBackToWorkspace={() => setCurrentPage('applications')}
                onRecordSubmission={handleRecordSubmission}
                onPrintReceipt={(ref) => {
                  const targetApp = (selectedApplicationId ? applications.find(a => a.id === selectedApplicationId) : null)
                    || applications.find(a => a.receiptRef === ref)
                    || applications[0];
                  if (targetApp) {
                    setReceiptModalAppId(targetApp.id);
                  }
                }}
                nextBurstApp={nextBurstAppInfo}
                onAdvanceBurst={async () => {
                  if (nextReadyApp) {
                    await handleLaunchApplicationInPortal(nextReadyApp.id);
                    showToast(`⚡ Loaded next ready application: ${nextBurstAppInfo?.citizenName} (${nextBurstAppInfo?.serviceName})`);
                  }
                }}
              />
            );
          })()}
        </main>

        {/* Global Modals */}
        {handoffModalAppId && (() => {
          const app = applications.find(a => a.id === handoffModalAppId);
          if (!app) return null;
          const citizen = citizens.find(c => c.id === app.citizenId);
          const service = services.find(s => s.id === app.serviceId);
          if (!citizen || !service) return null;

          return (
            <PortalHandoffModal
              application={app}
              citizen={citizen}
              service={service}
              onClose={() => setHandoffModalAppId(null)}
              onLaunchSimulator={() => {
                setHandoffModalAppId(null);
                setSelectedApplicationId(app.id);
                setCurrentPage('simulator');
              }}
              onOpenLivePortal={() => {
                setHandoffModalAppId(null);
                if (service.portalUrl && service.portalUrl.startsWith('http')) {
                  window.open(service.portalUrl, '_blank', 'noopener,noreferrer');
                }
                showToast(`Opened ${service.name}. SevaDesk Companion will auto-fill on page load.`);
              }}
            />
          );
        })()}

        {receiptModalAppId && (() => {
          const app = applications.find(a => a.id === receiptModalAppId);
          if (!app) return null;
          const citizen = citizens.find(c => c.id === app.citizenId);
          const service = services.find(s => s.id === app.serviceId);
          if (!citizen || !service) return null;

          return (
            <CitizenReceiptModal
              application={app}
              citizen={citizen}
              service={service}
              operatorName={profile.operatorName}
              centreName={profile.centreName}
              onClose={() => setReceiptModalAppId(null)}
              onUpdateFeeStatus={(status) => handleUpdateFeeStatus(app.id, status)}
            />
          );
        })()}
      </div>
    </div>
  );
};
