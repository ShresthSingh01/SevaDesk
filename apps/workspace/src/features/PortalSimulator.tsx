import React, { useState, useEffect, useRef } from 'react';
import { fetchActiveBridgeSession } from '../lib/api';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  RefreshCw, 
  RotateCcw,
  Zap,
  HelpCircle,
  FileText,
  Lock,
  ChevronRight,
  ArrowLeft,
  Printer,
  Globe
} from 'lucide-react';

export interface PortalSimulatorProps {
  activeApplicationId?: string;
  onBackToWorkspace?: () => void;
  onRecordSubmission?: (receiptRef: string) => Promise<void> | void;
  onPrintReceipt?: (receiptRef: string) => void;
  nextBurstApp?: { id: string; citizenName: string; serviceName: string } | null;
  onAdvanceBurst?: () => Promise<void> | void;
}

type PortalType = 'up-edistrict' | 'mahadbt';

export const PortalSimulator: React.FC<PortalSimulatorProps> = ({ 
  activeApplicationId,
  onBackToWorkspace, 
  onRecordSubmission,
  onPrintReceipt,
  nextBurstApp,
  onAdvanceBurst
}) => {
  const urlParams = new URLSearchParams(window.location.search);
  const initialPortal = (urlParams.get('portal')?.includes('mahadbt') ? 'mahadbt' : 'up-edistrict') as PortalType;

  const [activePortal, setActivePortal] = useState<PortalType>(initialPortal);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  const [activeErrorBanner, setActiveErrorBanner] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<{ time: string; msg: string; type: 'info' | 'fill' | 'warn' }[]>([]);
  const [injectedFields, setInjectedFields] = useState<Set<string>>(new Set());
  const [captchaInput, setCaptchaInput] = useState('');
  const [submissionReceipt, setSubmissionReceipt] = useState<{ ref: string; date: string } | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'no-session' | 'filled'>('idle');
  const hasAutoFilledRef = useRef(false);

  // Field values state for manual inspection
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Document attachment state
  const [selectedDocType, setSelectedDocType] = useState('वेतन पर्ची / आय प्रमाण पत्र (Income Proof)');
  const [attachedDocs, setAttachedDocs] = useState<{ id: string; title: string; filename: string; sizeKB: number; valid: boolean }[]>([]);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  // Maps citizen payload field keys → portal form input IDs for each portal type
  const SIMULATOR_FIELD_MAP: Record<PortalType, Record<string, string>> = {
    'up-edistrict': {
      fullName:    'txtApplicantNameEng',
      dob:         'txtDOB',
      gender:      'ddlGender',
      mobile:      'txtMobile',
      address:     'txtAddressPermanent',
      district:    'ddlDistrict',
      pincode:     'txtPin',
      rationCard:  'txtRationCard',
      aadhaar:     'txtAadhaarNumber',
    },
    'mahadbt': {
      fullName:    'txtApplicantName',
      dob:         'txtDOB',
      gender:      'ddlGender',
      mobile:      'txtMobileNumber',
      address:     'txtAddress',
      pincode:     'txtPin',
      bankAccount: 'txtAccountNumber',
      ifsc:        'txtIFSCCode',
    }
  };

  const logEvent = (msg: string, type: 'info' | 'fill' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setEventLog(prev => [{ time, msg, type }, ...prev.slice(0, 30)]);
  };

  useEffect(() => {
    logEvent(`State Portal Simulator initialized in ${activePortal === 'up-edistrict' ? 'UP e-District' : 'MahaDBT'} mode.`);
  }, [activePortal]);

  // Listen to input and change events on container to detect companion injections
  const handleFormChange = (e: React.FormEvent<HTMLFormElement>) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!target) return;
    const key = target.id || target.name;
    if (key) {
      setFormValues(prev => ({ ...prev, [key]: target.value }));
      setInjectedFields(prev => new Set([...prev, key]));
      logEvent(`DOM Event fired: [${e.type}] on #${key} = "${target.value}"`, 'fill');
    }
  };

  const handleReset = () => {
    setFormValues({});
    setInjectedFields(new Set());
    setSessionTimedOut(false);
    setActiveErrorBanner(null);
    setCaptchaInput('');
    setSubmissionReceipt(null);
    setAttachedDocs([]);
    setPendingUploadFile(null);
    setBridgeStatus('idle');
    logEvent('Portal form reset to empty state.', 'warn');
  };

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    logEvent('Fetching reviewed session from SevaDesk bridge...', 'info');
    try {
      const data = await fetchActiveBridgeSession();
      let payload = data.active && data.session?.payload ? data.session.payload : null;
      
      // Fallback to window companion payload or localStorage bridge if daemon is offline
      if (!payload) {
        if ((window as any).__SEVA_COMPANION_PAYLOAD__) {
          payload = (window as any).__SEVA_COMPANION_PAYLOAD__;
        } else {
          try {
            const rawStored = localStorage.getItem('seva_active_bridge_payload');
            if (rawStored) payload = JSON.parse(rawStored);
          } catch {}
        }
      }

      if (!payload) {
        setBridgeStatus('no-session');
        logEvent('ℹ️ Portal Simulator ready. Launch an application from SevaDesk or click "Auto-Fill" to populate.', 'info');
        setIsAutoFilling(false);
        return;
      }

      const fields: Record<string, string> = payload.citizen?.fields || {};
      const fieldMap = SIMULATOR_FIELD_MAP[activePortal];

      const newValues: Record<string, string> = {};
      const newInjected = new Set<string>();
      let filledCount = 0;

      for (const [citizenKey, portalId] of Object.entries(fieldMap)) {
        const rawValue = fields[citizenKey] || '';
        if (rawValue) {
          newValues[portalId] = String(rawValue);
          newInjected.add(portalId);
          filledCount++;
          logEvent(`✓ Filled #${portalId} ← citizen.${citizenKey} = "${String(rawValue).slice(0, 30)}"`, 'fill');
        }
      }

      setFormValues(prev => ({ ...prev, ...newValues }));
      setInjectedFields(prev => new Set([...prev, ...newInjected]));
      setBridgeStatus('filled');

      // Flaw 5: If session includes staged documents, auto-attach with proper roles
      const docs: any[] = payload.documents || [];
      if (docs.length > 0) {
        setAttachedDocs(docs.map((d, i) => {
          let title = d.name;
          const lower = (d.role || d.name || '').toLowerCase();
          if (lower.includes('photo')) {
            title = 'फ़ोटो (Applicant Photograph)';
          } else if (lower.includes('income')) {
            title = 'वेतन पर्ची / आय प्रमाण पत्र (Income Proof)';
          } else if (lower.includes('declaration')) {
            title = 'स्वप्रमाणित घोषणा पत्र (Self-Declaration Form)';
          } else {
            title = d.name;
          }
          return {
            id: `BRIDGE-DOC-${i}`,
            title,
            filename: d.name,
            sizeKB: d.sizeKB || Math.round((d.size || 0) / 1024),
            valid: d.isOptimized !== false
          };
        }));
        logEvent(`⚡ Auto-attached ${docs.length} pre-optimized document(s) directly from SevaDesk application session into portal file inputs.`, 'fill');
      }

      logEvent(`⚡ Auto-fill complete: ${filledCount} fields injected from "${payload.citizen?.displayName || 'Applicant'}" session.`, 'fill');
    } catch (err: any) {
      logEvent(`Bridge fetch failed: ${err.message || 'Daemon offline. Start run.bat first.'}`, 'warn');
      setBridgeStatus('no-session');
    } finally {
      setIsAutoFilling(false);
    }
  };

  useEffect(() => {
    // Attempt auto-fill on mount / portal change if not yet performed
    if (!hasAutoFilledRef.current) {
      hasAutoFilledRef.current = true;
      handleAutoFill();
    }
  }, [activePortal]);

  useEffect(() => {
    if (activeApplicationId) {
      handleReset();
      const timer = setTimeout(() => {
        handleAutoFill();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeApplicationId]);



  const handleUploadDocument = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!pendingUploadFile) {
      logEvent('Please select a file to upload.', 'warn');
      return;
    }
    const sizeKB = Math.round(pendingUploadFile.size / 1024);
    const isPhoto = selectedDocType.includes('Photo') || selectedDocType.includes('फ़ोटो');
    const maxAllowedKB = isPhoto ? 20 : 100;

    if (sizeKB > maxAllowedKB) {
      setActiveErrorBanner(`Upload Failed: Selected file "${pendingUploadFile.name}" (${sizeKB} KB) exceeds the portal limit of ${maxAllowedKB} KB for ${selectedDocType}.`);
      logEvent(`Portal upload rejected: ${pendingUploadFile.name} (${sizeKB} KB > ${maxAllowedKB} KB limit)`, 'warn');
      return;
    }

    setActiveErrorBanner(null);
    setAttachedDocs(prev => [
      ...prev.filter(d => d.title !== selectedDocType),
      {
        id: `DOC-${Date.now()}`,
        title: selectedDocType,
        filename: pendingUploadFile.name,
        sizeKB,
        valid: true
      }
    ]);
    setPendingUploadFile(null);
    logEvent(`✓ Document attached to portal: ${selectedDocType} (${sizeKB} KB) - Verified!`, 'fill');
  };

  const handleQuickAttachPreOptimized = () => {
    setAttachedDocs([
      {
        id: 'DOC-1',
        title: 'फ़ोटो (Applicant Photograph)',
        filename: 'ramesh_photo_20kb.jpg',
        sizeKB: 18,
        valid: true
      },
      {
        id: 'DOC-2',
        title: 'वेतन पर्ची / आय प्रमाण पत्र (Income Proof)',
        filename: 'ramesh_income_proof_88kb.jpg',
        sizeKB: 88,
        valid: true
      },
      {
        id: 'DOC-3',
        title: 'स्वप्रमाणित घोषणा पत्र (Self-Declaration Form)',
        filename: 'self_declaration_signed.pdf',
        sizeKB: 64,
        valid: true
      }
    ]);
    setActiveErrorBanner(null);
    logEvent('⚡ Quick-attached 3 SevaDesk pre-optimized documents (< 100 KB limit).', 'fill');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaInput !== '7492' && captchaInput !== '9834') {
      setActiveErrorBanner('Invalid CAPTCHA security code entered. Please type the digits displayed in the image.');
      logEvent('Submission rejected: CAPTCHA mismatch.', 'warn');
      return;
    }
    const receiptRef = activePortal === 'up-edistrict' 
      ? `UPED-${new Date().getFullYear()}-${Math.floor(10000000 + Math.random() * 90000000)}`
      : `MHDBT-${new Date().getFullYear()}-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const nowStr = new Date().toLocaleString();
    
    setSubmissionReceipt({
      ref: receiptRef,
      date: nowStr
    });

    // Flaw 7: Broadcast captured portal acknowledgement to parent / SevaDesk Workspace
    const ackPayload = {
      type: 'SEVA_ACK_DETECTED',
      ref: receiptRef,
      date: nowStr,
      portal: activePortal
    };

    try {
      window.postMessage(ackPayload, '*');
      if (window.opener) {
        window.opener.postMessage(ackPayload, '*');
      }
      localStorage.setItem('seva_last_portal_ack', JSON.stringify({
        ref: receiptRef,
        date: nowStr,
        portal: activePortal,
        timestamp: Date.now()
      }));
    } catch {}

    logEvent(`Official Portal Submission Succeeded! Acknowledgement No: ${receiptRef}`, 'info');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5', color: '#1c1e21', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Simulator Control Header */}
      <div style={{
        backgroundColor: '#0a1a12',
        color: '#ffffff',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '3px solid #22c55e',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>State Portal Simulator (Offline Testing Environment)</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#86efac' }}>
              Domain Emulation: <strong>{activePortal === 'up-edistrict' ? 'edistrict.up.gov.in' : 'mahadbt.maharashtra.gov.in'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Portal Selector */}
          <div style={{ display: 'flex', backgroundColor: '#14291e', borderRadius: '6px', padding: '3px' }}>
            <button
              type="button"
              onClick={() => { setActivePortal('up-edistrict'); handleReset(); }}
              style={{
                backgroundColor: activePortal === 'up-edistrict' ? '#22c55e' : 'transparent',
                color: activePortal === 'up-edistrict' ? '#052e16' : '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              UP e-District (आय प्रमाण पत्र)
            </button>
            <button
              type="button"
              onClick={() => { setActivePortal('mahadbt'); handleReset(); }}
              style={{
                backgroundColor: activePortal === 'mahadbt' ? '#22c55e' : 'transparent',
                color: activePortal === 'mahadbt' ? '#052e16' : '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              MahaDBT (Scholarship)
            </button>
          </div>

          {/* Test Action Buttons */}
          <button
            type="button"
            onClick={() => window.open(activePortal === 'up-edistrict' ? 'https://edistrict.up.gov.in' : 'https://mahadbt.maharashtra.gov.in', '_blank', 'noopener,noreferrer')}
            style={{
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
            title="Open official government portal in a new browser tab"
          >
            <Globe size={14} />
            <span>Open Real Portal ↗</span>
          </button>

          {/* PRIMARY: Auto-Fill from SevaDesk Bridge */}
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={isAutoFilling}
            style={{
              backgroundColor: bridgeStatus === 'filled' ? '#16a34a' : bridgeStatus === 'no-session' ? '#b45309' : '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isAutoFilling ? 'wait' : 'pointer',
              boxShadow: '0 0 0 2px rgba(5,150,105,0.3)',
              opacity: isAutoFilling ? 0.8 : 1
            }}
            title="Fetch reviewed session from SevaDesk bridge and auto-fill all portal fields"
          >
            <Zap size={14} />
            {isAutoFilling ? 'Fetching…' : bridgeStatus === 'filled' ? '✓ Auto-Filled' : '⚡ Auto-Fill from SevaDesk'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            style={{
              backgroundColor: '#374151',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>

          {onBackToWorkspace && (
            <button
              type="button"
              onClick={onBackToWorkspace}
              style={{
                backgroundColor: '#ffffff',
                color: '#0a1a12',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={14} /> SevaDesk Workspace
            </button>
          )}
        </div>
      </div>

      {/* Main Layout Grid */}
      <div style={{ maxWidth: '1380px', margin: '20px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        
        {/* Left Column: Simulated Portal Page */}
        <div>
          {sessionTimedOut ? (
            /* Simulated ASP.NET / NIC 504 Session Timeout Screen */
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              padding: '40px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⏳</div>
              <h2 style={{ fontSize: '1.4rem', color: '#b91c1c', marginBottom: '8px' }}>
                Server Error in '/' Application — Session Has Expired
              </h2>
              <p style={{ color: '#4b5563', fontSize: '0.9rem', maxWidth: '580px', margin: '0 auto 20px' }}>
                Your portal session has timed out due to 15 minutes of inactivity or server gateway timeout (HTTP 504). All unsubmitted form inputs on this page were dropped by the government server.
              </p>
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                padding: '16px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                color: '#991b1b',
                maxWidth: '560px',
                margin: '0 auto 24px',
                textAlign: 'left'
              }}>
                <strong>🧪 Testing SevaDesk 1-Click Session Guard:</strong>
                <ol style={{ paddingLeft: '20px', margin: '6px 0 0' }}>
                  <li>Click <strong>"Restore Portal Page"</strong> below to reload the blank form.</li>
                  <li>Open the <strong>SevaDesk Companion</strong> extension in Chrome.</li>
                  <li>Click <strong>"⚡ Restore Last Session"</strong> to re-inject all reviewed fields instantly without re-typing!</li>
                </ol>
              </div>
              <button
                type="button"
                onClick={() => setSessionTimedOut(false)}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 24px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                🔄 Restore Portal Page (Reload Form)
              </button>
            </div>
          ) : submissionReceipt ? (
            /* Simulated Official Government Acknowledgement Receipt */
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '2px solid #22c55e',
              padding: '36px',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '16px' }}>
                <CheckCircle2 size={36} color="#16a34a" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#166534' }}>
                    {activePortal === 'up-edistrict' 
                      ? 'उत्तर प्रदेश ई-डिस्ट्रिक्ट — आवेदन पावती (Official Acknowledgement)'
                      : 'MahaDBT — Application Submission Receipt'}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Department of Revenue & e-Governance · Govt of {activePortal === 'up-edistrict' ? 'Uttar Pradesh' : 'Maharashtra'}
                  </span>
                </div>
              </div>

              <div style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '16px 20px',
                borderRadius: '6px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>OFFICIAL PORTAL ACKNOWLEDGEMENT NUMBER</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.04em', margin: '4px 0' }}>
                  {submissionReceipt.ref}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#4b5563' }}>
                  Submitted at: {submissionReceipt.date} · Submission Status: <strong>Forwarded to Sub-Divisional Magistrate (SDM) / Tehsildar</strong>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.6, marginBottom: '24px' }}>
                <p>
                  <strong>Next Operator Action:</strong> Copy the official portal reference number above (<code>{submissionReceipt.ref}</code>) into SevaDesk Workspace and mark the application status as <strong>"Submitted"</strong>. This permanently locks the citizen demographic record under legal audit integrity rules.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {onPrintReceipt && (
                  <button
                    type="button"
                    onClick={() => onPrintReceipt(submissionReceipt.ref)}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 20px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>🖨️ Print Citizen Slip</span>
                  </button>
                )}

                {nextBurstApp && onAdvanceBurst && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (onRecordSubmission) {
                        try {
                          await onRecordSubmission(submissionReceipt.ref);
                        } catch (err) {
                          console.warn('Error recording submission:', err);
                        }
                      }
                      await onAdvanceBurst();
                    }}
                    style={{
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 20px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 4px rgba(124, 58, 237, 0.3)'
                    }}
                  >
                    <span>⚡ Submit Next in Queue: {nextBurstApp.citizenName} ({nextBurstApp.serviceName}) →</span>
                  </button>
                )}

                {onBackToWorkspace && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ackData = {
                        type: 'SEVA_ACK_DETECTED',
                        ref: submissionReceipt.ref,
                        date: submissionReceipt.date,
                        portal: activePortal
                      };
                      try {
                        window.postMessage(ackData, '*');
                        localStorage.setItem('seva_last_portal_ack', JSON.stringify({
                          ref: submissionReceipt.ref,
                          date: submissionReceipt.date,
                          portal: activePortal,
                          timestamp: Date.now()
                        }));
                      } catch {}

                      if (onRecordSubmission) {
                        try {
                          await onRecordSubmission(submissionReceipt.ref);
                        } catch (err) {
                          console.warn('Error recording submission:', err);
                        }
                      }

                      if (onBackToWorkspace) {
                        onBackToWorkspace();
                      }
                    }}
                    style={{
                      backgroundColor: '#22c55e',
                      color: '#052e16',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 20px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>⚡ Relay Reference & Close Case in Workspace ({submissionReceipt.ref})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Process Another Case
                </button>
              </div>
            </div>
          ) : (
            /* Active Simulated Government Form */
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}>
              {/* Government Portal Official Masthead */}
              <div style={{
                backgroundColor: activePortal === 'up-edistrict' ? '#881337' : '#1e3a8a',
                color: '#ffffff',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '4px solid #f59e0b'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    color: activePortal === 'up-edistrict' ? '#881337' : '#1e3a8a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    fontWeight: 900,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    🏛️
                  </div>
                  <div>
                    <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.02em' }}>
                      {activePortal === 'up-edistrict'
                        ? 'ई-डिस्ट्रिक्ट उत्तर प्रदेश / eDistrict Uttar Pradesh'
                        : 'आपले सरकार महाडीबीटी / MahaDBT Portal'}
                    </h1>
                    <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                      {activePortal === 'up-edistrict'
                        ? 'Centre for e-Governance, Government of Uttar Pradesh (edistrict.up.gov.in)'
                        : 'Direct Benefit Transfer Portal, Government of Maharashtra (mahadbt.maharashtra.gov.in)'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.72rem', opacity: 0.85 }}>
                  <div>National Informatics Centre (NIC)</div>
                  <div>Secure Session · 256-bit SSL</div>
                </div>
              </div>

              {/* Form Title & Instruction Banner */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fcfcfd' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
                      {activePortal === 'up-edistrict'
                        ? 'आय प्रमाण पत्र हेतु आवेदन पत्र (Application Form for Income Certificate)'
                        : 'Post-Matric Scholarship / Welfare Scheme Application Form'}
                    </h2>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      कृपया सभी अनिवार्य विवरण ध्यानपूर्वक भरें (Please fill all mandatory fields accurately)
                    </span>
                  </div>
                  <span style={{
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}>
                    Service Code: {activePortal === 'up-edistrict' ? 'REV-INC-01' : 'SW-PMS-04'}
                  </span>
                </div>
              </div>

              {/* On-Screen Error Banner (If Triggered) */}
              {activeErrorBanner && (
                <div 
                  className="alert alert-danger error" 
                  role="alert"
                  style={{
                    margin: '16px 24px 0',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #f87171',
                    color: '#991b1b',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <span id="lblError" className="error-message">
                      <strong>Portal Error: </strong>{activeErrorBanner}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveErrorBanner(null)}
                    style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Government Form Content */}
              <form 
                id="aspnetForm" 
                onSubmit={handleSubmit}
                onChange={handleFormChange}
                style={{ padding: '24px' }}
              >
                {activePortal === 'up-edistrict' ? (
                  /* UP e-District Form Fields (Matches up-edistrict-v1 declarative adapter) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Row 1: Applicant Name & DOB */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label 
                          htmlFor="txtApplicantNameEng" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          1. आवेदक का नाम (अंग्रेजी में) / Applicant Name (English) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtApplicantNameEng"
                          name="txtNameEng"
                          className="form-control"
                          placeholder="Full Name as in Aadhaar"
                          value={formValues['txtApplicantNameEng'] ?? formValues['txtNameEng'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtApplicantNameEng: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtApplicantNameEng') || injectedFields.has('txtNameEng') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtApplicantNameEng') || injectedFields.has('txtNameEng') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none',
                            transition: 'all 0.2s ease'
                          }}
                        />
                        {injectedFields.has('txtApplicantNameEng') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label 
                          htmlFor="txtDOB" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          2. जन्म तिथि / Date of Birth (DD/MM/YYYY) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtDOB"
                          name="txtDOB"
                          placeholder="DD/MM/YYYY"
                          value={formValues['txtDOB'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtDOB: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtDOB') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtDOB') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                        {injectedFields.has('txtDOB') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Gender & Mobile */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label 
                          htmlFor="ddlGender" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          3. लिंग / Gender <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <select
                          id="ddlGender"
                          name="ddlGender"
                          value={formValues['ddlGender'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, ddlGender: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('ddlGender') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('ddlGender') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        >
                          <option value="">-- चुनें (Select Gender) --</option>
                          <option value="Male">पुरुष (Male)</option>
                          <option value="Female">महिला (Female)</option>
                          <option value="Transgender">अन्य (Transgender)</option>
                        </select>
                        {injectedFields.has('ddlGender') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label 
                          htmlFor="txtMobile" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          4. मोबाइल नंबर / Mobile Number <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="tel"
                          id="txtMobile"
                          name="txtMobile"
                          maxLength={10}
                          placeholder="10 digit mobile number"
                          value={formValues['txtMobile'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtMobile: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtMobile') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtMobile') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                        {injectedFields.has('txtMobile') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>
                    </div>

                    {/* Row 3: Permanent Address */}
                    <div className="form-group">
                      <label 
                        htmlFor="txtAddressPermanent" 
                        style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                      >
                        5. स्थायी पता (मकान नंबर, मोहल्ला / ग्राम, पोस्ट) / Permanent Address <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <textarea
                        id="txtAddressPermanent"
                        name="txtAddress"
                        rows={2}
                        placeholder="Village / Town, Post Office, Tehsil"
                        value={formValues['txtAddressPermanent'] ?? formValues['txtAddress'] ?? ''}
                        onChange={e => setFormValues(p => ({ ...p, txtAddressPermanent: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '4px',
                          border: `1px solid ${injectedFields.has('txtAddressPermanent') || injectedFields.has('txtAddress') ? '#22c55e' : '#cbd5e1'}`,
                          backgroundColor: injectedFields.has('txtAddressPermanent') || injectedFields.has('txtAddress') ? '#f0fdf4' : '#ffffff',
                          fontSize: '0.9rem',
                          outline: 'none'
                        }}
                      />
                      {injectedFields.has('txtAddressPermanent') && (
                        <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                      )}
                    </div>

                    {/* Row 4: District & PIN Code */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label 
                          htmlFor="ddlDistrict" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          6. जनपद / District <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <select
                          id="ddlDistrict"
                          name="ddlDistrict"
                          value={formValues['ddlDistrict'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, ddlDistrict: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('ddlDistrict') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('ddlDistrict') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        >
                          <option value="">-- जनपद चुनें (Select District) --</option>
                          <option value="Meerut">मेरठ (Meerut)</option>
                          <option value="Lucknow">लखनऊ (Lucknow)</option>
                          <option value="Varanasi">वाराणसी (Varanasi)</option>
                          <option value="Agra">आगरा (Agra)</option>
                          <option value="Kanpur">कानपुर नगर (Kanpur)</option>
                          <option value="Ghaziabad">गाजियाबाद (Ghaziabad)</option>
                        </select>
                        {injectedFields.has('ddlDistrict') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label 
                          htmlFor="txtPin" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          7. पिन कोड / PIN Code <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtPin"
                          name="txtPinCode"
                          maxLength={6}
                          placeholder="6-digit PIN"
                          value={formValues['txtPin'] ?? formValues['txtPinCode'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtPin: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtPin') || injectedFields.has('txtPinCode') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtPin') || injectedFields.has('txtPinCode') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                        {injectedFields.has('txtPin') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>
                    </div>

                    {/* Row 5: Ration Card & Masked Aadhaar */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label 
                          htmlFor="txtRationCard" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          8. राशन कार्ड संख्या / Ration Card ID (Optional)
                        </label>
                        <input
                          type="text"
                          id="txtRationCard"
                          name="txtRationCard"
                          placeholder="Family Ration Card Number"
                          value={formValues['txtRationCard'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtRationCard: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtRationCard') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtRationCard') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                        {injectedFields.has('txtRationCard') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label 
                          htmlFor="txtAadhaarNumber" 
                          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}
                        >
                          9. आधार संख्या / Aadhaar Number (12 digits)
                        </label>
                        <input
                          type="text"
                          id="txtAadhaarNumber"
                          name="txtAadhaar"
                          maxLength={12}
                          placeholder="Aadhaar Number (Verhoeff Verified)"
                          value={formValues['txtAadhaarNumber'] ?? formValues['txtAadhaar'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtAadhaarNumber: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '4px',
                            border: `1px solid ${injectedFields.has('txtAadhaarNumber') || injectedFields.has('txtAadhaar') ? '#22c55e' : '#cbd5e1'}`,
                            backgroundColor: injectedFields.has('txtAadhaarNumber') || injectedFields.has('txtAadhaar') ? '#f0fdf4' : '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                        {injectedFields.has('txtAadhaarNumber') && (
                          <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ Injected by SevaDesk</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* MahaDBT Form Fields (Matches mahadbt-post-matric-v1 declarative adapter) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label htmlFor="txtApplicantName" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Applicant Full Name <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtApplicantName"
                          name="ApplicantName"
                          placeholder="Name as per Aadhaar"
                          value={formValues['txtApplicantName'] ?? formValues['ApplicantName'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtApplicantName: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="txtDOB" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Date of Birth (DD/MM/YYYY) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtDOB"
                          name="DOB"
                          placeholder="DD/MM/YYYY"
                          value={formValues['txtDOB'] ?? formValues['DOB'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtDOB: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label htmlFor="ddlGender" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Gender <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <select
                          id="ddlGender"
                          name="Gender"
                          value={formValues['ddlGender'] ?? formValues['Gender'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, ddlGender: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="">-- Select Gender --</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="txtMobileNumber" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Mobile Number <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="tel"
                          id="txtMobileNumber"
                          name="MobileNo"
                          placeholder="10 digit mobile"
                          value={formValues['txtMobileNumber'] ?? formValues['MobileNo'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtMobileNumber: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="txtAddress" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                        Permanent Residential Address <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <textarea
                        id="txtAddress"
                        name="Address"
                        rows={2}
                        placeholder="Address"
                        value={formValues['txtAddress'] ?? formValues['Address'] ?? ''}
                        onChange={e => setFormValues(p => ({ ...p, txtAddress: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label htmlFor="txtAccountNumber" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Bank Account Number <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtAccountNumber"
                          name="BankAccount"
                          placeholder="Bank Account Number"
                          value={formValues['txtAccountNumber'] ?? formValues['BankAccount'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtAccountNumber: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="txtIFSCCode" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                          Bank IFSC Code <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="txtIFSCCode"
                          name="IFSC"
                          placeholder="IFSC Code (e.g. HDFC0001234)"
                          value={formValues['txtIFSCCode'] ?? formValues['IFSC'] ?? ''}
                          onChange={e => setFormValues(p => ({ ...p, txtIFSCCode: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Official Government Document Upload Section (Matching UP e-District & MahaDBT) */}
                <div style={{
                  marginTop: '24px',
                  padding: '18px 20px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
                        संलग्नक शीर्षक व दस्तावेज़ अपलोड (Mandatory Document Uploads)
                      </h3>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        पोर्टल सीमा: फ़ोटो ≤ 20KB, अन्य दस्तावेज़ ≤ 100KB (Portal limits: Photo ≤ 20KB, Documents ≤ 100KB)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleQuickAttachPreOptimized}
                      style={{
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      title="Simulate attaching SevaDesk's pre-optimized < 100 KB files in 1 click"
                    >
                      <Zap size={13} />
                      <span>⚡ Quick-Attach SevaDesk Pre-Optimized Docs</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr auto', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <label htmlFor="ddlDocType" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        संलग्नक शीर्षक (Document Type) <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <select
                        id="ddlDocType"
                        value={selectedDocType}
                        onChange={e => setSelectedDocType(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      >
                        <option value="फ़ोटो (Applicant Photograph)">फ़ोटो (Photograph) [≤ 20KB]</option>
                        <option value="स्वप्रमाणित घोषणा पत्र (Self-Declaration)">स्वप्रमाणित घोषणा पत्र (Self-Declaration) [≤ 100KB]</option>
                        <option value="राशन कार्ड की छायाप्रति (Ration Card Copy)">राशन कार्ड की छायाप्रति (Ration Card) [≤ 100KB]</option>
                        <option value="वेतन पर्ची / आय प्रमाण पत्र (Income Proof)">वेतन पर्ची / आय प्रमाण पत्र (Income Certificate) [≤ 100KB]</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="fileUpload" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        दस्तावेज़ चुनें (Choose File) <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="file"
                        id="fileUpload"
                        name="fileUpload"
                        accept=".jpg,.jpeg,.pdf"
                        onChange={e => setPendingUploadFile(e.target.files?.[0] || null)}
                        style={{ width: '100%', padding: '6px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div style={{ alignSelf: 'flex-end' }}>
                      <button
                        type="button"
                        id="btnUploadDoc"
                        onClick={handleUploadDocument}
                        style={{
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '9px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        अपलोड करें (Attach)
                      </button>
                    </div>
                  </div>

                  {/* Pre-Staged Documents Presentation Banner */}
                  {attachedDocs.length > 0 && (
                    <div style={{
                      marginBottom: '12px',
                      padding: '10px 14px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.82rem',
                      color: '#166534'
                    }}>
                      <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>{attachedDocs.length} Document(s) Pre-Staged & Auto-Attached:</strong>
                        <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '2px' }}>
                          Physical files attached in SevaDesk have been pre-compressed, validated under official portal limits, and mapped to portal upload slots. No manual re-upload needed.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Attached Documents Table */}
                  {attachedDocs.length > 0 ? (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                            <th style={{ padding: '8px 12px' }}>संलग्नक (Title)</th>
                            <th style={{ padding: '8px 12px' }}>फ़ाइल का नाम (File)</th>
                            <th style={{ padding: '8px 12px' }}>साइज़ (Size)</th>
                            <th style={{ padding: '8px 12px' }}>स्थिति (Portal Status)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attachedDocs.map(doc => (
                            <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{doc.title}</td>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{doc.filename}</td>
                              <td style={{ padding: '8px 12px' }}>{doc.sizeKB} KB</td>
                              <td style={{ padding: '8px 12px', color: '#16a34a', fontWeight: 700 }}>✓ Attached to portal</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                      No documents attached yet. Attach your pre-optimized scans or click "Quick-Attach".
                    </div>
                  )}
                </div>

                {/* Protected Section: Human-in-the-Loop CAPTCHA & Final Submission */}
                <div style={{
                  marginTop: '28px',
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  border: '1px dashed #94a3b8',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Lock size={16} color="#475569" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                      Human Verification Checkpoint (Protected: SevaDesk Companion Strictly Disallows Automation)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      letterSpacing: '0.25em',
                      fontWeight: 800,
                      userSelect: 'none',
                      textDecoration: 'line-through'
                    }}>
                      7492
                    </div>

                    <div style={{ flex: '1 1 200px', maxWidth: '240px' }}>
                      <input
                        type="text"
                        id="txtCaptcha"
                        name="txtCaptcha"
                        className="captcha-input"
                        placeholder="Enter CAPTCHA"
                        maxLength={6}
                        value={captchaInput}
                        onChange={e => setCaptchaInput(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '4px',
                          border: '2px solid #64748b',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      id="btnSubmit"
                      style={{
                        backgroundColor: '#15803d',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '11px 24px',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    >
                      <span>सुरक्षित करें (Submit Application)</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right Column: Live Event Log & Diagnostic Feedback */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quick Step Guide */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={16} color="#16a34a" /> Test Flow Walkthrough
            </h3>
            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.5 }}>
              <li>In SevaDesk, pass Preflight and click <strong>"Send to Companion"</strong>.</li>
              <li>Keep this tab active and click the <strong>SevaDesk Companion</strong> icon in Chrome toolbar.</li>
              <li>Notice the extension instantly loads data via loopback bridge (Zero clipboard leak).</li>
              <li>Click <strong>"⚡ Fast-Burst Reviewed Fields"</strong> to inject all 8 fields in &lt; 150ms!</li>
              <li>Click <strong>"504 Timeout"</strong> above to test 1-Click Timeout recovery.</li>
              <li>Enter CAPTCHA <code>7492</code> and click Submit to generate portal receipt.</li>
            </ol>
          </div>

          {/* Real-Time DOM Event Inspector */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '440px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                Live DOM Event Feed
              </h3>
              <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>
                {injectedFields.size} fields filled
              </span>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              color: '#94a3b8',
              lineHeight: 1.4
            }}>
              {eventLog.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>Listening for synthetic DOM events...</div>
              ) : (
                eventLog.map((log, i) => (
                  <div key={i} style={{ marginBottom: '6px', color: log.type === 'fill' ? '#4ade80' : log.type === 'warn' ? '#fbbf24' : '#94a3b8' }}>
                    <span style={{ color: '#64748b' }}>[{log.time}]</span> {log.msg}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Safety Guarantees Callout */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '14px',
            fontSize: '0.75rem',
            color: '#475569'
          }}>
            <strong style={{ display: 'block', color: '#1e293b', marginBottom: '4px' }}>
              DPDP Act & Kiosk Security Policy:
            </strong>
            Companion strictly excludes password, CAPTCHA, and final submit buttons. Operator retains full agency and oversight over government submissions.
          </div>
        </div>

      </div>
    </div>
  );
};
