import React, { useState } from 'react';
import { 
  Volume2, 
  Printer, 
  Monitor, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { ServiceDefinition, Application, Citizen, formatINR } from '@sevadesk/core-types';
import { playFeeSpeech } from '../lib/speech';

interface FeeTransparencyProps {
  services: ServiceDefinition[];
  applications: Application[];
  citizens: Citizen[];
  selectedServiceId: string;
  selectedApplicationId: string;
  onSelectService: (id: string) => void;
  onSelectApplication: (id: string) => void;
  onOpenCitizenDisplay: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  daemonConnected: boolean;
}

export const FeeTransparency: React.FC<FeeTransparencyProps> = ({
  services,
  applications,
  citizens,
  selectedServiceId,
  selectedApplicationId,
  onSelectService,
  onSelectApplication,
  onOpenCitizenDisplay,
  onShowToast,
  daemonConnected
}) => {
  const [audioLang, setAudioLang] = useState('hi-IN');
  const [audioLoading, setAudioLoading] = useState(false);

  const service = services.find(s => s.id === selectedServiceId) || services[0];
  const application = applications.find(a => a.id === selectedApplicationId);
  const citizen = application ? citizens.find(c => c.id === application.citizenId) : null;

  const officialFee = service?.officialFee;
  const operatorCharge = service?.operatorCharge;
  const total = officialFee !== null && officialFee !== undefined && operatorCharge !== null && operatorCharge !== undefined
    ? Number(officialFee) + Number(operatorCharge)
    : null;

  const isVerified = service?.officialFee !== null && service?.operatorCharge !== null && Boolean(service?.feeSourceUrl) && Boolean(service?.feeVerifiedAt);

  const handleSpeakFees = async () => {
    if (!service) return;
    setAudioLoading(true);

    try {
      await playFeeSpeech(service.name, officialFee, operatorCharge, audioLang);
    } catch {
      onShowToast('Audio readout error. Please show on-screen disclosure.', 'error');
    } finally {
      setAudioLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!services.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>₹</div>
        <h2>No services configured yet</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          Configure a real service and its official fee before displaying fee disclosures.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            CITIZEN VISIBILITY & TRUST
          </div>
          <h1>Fee transparency</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Show official government fees and operator service charges separately. Never combine or guess fee amounts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }} className="no-print">
          <button className="btn btn-secondary" onClick={onOpenCitizenDisplay}>
            <Monitor size={16} /> Open citizen display
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: The Receipt / Disclosure Slip */}
        <div className="panel">
          <div className="panel-header no-print">
            <div>
              <h2>Citizen-facing fee disclosure</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choose service and optional case</p>
            </div>
            {isVerified ? (
              <span className="status-pill good">
                <CheckCircle2 size={12} /> Verified Source
              </span>
            ) : (
              <span className="status-pill warn">
                <AlertTriangle size={12} /> Needs Verification
              </span>
            )}
          </div>

          {/* Service & Case Selector */}
          <div className="form-grid no-print" style={{ marginBottom: '20px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="feeServiceSelect">Service</label>
              <select
                id="feeServiceSelect"
                className="form-control"
                value={service.id}
                onChange={e => onSelectService(e.target.value)}
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="feeAppSelect">Citizen / Application (Optional)</label>
              <select
                id="feeAppSelect"
                className="form-control"
                value={selectedApplicationId}
                onChange={e => onSelectApplication(e.target.value)}
              >
                <option value="">Public Display Only</option>
                {applications.map(a => {
                  const c = citizens.find(cit => cit.id === a.citizenId);
                  return (
                    <option key={a.id} value={a.id}>
                      {c?.fullName || 'Citizen'} · {a.id}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Formatted Disclosure Slip */}
          <div style={{
            border: '2px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            backgroundColor: 'var(--bg-surface)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px',
                fontWeight: 700
              }}>S</div>
              <strong style={{ fontSize: '1.2rem', display: 'block' }}>Fee Disclosure & Transparency Slip</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assisted Application Preparation</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Applicant:</span>
                <strong>{citizen?.fullName || 'Walk-in Citizen'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Service name:</span>
                <strong>{service.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Department:</span>
                <span>{service.department || 'State Government'}</span>
              </div>

              <div style={{ margin: '8px 0', borderTop: '1px dashed var(--border-strong)' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>1. Government / Portal Fee:</span>
                <strong>{officialFee !== null && officialFee !== undefined ? formatINR(officialFee) : 'Not configured'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>2. Operator Service Charge:</span>
                <strong>{operatorCharge !== null && operatorCharge !== undefined ? formatINR(operatorCharge) : 'Not configured'}</strong>
              </div>

              <div style={{ margin: '8px 0', borderTop: '2px solid var(--primary)', paddingTop: '8px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Total Payable:</span>
                <strong style={{ color: 'var(--primary)', fontWeight: 800 }}>{total !== null ? formatINR(total) : '—'}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                <span>Fee source verified on:</span>
                <span>{service.feeVerifiedAt || 'Not recorded'}</span>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-subtle)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              <strong>Notice:</strong> This is a service-fee transparency disclosure from the kiosk operator, not an official government payment receipt. Amounts must be verified on the portal before collection.
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '20px', alignItems: 'center' }} className="no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.85rem' }}
                value={audioLang}
                onChange={e => setAudioLang(e.target.value)}
              >
                <option value="hi-IN">Hindi (हिंदी)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="bn-IN">Bengali (বাংলা)</option>
                <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
                <option value="en-IN">English (India)</option>
              </select>
              <button className="btn btn-secondary" onClick={handleSpeakFees} disabled={audioLoading}>
                <Volume2 size={16} /> {audioLoading ? 'Playing…' : 'Read aloud'}
              </button>
            </div>

            <button className="btn btn-secondary" onClick={handlePrint}>
              <Printer size={16} /> Print disclosure slip
            </button>
          </div>
        </div>

        {/* Right Column: Trust Checklist */}
        <div className="panel no-print">
          <div className="panel-header">
            <div>
              <h2>Trust Checklist</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Citizen-centric principles</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { num: '1', title: 'Show both line items', desc: 'Never combine the government fee and operator charge into one unexplained lump sum.' },
              { num: '2', title: 'Verify official gazette', desc: 'Maintain an official source link and record when the fee was last verified.' },
              { num: '3', title: 'Multilingual speech', desc: 'Read the disclosure aloud in the citizen’s native language for complete comprehension.' },
              { num: '4', title: 'Provide printed disclosure', desc: 'Hand a clear disclosure slip so the citizen has a record of charges.' },
            ].map(item => (
              <div key={item.num} style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-subtle)' }}>
                <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>{item.num}.</span>
                <div>
                  <strong style={{ fontSize: '0.85rem', display: 'block' }}>{item.title}</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {service.feeSourceUrl && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Official Fee Gazette / Source URL:</span>
              <a
                href={service.feeSourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.8rem', color: 'var(--primary)', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {service.feeSourceUrl} <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
