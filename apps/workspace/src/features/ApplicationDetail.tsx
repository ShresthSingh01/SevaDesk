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
  RefreshCw
} from 'lucide-react';
import { 
  Application, 
  Citizen, 
  ServiceDefinition, 
  FIELD_LABELS, 
  maskIdentifier, 
  validateCase, 
  interpretPortalError,
  buildApplicationPayload
} from '@sevadesk/core-types';
import { requestPortalErrorInterpretation, pushBridgeSession, checkPortalHealth, PortalHealthStatus } from '../lib/api';
import { optimizeImageForPortal, formatBytes } from '../lib/imageCompressor';

interface ApplicationDetailProps {
  application: Application;
  citizen: Citizen | undefined;
  service: ServiceDefinition | undefined;
  onBack: () => void;
  onEditCitizen: (citizenId: string) => void;
  onUpdateStatus: (appId: string, status: string, ref?: string, note?: string) => Promise<void>;
  onSavePreflight: (appId: string, snapshot: any) => Promise<void>;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ApplicationDetail: React.FC<ApplicationDetailProps> = ({
  application,
  citizen,
  service,
  onBack,
  onEditCitizen,
  onUpdateStatus,
  onSavePreflight,
  onShowToast
}) => {
  const [testFiles, setTestFiles] = useState<Array<{ name: string; size: number; type: string }>>([]);
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
  };

  const handleDispatchToCompanion = async () => {
    if (!citizen || !service) return;
    if (!application.preflight?.valid) {
      onShowToast('Run and pass preflight validation before sending to companion.', 'error');
      return;
    }
    const payload = buildApplicationPayload(application, citizen, service);
    try {
      // 1. Direct Loopback IPC Bridge (Zero OS Clipboard PII Exposure)
      await pushBridgeSession(payload);
      // 2. Also populate clipboard as secondary offline fallback
      try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); } catch {}
      onShowToast('Dispatched to SevaDesk Companion! Open extension puzzle icon on portal.');
    } catch {
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        onShowToast('Dispatched to clipboard (Local daemon offline). Paste into companion.');
      } catch {
        onShowToast('Could not access clipboard or IPC bridge.', 'error');
      }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || []);
    setRawFiles(raw);
    const files = raw.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    }));
    setTestFiles(files);
    setOptimizationNote(null);
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

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
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
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Case ID: {application.id} · Created {new Date(application.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleDispatchToCompanion}
            disabled={!application.preflight?.valid}
            title={!application.preflight?.valid ? 'Pass preflight first' : 'Dispatch payload to companion extension'}
          >
            <Send size={16} /> Send to Companion
          </button>
          <button className="btn btn-primary" onClick={() => setShowStatusModal(true)}>
            Update status
          </button>
        </div>
      </div>

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
                  <button className="btn btn-secondary btn-xs" onClick={() => onEditCitizen(citizen.id)}>
                    Edit citizen record
                  </button>
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

            <button className="btn btn-primary btn-sm" onClick={handleRunPreflight} style={{ width: '100%' }}>
              Run preflight validation check
            </button>

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

            <div style={{ marginBottom: '12px' }}>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="form-control"
                style={{ fontSize: '0.8rem' }}
              />
            </div>

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
                  <option value="draft">Draft</option>
                  <option value="needs_correction">Needs correction</option>
                  <option value="ready">Ready for review</option>
                  <option value="in_portal">In portal</option>
                  <option value="submitted">Submitted on official portal</option>
                  <option value="rejected">Rejected / returned by portal</option>
                  <option value="closed">Closed</option>
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
    </div>
  );
};
