import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#64748b' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/mfa/setup"  element={user ? <Navigate to="/" replace /> : <MFASetup />} />
      <Route path="/mfa/verify" element={user ? <Navigate to="/" replace /> : <MFAVerify />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/new" element={<CreateTicket />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="tickets/:id/edit" element={<EditTicket />} />
        <Route path="my-tickets" element={<TicketList myTickets />} />
        <Route path="admin/my-dashboard" element={<RequireAdmin><Dashboard personal /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="admin/user-tickets" element={<RequireAdmin><UserWiseTickets /></RequireAdmin>} />
        <Route path="admin/user-tickets/:userId" element={<RequireAdmin><AdminUserDetail /></RequireAdmin>} />
        <Route path="admin/modules" element={<RequireAdmin><AdminModules /></RequireAdmin>} />
        <Route path="admin/groups" element={<RequireAdmin><Groups /></RequireAdmin>} />
        <Route path="audit-logs" element={<RequireAdmin><AuditLogs /></RequireAdmin>} />
        <Route path="admin/sso" element={<RequireAdmin><SSOConfig /></RequireAdmin>} />
        <Route path="admin/email" element={<RequireAdmin><EmailConfig /></RequireAdmin>} />
        <Route path="reports" element={<Reports />} />
        <Route path="my-query" element={<MyQuery />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        <Route path="knowledge-base/:id" element={<KBArticle />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontFamily: 'Inter, sans-serif', fontSize: '14px' } }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
