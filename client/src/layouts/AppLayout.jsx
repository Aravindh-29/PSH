import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Clock, LogOut } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { NotificationProvider } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import useIdleTimer from '../hooks/useIdleTimer';
import './AppLayout.css';

const WARN_MS   = 13 * 60 * 1000; // 13 minutes → show warning
const LOGOUT_MS = 15 * 60 * 1000; // 15 minutes → auto logout

function IdleWarningModal({ countdown, onStay, onLogout }) {
  return (
    <div className="idle-overlay">
      <div className="idle-modal">
        <div className="idle-icon-wrap">
          <Clock size={28} />
        </div>
        <h2 className="idle-title">Are you still there?</h2>
        <p className="idle-msg">
          You've been inactive. You'll be automatically signed out in{' '}
          <span className="idle-countdown">{countdown}s</span> to keep your account secure.
        </p>
        <div className="idle-actions">
          <button className="idle-btn-stay" onClick={onStay}>Stay signed in</button>
          <button className="idle-btn-logout" onClick={onLogout}>
            <LogOut size={14} /> Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showWarning, setShowWarning]           = useState(false);
  const [countdown, setCountdown]               = useState(120); // 2-minute countdown
  const countdownRef  = useRef(null);
  const { logout }    = useAuth();
  const navigate      = useNavigate();

  const doLogout = useCallback(async () => {
    clearInterval(countdownRef.current);
    setShowWarning(false);
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleWarn = useCallback(() => {
    setShowWarning(true);
    setCountdown(120);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  }, []);

  const handleStay = useCallback(() => {
    clearInterval(countdownRef.current);
    setShowWarning(false);
    setCountdown(120);
  }, []);

  useEffect(() => () => clearInterval(countdownRef.current), []);

  useIdleTimer({
    onWarn:       handleWarn,
    onLogout:     doLogout,
    warnAfterMs:  WARN_MS,
    logoutAfterMs: LOGOUT_MS,
  });

  return (
    <NotificationProvider>
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <div className="app-main">
          <Topbar onMenuClick={() => setSidebarCollapsed(c => !c)} />
          <main className="app-content">
            <Outlet />
          </main>
        </div>
      </div>

      {showWarning && (
        <IdleWarningModal
          countdown={countdown}
          onStay={handleStay}
          onLogout={doLogout}
        />
      )}
    </NotificationProvider>
  );
}
