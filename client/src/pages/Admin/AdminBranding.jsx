import React, { useEffect, useState } from 'react';
import { useBranding } from '../../context/BrandingContext';
import BrandIdentity from '../../components/BrandIdentity';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './AdminBranding.css';

export default function AdminBranding() {
  const { branding, setBranding, error, load } = useBranding();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => { if (branding) setDraft({ ...branding }); }, [branding]);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const upload = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 262144) return toast.error('Choose a PNG, JPEG, or WebP image up to 256 KB');
    setReading(true);
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      await new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = data; });
      set('logo_data', data);
    } catch { toast.error('This file could not be read as an image'); }
    finally { setReading(false); }
  };
  const save = async e => {
    e.preventDefault();
    if (draft.customize && !draft.organization_name.trim()) return toast.error('Enter your organization name');
    setSaving(true);
    try { const { data } = await api.put('/config/admin/branding', draft); setBranding(data.branding); toast.success('Branding saved'); }
    catch (err) { toast.error(err.response?.data?.message || 'Could not save branding'); }
    finally { setSaving(false); }
  };
  if (error) return <p role="alert">{error} <button className="cfg-btn-cancel" onClick={load}>Retry</button></p>;
  if (!draft) return <p>Loading branding…</p>;
  return <div className="branding-settings">
    <h2>Organization Branding</h2><p className="cfg-section-desc">Make SERV-IT feel like your organization's own service desk.</p>
    <div className="branding-customize-row"><label htmlFor="branding-customize">Customize</label><button id="branding-customize" type="button" role="switch" aria-checked={draft.customize} aria-label="Customize" className="branding-switch" disabled={saving || reading} onClick={() => set('customize', !draft.customize)}><span /></button><span>{draft.customize ? 'On' : 'Off'}</span></div>
    <div className="branding-grid">
      <form onSubmit={save} className="branding-card"><h3>Organization identity</h3>
        <fieldset disabled={!draft.customize || saving || reading}>
          <div className="branding-input"><label htmlFor="organization-name">Organization name *</label><input id="organization-name" value={draft.organization_name} maxLength={150} required={draft.customize} placeholder="e.g. ACME Industries" onChange={e => set('organization_name', e.target.value)} /></div>
          <div className="branding-input"><label htmlFor="service-desk-name">Service desk name</label><input id="service-desk-name" value={draft.service_desk_name || ''} maxLength={150} placeholder="e.g. ACME IT Helpdesk" onChange={e => set('service_desk_name', e.target.value)} /></div>
          <div className="branding-input"><label htmlFor="organization-logo">Organization logo</label><div className="branding-upload">{draft.logo_data ? <img src={draft.logo_data} alt="Organization logo preview" /> : <span className="branding-logo-fallback" style={{ background:draft.accent_color }}>{draft.organization_name?.[0]?.toUpperCase() || 'A'}</span>}<label className="cfg-btn-cancel" htmlFor="organization-logo">Upload logo</label><input id="organization-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />{draft.logo_data && <button type="button" className="cfg-btn-cancel" onClick={() => set('logo_data','')}>Remove logo</button>}</div><small>Square PNG, JPEG or WebP, up to 256 KB. A monogram appears when no logo is uploaded.</small></div>
          <div className="branding-input"><span className="branding-field-label" id="accent-label">Brand accent</span><div className="branding-swatches" role="group" aria-labelledby="accent-label">{[['#E85D04','Orange'],['#1768AC','Blue'],['#008577','Teal']].map(([color,label]) => <button key={color} type="button" aria-label={label} aria-pressed={draft.accent_color === color} style={{ background:color }} onClick={() => set('accent_color',color)}>{draft.accent_color === color ? '✓' : ''}</button>)}</div></div>
        </fieldset>
        <p className="branding-hint">{draft.customize ? 'Save to apply your branding across the application.' : 'Customize is off. Save to restore the default appearance. Your settings will be kept.'}</p><button className="cfg-btn-save" type="submit" disabled={saving || reading}>{saving ? 'Saving…' : 'Save Branding'}</button>
      </form>
      <div className="branding-card"><h3>Live preview</h3><div className="branding-portal" style={{ '--preview-accent':draft.customize ? draft.accent_color : '#E85D04' }}><div className="branding-portal-header">{draft.customize ? <BrandIdentity branding={draft} /> : <img src="/psh.png" alt="SERV-IT preview" className="branding-default-logo" />}</div></div><p className="branding-hint">Applied to the sidebar, sign-in screen and workspace header. Unsaved changes appear only in this preview.</p></div>
    </div>
  </div>;
}
