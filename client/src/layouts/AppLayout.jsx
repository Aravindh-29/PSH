import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { NotificationProvider } from '../context/NotificationContext';
import './AppLayout.css';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    </NotificationProvider>
  );
}
