import React from 'react';
import './Admin.css';

export default function AdminModules() {
  return (
    <div className="admin-page">
      <div className="admin-header"><h1>Configuration</h1><p>Manage modules, categories, and system settings.</p></div>
      <div className="admin-form-card" style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
        Configuration management coming soon — modules and categories are pre-loaded via seed data.
      </div>
    </div>
  );
}
