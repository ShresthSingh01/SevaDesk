import React from 'react';
import { Plus, Shield, CheckCircle2 } from 'lucide-react';
import { PageId } from './Sidebar';

interface TopBarProps {
  currentPage: PageId;
  onNewApplication: () => void;
  daemonConnected: boolean;
}

const PAGE_TITLES: Record<PageId, string> = {
  overview: 'Overview',
  intake: 'Citizen intake',
  applications: 'Applications',
  fees: 'Fee transparency',
  services: 'Services & rules',
  audit: 'Audit trail',
  citizenDisplay: 'Citizen Display Mode',
  simulator: 'State Portal Simulator'
};

export const TopBar: React.FC<TopBarProps> = ({ currentPage, onNewApplication, daemonConnected }) => {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>Workspace</span>
        <span style={{ color: 'var(--border-strong)' }}>/</span>
        <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{PAGE_TITLES[currentPage] || 'Workspace'}</strong>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: daemonConnected ? 'var(--status-good)' : '#b45309',
            backgroundColor: daemonConnected ? 'var(--status-good-bg)' : '#fef3c7',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)'
          }}
          title={daemonConnected ? 'Local Python Core daemon active (port 8765) — direct IPC enabled' : 'Python daemon offline — browser vault active (run run.bat for daemon)'}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: daemonConnected ? 'var(--status-good)' : '#d97706' }} />
          <span>{daemonConnected ? 'Local Core connected' : 'Local Core offline (Browser Vault)'}</span>
        </div>

        <button className="btn btn-primary btn-sm" onClick={onNewApplication}>
          <Plus size={16} /> New application
        </button>
      </div>
    </header>
  );
};
