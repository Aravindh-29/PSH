import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, Loader, Trash2, Save,
         ChevronDown, Eye, EyeOff, AlertTriangle, Info } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './SSOConfig.css';

const PRESETS = [
  {
    key: 'azure',
    label: 'Microsoft Azure AD',
    providerName: 'Microsoft',
    issuerUrl: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0',
    hint: 'Replace YOUR_TENANT_ID with your Azure Directory (tenant) ID',
  },
  {
    key: 'google',
    label: 'Google Workspace',
    providerName: 'Google',
    issuerUrl: 'https://accounts.google.com',
    hint: '',
  },
  {
    key: 'okta',
    label: 'Okta',
    providerName: 'Okta',
    issuerUrl: 'https://YOUR_ORG.okta.com/oauth2/default',
    hint: 'Replace YOUR_ORG with your Okta organisation subdomain',
  },
  {
    key: 'auth0',
    label: 'Auth0',
    providerName: 'Auth0',
    issuerUrl: 'https://YOUR_TENANT.auth0.com',
    hint: 'Replace YOUR_TENANT with your Auth0 tenant name',
  },
];

const REDIRECT_URI = `${window.location.origin}/api/auth/sso/callback`;

const EMPTY = {
  providerName: '',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  redirectUri: REDIRECT_URI,
  autoProvision: false,
  isEnabled: false,
};

