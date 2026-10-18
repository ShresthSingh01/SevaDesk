import React, { useState } from 'react';
import { Search, Plus, Filter, ArrowRight, CheckCircle2, AlertTriangle, Zap, Clock } from 'lucide-react';
import { Application, Citizen, ServiceDefinition } from '@sevadesk/core-types';

interface ApplicationsProps {
  applications: Application[];
  citizens: Citizen[];
  services: ServiceDefinition[];
  onOpenApplication: (appId: string) => void;
  onNewApplication: () => void;
}

export const Applications: React.FC<ApplicationsProps> = ({
  applications,
  citizens,
  services,
  onOpenApplication,
  onNewApplication
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const getCitizen = (citizenId: string) => citizens.find(c => c.id === citizenId);
  const getService = (serviceId: string) => services.find(s => s.id === serviceId);

  const readyApps = applications.filter(app => app.status === 'ready');

  const filteredApps = applications.filter(app => {
    const c = getCitizen(app.citizenId);
    const s = getService(app.serviceId);
    const query = searchTerm.toLowerCase();

    const matchesSearch =
      !query ||
      app.id.toLowerCase().includes(query) ||
      (c?.fullName || '').toLowerCase().includes(query) ||
      (c?.mobile || '').includes(query) ||
      (s?.name || '').toLowerCase().includes(query);

    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            CASE QUEUE
          </div>
          <h1>Applications</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Track each application from intake to verified submission on the official portal.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNewApplication}>
          <Plus size={16} /> New application
        </button>
      </div>

      {readyApps.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%)',
            color: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 24px',
            marginBottom: '24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '680px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Zap size={22} color="#95d5b2" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '1rem', letterSpacing: '-0.01em' }}>
                  Off-Peak Burst Submission Queue Active
                </strong>
                <span
                  style={{
                    backgroundColor: '#95d5b2',
                    color: '#081c15',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}
                >
                  {readyApps.length} Ready for Portal
                </span>
              </div>
              <p style={{ fontSize: '0.825rem', opacity: 0.9, marginTop: '2px' }}>
                Portals congested or timed out during the day? These cases have 100% preflight validation and citizen consent. Burst-submit them instantly via the Companion Extension once server traffic clears.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="btn"
              style={{
                backgroundColor: statusFilter === 'ready' ? '#ffffff' : 'rgba(255, 255, 255, 0.2)',
                color: statusFilter === 'ready' ? '#1b4332' : '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                fontSize: '0.8rem'
              }}
              onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
            >
              <Filter size={14} />
              {statusFilter === 'ready' ? 'Showing Ready Queue' : 'View Ready Cases'}
            </button>
            <button
              className="btn"
              style={{
                backgroundColor: '#95d5b2',
                color: '#081c15',
                fontSize: '0.8rem',
                fontWeight: 700
              }}
              onClick={() => onOpenApplication(readyApps[0].id)}
            >
              Launch Next Ready Case <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      <section className="panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3>Application register</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {applications.length} case record(s) on this device · not uploaded to external servers
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: '260px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                className="form-control"
                placeholder="Search citizen, scheme, or ID"
                style={{ paddingLeft: '36px' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="needs_correction">Needs correction</option>
              <option value="ready">Ready (Preflight passed)</option>
              <option value="in_portal">In portal</option>
              <option value="submitted">Submitted on portal</option>
              <option value="rejected">Rejected by portal</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {filteredApps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📂</div>
            <strong>No applications match your filter</strong>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              Try searching by another keyword or create a new case.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Citizen / Case ID</th>
                  <th>Service / Department</th>
                  <th>Status</th>
                  <th>Preflight validation</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map(app => {
                  const citizen = getCitizen(app.citizenId);
                  const service = getService(app.serviceId);
                  const preflightValid = app.preflight?.valid;

                  return (
                    <tr key={app.id}>
                      <td>
                        <strong style={{ display: 'block', fontSize: '0.875rem' }}>
                          {citizen?.fullName || 'Citizen unavailable'}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{app.id}</span>
                      </td>
                      <td>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>
                          {service?.name || 'Service unavailable'}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {service?.department || 'Department not set'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${app.status}`}>
                          • {app.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {app.preflight ? (
                          preflightValid ? (
                            <span className="status-pill good">
                              <CheckCircle2 size={12} /> Passed
                            </span>
                          ) : (
                            <span className="status-pill warn">
                              <AlertTriangle size={12} /> Issues ({app.preflight.errors.length})
                            </span>
                          )
                        ) : (
                          <span className="status-pill draft">Not checked</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => onOpenApplication(app.id)}>
                          Open <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
