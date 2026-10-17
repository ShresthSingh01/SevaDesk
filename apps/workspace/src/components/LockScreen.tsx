import React, { useState } from 'react';
import { Shield, ArrowRight, Upload, Lock } from 'lucide-react';

interface LockScreenProps {
  isSetup: boolean;
  onUnlock: (passphrase: string, operatorName?: string, centreName?: string) => Promise<void>;
  onRestoreBackup: (file: File) => Promise<void>;
}

export const LockScreen: React.FC<LockScreenProps> = ({ isSetup, onUnlock, onRestoreBackup }) => {
  const [operatorName, setOperatorName] = useState('');
  const [centreName, setCentreName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (passphrase.length < 10) {
      setError('Use a passphrase of at least 10 characters.');
      return;
    }

    if (isSetup) {
      if (passphrase !== passphraseConfirm) {
        setError('The passphrases do not match.');
        return;
      }
      if (!operatorName.trim() || !centreName.trim()) {
        setError('Please enter both your name and centre name.');
        return;
      }
    }

    setLoading(true);
    try {
      await onUnlock(passphrase, operatorName, centreName);
    } catch (err: any) {
      setError(err.message || 'Unable to decrypt this workspace. Check your passphrase.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await onRestoreBackup(file);
      } catch (err: any) {
        setError(err.message || 'Failed to restore backup file.');
      }
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-app)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          backgroundColor: 'var(--primary)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '1.25rem'
        }}>S</div>
        <div>
          <h2 style={{ fontSize: '1.2rem', lineHeight: 1.1 }}>SevaDesk</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assisted service workspace</span>
        </div>
      </div>

      <div className="panel" style={{ width: '100%', maxWidth: '440px', padding: '32px' }}>
        <div className="overline">
          <Lock size={13} /> LOCAL-FIRST ENCRYPTED WORKSPACE
        </div>
        <h1 style={{ fontSize: '1.45rem', marginBottom: '8px' }}>
          {isSetup ? 'Set up your secure workspace' : 'Welcome back'}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          {isSetup
            ? 'Your records stay on this device, encrypted with your passphrase. Zero preloaded citizen data.'
            : 'Enter your passphrase to decrypt this browser’s local workspace.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSetup && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="operatorName">Operator name</label>
                <input
                  id="operatorName"
                  className="form-control"
                  placeholder="Name shown on disclosures"
                  value={operatorName}
                  onChange={e => setOperatorName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="centreName">Centre name</label>
                <input
                  id="centreName"
                  className="form-control"
                  placeholder="Your CSC or service centre"
                  value={centreName}
                  onChange={e => setCentreName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="passphrase">Workspace passphrase</label>
            <input
              id="passphrase"
              className="form-control"
              type="password"
              placeholder="At least 10 characters"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              minLength={10}
              required
            />
          </div>

          {isSetup && (
            <div className="form-group">
              <label className="form-label" htmlFor="passphraseConfirm">Confirm passphrase</label>
              <input
                id="passphraseConfirm"
                className="form-control"
                type="password"
                placeholder="Re-enter your passphrase"
                value={passphraseConfirm}
                onChange={e => setPassphraseConfirm(e.target.value)}
                minLength={10}
                required
              />
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--status-bad-bg)',
              color: 'var(--status-bad)',
              fontSize: '0.825rem',
              fontWeight: 500
            }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '12px' }}>
            {loading ? 'Processing…' : isSetup ? 'Create encrypted workspace' : 'Unlock workspace'}
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Have a backup?</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={14} /> Restore backup
            <input type="file" accept=".json,application/json" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <p style={{ marginTop: '20px', fontSize: '0.775rem', color: 'var(--text-subtle)', textAlign: 'center', maxWidth: '400px' }}>
        Important: There is no passphrase recovery. Stored locally with AES-GCM and PBKDF2 encryption.
      </p>
    </div>
  );
};
