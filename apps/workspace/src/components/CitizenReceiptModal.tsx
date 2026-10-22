import React, { useState } from 'react';
import { 
  Printer, 
  Volume2, 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  ExternalLink,
  Clock,
  IndianRupee,
  Building,
  User,
  FileCheck
} from 'lucide-react';
import { Application, Citizen, ServiceDefinition, formatINR, maskIdentifier } from '@sevadesk/core-types';
import { playFeeSpeech } from '../lib/speech';

export interface CitizenReceiptModalProps {
  application: Application;
  citizen?: Citizen;
  service?: ServiceDefinition;
  operatorName: string;
  centreName: string;
  audioLang?: string;
  onClose: () => void;
  onMarkFeeCollected?: (appId: string) => void;
  onUpdateFeeStatus?: (status: 'pending' | 'collected') => void;
}

export const CitizenReceiptModal: React.FC<CitizenReceiptModalProps> = ({
  application,
  citizen,
  service,
  operatorName,
  centreName,
  audioLang = 'hi-IN',
  onClose,
  onMarkFeeCollected,
  onUpdateFeeStatus
}) => {
  const [speechLoading, setSpeechLoading] = useState(false);

  const officialFee = service?.officialFee ?? 0;
  const operatorCharge = service?.operatorCharge ?? 0;
  const totalFee = officialFee + operatorCharge;

  const isFeeCollected = application.feeStatus === 'collected';
  const receiptNo = application.feeReceiptNo || `REC-${application.id.slice(-6)}`;
  const formattedDate = new Date(application.updatedAt || application.createdAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleSpeak = async () => {
    if (!service) return;
    setSpeechLoading(true);
    try {
      await playFeeSpeech(service.name, officialFee, operatorCharge, audioLang);
    } catch (err) {
      console.warn('Speech playback failed:', err);
    } finally {
      setSpeechLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 150 }}>
      <div className="modal-content" style={{ maxWidth: '640px', padding: 0, overflow: 'hidden' }}>
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCheck size={18} color="var(--primary)" />
            <strong style={{ fontSize: '0.92rem' }}>Official Citizen Acknowledgement & Cash Receipt</strong>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSpeak}
              disabled={speechLoading}
              title="Speak fee amount in regional language"
              style={{ fontSize: '0.8rem', padding: '5px 10px' }}
            >
              <Volume2 size={14} />
              <span>{speechLoading ? 'Playing…' : 'Spoken Audio'}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{ fontSize: '0.8rem', padding: '5px 12px', fontWeight: 700 }}
            >
              <Printer size={14} />
              <span>Print Slip (Ctrl+P)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              title="Close receipt preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Physical Slip Area */}
        <div id="printable-citizen-receipt" style={{
          padding: '24px 28px',
          backgroundColor: '#ffffff',
          color: '#1f2937',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.45
        }}>
          
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px dashed #9ca3af', paddingBottom: '14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase' }}>
              Citizen Service Centre · नागरिक सेवा पावती एवं शुल्क रसीद
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 2px', color: '#111827' }}>
              {centreName || 'Common Service Centre (CSC)'}
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
              Operator: <strong>{operatorName || 'Authorized VLE'}</strong> · Receipt No: <strong style={{ fontFamily: 'monospace' }}>{receiptNo}</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              Date & Time: {formattedDate}
            </div>
          </div>

          {/* Citizen Particulars */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '12px 14px', marginBottom: '14px', border: '1px solid #e5e7eb', fontSize: '0.82rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block' }}>Applicant Name:</span>
                <strong style={{ fontSize: '0.9rem', color: '#111827' }}>{citizen?.fullName || 'Beneficiary'}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block' }}>Mobile / Contact:</span>
                <strong>{citizen?.mobile || 'Not specified'}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block' }}>Identity (Masked ID):</span>
                <strong style={{ fontFamily: 'monospace' }}>{citizen?.aadhaar ? maskIdentifier(citizen.aadhaar) : (citizen?.voterId || 'On Record')}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block' }}>Location:</span>
                <span>{citizen?.district ? `${citizen.district}, ${citizen.state || 'UP'}` : (citizen?.state || 'Local Tehsil')}</span>
              </div>
            </div>
          </div>

          {/* Service & Portal Acknowledgement */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px 14px', marginBottom: '16px', backgroundColor: '#fcfcfc' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '6px' }}>
              Application Particulars
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46', marginBottom: '4px' }}>
              {service?.name || 'Government Scheme / Service'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#4b5563', marginBottom: '8px' }}>
              Department: {service?.department || 'State e-District / DBT Portal'}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: '#047857', display: 'block', fontWeight: 600 }}>Official Portal Acknowledgement No:</span>
                <strong style={{ fontSize: '1.05rem', color: '#065f46', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  {application.receiptRef || 'SUBMISSION-IN-PROGRESS'}
                </strong>
              </div>
              <span className="status-pill good" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                ● {application.status.toUpperCase()}
              </span>
            </div>

            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={12} />
              <span>Standard Resolution Timeline: <strong>15 Working Days</strong> (Subject to Tehsil / Officer verification)</span>
            </div>
          </div>

          {/* Transparent Fee Breakdown */}
          <div style={{ borderTop: '2px dashed #9ca3af', paddingTop: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
              Statutory Fee & Service Charge Breakdown
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0' }}>
              <span>Official Government Portal Statutory Fee:</span>
              <strong>{formatINR(officialFee)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0' }}>
              <span>CSC Operator Service Charge (Scanning & Handoff):</span>
              <strong>{formatINR(operatorCharge)}</strong>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '1.05rem',
              fontWeight: 800,
              padding: '8px 0 4px',
              borderTop: '1px solid #111827',
              marginTop: '4px',
              color: '#111827'
            }}>
              <span>Total Amount Paid by Citizen:</span>
              <span style={{ color: '#065f46' }}>{formatINR(totalFee)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                Payment Mode: <strong>Cash (INR)</strong>
              </div>
              <div>
                {isFeeCollected ? (
                  <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> ✓ Cash Payment Received
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>Payment Pending</span>
                    {(onUpdateFeeStatus || onMarkFeeCollected) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs no-print"
                        onClick={() => {
                          if (onUpdateFeeStatus) {
                            onUpdateFeeStatus('collected');
                          } else if (onMarkFeeCollected) {
                            onMarkFeeCollected(application.id);
                          }
                        }}
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Record Cash Received ({formatINR(totalFee)})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
            <p style={{ margin: 0 }}>
              This is a computer-generated acknowledgement receipt for citizen records under DPDP Act & CSC transparency norms.
            </p>
            <p style={{ margin: '2px 0 0' }}>
              Track application status on official portal: <strong>{service?.portalUrl ? new URL(service.portalUrl).hostname : 'edistrict.up.gov.in'}</strong>
            </p>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden when printing) */}
        <div className="no-print" style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Case ID: {application.id} · DPDP Audit Logged
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close Preview
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint} style={{ fontWeight: 700 }}>
              <Printer size={15} /> Print Physical Receipt Slip
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
