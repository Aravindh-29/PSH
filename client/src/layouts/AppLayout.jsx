import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { NotificationProvider } from '../context/NotificationContext';
import './AppLayout.css';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <NotificationProvider>
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <div className="app-main">
          <Topbar
            onMenuClick={() => setSidebarCollapsed(c => !c)}
            darkMode={darkMode}
            onThemeToggle={() => setDarkMode(d => !d)}
          />
          <main className="app-content">
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
