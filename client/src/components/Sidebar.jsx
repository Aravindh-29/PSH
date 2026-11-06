import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, PlusCircle, BookOpen,
  BarChart2, Users, Users2, Settings, ShieldCheck, LogOut, ChevronLeft, LayoutList, KeyRound, Mail, Search
} from 'lucide-react';
import './Sidebar.css';
import useAccess from '../hooks/useAccess';
import BrandIdentity from './BrandIdentity';
import { useBranding } from '../context/BrandingContext';

const NAV_TOP_ADMIN = [
  { to: '/',                    icon: LayoutDashboard, label: 'Global Dashboard', exact: true },
  { to: '/admin/my-dashboard',  icon: LayoutDashboard, label: 'Admin Dashboard'               },
];

const NAV_TOP_EMPLOYEE = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
];

const ADMIN_MAIN = [
  { to: '/admin/user-tickets', icon: LayoutList, label: 'Tickets by User' },
];

const NAV_COMMON = [
  { to: '/my-tickets',    icon: ClipboardList, label: 'My Tickets'    },
  { to: '/my-query',      icon: Search,        label: 'My Query'      },
  { to: '/tickets/new',   icon: PlusCircle,    label: 'Create Ticket' },
  { to: '/knowledge-base',icon: BookOpen,      label: 'Knowledge Base'},
  { to: '/reports',       icon: BarChart2,     label: 'Reports'       },
];

const ADMIN_NAV = [
  { to: '/admin/users',          icon: Users,       label: 'Users'          },
  { to: '/admin/groups',         icon: Users2,      label: 'Groups'         },
  { to: '/admin/modules',        icon: Settings,    label: 'Configuration'  },
  { to: '/admin/sso',            icon: KeyRound,    label: 'SSO'            },
  { to: '/admin/email',          icon: Mail,        label: 'Email Config'   },
  { to: '/audit-logs',           icon: ShieldCheck, label: 'Audit Logs'     },
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
  const { branding } = useBranding();
  const {can,any}=useAccess();
  const navPermissions={'/':'dashboard.view','/admin/my-dashboard':'dashboard.view','/admin/user-tickets':'users.tickets','/my-tickets':'tickets.view','/my-query':'query.view','/tickets/new':'tickets.create','/knowledge-base':'kb.view','/reports':'reports.view','/admin/users':'users.view','/admin/groups':'groups.view','/admin/sso':'sso.view','/admin/email':'email.view','/audit-logs':'audit.view'};
  const configAllowed=any(['fields.view','categories.view','types.view','templates.view','branding.view','sla_config.view','roles.view']);
  const visible=item=>item.to==='/admin/modules'?configAllowed:can(navPermissions[item.to]);
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className={`sidebar-logo${!collapsed && branding?.customize ? ' sidebar-logo-branded' : ''}`}>
        {branding?.customize ? <BrandIdentity branding={branding} compact={collapsed} /> : <img src="/psh.png" alt="SERV-IT" className={collapsed ? 'sidebar-logo-sm' : 'sidebar-logo-img'} />}
      </div>

      <nav className="sidebar-nav">
        {/* Dashboard links — differ by role */}
        {(isAdmin ? NAV_TOP_ADMIN : NAV_TOP_EMPLOYEE).filter(visible).map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}

        {/* User Wise Tickets — admin only, right after Dashboard */}
        {ADMIN_MAIN.filter(visible).map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}

        {/* Common nav items */}
        {NAV_COMMON.filter(visible).map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
        {can('qa.view') && <NavItem to="/qa-analysis" icon={BarChart2} label="QA Analysis" collapsed={collapsed} />}

        {/* Admin section */}
        {(ADMIN_NAV.some(visible)) && (
          <>
            {!collapsed && <div className="nav-section-label">Admin</div>}
            {ADMIN_NAV.filter(visible).map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.fullName?.[0] || 'U'}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.fullName}</div>
              <div className="sidebar-user-role">{user?.roleName || (isAdmin ? 'Administrator' : 'Employee')}</div>
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
