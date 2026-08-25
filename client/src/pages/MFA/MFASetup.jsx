import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, KeyRound, Copy, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './MFA.css';

export default function MFASetup() {
  const navigate = useNavigate();
  const { completeMfa } = useAuth();

  const [qrDataUrl, setQrDataUrl]   = useState('');
  const [secret, setSecret]         = useState('');
  const [code, setCode]             = useState('');
  const [loading, setLoading]       = useState(true);
  const [verifying, setVerifying]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const [step, setStep]             = useState(1); // 1=scan, 2=verify

  useEffect(() => {
    api.get('/mfa/pending').then(r => {
      if (!r.data.pending) { navigate('/login', { replace: true }); return; }
      if (!r.data.mfaSetup) { navigate('/mfa/verify', { replace: true }); return; }
      api.get('/mfa/setup-qr')
        .then(res => { setQrDataUrl(res.data.qrDataUrl); setSecret(res.data.secret); })
        .catch(() => toast.error('Failed to load QR code'))
        .finally(() => setLoading(false));
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.replace(/\s/g, '').length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post('/mfa/confirm-setup', { code });
      completeMfa(res.data.user);
      toast.success('MFA configured successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const formatSecret = (s) => s ? s.match(/.{1,4}/g)?.join(' ') : '';

  return (
    <div className="mfa-page">
      <div className="mfa-card">

        {/* Header */}
        <div className="mfa-header">
          <div className="mfa-icon-wrap">
            <ShieldCheck size={28} />
          </div>
          <h1 className="mfa-title">Set up Two-Factor Authentication</h1>
          <p className="mfa-sub">Secure your account with Microsoft Authenticator. This is required to access SERV-IT.</p>
        </div>

        {/* Step tabs */}
        <div className="mfa-steps">
          <div className={`mfa-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <span className="mfa-step-num">{step > 1 ? <CheckCircle2 size={14}/> : '1'}</span>
            <span>Scan QR code</span>
          </div>
          <div className="mfa-step-line" />
          <div className={`mfa-step ${step >= 2 ? 'active' : ''}`}>
            <span className="mfa-step-num">2</span>
            <span>Verify code</span>
          </div>
        </div>

        {loading ? (
          <div className="mfa-loading"><Loader2 size={28} className="mfa-spin" /><span>Loading...</span></div>
        ) : step === 1 ? (
          <div className="mfa-body">
            {/* Install instructions */}
            <div className="mfa-instruction-row">
              <div className="mfa-instr-icon mfa-instr-icon-img">
                <img src="/ms-authenticator.png" alt="Microsoft Authenticator" className="mfa-ms-icon" />
              </div>
              <div>
                <div className="mfa-instr-title">Install Microsoft Authenticator</div>
                <div className="mfa-instr-sub">Download from App Store or Google Play, then open it and tap <strong>+</strong> to add an account.</div>
              </div>
            </div>

            {/* QR + Manual key side by side */}
            <div className="mfa-qr-manual-row">
              <div className="mfa-qr-wrap">
                {qrDataUrl && <img src={qrDataUrl} alt="MFA QR Code" className="mfa-qr" />}
                <div className="mfa-qr-label">Scan with<br/>Authenticator</div>
              </div>

              <div className="mfa-manual">
                <div className="mfa-manual-label">
                  <KeyRound size={12} /> Can't scan? Enter key manually:
                </div>
                <div className="mfa-secret-row">
                  <code className="mfa-secret">{formatSecret(secret)}</code>
                  <button className="mfa-copy-btn" onClick={handleCopy} title="Copy key">
                    {copied ? <CheckCircle2 size={13} color="#16a34a"/> : <Copy size={13} />}
                  </button>
                </div>
                <div className="mfa-manual-hint">Account: <strong>SERV-IT</strong> · <strong>Time-based</strong></div>
              </div>
            </div>

            <button className="mfa-btn" onClick={() => setStep(2)}>
              I've scanned the code — Continue
            </button>
          </div>
        ) : (
          <form className="mfa-body" onSubmit={handleVerify}>
            <div className="mfa-instruction-row">
              <div className="mfa-instr-icon"><ShieldCheck size={18} /></div>
              <div>
                <div className="mfa-instr-title">Enter the 6-digit code</div>
                <div className="mfa-instr-sub">Open Microsoft Authenticator and enter the code shown for SERV-IT.</div>
              </div>
            </div>

            <div className="mfa-code-wrap">
              <input
                className="mfa-code-input"
                type="text"
                inputMode="numeric"
                maxLength={7}
                placeholder="000 000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9\s]/g, ''))}
                autoFocus
              />
            </div>

            <button className="mfa-btn" type="submit" disabled={verifying}>
              {verifying ? <><Loader2 size={16} className="mfa-spin"/> Verifying...</> : 'Verify & Activate MFA'}
            </button>
            <button type="button" className="mfa-back-btn" onClick={() => setStep(1)}>
              ← Back to QR code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
