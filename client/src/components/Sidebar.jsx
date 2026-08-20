import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, PlusCircle, BookOpen,
  BarChart2, Users, Settings, ShieldCheck, LogOut, ChevronLeft, LayoutList, KeyRound
} from 'lucide-react';
import './Sidebar.css';

const NAV_TOP = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
];

const ADMIN_MAIN = [
  { to: '/admin/user-tickets', icon: LayoutList, label: 'User Wise Tickets' },
];

const NAV_COMMON = [
  { to: '/my-tickets', icon: ClipboardList, label: 'My Tickets' },
  { to: '/tickets/new', icon: PlusCircle, label: 'Create Ticket' },
  { to: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
  { to: '/reports', icon: BarChart2, label: 'Reports' },
];

const ADMIN_NAV = [
  { to: '/admin/users',   icon: Users,      label: 'Users'         },
  { to: '/admin/modules', icon: Settings,   label: 'Configuration' },
  { to: '/admin/sso',     icon: KeyRound,   label: 'SSO'           },
  { to: '/audit-logs',    icon: ShieldCheck, label: 'Audit Logs'   },
];

function NavItem({ to, icon: Icon, label, exact, disabled, collapsed }) {
  return (
    <NavLink
      to={disabled ? '#' : to}
      end={exact}
      className={({ isActive }) => `nav-item ${isActive && !disabled ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={e => disabled && e.preventDefault()}
    >
      <Icon size={18} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img
          src="/psh.png"
          alt="SERV-IT"
          className={collapsed ? 'sidebar-logo-sm' : 'sidebar-logo-img'}
        />
      </div>

      <nav className="sidebar-nav">
        {/* Dashboard — always first */}
        {NAV_TOP.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}

        {/* User Wise Tickets — admin only, right after Dashboard */}
        {isAdmin && ADMIN_MAIN.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}

        {/* Common nav items */}
        {NAV_COMMON.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}

        {/* Admin section */}
        {isAdmin && (
          <>
            {!collapsed && <div className="nav-section-label">Admin</div>}
            {ADMIN_NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.fullName?.[0] || 'U'}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.fullName}</div>
              <div className="sidebar-user-role">{isAdmin ? 'Administrator' : 'Employee'}</div>
            </div>
            <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        )}
        <button className="sidebar-collapse-btn" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          <ChevronLeft size={16} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: '0.25s' }} />
        </button>
      </div>
    </aside>
  );
}
