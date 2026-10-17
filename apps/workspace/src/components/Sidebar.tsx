import React from 'react';
import { 
  LayoutDashboard, 
  UserPlus, 
  FileText, 
  IndianRupee, 
  Settings2, 
  ScrollText, 
  ShieldCheck, 
  LogOut,
  ExternalLink
} from 'lucide-react';

export type PageId = 'overview' | 'intake' | 'applications' | 'fees' | 'services' | 'audit' | 'citizenDisplay';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  operatorName: string;
  centreName: string;
  applicationCount: number;
  onLock: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  operatorName,
  centreName,
  applicationCount,
  onLock
}) => {
  const navItems = [
    { id: 'overview' as PageId, label: 'Overview', icon: LayoutDashboard },
    { id: 'intake' as PageId, label: 'Citizen intake', icon: UserPlus, badge: 'New' },
    { id: 'applications' as PageId, label: 'Applications', icon: FileText, count: applicationCount },
    { id: 'fees' as PageId, label: 'Fee transparency', icon: IndianRupee },
    { id: 'services' as PageId, label: 'Services & rules', icon: Settings2 },
    { id: 'audit' as PageId, label: 'Audit trail', icon: ScrollText },
  ];

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          backgroundColor: 'var(--primary)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '1.1rem'
        }}>S</div>
        <div>
          <strong style={{ display: 'block', fontSize: '1rem', lineHeight: 1.1 }}>SevaDesk</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assisted service</span>
        </div>
      </div>

      {/* Centre selector */}
      <div style={{
        padding: '10px 12px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{ fontSize: '1rem' }}>🏛️</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {centreName || 'Service centre'}
          </strong>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            LOCAL WORKSPACE
          </span>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '0.08em', marginBottom: '8px' }}>
        WORKSPACE
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {navItems.map(item => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: active ? 'var(--primary-light)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-main)',
                fontWeight: active ? 600 : 500,
                fontSize: '0.875rem',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={18} color={active ? 'var(--primary)' : 'var(--text-muted)'} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--status-good-bg)', color: 'var(--status-good)', fontWeight: 700 }}>
                  {item.badge}
                </span>
              )}
              {item.count !== undefined && item.count > 0 && (
                <span style={{ fontSize: '0.75rem', padding: '2px 7px', borderRadius: 'var(--radius-full)', background: 'var(--bg-accent)', color: 'var(--text-main)', fontWeight: 600 }}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Privacy Callout */}
      <div style={{
        padding: '12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-subtle)',
        marginBottom: '16px',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start'
      }}>
        <ShieldCheck size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-main)' }}>Zero Cloud PII</strong>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3, marginTop: '2px' }}>
            Aadhaar & citizen records are encrypted in your local vault.
          </p>
        </div>
      </div>

      {/* Operator and Lock */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '12px',
        borderTop: '1px solid var(--border-light)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-accent)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}>
            {(operatorName || 'O').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: '0.825rem', lineHeight: 1.2 }}>{operatorName || 'Operator'}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Workspace owner</span>
          </div>
        </div>
        <button
          onClick={onLock}
          title="Lock workspace"
          style={{
            padding: '6px',
            borderRadius: '6px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
