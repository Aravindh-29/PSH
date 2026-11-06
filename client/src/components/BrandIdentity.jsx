import React from 'react';
import './BrandIdentity.css';

export default function BrandIdentity({ branding, compact = false }) {
  return <div className={`brand-identity${compact ? ' brand-identity-compact' : ''}`} style={{ '--brand-accent': branding.accent_color || '#E85D04' }}>
    <div className="brand-lockup">
      {branding.logo_data ? <img className="brand-org-logo" src={branding.logo_data} alt={`${branding.organization_name} logo`} /> : <div className="brand-monogram" aria-hidden="true">{branding.organization_name?.trim()?.[0]?.toUpperCase() || 'A'}</div>}
      {!compact && <div className="brand-org-text"><strong>{branding.organization_name || 'Your organization'}</strong><span>{branding.service_desk_name || 'IT Service Desk'}</span></div>}
    </div>
    {!compact && <div className="brand-powered">Powered by <img src="/psh.png" alt="SERV-IT" /></div>}
  </div>;
}
