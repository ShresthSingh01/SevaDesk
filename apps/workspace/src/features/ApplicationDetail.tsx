import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  FileCheck, 
  HelpCircle,
  Clock,
  Sparkles,
  Send,
  Zap,
  Activity,
  RefreshCw,
  Lock,
  ShieldAlert,
  Download,
  Printer,
  Globe,
  IndianRupee,
  Check
} from 'lucide-react';
import { 
  Application, 
  Citizen, 
  ServiceDefinition, 
  FIELD_LABELS, 
  maskIdentifier, 
  validateCase, 
  interpretPortalError,
  buildApplicationPayload,
  validateStatusTransition,
  formatINR,
  DocumentSlotDefinition
} from '@sevadesk/core-types';
import { requestPortalErrorInterpretation, pushBridgeSession, checkPortalHealth, PortalHealthStatus } from '../lib/api';
import { optimizeImageForPortal, formatBytes } from '../lib/imageCompressor';
import { CitizenReceiptModal } from '../components/CitizenReceiptModal';
import { PortalHandoffModal } from '../components/PortalHandoffModal';
import { PrintableProformaModal } from '../components/PrintableProformaModal';

interface ApplicationDetailProps {
  application: Application;
  citizen: Citizen | undefined;
  service: ServiceDefinition | undefined;
  operatorName?: string;
  centreName?: string;
  onBack: () => void;
  onEditCitizen: (citizenId: string) => void;
  onUpdateStatus: (appId: string, status: string, ref?: string, note?: string) => Promise<void>;
  onUpdateFeeStatus?: (appId: string, status: 'pending' | 'collected') => void;
  onSavePreflight: (appId: string, snapshot: any) => Promise<void>;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onNavigateToSimulator?: () => void;
}