export default function SSOConfig() {
  const [config, setConfig]           = useState(EMPTY);
  const [secretSet, setSecretSet]     = useState(false);   // server already has a secret
  const [changeSecret, setChangeSecret] = useState(false); // user wants to enter new secret
  const [showSecret, setShowSecret]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState(null);    // { ok, message, issuer }
  const [activePreset, setActivePreset] = useState(null);

  useEffect(() => {
    api.get('/config/admin/sso')
      .then(r => {
        if (r.data.config) {
          const c = r.data.config;
          setConfig({
            providerName:  c.providerName  || '',
            issuerUrl:     c.issuerUrl     || '',
            clientId:      c.clientId      || '',
            clientSecret:  '',
            redirectUri:   c.redirectUri   || REDIRECT_URI,
            autoProvision: c.autoProvision || false,
            isEnabled:     c.isEnabled     || false,
          });
          setSecretSet(c.clientSecretSet || false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    setConfig(prev => ({
      ...prev,
      providerName: preset.providerName,
      issuerUrl:    preset.issuerUrl,
    }));
    setTestResult(null);
  };

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!config.issuerUrl.trim()) { toast.error('Enter an Issuer URL first'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/config/admin/sso/test', { issuerUrl: config.issuerUrl });
      setTestResult({ ok: r.data.success, message: r.data.message, issuer: r.data.issuer });
    } catch {
      setTestResult({ ok: false, message: 'Request failed' });
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (!config.issuerUrl.trim() || !config.clientId.trim()) {
      toast.error('Issuer URL and Client ID are required'); return;
    }
    if (!secretSet && !config.clientSecret.trim()) {
      toast.error('Client Secret is required'); return;
    }
    setSaving(true);
    try {
      const payload = { ...config };
      if (secretSet && !changeSecret) delete payload.clientSecret;
      await api.post('/config/admin/sso', payload);
      toast.success('SSO configuration saved');
      setSecretSet(true);
      setChangeSecret(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear SSO configuration? Users will no longer be able to sign in with SSO.')) return;
    try {
      await api.delete('/config/admin/sso');
      setConfig(EMPTY);
      setSecretSet(false);
      setChangeSecret(false);
      setTestResult(null);
      setActivePreset(null);
      toast.success('SSO configuration cleared');
    } catch { toast.error('Failed to clear configuration'); }
  };

  // Status pill
  const status = !config.issuerUrl
    ? { label: 'Not Configured', cls: 'sso-status-none' }
    : !config.isEnabled
    ? { label: 'Configured — Disabled', cls: 'sso-status-disabled' }
    : { label: 'Configured & Enabled', cls: 'sso-status-active' };

  if (loading) return <div className="sso-loading"><Loader size={20} className="spin" /> Loading…</div>;

  return (
    <div className="sso-page">
      {/* Header */}
      <div className="sso-header">
        <div>
          <h1 className="sso-title">SSO Configuration</h1>
          <p className="sso-sub">Connect an identity provider so users can sign in with their organisation account</p>
        </div>
        <span className={`sso-status-pill ${status.cls}`}>
          {status.cls === 'sso-status-active'
            ? <CheckCircle size={13} />
            : status.cls === 'sso-status-disabled'
            ? <AlertTriangle size={13} />
            : <XCircle size={13} />}
          {status.label}
        </span>
      </div>

      {/* Provider presets */}
      <div className="sso-card">
        <div className="sso-card-title">Quick Setup — Choose Your Provider</div>
        <div className="sso-presets">
          {PRESETS.map(p => (
            <button
              key={p.key}
              className={`sso-preset-btn ${activePreset === p.key ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              <span className="sso-preset-icon">
                {p.key === 'azure'  && <MsIcon />}
                {p.key === 'google' && <GIcon />}
                {p.key === 'okta'   && <span className="sso-preset-letter">O</span>}
                {p.key === 'auth0'  && <span className="sso-preset-letter">A</span>}
              </span>
              {p.label}
            </button>
          ))}
        </div>
        {activePreset && (
          <div className="sso-preset-hint">
            <Info size={12} />
            {PRESETS.find(p => p.key === activePreset)?.hint}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="sso-card">
        <div className="sso-card-title">Provider Details</div>

        <div className="sso-form">
          {/* Row 1 */}
          <div className="sso-field-group">
            <label className="sso-label">Provider Display Name
              <span className="sso-hint-inline">Shown on the login button, e.g. "Microsoft"</span>
            </label>
            <input
              className="sso-input"
              placeholder="e.g. Microsoft, Google, Okta"
              value={config.providerName}
              onChange={e => handleChange('providerName', e.target.value)}
            />
          </div>

          {/* Row 2 — Issuer URL */}
          <div className="sso-field-group">
            <label className="sso-label">Issuer URL <span className="sso-req">*</span>
              <span className="sso-hint-inline">The OIDC discovery base URL of your provider</span>
            </label>
            <div className="sso-input-row">
              <input
                className="sso-input"
                placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
                value={config.issuerUrl}
                onChange={e => handleChange('issuerUrl', e.target.value)}
              />
              <button
                className={`sso-test-btn ${testing ? 'loading' : ''} ${testResult ? (testResult.ok ? 'ok' : 'fail') : ''}`}
                onClick={handleTest}
                disabled={testing}
              >
                {testing
                  ? <><Loader size={13} className="spin" /> Testing…</>
                  : testResult
                  ? testResult.ok
                    ? <><CheckCircle size={13} /> Connected</>
                    : <><XCircle size={13} /> Failed</>
                  : 'Test Connection'}
              </button>
            </div>
            {testResult && (
              <div className={`sso-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                {testResult.ok
                  ? <><CheckCircle size={12} /> {testResult.message} — <code>{testResult.issuer}</code></>
                  : <><XCircle size={12} /> {testResult.message}</>}
              </div>
            )}
          </div>

          {/* Row 3 — Client ID */}
          <div className="sso-field-group">
            <label className="sso-label">Client ID <span className="sso-req">*</span>
              <span className="sso-hint-inline">Application / Client ID from your provider</span>
            </label>
            <input
              className="sso-input"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={config.clientId}
              onChange={e => handleChange('clientId', e.target.value)}
            />
          </div>

          {/* Row 4 — Client Secret */}
          <div className="sso-field-group">
            <label className="sso-label">Client Secret <span className="sso-req">*</span>
              <span className="sso-hint-inline">Stored encrypted; not shown after saving</span>
            </label>
            {secretSet && !changeSecret ? (
              <div className="sso-secret-saved">
                <Shield size={13} />
                <span>Secret saved securely</span>
                <button className="sso-change-link" onClick={() => setChangeSecret(true)}>Change</button>
              </div>
            ) : (
              <div className="sso-input-wrap">
                <input
                  className="sso-input"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Enter client secret"
                  value={config.clientSecret}
                  onChange={e => handleChange('clientSecret', e.target.value)}
                />
                <button className="sso-eye" type="button" onClick={() => setShowSecret(s => !s)}>
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            )}
          </div>

          {/* Row 5 — Redirect URI (read-only) */}
          <div className="sso-field-group">
            <label className="sso-label">Redirect URI
              <span className="sso-hint-inline">Copy this into your provider's allowed redirect URIs</span>
            </label>
            <div className="sso-redirect-box">
              <code>{REDIRECT_URI}</code>
              <button
                className="sso-copy-btn"
                onClick={() => { navigator.clipboard.writeText(REDIRECT_URI); toast.success('Copied'); }}
              >Copy</button>
            </div>
          </div>

          {/* Toggles */}
          <div className="sso-toggles">
            <label className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Auto-provision users</div>
                <div className="sso-toggle-sub">Automatically create an Employee account on first SSO login. If off, the admin must pre-create the account.</div>
              </div>
              <button
                className={`sso-toggle ${config.autoProvision ? 'on' : ''}`}
                onClick={() => handleChange('autoProvision', !config.autoProvision)}
              >
                <span className="sso-toggle-knob" />
              </button>
            </label>

            <label className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Enable SSO</div>
                <div className="sso-toggle-sub">Show the "Sign in with SSO" button on the login page. Password login always remains available.</div>
              </div>
              <button
                className={`sso-toggle ${config.isEnabled ? 'on' : ''}`}
                onClick={() => handleChange('isEnabled', !config.isEnabled)}
              >
                <span className="sso-toggle-knob" />
              </button>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="sso-actions">
          <button className="sso-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
          {secretSet && (
            <button className="sso-clear-btn" onClick={handleClear}>
              <Trash2 size={14} /> Clear Configuration
            </button>
          )}
        </div>
      </div>

      {/* How to guide */}
      <div className="sso-card sso-guide-card">
        <div className="sso-card-title">Setup Guide</div>
        <div className="sso-guide-grid">
          {PRESETS.map(p => (
            <div key={p.key} className="sso-guide-item">
              <div className="sso-guide-name">{p.label}</div>
              <code className="sso-guide-url">{p.issuerUrl}</code>
              {p.hint && <div className="sso-guide-note">{p.hint}</div>}
            </div>
          ))}
        </div>
        <div className="sso-guide-steps">
          <div className="sso-guide-step"><span>1</span>Register this app in your identity provider and copy the Client ID and Client Secret</div>
          <div className="sso-guide-step"><span>2</span>Add the Redirect URI above to the provider's allowed callback URLs (must match exactly)</div>
          <div className="sso-guide-step"><span>3</span>Paste the details above, click "Test Connection" to verify, then Save and Enable</div>
        </div>
      </div>
    </div>
  );
}

// Inline SVG icons for provider presets
function MsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
}
function GIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
