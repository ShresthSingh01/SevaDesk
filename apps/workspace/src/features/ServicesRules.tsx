import React, { useState } from 'react';
import { 
  Plus, 
  Sliders, 
  Download, 
  Lock, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  Save
} from 'lucide-react';
import { ServiceDefinition, FIELD_LABELS, FIELD_KEYS, FieldKey } from '@sevadesk/core-types';

interface ServicesRulesProps {
  services: ServiceDefinition[];
  onSaveService: (service: ServiceDefinition) => Promise<void>;
  operatorName: string;
  centreName: string;
  audioLang: string;
  autoLockMinutes: number;
  onSaveProfile: (operator: string, centre: string, lang: string, autoLock: number) => Promise<void>;
  onExportBackup: () => void;
  onLock: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ServicesRules: React.FC<ServicesRulesProps> = ({
  services,
  onSaveService,
  operatorName,
  centreName,
  audioLang,
  autoLockMinutes,
  onSaveProfile,
  onExportBackup,
  onLock,
  onShowToast
}) => {
  const [editingService, setEditingService] = useState<ServiceDefinition | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Profile Form state
  const [profOperator, setProfOperator] = useState(operatorName);
  const [profCentre, setProfCentre] = useState(centreName);
  const [profLang, setProfLang] = useState(audioLang);
  const [profAutoLock, setProfAutoLock] = useState(autoLockMinutes);

  const openNewServiceModal = () => {
    setEditingService({
      id: `SRV-${Date.now().toString(36).toUpperCase()}`,
      name: '',
      department: '',
      portalUrl: '',
      officialFee: null,
      operatorCharge: null,
      feeSourceUrl: '',
      feeVerifiedAt: '',
      maxUploadMB: null,
      allowedExtensions: ['pdf', 'jpg'],
      requiredFields: ['fullName'],
      notes: ''
    });
    setShowModal(true);
  };

  const openEditModal = (service: ServiceDefinition) => {
    setEditingService({ ...service });
    setShowModal(true);
  };

  const handleServiceFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !editingService.name.trim()) {
      onShowToast('Please enter a service name.', 'error');
      return;
    }
    await onSaveService(editingService);
    setShowModal(false);
    onShowToast('Service rules saved successfully.');
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profOperator.trim() || !profCentre.trim()) {
      onShowToast('Enter both operator and centre name.', 'error');
      return;
    }
    await onSaveProfile(profOperator, profCentre, profLang, profAutoLock);
    onShowToast('Profile settings saved.');
  };

  const toggleRequiredField = (key: FieldKey) => {
    if (!editingService) return;
    const current = new Set(editingService.requiredFields || []);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    setEditingService({ ...editingService, requiredFields: Array.from(current) as FieldKey[] });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="overline">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            CONFIGURATION & RULES
          </div>
          <h1>Services & rules</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Every saved service is configured from real portal requirements. No scheme or fee is preloaded.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onExportBackup}>
            <Download size={16} /> Export backup
          </button>
          <button className="btn btn-primary" onClick={openNewServiceModal}>
            <Plus size={16} /> Add service
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {services.map(s => {
          const isFeeDone = s.officialFee !== null && s.operatorCharge !== null && Boolean(s.feeSourceUrl);
          return (
            <div key={s.id} className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                    fontWeight: 700
                  }}>🏛️</div>
                  <span className={`status-pill ${isFeeDone ? 'good' : 'warn'}`}>
                    {isFeeDone ? 'Fee recorded' : 'Fee unverified'}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{s.name}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '14px' }}>
                  {s.department || 'Department unconfigured'}
                </span>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.72rem' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--text-main)', fontWeight: 600 }}>
                    {(s.requiredFields || []).length} required fields
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--text-main)', fontWeight: 600 }}>
                    {s.maxUploadMB ? `${s.maxUploadMB} MB limit` : 'Size not set'}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--text-main)', fontWeight: 600 }}>
                    {s.allowedExtensions?.join(', ') || 'Types not set'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                <button className="btn btn-secondary btn-xs" onClick={() => openEditModal(s)}>
                  Edit rules
                </button>
                {s.portalUrl && (
                  <a href={s.portalUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    Portal ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Profile & Backup Settings */}
      <section className="panel" style={{ maxWidth: '720px' }}>
        <h2 style={{ marginBottom: '6px' }}>Workspace profile & security</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Configured for disclosures and auto-lock protection.
        </p>

        <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="profOperator">Operator name</label>
              <input
                id="profOperator"
                className="form-control"
                value={profOperator}
                onChange={e => setProfOperator(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profCentre">Centre name</label>
              <input
                id="profCentre"
                className="form-control"
                value={profCentre}
                onChange={e => setProfCentre(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profLang">Citizen audio language</label>
              <select
                id="profLang"
                className="form-control"
                value={profLang}
                onChange={e => setProfLang(e.target.value)}
              >
                <option value="hi-IN">Hindi (हिंदी)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="bn-IN">Bengali (বাংলা)</option>
                <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
                <option value="en-IN">English (India)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profAutoLock">Auto-lock timeout</label>
              <select
                id="profAutoLock"
                className="form-control"
                value={profAutoLock}
                onChange={e => setProfAutoLock(Number(e.target.value))}
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn btn-primary btn-sm" type="submit">
              <Save size={14} /> Save profile
            </button>
          </div>
        </form>

        <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-light)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.85rem' }}>Lock workspace now</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clears the encryption key from browser memory.</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onLock}>
            <Lock size={14} /> Lock now
          </button>
        </div>
      </section>

      {/* Edit Service Modal */}
      {showModal && editingService && (
        <div className="modal-overlay">
          <div className="modal-content wide" style={{ padding: '28px' }}>
            <h2 style={{ marginBottom: '6px' }}>{editingService.name ? 'Edit service rules' : 'Add new service'}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Inspect the real portal and configure mandatory fields and limits.
            </p>

            <form onSubmit={handleServiceFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label" htmlFor="modalServiceName">Service name *</label>
                  <input
                    id="modalServiceName"
                    className="form-control"
                    placeholder="e.g. Caste Certificate, PM Kisan"
                    value={editingService.name}
                    onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalDept">Department / Scheme</label>
                  <input
                    id="modalDept"
                    className="form-control"
                    placeholder="Revenue / Social Welfare"
                    value={editingService.department || ''}
                    onChange={e => setEditingService({ ...editingService, department: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalPortalUrl">Official portal URL</label>
                  <input
                    id="modalPortalUrl"
                    className="form-control"
                    placeholder="https://edistrict.example.gov.in"
                    value={editingService.portalUrl || ''}
                    onChange={e => setEditingService({ ...editingService, portalUrl: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalOfficialFee">Official / Portal fee (₹)</label>
                  <input
                    id="modalOfficialFee"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    placeholder="e.g. 30.00"
                    value={editingService.officialFee ?? ''}
                    onChange={e => setEditingService({ ...editingService, officialFee: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalOpCharge">Operator service charge (₹)</label>
                  <input
                    id="modalOpCharge"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    placeholder="e.g. 20.00"
                    value={editingService.operatorCharge ?? ''}
                    onChange={e => setEditingService({ ...editingService, operatorCharge: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalFeeSourceUrl">Fee gazette / Source link</label>
                  <input
                    id="modalFeeSourceUrl"
                    className="form-control"
                    placeholder="Official fee order link"
                    value={editingService.feeSourceUrl || ''}
                    onChange={e => setEditingService({ ...editingService, feeSourceUrl: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalFeeVerifiedAt">Fee checked date</label>
                  <input
                    id="modalFeeVerifiedAt"
                    type="date"
                    className="form-control"
                    value={editingService.feeVerifiedAt || ''}
                    onChange={e => setEditingService({ ...editingService, feeVerifiedAt: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalMaxUploadMB">Max upload size (MB per file)</label>
                  <input
                    id="modalMaxUploadMB"
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="form-control"
                    placeholder="e.g. 2.0"
                    value={editingService.maxUploadMB ?? ''}
                    onChange={e => setEditingService({ ...editingService, maxUploadMB: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modalAllowedExts">Allowed file extensions</label>
                  <input
                    id="modalAllowedExts"
                    className="form-control"
                    placeholder="pdf, jpg, png"
                    value={(editingService.allowedExtensions || []).join(', ')}
                    onChange={e => setEditingService({
                      ...editingService,
                      allowedExtensions: e.target.value.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
                    })}
                  />
                </div>
              </div>

              {/* Mandatory Fields Checklist */}
              <div>
                <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                  Mandatory applicant fields observed on portal:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {FIELD_KEYS.map(key => {
                    const isChecked = (editingService.requiredFields || []).includes(key as FieldKey);
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: isChecked ? 'var(--primary-light)' : 'var(--bg-subtle)',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRequiredField(key as FieldKey)}
                        />
                        <span>{FIELD_LABELS[key as FieldKey]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Save service rules
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