export const ApplicationDetail: React.FC<ApplicationDetailProps> = ({
  application,
  citizen,
  service,
  operatorName = 'Operator',
  centreName = 'Service centre',
  onBack,
  onEditCitizen,
  onUpdateStatus,
  onUpdateFeeStatus,
  onSavePreflight,
  onShowToast,
  onNavigateToSimulator
}) => {
  const [testFiles, setTestFiles] = useState<Array<{ name: string; size: number; type: string }>>(
    (application.documents || []).map(d => ({ name: d.name, size: d.size, type: d.type }))
  );
  const [portalErrorMessage, setPortalErrorMessage] = useState('');
  const [errorInterpretation, setErrorInterpretation] = useState<any>(null);
  
  // Status modal state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusVal, setStatusVal] = useState(application.status);
  const [receiptRef, setReceiptRef] = useState(application.receiptRef || '');
  const [statusNote, setStatusNote] = useState(application.statusNote || '');
  const [confirmedPortal, setConfirmedPortal] = useState(false);

  // Portal Latency & Document Optimization state
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [portalHealth, setPortalHealth] = useState<PortalHealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [optimizingDoc, setOptimizingDoc] = useState(false);
  const [optimizationNote, setOptimizationNote] = useState<string | null>(null);

  // Flaw 7: Auto-capture ACK reference from Portal Simulator
  const [detectedAck, setDetectedAck] = useState<{ ref: string; date: string } | null>(null);

  // Receipt & Portal Handoff Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [showDeliverCertificateModal, setShowDeliverCertificateModal] = useState(false);
  const [certificateNumber, setCertificateNumber] = useState(application.certificateRef || '');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [activeProformaSlot, setActiveProformaSlot] = useState<DocumentSlotDefinition | null>(null);

  const handleAttachProformaScan = async (file: File) => {
    setRawFiles(prev => [...prev, file]);
    const newDoc = { name: file.name, size: file.size, type: file.type };
    setTestFiles(prev => [...prev, newDoc]);
    
    // Auto-update application documents
    const docDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const targetSlot = activeProformaSlot || service?.documentSlots?.find(s => s.proformaType);
    const updatedDocs = [
      ...(application.documents || []),
      {
        name: file.name,
        size: file.size,
        type: file.type,
        role: targetSlot?.id || 'declaration',
        slotId: targetSlot?.id || 'declaration',
        dataUrl: docDataUrl,
        optimised: true
      }
    ];

    application.documents = updatedDocs;
    await handleRunPreflight();
    onShowToast(`Attached signed ${file.name} to case.`);
  };

  const handleOpenLivePortal = () => {
    if (!service?.portalUrl) return;
    window.open(service.portalUrl, '_blank');
    setShowHandoffModal(false);
    onShowToast(`Opened ${new URL(service.portalUrl).hostname}. SevaDesk Companion will auto-fill on page load.`);
  };

  const handleLaunchSimulatorFromModal = async () => {
    setShowHandoffModal(false);
    if (onNavigateToSimulator) {
      onNavigateToSimulator();
    } else {
      window.open(`/?view=simulator&portal=${service?.portalUrl?.includes('mahadbt') ? 'mahadbt' : 'edistrict.up.gov.in'}`, '_blank');
    }
  };

  const handleTrackOnPortal = async () => {
    if (!service?.portalUrl) return;
    if (application.receiptRef) {
      try {
        await navigator.clipboard.writeText(application.receiptRef);
        onShowToast(`Copied Ref "${application.receiptRef}" to clipboard! Opening ${new URL(service.portalUrl).hostname}...`);
      } catch {}
    }
    window.open(service.portalUrl, '_blank');
  };

  const handleDeliverCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = deliveryNote.trim() || `Certificate ${certificateNumber.trim() || 'Issued'} handed over to citizen.`;
    await onUpdateStatus(application.id, 'closed', application.receiptRef, note);
    setShowDeliverCertificateModal(false);
    onShowToast('✓ Certificate delivered and case completed & sealed!');
  };

  useEffect(() => {
    if (application.documents && application.documents.length > 0 && testFiles.length === 0) {
      setTestFiles(application.documents.map(d => ({ name: d.name, size: d.size, type: d.type })));
    }
  }, [application.documents]);

  useEffect(() => {
    const handleAckMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SEVA_ACK_DETECTED' && e.data.ref) {
        setDetectedAck({ ref: e.data.ref, date: e.data.date || new Date().toLocaleString() });
        onShowToast(`Official portal submission detected: Ref ${e.data.ref}!`, 'success');
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'seva_last_portal_ack' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.ref && (!detectedAck || detectedAck.ref !== parsed.ref)) {
            setDetectedAck({ ref: parsed.ref, date: parsed.date || new Date().toLocaleString() });
            onShowToast(`Official portal submission detected: Ref ${parsed.ref}!`, 'success');
          }
        } catch {}
      }
    };

    window.addEventListener('message', handleAckMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleAckMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [detectedAck]);

  const handleConfirmDetectedAck = async () => {
    if (!detectedAck) return;
    await onUpdateStatus(application.id, 'submitted', detectedAck.ref, 'Auto-captured from official state portal simulator.');
    setReceiptRef(detectedAck.ref);
    setStatusVal('submitted');
    setDetectedAck(null);
    onShowToast(`✓ Case ${application.id} closed and marked Submitted with Ref ${detectedAck.ref}!`);
  };

  const handleCheckPortalHealth = async () => {
    if (!service?.portalUrl) return;
    setCheckingHealth(true);
    try {
      const res = await checkPortalHealth(service.portalUrl);
      setPortalHealth(res);
    } catch {
      setPortalHealth({
        url: service.portalUrl,
        reachable: false,
        latencyMs: 0,
        congestion: 'offline',
        error: 'Local daemon offline or portal host unreachable',
        checkedAt: new Date().toISOString()
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (service?.portalUrl) {
      handleCheckPortalHealth();
    }
  }, [service?.portalUrl]);

  const requiredKeys = service?.requiredFields || [];
  const presentCount = requiredKeys.filter(k => citizen && Boolean(citizen[k as keyof Citizen])).length;
  const percentComplete = requiredKeys.length > 0 ? Math.round((presentCount / requiredKeys.length) * 100) : 0;

  const handleRunPreflight = async () => {
    if (!citizen || !service) return;
    const res = validateCase(citizen, service, testFiles);
    const snapshot = {
      valid: res.valid,
      errors: res.errors,
      warnings: res.warnings,
      checkedAt: new Date().toISOString(),
      rulesSnapshot: {
        requiredFields: service.requiredFields || [],
        maxUploadMB: service.maxUploadMB || null,
        allowedExtensions: service.allowedExtensions || []
      }
    };
    await onSavePreflight(application.id, snapshot);
    onShowToast(res.valid ? 'Preflight checks passed!' : `${res.errors.length} issue(s) need correction.`, res.valid ? 'success' : 'error');
    return snapshot;
  };

  const handleDispatchToCompanion = async () => {
    if (!citizen || !service) return;

    // Dynamically run preflight if not yet run
    let preflight = application.preflight;
    if (!preflight) {
      preflight = await handleRunPreflight();
    }

    if (!preflight?.valid) {
      const missingFields = (preflight?.errors || []).filter(e => e.field !== 'documents');
      const docErrors = (preflight?.errors || []).filter(e => e.field === 'documents');
      if (missingFields.length > 0) {
        onShowToast(`Applicant is missing required fields (${missingFields.map(e => e.label).join(', ')}). Edit applicant first.`, 'error');
        return;
      }
      if (docErrors.length > 0) {
        onShowToast(`Document size exceeds limit: Click 'Optimize Documents' before sending.`, 'error');
        return;
      }
      onShowToast('Preflight check failed. Please resolve errors before sending.', 'error');
      return;
    }

    const fileToDataUrl = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    const targetLimitMB = service.maxUploadMB || 0.20;
    const stagedDocs = await Promise.all((rawFiles.length > 0 ? rawFiles : []).map(async f => {
      const lower = f.name.toLowerCase();
      const role = lower.includes('photo') ? 'photo' :
                   lower.includes('declaration') ? 'selfDeclaration' :
                   lower.includes('income') ? 'incomeProof' : 'document';
      let dataUrl = '';
      try {
        dataUrl = await fileToDataUrl(f);
      } catch {}

      return {
        role,
        name: f.name,
        size: f.size,
        type: f.type,
        sizeKB: Math.round(f.size / 1024),
        isOptimized: (f.size / (1024 * 1024)) <= targetLimitMB,
        objectUrl: URL.createObjectURL(f),
        dataUrl
      };
    }));

    const finalDocsPayload = stagedDocs.length > 0 ? stagedDocs : testFiles.map(f => {
      const lower = f.name.toLowerCase();
      const role = lower.includes('photo') ? 'photo' :
                   lower.includes('declaration') ? 'selfDeclaration' :
                   lower.includes('income') ? 'incomeProof' : 'document';
      return {
        role,
        name: f.name,
        size: f.size,
        type: f.type,
        sizeKB: Math.round(f.size / 1024),
        isOptimized: (f.size / (1024 * 1024)) <= targetLimitMB
      };
    });

    const payload = buildApplicationPayload(application, citizen, service);
    (payload as any).documents = finalDocsPayload;

    // Provide immediate in-memory and storage bridge for simulator
    (window as any).__SEVA_COMPANION_PAYLOAD__ = payload;
    try {
      localStorage.setItem('seva_active_bridge_payload', JSON.stringify(payload));
    } catch {}

    try {
      // 1. Direct Loopback IPC Bridge (Zero OS Clipboard PII Exposure)
      await pushBridgeSession(payload);
      // 2. Also populate clipboard as secondary offline fallback
      try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); } catch {}
      onShowToast('✓ Dispatched to SevaDesk Bridge! Now click Auto-Fill in Portal Simulator.');
    } catch {
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        onShowToast('Dispatched to clipboard & local session. Paste or auto-fill in simulator.');
      } catch {
        onShowToast('Dispatched to local session. Proceed to Portal Simulator.');
      }
    }
  };

  const handleLaunchSimulator = async () => {
    if (!citizen || !service) return;

    await handleDispatchToCompanion();

    if ((window as any).__SEVA_COMPANION_PAYLOAD__) {
      if (application.status === 'ready' || application.status === 'draft') {
        await onUpdateStatus(application.id, 'in_portal');
      }
      setShowHandoffModal(true);
    }
  };

  const handleInterpretError = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalErrorMessage.trim()) return;
    try {
      const res = await requestPortalErrorInterpretation(portalErrorMessage, application.id);
      setErrorInterpretation(res);
    } catch {
      // Fallback
      setErrorInterpretation(interpretPortalError(portalErrorMessage));
    }
  };

  // Flaw 4: Auto-optimise immediately on file select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || []);
    if (raw.length === 0) return;
    setRawFiles(raw);
    const files = raw.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    }));
    setTestFiles(files);
    setOptimizationNote(null);

    const targetMB = service?.maxUploadMB || 0.20;
    const hasOversized = raw.some(rf => rf.type.startsWith('image/') && (rf.size > targetMB * 1024 * 1024));

    if (hasOversized) {
      setOptimizingDoc(true);
      try {
        const updatedRaw: File[] = [];
        let notes: string[] = [];

        for (const rf of raw) {
          if (rf.type.startsWith('image/') && (rf.size > targetMB * 1024 * 1024)) {
            const res = await optimizeImageForPortal(rf, targetMB);
            updatedRaw.push(res.optimizedFile);
            notes.push(`${rf.name}: ${formatBytes(res.originalSizeBytes)} ➔ ${formatBytes(res.optimizedSizeBytes)} (${res.reductionPercentage}% saved)`);
          } else {
            updatedRaw.push(rf);
          }
        }

        setRawFiles(updatedRaw);
        setTestFiles(updatedRaw.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        })));

        if (notes.length > 0) {
          setOptimizationNote(`✓ Auto-optimized: ${notes.join(' · ')}`);
          onShowToast(`Auto-optimized ${notes.length} document(s) on-device to satisfy portal limits!`, 'success');
        }
      } catch (err: any) {
        onShowToast(err.message || 'Auto-optimization failed.', 'error');
      } finally {
        setOptimizingDoc(false);
      }
    }
  };

  const handleOptimizeOversizedDocs = async () => {
    if (rawFiles.length === 0) return;
    setOptimizingDoc(true);
    try {
      const targetMB = service?.maxUploadMB || 0.20;
      const updatedRaw: File[] = [];
      let notes: string[] = [];

      for (const rf of rawFiles) {
        if (rf.type.startsWith('image/') && (rf.size > targetMB * 1024 * 1024)) {
          const res = await optimizeImageForPortal(rf, targetMB);
          updatedRaw.push(res.optimizedFile);
          notes.push(`${rf.name}: ${formatBytes(res.originalSizeBytes)} ➔ ${formatBytes(res.optimizedSizeBytes)} (${res.reductionPercentage}% saved)`);
        } else {
          updatedRaw.push(rf);
        }
      }

      setRawFiles(updatedRaw);
      const updatedTestFiles = updatedRaw.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type
      }));
      setTestFiles(updatedTestFiles);

      if (notes.length > 0) {
        setOptimizationNote(`✓ Optimized: ${notes.join(' · ')}`);
        onShowToast(`Optimized ${notes.length} document(s) on-device!`, 'success');
      } else {
        onShowToast('All documents already satisfy portal size limits.', 'success');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Optimization failed.', 'error');
    } finally {
      setOptimizingDoc(false);
    }
  };

  const handleDownloadOptimizedDocs = () => {
    if (rawFiles.length === 0) return;
    for (const f of rawFiles) {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PORTAL_${f.name}`;
      a.click();
      URL.revokeObjectURL(url);
    }
    onShowToast(`Downloaded ${rawFiles.length} optimized document(s) to your Downloads folder!`, 'success');
  };

  const isSubmitted = application.status === 'submitted';
  const isClosed = application.status === 'closed';
  const isApplicationLocked = isSubmitted || isClosed;

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateStatusTransition(application.status, statusVal);
    if (!check.allowed) {
      onShowToast(check.reason || 'Status transition not allowed.', 'error');
      return;
    }
    if (statusVal === 'submitted') {
      if (!receiptRef.trim()) {
        onShowToast('Enter official portal acknowledgement/reference number.', 'error');
        return;
      }
      if (!confirmedPortal) {
        onShowToast('Confirm that you personally observed the portal confirmation.', 'error');
        return;
      }
    }
    await onUpdateStatus(application.id, statusVal, receiptRef, statusNote);
    setShowStatusModal(false);
    onShowToast('Application status updated.');
  };

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div className="overline">
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
              APPLICATION REVIEW
            </div>
            <h1>{service?.name || 'Application Details'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Case ID: {application.id} · Created {new Date(application.createdAt).toLocaleDateString()}
              </span>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Fee: <strong>{formatINR((service?.officialFee || 0) + (service?.operatorCharge || 0))}</strong> (Govt ₹{service?.officialFee ?? 0} + CSC ₹{service?.operatorCharge ?? 0})
              </span>
              {application.feeStatus === 'collected' ? (
                <span className="status-pill good" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                  <CheckCircle2 size={12} /> Cash Collected
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => onUpdateFeeStatus && onUpdateFeeStatus(application.id, 'collected')}
                  style={{ fontSize: '0.72rem', padding: '2px 8px', color: 'var(--status-warn)', borderColor: 'var(--status-warn)' }}
                  title="Mark cash payment collected from citizen"
                >
                  Collect ₹{(service?.officialFee || 0) + (service?.operatorCharge || 0)} Cash
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isSubmitted && !isClosed && (
            <button
              className="btn btn-primary"
              onClick={handleLaunchSimulator}
              disabled={isApplicationLocked}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
              title="Launch application into official portal companion or offline simulator"
            >
              <Zap size={16} />
              <span>⚡ Launch Portal Handoff (Pre-Filled)</span>
            </button>
          )}

          {/* 1-Click Print Citizen Slip */}
          {(isSubmitted || isClosed) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowReceiptModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
              title="Print official citizen acknowledgement & cash fee receipt slip"
            >
              <Printer size={15} />
              <span>🖨️ Print Citizen Slip</span>
            </button>
          )}

          {/* Official Portal Tracking */}
          {isSubmitted && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTrackOnPortal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Copy acknowledgement ref and open official portal to check current status"
            >
              <Globe size={15} />
              <span>Track on Portal ↗</span>
            </button>
          )}

          {/* Deliver Certificate & Complete Case */}
          {isSubmitted && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowDeliverCertificateModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, borderColor: 'var(--status-good)', color: 'var(--status-good)' }}
              title="Record signed certificate delivery and mark case closed"
            >
              <CheckCircle2 size={15} />
              <span>Deliver Certificate & Close</span>
            </button>
          )}

          {isClosed ? (
            <button
              className="btn btn-secondary"
              disabled
              title="Closed applications are terminal and cannot be modified."
              style={{ opacity: 0.8, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Lock size={14} /> Case Closed (Sealed)
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={() => setShowStatusModal(true)}>
              Update status
            </button>
          )}
        </div>
      </div>

      {/* Flaw 7: Auto-Captured ACK Banner from Simulator */}
      {detectedAck && !isSubmitted && !isClosed && (
        <div style={{
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#ecfdf5',
          border: '2px solid #10b981',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={22} color="#059669" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#065f46' }}>
                Official Portal Acknowledgement Captured!
              </strong>
              <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '2px' }}>
                Simulator generated Acknowledgement No: <strong style={{ letterSpacing: '0.04em' }}>{detectedAck.ref}</strong> ({detectedAck.date})
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDetectedAck(null)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleConfirmDetectedAck}
              style={{ fontWeight: 700 }}
            >
              ✓ Confirm & Close Case ({detectedAck.ref})
            </button>
          </div>
        </div>
      )}

      {/* Immutability Banner when Submitted or Closed */}
      {isSubmitted && (
        <div style={{
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--status-good-bg)',
          border: '1px solid var(--primary-border)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CheckCircle2 size={18} color="var(--status-good)" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                Official Portal Submission Verified · Application Conditions Locked
              </strong>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Portal Acknowledgement: <strong style={{ color: 'var(--primary)' }}>{application.receiptRef || 'Recorded'}</strong> · Reversals to draft or ready are prohibited. Applicant demographic particulars are sealed under legal audit rules.
              </p>
            </div>
          </div>
          <span className="status-pill good" style={{ fontWeight: 700 }}>● IMMUTABLE</span>
        </div>
      )}

      {isClosed && (
        <div style={{
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-light)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Lock size={18} color="var(--text-main)" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                Case Closed & Finalized · Sealed Record
              </strong>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                This case is terminal. All applicant details, preflight logs, and receipt references are permanently sealed in the cryptographic audit ledger.
              </p>
            </div>
          </div>
          <span className="status-pill" style={{ fontWeight: 700 }}>● ARCHIVED</span>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Applicant & Preflight */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Applicant Details */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Applicant information</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cross-check against source physical document</p>
              </div>
              <span className={`status-pill ${application.status}`}>
                • {application.status.replace('_', ' ')}
              </span>
            </div>

            {citizen ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Full name:</span> <strong>{citizen.fullName}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>DOB:</span> <strong>{citizen.dob || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Gender:</span> <strong>{citizen.gender || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Mobile:</span> <strong>{citizen.mobile || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Aadhaar:</span> <strong>{citizen.aadhaar ? maskIdentifier(citizen.aadhaar) : 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Voter ID:</span> <strong>{citizen.voterId || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>District:</span> <strong>{citizen.district || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>PIN code:</span> <strong>{citizen.pincode || 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Bank account:</span> <strong>{citizen.bankAccount ? maskIdentifier(citizen.bankAccount) : 'Not provided'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>IFSC code:</span> <strong>{citizen.ifsc || 'Not provided'}</strong></div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                  {isApplicationLocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <Lock size={14} color="var(--primary)" />
                      <span>
                        Applicant data locked ({isClosed ? 'Case Closed' : 'Submitted on Official Portal'}). Demographic particulars are sealed under legal audit rules.
                      </span>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-xs" onClick={() => onEditCitizen(citizen.id)}>
                      Edit citizen record
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--status-bad)', fontSize: '0.85rem' }}>Citizen record unavailable.</div>
            )}
          </section>

          {/* Preflight Checklist */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Required-field checklist</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Based on configured service rules</p>
              </div>
              <span className="status-pill good">{requiredKeys.length} configured</span>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ width: `${percentComplete}%`, height: '100%', backgroundColor: percentComplete === 100 ? 'var(--status-good)' : 'var(--status-warn)', transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {presentCount} of {requiredKeys.length} mandatory field(s) present ({percentComplete}%)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {requiredKeys.map(k => {
                const isPresent = citizen && Boolean(citizen[k as keyof Citizen]);
                return (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isPresent ? 'var(--status-good-bg)' : 'var(--status-bad-bg)',
                      border: `1px solid ${isPresent ? 'var(--primary-border)' : 'var(--status-bad)'}`,
                      fontSize: '0.825rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isPresent ? <CheckCircle2 size={14} color="var(--status-good)" /> : <XCircle size={14} color="var(--status-bad)" />}
                      <strong>{FIELD_LABELS[k as keyof typeof FIELD_LABELS] || k}</strong>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isPresent ? 'var(--status-good)' : 'var(--status-bad)' }}>
                      {isPresent ? 'Present' : 'Missing'}
                    </span>
                  </div>
                );
              })}
            </div>

            {isApplicationLocked ? (
              <button
                className="btn btn-secondary btn-sm"
                disabled
                style={{ width: '100%', opacity: 0.7, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Lock size={14} /> Preflight verification sealed (Case {application.status})
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleRunPreflight} style={{ width: '100%' }}>
                Run preflight validation check
              </button>
            )}

            {/* Preflight Results */}
            {application.preflight && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                {application.preflight.valid ? (
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--status-good-bg)', color: 'var(--status-good)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                      <CheckCircle2 size={16} /> All configured preflight checks passed.
                    </div>
                    <p style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                      Ready to copy payload or fill on the official portal.
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)', fontSize: '0.85rem' }}>
                    <strong>{application.preflight.errors.length} blocking issue(s) detected:</strong>
                    <ul style={{ marginLeft: '18px', marginTop: '6px' }}>
                      {application.preflight.errors.map((err, i) => (
                        <li key={i}>{err.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Portal Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Official Portal Link */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Official portal link</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target government portal</p>
              </div>
            </div>

            {service?.portalUrl ? (
              <>
                <a
                  href={service.portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'space-between', marginBottom: '10px' }}
                >
                  <span>Open {service.name} portal</span>
                  <ExternalLink size={16} />
                </a>

                {/* Real-Time Portal Latency & Congestion Probe */}
                <div style={{
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.74rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={14} color="var(--primary)" />
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Portal Latency Probe: </span>
                      {checkingHealth ? (
                        <span style={{ color: 'var(--text-muted)' }}>Testing server response...</span>
                      ) : portalHealth ? (
                        <span>
                          {portalHealth.congestion === 'fast' && (
                            <span style={{ color: 'var(--status-good)', fontWeight: 700 }}>
                              ● Fast ({portalHealth.latencyMs}ms) · Responsive
                            </span>
                          )}
                          {portalHealth.congestion === 'congested' && (
                            <span style={{ color: 'var(--status-warn)', fontWeight: 700 }}>
                              ● Congested ({portalHealth.latencyMs}ms) · High Load
                            </span>
                          )}
                          {portalHealth.congestion === 'unhealthy' && (
                            <span style={{ color: 'var(--status-bad)', fontWeight: 700 }}>
                              ● Gateway Lag ({portalHealth.latencyMs}ms) · Slow Portal
                            </span>
                          )}
                          {portalHealth.congestion === 'offline' && (
                            <span style={{ color: 'var(--status-bad)', fontWeight: 700 }}>
                              ● Offline / Unreachable
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not tested</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckPortalHealth}
                    disabled={checkingHealth}
                    title="Re-test portal latency"
                    style={{ display: 'flex', alignItems: 'center', color: 'var(--primary)', cursor: 'pointer' }}
                  >
                    <RefreshCw size={12} className={checkingHealth ? 'spin' : ''} />
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--status-warn-bg)', color: 'var(--status-warn)', fontSize: '0.8rem', marginBottom: '12px' }}>
                Portal URL not configured in service rules.
              </div>
            )}

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              <strong>Companion Safety:</strong> The browser extension assists form filling but never touches passwords, OTPs, or the final Submit button.
            </div>
          </section>

          {/* Document Pre-Checker */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Document pre-check</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verify upload size and file type locally</p>
              </div>
              <FileCheck size={18} color="var(--primary)" />
            </div>

            {service?.documentSlots?.some(s => s.proformaType) && !isApplicationLocked && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const targetSlot = service.documentSlots?.find(s => s.proformaType) || service.documentSlots![0];
                  setActiveProformaSlot(targetSlot);
                }}
                style={{
                  width: '100%',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}
                title="Print pre-filled declaration proforma for applicant physical signature"
              >
                <Printer size={14} />
                <span>🖨️ Print Pre-Filled Proforma ({service.documentSlots.find(s => s.proformaType)?.proformaTitle?.split('(')[0].trim() || 'घोषणा पत्र'})</span>
              </button>
            )}

            <div style={{ marginBottom: '12px' }}>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                disabled={isApplicationLocked}
                className="form-control"
                style={{ fontSize: '0.8rem', opacity: isApplicationLocked ? 0.6 : 1 }}
              />
            </div>

            {isApplicationLocked && (
              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} color="var(--primary)" />
                <span>Document attachments locked: application is {application.status}.</span>
              </div>
            )}

            {testFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {testFiles.map((f, i) => {
                  const isOver = (f.size / (1024 * 1024)) > (service?.maxUploadMB || 0.20);
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.78rem',
                        padding: '6px 10px',
                        background: isOver ? 'var(--status-bad-bg)' : 'var(--bg-subtle)',
                        border: `1px solid ${isOver ? 'var(--status-bad)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <span style={{ fontWeight: isOver ? 700 : 500, color: isOver ? 'var(--status-bad)' : 'inherit' }}>
                        {f.name}
                      </span>
                      <span>
                        {(f.size / (1024 * 1024)).toFixed(2)} MB {isOver ? '(Oversized)' : '✓'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Document Auto-Optimizer Button */}
            {testFiles.some(f => (f.size / (1024 * 1024)) > (service?.maxUploadMB || 0.20)) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleOptimizeOversizedDocs}
                disabled={optimizingDoc}
                style={{
                  width: '100%',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  backgroundColor: 'var(--primary-light)',
                  border: '1px solid var(--primary-border)'
                }}
              >
                <Zap size={14} color="var(--primary)" />
                {optimizingDoc ? 'Optimizing document on-device...' : `⚡ Auto-Optimize Document for Portal (< ${service?.maxUploadMB || 0.2} MB)`}
              </button>
            )}

            {optimizationNote && (
              <div style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--status-good-bg)',
                border: '1px solid var(--primary-border)',
                color: 'var(--status-good)',
                fontSize: '0.72rem',
                fontWeight: 600,
                marginBottom: '10px'
              }}>
                {optimizationNote}
              </div>
            )}

            {testFiles.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadOptimizedDocs}
                style={{
                  width: '100%',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.78rem'
                }}
                title="Download staged pre-compressed files to attach on government portal"
              >
                <Download size={14} color="var(--primary)" />
                <span>📦 Download Staged Portal Documents Pack ({testFiles.length})</span>
              </button>
            )}

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Configured limits: {service?.maxUploadMB ? `${service.maxUploadMB} MB max` : 'Size unconfigured'} · {service?.allowedExtensions?.join(', ') || 'Extensions unconfigured'}
            </div>
          </section>

          {/* Portal Error Interpreter */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Portal error interpreter</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rule-based hints for cryptic portal messages</p>
              </div>
              <HelpCircle size={18} color="var(--primary)" />
            </div>

            <form onSubmit={handleInterpretError} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Paste the technical portal error message here (remove citizen PII)..."
                value={portalErrorMessage}
                onChange={e => setPortalErrorMessage(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={!portalErrorMessage.trim()}>
                Interpret message
              </button>
            </form>

            {errorInterpretation && (
              <div style={{
                marginTop: '14px',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: errorInterpretation.confidence === 'none' ? 'var(--status-warn-bg)' : 'var(--primary-light)',
                fontSize: '0.825rem'
              }}>
                <strong style={{ display: 'block', color: 'var(--text-main)' }}>{errorInterpretation.title}</strong>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0' }}>{errorInterpretation.explanation}</p>
                <div style={{ marginTop: '6px', fontWeight: 600, color: 'var(--primary)' }}>
                  Action: {errorInterpretation.action}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }}>
            <h2 style={{ marginBottom: '6px' }}>Update application status</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Case: {application.id} · Record observed official state
            </p>

            <form onSubmit={handleStatusSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="statusVal">Status</label>
                <select
                  id="statusVal"
                  className="form-control"
                  value={statusVal}
                  onChange={e => setStatusVal(e.target.value as any)}
                >
                  {application.status === 'submitted' ? (
                    <>
                      <option value="submitted">Submitted on official portal (Current)</option>
                      <option value="rejected">Rejected / returned by portal</option>
                      <option value="closed">Closed (Certificate delivered / Archive)</option>
                    </>
                  ) : (
                    <>
                      <option value="draft">Draft</option>
                      <option value="needs_correction">Needs correction</option>
                      <option value="ready">Ready for review</option>
                      <option value="in_portal">In portal</option>
                      <option value="submitted">Submitted on official portal</option>
                      <option value="rejected">Rejected / returned by portal</option>
                      <option value="closed">Closed</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="receiptRef">Portal acknowledgement / reference</label>
                <input
                  id="receiptRef"
                  className="form-control"
                  placeholder="Required when marking submitted"
                  value={receiptRef}
                  onChange={e => setReceiptRef(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="statusNote">Operator note</label>
                <textarea
                  id="statusNote"
                  className="form-control"
                  rows={2}
                  placeholder="Do not include identity or bank numbers"
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                />
              </div>

              {statusVal === 'submitted' && (
                <label style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={confirmedPortal}
                    onChange={e => setConfirmedPortal(e.target.checked)}
                    required
                  />
                  <span>I personally observed the official portal acknowledgement for this case.</span>
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowStatusModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Save status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Citizen Receipt Slip Modal */}
      {showReceiptModal && (
        <CitizenReceiptModal
          application={application}
          citizen={citizen}
          service={service}
          operatorName={operatorName}
          centreName={centreName}
          onClose={() => setShowReceiptModal(false)}
          onMarkFeeCollected={appId => onUpdateFeeStatus && onUpdateFeeStatus(appId, 'collected')}
        />
      )}

      {/* Unified Portal Handoff Modal */}
      {showHandoffModal && (
        <PortalHandoffModal
          application={application}
          citizen={citizen}
          service={service}
          onLaunchSimulator={handleLaunchSimulatorFromModal}
          onOpenLivePortal={handleOpenLivePortal}
          onClose={() => setShowHandoffModal(false)}
        />
      )}

      {/* Deliver Certificate & Complete Case Modal */}
      {showDeliverCertificateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }}>
            <h2 style={{ marginBottom: '6px' }}>Deliver Certificate & Complete Case</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Record the signed certificate handover to <strong>{citizen?.fullName || 'the citizen'}</strong>. This completes the service and permanently seals the case under DPDP audit rules.
            </p>

            <form onSubmit={handleDeliverCertificate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="certRef">Certificate / Sanction Number</label>
                <input
                  id="certRef"
                  className="form-control"
                  placeholder="e.g. UP-INC-2026-891234 or Sanction ID"
                  value={certificateNumber}
                  onChange={e => setCertificateNumber(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="delNote">Handover / Verification Note</label>
                <textarea
                  id="delNote"
                  className="form-control"
                  rows={2}
                  placeholder="e.g. Laminated physical certificate handed over to applicant in person."
                  value={deliveryNote}
                  onChange={e => setDeliveryNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDeliverCertificateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>
                  ✓ Confirm Delivery & Seal Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Pre-Filled Proforma Modal */}
      {activeProformaSlot && service && (
        <PrintableProformaModal
          citizen={citizen}
          service={service}
          slot={activeProformaSlot}
          operatorName={operatorName}
          centreName={centreName}
          onClose={() => setActiveProformaSlot(null)}
          onAttachScan={handleAttachProformaScan}
          onShowToast={(msg, type) => onShowToast(msg, type === 'error' ? 'error' : 'success')}
        />
      )}
    </div>
  );
};
