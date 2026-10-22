import React, { useState } from 'react';
import { Volume2, X, ShieldAlert, ArrowLeft } from 'lucide-react';
import { ServiceDefinition, formatINR } from '@sevadesk/core-types';
import { playFeeSpeech } from '../lib/speech';

interface CitizenDisplayProps {
  service: ServiceDefinition | undefined;
  onClose: () => void;
  daemonConnected: boolean;
}

export const CitizenDisplay: React.FC<CitizenDisplayProps> = ({ service, onClose }) => {
  const [lang, setLang] = useState('hi-IN');
  const [loading, setLoading] = useState(false);
  const [syncedService, setSyncedService] = useState<ServiceDefinition | undefined>(service);
  const [syncedCitizenName, setSyncedCitizenName] = useState<string | null>(null);

  React.useEffect(() => {
    setSyncedService(service);
  }, [service]);

  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'seva_citizen_display_sync' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.service) setSyncedService(parsed.service);
          if (parsed.citizenName !== undefined) setSyncedCitizenName(parsed.citizenName);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const activeService = syncedService || service;
  const official = activeService?.officialFee;
  const operator = activeService?.operatorCharge;
  const total = official !== null && official !== undefined && operator !== null && operator !== undefined
    ? Number(official) + Number(operator)
    : null;

  const handleSpeak = async () => {
    if (!activeService) return;
    setLoading(true);
    try {
      await playFeeSpeech(activeService.name, official, operator, lang);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  if (!activeService) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#0f1712',
      color: '#ffffff',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      padding: '32px 48px',
      overflowY: 'auto'
    }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#52b788',
            color: '#0f1712',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.5rem'
          }}>S</div>
          <div>
            <h1 style={{ fontSize: '1.6rem', color: '#ffffff', lineHeight: 1.1 }}>SevaDesk · Citizen Transparency Display</h1>
            <span style={{ fontSize: '0.9rem', color: '#95d5b2' }}>Official service fee & operator charge breakdown</span>
            {syncedCitizenName && (
              <span style={{ fontSize: '0.85rem', color: '#a7f3d0', display: 'block', marginTop: '3px' }}>
                👤 Applicant: <strong>{syncedCitizenName}</strong>
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          <ArrowLeft size={18} /> Return to operator workspace
        </button>
      </div>

      {/* Main Content Box */}
      <div style={{
        maxWidth: '840px',
        width: '100%',
        margin: '0 auto',
        backgroundColor: '#1b2a21',
        borderRadius: '24px',
        padding: '48px',
        border: '1px solid rgba(82, 183, 136, 0.3)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: '1rem', color: '#95d5b2', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px' }}>
          SERVICE FEE DECLARATION
        </div>
        <h2 style={{ fontSize: '2.4rem', color: '#ffffff', fontWeight: 800, marginBottom: '32px' }}>
          {activeService.name}
        </h2>

        {/* Dual Line Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '1.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: '#d8f3dc' }}>1. Government / Portal Fee:</span>
            <strong style={{ color: '#ffffff' }}>{official !== null && official !== undefined ? formatINR(official) : 'Not configured'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: '#d8f3dc' }}>2. Operator Assistance Charge:</span>
            <strong style={{ color: '#ffffff' }}>{operator !== null && operator !== undefined ? formatINR(operator) : 'Not configured'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', fontSize: '2rem' }}>
            <span style={{ color: '#52b788', fontWeight: 700 }}>Total Payable:</span>
            <strong style={{ color: '#52b788', fontWeight: 900 }}>{total !== null ? formatINR(total) : '—'}</strong>
          </div>
        </div>

        {/* Audio Speech Controls */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '40px', alignItems: 'center' }}>
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              backgroundColor: '#0f1712',
              color: '#ffffff',
              border: '1px solid #52b788',
              fontSize: '1rem',
              outline: 'none'
            }}
          >
            <option value="hi-IN">Hindi (हिंदी में सुनें)</option>
            <option value="mr-IN">Marathi (मराठीत ऐका)</option>
            <option value="bn-IN">Bengali (বাংলায় শুনুন)</option>
            <option value="gu-IN">Gujarati (ગુજરાતીમાં સાંભળો)</option>
            <option value="ta-IN">Tamil (தமிழில் கேட்க)</option>
            <option value="te-IN">Telugu (తెలుగులో వినండి)</option>
            <option value="en-IN">English (Read aloud)</option>
          </select>

          <button
            onClick={handleSpeak}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 24px',
              borderRadius: '10px',
              backgroundColor: '#52b788',
              color: '#0f1712',
              fontWeight: 700,
              fontSize: '1.05rem',
              cursor: 'pointer'
            }}
          >
            <Volume2 size={20} /> {loading ? 'Speaking…' : 'Read fees aloud'}
          </button>
        </div>

        {/* Disclaimer */}
        <div style={{
          marginTop: '36px',
          padding: '16px 20px',
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.85rem',
          color: '#d8f3dc',
          lineHeight: 1.5
        }}>
          <strong>Notice for Citizens:</strong> This on-screen disclosure explains the authorized fees for this service. This is not an official government transaction receipt. Please confirm the amount before payment.
        </div>
      </div>
    </div>
  );
};
