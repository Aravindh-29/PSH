import React, { useState, useEffect } from 'react';
import { Mail, Server, Lock, User, Send, CheckCircle, AlertCircle, Eye, EyeOff, Loader, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './EmailConfig.css';

const PRESETS = [
  { label: 'Office 365', host: 'smtp.office365.com', port: 587, encryption: 'tls' },
  { label: 'Outlook.com', host: 'smtp-mail.outlook.com', port: 587, encryption: 'tls' },
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, encryption: 'tls' },
  { label: 'Generic SMTP', host: '', port: 587, encryption: 'tls' },
];

const DEFAULT = {
  smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
  from_name: 'PSH Notifications', from_email: '',
  encryption: 'tls', is_enabled: false,
};

export default function EmailConfig() {
  const navigate = useNavigate();
  const [form, setForm]           = useState(DEFAULT);
  const [loaded, setLoaded]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [showPass, setShowPass]   = useState(false);
  const [testTo, setTestTo]       = useState('');
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, msg }

  const openDocs = async () => {
    try {
      const r = await api.get('/kb/slug/email-configuration');
      navigate(`/knowledge-base/${r.data.article.id}`);
    } catch {
      try {
        const r = await api.get('/kb?search=Email+Notifications');
        const match = r.data.articles?.find(a => a.title.toLowerCase().includes('email'));
        if (match) { navigate(`/knowledge-base/${match.id}`); return; }
      } catch { /* ignore */ }
      toast.error('Documentation article not found. Restart the server once to seed it.');
    }
  };

  useEffect(() => {
    api.get('/config/admin/email')
      .then(r => { setForm({ ...DEFAULT, ...r.data.config }); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const applyPreset = (preset) => {
    setForm(f => ({ ...f, smtp_host: preset.host, smtp_port: preset.port, encryption: preset.encryption }));
  };

  const handleSave = async () => {
    if (!form.smtp_host || !form.smtp_user || !form.from_email) {
      toast.error('SMTP Host, Username, and From Email are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/config/admin/email', form);
      toast.success('Email configuration saved');
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.smtp_host || !form.smtp_user) {
      toast.error('Fill in SMTP settings before testing');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/config/admin/email/test', { ...form, test_to: testTo || form.smtp_user });
      setTestResult({ ok: true, msg: r.data.message });
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <div className="ec-loading"><Loader size={20} className="ec-spin" /></div>;

  return (
    <div className="ec-page">
      {/* ── Header ── */}
      <div className="ec-header">
        <div>
          <div className="ec-title">Email Configuration</div>
          <div className="ec-sub">Configure SMTP to enable email notifications for all ticket actions</div>
          <button className="ec-doc-link" onClick={openDocs}>
            <BookOpen size={13} /> View Documentation
          </button>
        </div>
        <label className="ec-enable-toggle">
          <input
            type="checkbox"
            checked={!!form.is_enabled}
            onChange={e => set('is_enabled', e.target.checked)}
          />
          <span className="ec-toggle-track">
            <span className="ec-toggle-thumb" />
          </span>
          <span className="ec-toggle-label">{form.is_enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {/* ── Provider presets ── */}
      <div className="ec-card">
        <div className="ec-card-title">Quick Setup</div>
        <div className="ec-presets">
          {PRESETS.map(p => (
            <button key={p.label} className="ec-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SMTP Settings ── */}
      <div className="ec-card">
        <div className="ec-card-title"><Server size={15} /> SMTP Server</div>
        <div className="ec-grid">
          <div className="ec-field ec-field-lg">
            <label>SMTP Host <span className="ec-req">*</span></label>
            <input
              type="text"
              value={form.smtp_host}
              onChange={e => set('smtp_host', e.target.value)}
              placeholder="smtp.office365.com"
            />
          </div>
          <div className="ec-field">
            <label>Port</label>
            <input
              type="number"
              value={form.smtp_port}
              onChange={e => set('smtp_port', parseInt(e.target.value) || 587)}
              placeholder="587"
            />
          </div>
          <div className="ec-field">
            <label>Encryption</label>
            <select value={form.encryption} onChange={e => set('encryption', e.target.value)}>
              <option value="tls">TLS (STARTTLS)</option>
              <option value="ssl">SSL</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Authentication ── */}
      <div className="ec-card">
        <div className="ec-card-title"><Lock size={15} /> Authentication</div>
        <div className="ec-grid">
          <div className="ec-field ec-field-lg">
            <label>Username / Email <span className="ec-req">*</span></label>
            <input
              type="text"
              value={form.smtp_user}
              onChange={e => set('smtp_user', e.target.value)}
              placeholder="notifications@company.com"
              autoComplete="off"
            />
          </div>
          <div className="ec-field ec-field-lg">
            <label>Password / App Password</label>
            <div className="ec-pass-wrap">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.smtp_pass}
                onChange={e => set('smtp_pass', e.target.value)}
                placeholder="App password or SMTP password"
                autoComplete="new-password"
              />
              <button type="button" className="ec-pass-eye" onClick={() => setShowPass(v => !v)}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="ec-hint">For Office 365 / Gmail, use an App Password</div>
          </div>
        </div>
      </div>

      {/* ── Sender Identity ── */}
      <div className="ec-card">
        <div className="ec-card-title"><User size={15} /> Sender Identity</div>
        <div className="ec-grid">
          <div className="ec-field">
            <label>From Name</label>
            <input
              type="text"
              value={form.from_name}
              onChange={e => set('from_name', e.target.value)}
              placeholder="PSH Notifications"
            />
          </div>
          <div className="ec-field ec-field-lg">
            <label>From Email <span className="ec-req">*</span></label>
            <input
              type="email"
              value={form.from_email}
              onChange={e => set('from_email', e.target.value)}
              placeholder="no-reply@company.com"
            />
          </div>
        </div>
      </div>

      {/* ── Test Email ── */}
      <div className="ec-card">
        <div className="ec-card-title"><Send size={15} /> Test Connection</div>
        <div className="ec-test-row">
          <input
            type="email"
            className="ec-test-input"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder={form.smtp_user || 'recipient@company.com'}
          />
          <button className="ec-test-btn" onClick={handleTest} disabled={testing}>
            {testing ? <Loader size={14} className="ec-spin" /> : <Send size={14} />}
            {testing ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>
        {testResult && (
          <div className={`ec-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
            {testResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {testResult.msg}
          </div>
        )}
      </div>

      {/* ── What triggers emails ── */}
      <div className="ec-card ec-triggers-card">
        <div className="ec-card-title"><Mail size={15} /> Email Triggers</div>
        <div className="ec-triggers-grid">
          {[
            { event: 'Ticket Created & Assigned', recipients: 'Assignee' },
            { event: 'Ticket Reassigned', recipients: 'New Assignee' },
            { event: 'Status Changed', recipients: 'Creator, Assignee' },
            { event: 'Ticket Resolved / Closed', recipients: 'Creator, Assignee' },
            { event: 'Comment Added', recipients: 'Other party (not commenter)' },
            { event: 'Work Note Added', recipients: 'Other party (not commenter)' },
          ].map(t => (
            <div key={t.event} className="ec-trigger-row">
              <div className="ec-trigger-event">{t.event}</div>
              <div className="ec-trigger-to">{t.recipients}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="ec-actions">
        <button className="ec-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={14} className="ec-spin" /> : null}
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
