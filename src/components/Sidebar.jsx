import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Building2, Users, Award, Sparkles,
  Clock, CalendarRange, Palette, ScrollText,
  LogOut, ChevronLeft, ChevronRight, Stethoscope,
  ClipboardList, CalendarHeart, CalendarClock, Shield,
  SlidersHorizontal
} from 'lucide-react';

const NAV_ITEMS = [
  { type: 'section', label: 'Overview' },
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },

  { type: 'section', label: 'Management' },
  { path: '/staff', icon: Users, label: 'Staff' },
  { path: '/skills', icon: Sparkles, label: 'Skills' },
  { path: '/shifts', icon: Clock, label: 'Shifts' },

  { type: 'section', label: 'Requests' },
  { path: '/shift-requests', icon: CalendarClock, label: 'Shift Requests' },
  { path: '/leaves', icon: CalendarHeart, label: 'Leave Requests' },

  { type: 'section', label: 'Scheduling' },
  { path: '/demand', icon: ClipboardList, label: 'Demand Config' },
  { path: '/hard-constraints', icon: Shield, label: 'Hard Constraints' },
  { path: '/soft-constraints', icon: SlidersHorizontal, label: 'Soft Constraints' },
  { path: '/roster', icon: CalendarRange, label: 'Roster Generation' },

  { type: 'section', label: 'Settings' },
  { path: '/departments', icon: Building2, label: 'Departments' },
  { path: '/grades', icon: Award, label: 'Grades' },
  { path: '/themes', icon: Palette, label: 'Theme' },
  { path: '/audit-log', icon: ScrollText, label: 'Audit Log' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside
      className="sidebar"
      style={{
        width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        minWidth: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width var(--transition-base), min-width var(--transition-base)',
        overflow: 'hidden',
        height: '100vh',
      }}
    >
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 12px' : '20px 20px',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 68,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Stethoscope size={20} color="white" />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}>NRS</div>
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}>Nurse Rostering</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{
        flex: 1,
        overflowY: 'auto',
        padding: collapsed ? '12px 8px' : '12px',
      }}>
        {NAV_ITEMS.map((item, i) => {
          if (item.type === 'section') {
            if (collapsed) return null;
            return (
              <div key={i} style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-tertiary)',
                padding: '16px 12px 6px',
              }}>
                {item.label}
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '10px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all var(--transition-fast)',
                marginBottom: 2,
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border-primary)',
        padding: collapsed ? '12px 8px' : '12px',
      }}>
        {/* User info */}
        {!collapsed && (
          <div style={{
            padding: '10px 12px',
            marginBottom: 8,
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
          }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>Logged in as</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.userId}</div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            width: '100%',
            padding: '9px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            transition: 'all var(--transition-fast)',
            marginBottom: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sidebar-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> <span>Collapse</span></>}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            width: '100%',
            padding: '9px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-danger)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-danger-subtle)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
