import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './MFA.css';

export default function MFAVerify() {
  const navigate = useNavigate();
  const { completeMfa } = useAuth();

  const [code, setCode]         = useState('');
  const [verifying, setVerifying] = useState(false);
  const [checked, setChecked]   = useState(false);

  useEffect(() => {
    api.get('/mfa/pending').then(r => {
      if (!r.data.pending) { navigate('/login', { replace: true }); return; }
      if (r.data.mfaSetup)  { navigate('/mfa/setup', { replace: true }); return; }
      setChecked(true);
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.replace(/\s/g, '').length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post('/mfa/verify', { code });
      completeMfa(res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  if (!checked) {
    return (
      <div className="mfa-page">
        <div className="mfa-loading"><Loader2 size={28} className="mfa-spin"/><span>Loading...</span></div>
      </div>
    );
  }

  return (
    <div className="mfa-page">
      <div className="mfa-card">

        <div className="mfa-header">
          <div className="mfa-icon-wrap"><ShieldCheck size={28} /></div>
          <h1 className="mfa-title">Two-Factor Authentication</h1>
          <p className="mfa-sub">Enter the 6-digit code from Microsoft Authenticator to continue.</p>
        </div>

        <form className="mfa-body" onSubmit={handleVerify}>
          <div className="mfa-verify-hint">
            Open <strong>Microsoft Authenticator</strong> and enter the code for <strong>SERV-IT</strong>.
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
            <div className="mfa-code-hint">Code refreshes every 30 seconds</div>
          </div>

          <button className="mfa-btn" type="submit" disabled={verifying}>
            {verifying ? <><Loader2 size={16} className="mfa-spin"/> Verifying...</> : 'Verify & Sign In'}
          </button>

          <a href="/login" className="mfa-back-link" onClick={(e) => { e.preventDefault(); navigate('/login', { replace: true }); }}>
            ← Back to login
          </a>
        </form>
      </div>
    </div>
  );
}
