import React from 'react';
import useAccess from './hooks/useAccess';
import AccessDenied from './components/AccessDenied';
import { BrandingProvider } from './context/BrandingContext';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/Login/LoginPage';
import MFASetup from './pages/MFA/MFASetup';
import MFAVerify from './pages/MFA/MFAVerify';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import TicketList from './pages/Tickets/TicketList';
import TicketDetail from './pages/Tickets/TicketDetail';
import CreateTicket from './pages/Tickets/CreateTicket';
import EditTicket from './pages/Tickets/EditTicket';
import AdminUsers from './pages/Admin/AdminUsers';
import UserWiseTickets from './pages/Admin/UserWiseTickets';
import AdminUserDetail from './pages/Admin/AdminUserDetail';
import AdminModules from './pages/Admin/AdminModules';
import Groups from './pages/Admin/Groups';
import SSOConfig from './pages/Admin/SSOConfig';
import EmailConfig from './pages/Admin/EmailConfig';
import AuditLogs from './pages/Audit/AuditLogs';
import Reports from './pages/Reports/Reports';
import MyQuery from './pages/MyQuery/MyQuery';
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase';
import KBArticle from './pages/KnowledgeBase/KBArticle';
import Profile from './pages/Profile/Profile';
import QAAnalysis from './pages/QAAnalysis/QAAnalysis';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#64748b' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequirePermission({ children, permission }) {
  const {can,any}=useAccess();
  const allowed=Array.isArray(permission)?any(permission):can(permission);
  return allowed ? children : <AccessDenied />;
}
const configPermissions=['fields.view','categories.view','types.view','sla_config.view','templates.view','branding.view','roles.view'];
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/mfa/setup"  element={user ? <Navigate to="/" replace /> : <MFASetup />} />
      <Route path="/mfa/verify" element={user ? <Navigate to="/" replace /> : <MFAVerify />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<RequirePermission permission="dashboard.view"><Dashboard /></RequirePermission>} />
        <Route path="tickets" element={<RequirePermission permission="tickets.view"><TicketList /></RequirePermission>} />
        <Route path="tickets/new" element={<RequirePermission permission="tickets.create"><CreateTicket /></RequirePermission>} />
        <Route path="tickets/:id" element={<RequirePermission permission="tickets.view"><TicketDetail /></RequirePermission>} />
        <Route path="tickets/:id/edit" element={<RequirePermission permission={['tickets.edit','tickets.priority','tickets.impact','tickets.urgency','tickets.category','tickets.type','tickets.classification','tickets.template','tickets.status','tickets.assign','tickets.owner']}><EditTicket /></RequirePermission>} />
        <Route path="my-tickets" element={<RequirePermission permission="tickets.view"><TicketList myTickets /></RequirePermission>} />
        <Route path="admin/my-dashboard" element={<RequirePermission permission={'dashboard.view'}><Dashboard personal /></RequirePermission>} />
        <Route path="admin/users" element={<RequirePermission permission={'users.view'}><AdminUsers /></RequirePermission>} />
        <Route path="admin/user-tickets" element={<RequirePermission permission={'users.tickets'}><UserWiseTickets /></RequirePermission>} />
        <Route path="admin/user-tickets/:userId" element={<RequirePermission permission={'users.tickets'}><AdminUserDetail /></RequirePermission>} />
        <Route path="admin/modules" element={<RequirePermission permission={configPermissions}><AdminModules /></RequirePermission>} />
        <Route path="admin/groups" element={<RequirePermission permission={'groups.view'}><Groups /></RequirePermission>} />
        <Route path="audit-logs" element={<RequirePermission permission={'audit.view'}><AuditLogs /></RequirePermission>} />
        <Route path="admin/sso" element={<RequirePermission permission={'sso.view'}><SSOConfig /></RequirePermission>} />
        <Route path="admin/email" element={<RequirePermission permission={'email.view'}><EmailConfig /></RequirePermission>} />
        <Route path="reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
        <Route path="my-query" element={<RequirePermission permission="query.view"><MyQuery /></RequirePermission>} />
        <Route path="knowledge-base" element={<RequirePermission permission="kb.view"><KnowledgeBase /></RequirePermission>} />
        <Route path="knowledge-base/:id" element={<RequirePermission permission="kb.view"><KBArticle /></RequirePermission>} />
        <Route path="profile" element={<RequirePermission permission="profile.view"><Profile /></RequirePermission>} />
        <Route path="qa-analysis" element={<RequirePermission permission={'qa.view'}><QAAnalysis /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider><AppRoutes /></BrandingProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontFamily: 'Inter, sans-serif', fontSize: '14px' } }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
