import React, { useState } from 'react';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Plus, 
  ShieldAlert,
  Sliders,
  ExternalLink,
  Zap,
  Edit2
} from 'lucide-react';
import { PageId } from '../components/Sidebar';
import { Citizen, Application, ServiceDefinition, maskIdentifier } from '@sevadesk/core-types';

interface OverviewProps {
  citizens: Citizen[];
  applications: Application[];
  services: ServiceDefinition[];
  onNavigate: (page: PageId) => void;
  onEditCitizen: (citizenId: string) => void;
  onOpenApplication: (appId: string) => void;
  onLaunchPortal?: (appId: string) => void;
  onCreateCaseForCitizen: (citizenId: string) => void;
  operatorProfile?: {
    operatorName: string;
    centreName: string;
    language: string;
  };
  onUpdateProfile?: (operatorName: string, centreName: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({
  citizens,
  applications,
  services,
  onNavigate,
  onEditCitizen,
  onOpenApplication,
  onLaunchPortal,
  onCreateCaseForCitizen,
  operatorProfile,
  onUpdateProfile
}) => {
  const isDefaultProfile = Boolean(
    operatorProfile && (
      !operatorProfile.centreName ||
      operatorProfile.centreName.toLowerCase().includes('service centre') ||
      operatorProfile.centreName.toLowerCase() === 'csc centre' ||
      operatorProfile.operatorName === 'Operator'
    )
  );

  const [showQuickSetup, setShowQuickSetup] = useState(isDefaultProfile);
  const [tempOpName, setTempOpName] = useState(operatorProfile?.operatorName || 'Operator');
  const [tempCentreName, setTempCentreName] = useState(operatorProfile?.centreName || 'SevaDesk Service Centre');

  const activeApps = applications.filter(a => !['submitted', 'rejected', 'closed'].includes(a.status));
  const readyApps = applications.filter(a => a.status === 'ready');
  const attentionApps = applications.filter(a => a.status === 'needs_correction' || a.status === 'rejected');
  const recentApps = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const recentCitizens = [...citizens].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  const getCitizenName = (citizenId: string) => {
    return citizens.find(c => c.id === citizenId)?.fullName || 'Citizen unavailable';
  };

  const getServiceName = (serviceId: string) => {
    return services.find(s => s.id === serviceId)?.name || 'Service unavailable';
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            OPERATOR DESK
          </div>
          <h1>Good work starts with a clean record.</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span style={{ 
              fontSize: '0.8rem', 
              color: 'var(--text-muted)', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              backgroundColor: 'var(--panel-bg-subtle, #f3f4f6)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)'
            }}>
              🏪 <strong>{operatorProfile?.centreName || 'SevaDesk Kiosk'}</strong>
              <span style={{ opacity: 0.5 }}>•</span>
              👤 Operator: <strong>{operatorProfile?.operatorName || 'Operator'}</strong>
            </span>
            <button
              type="button"
              onClick={() => setShowQuickSetup(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0 4px'
              }}
            >
              {showQuickSetup ? 'Hide setup' : 'Edit kiosk credentials'}
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
            Prepare complete applications, catch preventable portal rejections and make every fee visible to the citizen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => onNavigate('services')}>
            <Sliders size={16} /> Configure services
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('intake')}>
            <Plus size={16} /> Add citizen
          </button>
        </div>
      </div>

      {/* Kiosk Identity Quick Setup Banner */}
      {showQuickSetup && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(30, 64, 175, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>🏪</span>
              <div>
                <strong style={{ color: '#1e40af', fontSize: '0.95rem' }}>
                  {isDefaultProfile ? 'Complete Your Kiosk Identity Setup' : 'Update Kiosk Identity Credentials'}
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#3b82f6' }}>
                  Set your Jan Seva Kendra / CSC Centre name and Operator name so official printed citizen slips, fee disclosures, and portal handoffs display authentic credentials.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickSetup(false)}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ✕ Dismiss
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '4px' }}>
                Centre Name / Jan Seva Kendra
              </label>
              <input
                className="form-control"
                placeholder="e.g. Maa Durga Jan Seva Kendra, Mawana"
                value={tempCentreName}
                onChange={e => setTempCentreName(e.target.value)}
                style={{ backgroundColor: '#ffffff', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '4px' }}>
                Operator / VLE Name & ID
              </label>
              <input
                className="form-control"
                placeholder="e.g. Ramesh Kumar (UP-CSC-849201)"
                value={tempOpName}
                onChange={e => setTempOpName(e.target.value)}
                style={{ backgroundColor: '#ffffff', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700 }}
                onClick={() => {
                  if (onUpdateProfile && tempCentreName.trim()) {
                    onUpdateProfile(tempOpName.trim() || 'Operator', tempCentreName.trim());
                    setShowQuickSetup(false);
                  }
                }}
              >
                ✓ Save Kiosk Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Citizen records</span>
            <Users size={16} color="var(--primary)" />
          </div>
          <div className="stat-num">{citizens.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Stored in encrypted local vault</div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Active applications</span>
            <FileText size={16} color="var(--primary)" />
          </div>
          <div className="stat-num">{activeApps.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Not yet completed or closed</div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Passed preflight</span>
            <CheckCircle2 size={16} color="var(--status-good)" />
          </div>
          <div className="stat-num">{readyApps.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Ready for portal fill & operator review</div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Needs attention</span>
            <AlertTriangle size={16} color="var(--status-warn)" />
          </div>
          <div className="stat-num">{attentionApps.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Preflight issues or portal returns</div>
        </div>
      </div>

      {/* Dashboard 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px', marginBottom: '28px' }}>
        {/* Recent Applications */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Recent applications</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest cases on this device</p>
            </div>
            <button className="btn btn-secondary btn-xs" onClick={() => onNavigate('applications')}>
              View all <ArrowRight size={12} />
            </button>
          </div>

          {recentApps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
              <strong>Your application queue is clear</strong>
              <p style={{ fontSize: '0.825rem', marginTop: '4px' }}>Applications created from real citizen records will appear here.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Citizen / Case ID</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentApps.map(app => (
                    <tr key={app.id}>
                      <td>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>{getCitizenName(app.citizenId)}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{app.id}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{getServiceName(app.serviceId)}</td>
                      <td>
                        <span className={`status-pill ${app.status}`}>
                          • {app.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {app.status === 'ready' && (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => onLaunchPortal ? onLaunchPortal(app.id) : onOpenApplication(app.id)}
                              style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="1-Click Launch into State Portal Simulator"
                            >
                              <Zap size={11} /> Launch ↗
                            </button>
                          )}
                          <button className="btn btn-secondary btn-xs" onClick={() => onOpenApplication(app.id)}>
                            Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3-Step Streamlined Operator Workflow */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Streamlined operator workflow</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From counter intake to verified submission & citizen slip</p>
            </div>
            <span className="status-pill good">3 fast steps</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { num: '01', title: 'Smart Intake & Preflight', desc: 'Select scheme, scan ID via local OCR, attach slot-optimized docs, and verify 100% preflight inline.', page: 'intake' as PageId },
              { num: '02', title: 'Fast-Burst Portal Injection', desc: 'Sub-150ms autofill of reviewed demographic fields & pre-sized attachments into state portal or simulator.', page: 'applications' as PageId },
              { num: '03', title: 'Instant Acknowledgement & Slip', desc: 'Auto-capture portal reference number, print bilingual citizen receipt slip, and seal case.', page: 'applications' as PageId },
            ].map(step => (
              <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-subtle)' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: '1px solid var(--border-light)'
                }}>
                  {step.num}
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.85rem' }}>{step.title}</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{step.desc}</p>
                </div>
                <button className="btn btn-secondary btn-xs" onClick={() => onNavigate(step.page)}>
                  Go <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Citizen Register */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Citizen register</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {citizens.length} record(s) encrypted in this browser vault · recent 5 shown
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('intake')}>
            <Plus size={14} /> Add citizen
          </button>
        </div>

        {citizens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👤</div>
            <strong>No citizen records yet</strong>
            <p style={{ fontSize: '0.85rem', marginTop: '4px', maxWidth: '380px', margin: '4px auto 16px' }}>
              Citizen records appear only after an operator captures real information with recorded consent.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('intake')}>
              Create first record
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>Contact</th>
                  <th>District / State</th>
                  <th>Aadhaar</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentCitizens.map(c => (
                  <tr key={c.id}>
                    <td>
                      <strong style={{ display: 'block', fontSize: '0.875rem' }}>{c.fullName}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.id}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{c.mobile || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{[c.district, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                      {c.aadhaar ? maskIdentifier(c.aadhaar) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => onEditCitizen(c.id)} style={{ marginRight: '6px' }}>
                        Edit
                      </button>
                      <button className="btn btn-primary btn-xs" onClick={() => onCreateCaseForCitizen(c.id)}>
                        ＋ Case
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
