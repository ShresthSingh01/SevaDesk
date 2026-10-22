import React from 'react';
import { 
  Globe, 
  ExternalLink, 
  X, 
  Zap, 
  CheckCircle2, 
  ShieldCheck, 
  Laptop,
  ArrowRight
} from 'lucide-react';
import { Application, Citizen, ServiceDefinition } from '@sevadesk/core-types';

export interface PortalHandoffModalProps {
  application: Application;
  citizen?: Citizen;
  service?: ServiceDefinition;
  onLaunchSimulator: () => void;
  onOpenLivePortal?: () => void;
  onClose: () => void;
}

export const PortalHandoffModal: React.FC<PortalHandoffModalProps> = ({
  application,
  citizen,
  service,
  onLaunchSimulator,
  onOpenLivePortal,
  onClose
}) => {
  const portalHostname = service?.portalUrl ? new URL(service.portalUrl).hostname : 'Official State Portal';

  const handleOpenLive = () => {
    if (onOpenLivePortal) {
      onOpenLivePortal();
    } else if (service?.portalUrl) {
      window.open(service.portalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 140 }}>
      <div className="modal-content" style={{ maxWidth: '620px', padding: 0, overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div className="overline" style={{ margin: 0 }}>
              <Zap size={14} /> PORTAL DISPATCH & HANDOFF
            </div>
            <h2 style={{ fontSize: '1.2rem', margin: '4px 0 0' }}>Launch Application on State Portal</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Case Info Summary */}
        <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong style={{ fontSize: '1rem', color: 'var(--text-main)', display: 'block' }}>
                {service?.name || 'Service Scheme'}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Applicant: <strong>{citizen?.fullName || 'Citizen'}</strong> ({citizen?.mobile || 'No phone'}) · Case: {application.id}
              </span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--status-good)', backgroundColor: 'var(--status-good-bg)', padding: '4px 10px', borderRadius: 'var(--radius-full)' }}>
              <CheckCircle2 size={13} />
              <span>Bridge Payload Staged (&lt;150ms Ready)</span>
            </div>
          </div>
        </div>

        {/* Options Grid */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Option 1: Live Official Government Portal */}
          <div style={{
            border: '2px solid var(--primary-border)',
            borderRadius: 'var(--radius-md)',
            padding: '18px 20px',
            backgroundColor: 'var(--primary-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transition: 'border-color 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Globe size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    Live Official Government Portal ({portalHostname})
                  </strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
                    Recommended for real citizen submissions
                  </div>
                </div>
              </div>
              <span className="status-pill good" style={{ fontSize: '0.7rem' }}>Official Website</span>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
              The payload is queued in your local SevaDesk Bridge. Open <strong>{portalHostname}</strong> in Google Chrome; click the <strong>SevaDesk Companion Extension</strong> icon in the browser toolbar to burst-inject all form fields and attachments in under 150ms.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenLive}
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <span>Open {portalHostname}</span>
                <ExternalLink size={15} />
              </button>
            </div>
          </div>

          {/* Option 2: Built-in Offline Portal Simulator */}
          <div style={{
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Laptop size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                    Built-in Offline Portal Simulator
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Sandbox testing & demonstration (No internet required)
                  </div>
                </div>
              </div>
              <span className="status-pill draft" style={{ fontSize: '0.7rem' }}>Offline Practice</span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
              Test form auto-fill, inspect mapped fields, review pre-staged documents, and practice capturing acknowledgement receipts inside SevaDesk's offline simulator.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onLaunchSimulator}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>Launch Offline Simulator</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Zero-Clipboard IPC: PII protected under DPDP Act
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};
