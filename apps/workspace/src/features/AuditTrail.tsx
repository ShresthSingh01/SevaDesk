import React, { useState } from 'react';
import { Download, ScrollText, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AuditEvent } from '@sevadesk/core-types';
import { verifyAuditLedger } from '../lib/api';

interface AuditTrailProps {
  events: AuditEvent[];
  onExportCsv: () => void;
}

export const AuditTrail: React.FC<AuditTrailProps> = ({ events, onExportCsv }) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{ valid: boolean; count?: number; chainHead?: string; error?: string } | null>(null);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await verifyAuditLedger();
      setVerifyStatus(res);
    } catch {
      setVerifyStatus({ valid: false, error: 'Could not connect to Local Core for verification.' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            ACCOUNTABILITY & LOCAL INTEGRITY
          </div>
          <h1>Audit trail</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Local event history for case workflow and operator actions. Sensitive identity values are never logged.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={handleVerifyChain} disabled={verifying}>
            <ShieldCheck size={16} /> {verifying ? 'Verifying...' : 'Verify Cryptographic Chain'}
          </button>
          <button className="btn btn-secondary" onClick={onExportCsv}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {verifyStatus && (
        <div style={{
          marginBottom: '20px',
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: verifyStatus.valid ? 'rgba(82, 183, 136, 0.15)' : 'rgba(239, 71, 111, 0.15)',
          border: `1px solid ${verifyStatus.valid ? 'var(--primary)' : 'var(--danger)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          {verifyStatus.valid ? (
            <CheckCircle2 size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          )}
          <div>
            <strong style={{ color: verifyStatus.valid ? 'var(--primary)' : 'var(--danger)', fontSize: '0.95rem' }}>
              {verifyStatus.valid ? 'Cryptographic Non-Repudiation Verified' : 'Cryptographic Chain Verification Failed'}
            </strong>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {verifyStatus.valid
                ? `SHA-256 Merkle chain verified across ${verifyStatus.count} events. Chain head: ${verifyStatus.chainHead?.slice(0, 16)}...`
                : (verifyStatus.error || 'Tampered or broken hash links detected.')}
            </p>
          </div>
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Activity log</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {events.length} event(s) recorded in local vault · newest first
            </p>
          </div>
          <span className="status-pill good">SHA-256 Hash-Chained</span>
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
            <ScrollText size={32} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
            <strong>No audit events yet</strong>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Actions such as citizen saves and preflight checks will appear here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Description</th>
                  <th>Entity</th>
                  <th>Event ID</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(ev.timestamp).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td>
                      <span className="status-pill neutral">
                        {ev.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{ev.description}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {ev.entityType} ({ev.entityId})
                    </td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                      {ev.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          marginTop: '24px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-subtle)',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <ShieldCheck size={16} color="var(--primary)" />
          <span>
            <strong>Zero PII Logging Guarantee:</strong> Aadhaar numbers, bank account numbers, and document photos are strictly prohibited from event descriptions to guarantee DPDP Act compliance.
          </span>
        </div>
      </section>
    </div>
  );
};
