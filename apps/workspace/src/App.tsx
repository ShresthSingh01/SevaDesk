import React, { useState, useEffect, useRef } from 'react';
import { 
  Citizen, 
  ServiceDefinition, 
  Application, 
  AuditEvent 
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
import { checkDaemonHealth, syncCitizenToDaemon, syncServiceToDaemon, syncApplicationToDaemon } from './lib/api';
import { Overview } from './features/Overview';
import { CitizenIntake } from './features/CitizenIntake';
import { Applications } from './features/Applications';
import { ApplicationDetail } from './features/ApplicationDetail';
import { FeeTransparency } from './features/FeeTransparency';
import { CitizenDisplay } from './features/CitizenDisplay';
import { ServicesRules } from './features/ServicesRules';
import { AuditTrail } from './features/AuditTrail';

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
    notes: 'Official portal fee ₹15. Photo ≤ 20KB, self-declaration ≤ 100KB.'
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
    notes: 'Official fee ₹15. Caste verification and self-declaration required.'
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
    notes: 'Official fee ₹15. Electricity bill, ration card or school certificate required.'
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
    notes: 'Official portal fee is FREE (₹0). Aadhaar-linked bank account required for DBT transfer.'
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
    notes: 'Official fee ₹200. Age and address proofs required.'
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
    notes: 'Official fee ₹200. Existing DL number, medical certificate (Form 1A if >40 yrs).'
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
    notes: 'Official fee FREE (₹0). Eligible families under SECC / NFSA Ration Card.'
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
    notes: 'Official fee FREE (₹0). Student Aadhaar, Marksheet, and Bank passbook required.'
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
    notes: 'Official fee FREE (₹0). Aadhaar OTP authentication and bank account linking.'
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
    notes: 'Official fee FREE (₹0). Age 18+ declaration and address proof required.'
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
    notes: 'Official fee FREE (₹0). Head of family ration card number and member Aadhaar.'
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
    notes: 'Official fee FREE (₹0). Biometric / Iris authentication for pensioner DLC.'
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
  
  // Modals & UI
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  const [newAppCitizenId, setNewAppCitizenId] = useState('');
  const [newAppServiceId, setNewAppServiceId] = useState('');
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

  const handleSaveCitizen = async (citizen: Citizen, targetServiceId?: string) => {
    const isEdit = citizens.some(c => c.id === citizen.id);
    if (isEdit) {
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
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setApplications(prev => [newApp, ...prev]);
      if (daemonConnected) {
        syncApplicationToDaemon(newApp);
      }
      addAuditEvent('application_created', `Application case launched directly from intake for ${targetService?.name || targetServiceId}.`, 'application', newApp.id);
      setSelectedApplicationId(newApp.id);
      setCurrentPage('applications');
      showToast(`Saved citizen & launched application for ${targetService?.name?.split('(')[0].trim() || 'service'}!`);
    } else {
      setCurrentPage('overview');
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
    addAuditEvent('status_updated', `Application status changed to ${status}. ${status === 'submitted' ? `Portal Ref: ${ref}` : ''}`, 'application', appId);
  };

  const handleCreateNewAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppCitizenId || !newAppServiceId) return;

    const newApp: Application = {
      id: `SD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      citizenId: newAppCitizenId,
      serviceId: newAppServiceId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setApplications(prev => [newApp, ...prev]);
    if (daemonConnected) {
      syncApplicationToDaemon(newApp);
    }
    addAuditEvent('application_created', 'Created local application case.', 'application', newApp.id);
    setShowNewAppModal(false);
    setSelectedApplicationId(newApp.id);
    setCurrentPage('applications');
    showToast('New application record created.');
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
            if (!citizens.length) {
              showToast('Add a citizen record before creating an application.', 'error');
              setEditingCitizenId(null);
              setCurrentPage('intake');
              return;
            }
            if (!services.length) {
              showToast('Configure at least one service before creating an application.', 'error');
              setCurrentPage('services');
              return;
            }
            setShowNewAppModal(true);
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
                setEditingCitizenId(id);
                setCurrentPage('intake');
              }}
              onOpenApplication={id => {
                setSelectedApplicationId(id);
                setCurrentPage('applications');
              }}
              onCreateCaseForCitizen={id => {
                setNewAppCitizenId(id);
                setShowNewAppModal(true);
              }}
            />
          )}

          {currentPage === 'intake' && (
            <CitizenIntake
              initialCitizen={editingCitizen}
              services={services}
              onSave={handleSaveCitizen}
              onCancel={() => {
                setEditingCitizenId(null);
                setCurrentPage('overview');
              }}
              daemonConnected={daemonConnected}
            />
          )}

          {currentPage === 'applications' && (
            selectedApplicationId && activeApp ? (
              <ApplicationDetail
                application={activeApp}
                citizen={activeCitizen}
                service={activeService}
                onBack={() => setSelectedApplicationId(null)}
                onEditCitizen={id => {
                  setEditingCitizenId(id);
                  setCurrentPage('intake');
                }}
                onUpdateStatus={handleUpdateStatus}
                onSavePreflight={handleSavePreflight}
                onShowToast={showToast}
              />
            ) : (
              <Applications
                applications={applications}
                citizens={citizens}
                services={services}
                onOpenApplication={id => setSelectedApplicationId(id)}
                onNewApplication={() => setShowNewAppModal(true)}
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
        </main>
      </div>

      {/* New Application Modal */}
      {showNewAppModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '6px' }}>Create new application case</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Link a saved citizen record to a configured scheme.
            </p>

            <form onSubmit={handleCreateNewAppSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="newAppCitizen">Citizen *</label>
                <select
                  id="newAppCitizen"
                  className="form-control"
                  value={newAppCitizenId}
                  onChange={e => setNewAppCitizenId(e.target.value)}
                  required
                >
                  <option value="">Select a citizen record…</option>
                  {citizens.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName} · {c.id}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="newAppService">Service / Scheme *</label>
                <select
                  id="newAppService"
                  className="form-control"
                  value={newAppServiceId}
                  onChange={e => setNewAppServiceId(e.target.value)}
                  required
                >
                  <option value="">Select a service…</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.department || 'Scheme'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewAppModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Create case →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
