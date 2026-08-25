import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, Lock, User, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import './LoginPage.css';

function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let w = 0, h = 0;

    const PARTICLE_COUNT = 65;
    const METEOR_INTERVAL = 210;
    const ORB_COLORS = [
      [60, 143, 216],
      [30, 105, 195],
      [205, 82, 8],
      [85, 165, 245],
    ];

    const particles = [];
    const orbs = [];
    const meteors = [];
    let meteorTimer = Math.floor(METEOR_INTERVAL * 0.55);

    function resize() {
      w = canvas.width  = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }

    function initAll() {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.30,
          vy: (Math.random() - 0.5) * 0.30,
          r: Math.random() * 1.6 + 0.4,
          baseAlpha: Math.random() * 0.42 + 0.18,
          tw: Math.random() * 11 + 6,
          twOff: Math.random() * Math.PI * 2,
        });
      }
      orbs.length = 0;
      const radii  = [135, 105, 115, 92];
      const alphas = [0.055, 0.044, 0.040, 0.038];
      for (let i = 0; i < 4; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.09,
          vy: (Math.random() - 0.5) * 0.09,
          r: radii[i],
          rgb: ORB_COLORS[i],
          alpha: alphas[i],
          ps: Math.random() * 0.55 + 0.28,
          po: Math.random() * Math.PI * 2,
        });
      }
    }

    function spawnMeteor() {
      const spd = 3.0 + Math.random() * 2.0;
      const ang = (Math.PI / 6) + Math.random() * (Math.PI / 8);
      meteors.push({
        x: Math.random() * w * 0.65 + w * 0.04,
        y: Math.random() * h * 0.32,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1.0,
        decay: 0.020 + Math.random() * 0.013,
        len: 58 + Math.random() * 78,
      });
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let t = 0;

    function drawFrame() {
      ctx.clearRect(0, 0, w, h);
      t += 0.004;

      // 1 — aurora orbs
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        const pad = orb.r * 1.6;
        if (orb.x < -pad) orb.x = w + orb.r;
        if (orb.x > w + pad) orb.x = -orb.r;
        if (orb.y < -pad) orb.y = h + orb.r;
        if (orb.y > h + pad) orb.y = -orb.r;

        const pulse = Math.sin(t * orb.ps + orb.po) * 0.20 + 0.80;
        const rr = orb.r * pulse;
        const [r, g, b] = orb.rgb;
        const og = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, rr);
        og.addColorStop(0,    `rgba(${r},${g},${b},${(orb.alpha * pulse * 1.55).toFixed(3)})`);
        og.addColorStop(0.45, `rgba(${r},${g},${b},${(orb.alpha * pulse * 0.72).toFixed(3)})`);
        og.addColorStop(1,    `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2 — wave grid
      const ROWS = 7, COLS = 13;
      const waveYs = [];
      for (let row = 0; row < ROWS; row++) {
        const rowA = Math.max(0.024, 0.148 - row * 0.013);
        const baseY = h * 0.43 + row * 52;
        const ys = [];
        ctx.beginPath();
        for (let col = 0; col <= COLS; col++) {
          const x = (col / COLS) * w;
          const y = baseY
            + Math.sin(t + col * 0.47 + row * 0.27) * 27
            + Math.sin(t * 0.62 + col * 0.29) * 13;
          ys.push(y);
          col === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(100,185,255,${rowA})`;
        ctx.lineWidth = 0.85;
        ctx.stroke();
        waveYs.push(ys);
      }

      // vertical connectors + glowing nodes
      for (let row = 0; row < ROWS - 1; row++) {
        const rowA = Math.max(0.024, 0.148 - row * 0.013);
        for (let col = 0; col <= COLS; col++) {
          const x = (col / COLS) * w;
          const y1 = waveYs[row][col];
          const y2 = waveYs[row + 1][col];
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
          ctx.strokeStyle = `rgba(80,155,255,${Math.max(0.011, rowA * 0.40)})`;
          ctx.lineWidth = 0.38;
          ctx.stroke();

          if (col % 3 === row % 3) {
            const gr = 3.8 + Math.sin(t * 2.8 + col + row) * 1.1;
            const ng = ctx.createRadialGradient(x, y1, 0, x, y1, gr);
            ng.addColorStop(0, 'rgba(155,218,255,0.8)');
            ng.addColorStop(1, 'rgba(100,185,255,0)');
            ctx.fillStyle = ng;
            ctx.beginPath();
            ctx.arc(x, y1, gr, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y1, 1.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(195,235,255,0.92)';
            ctx.fill();
          }
        }
      }

      // 3 — pulsing accent glows
      const op = Math.sin(t * 1.75) * 0.07 + 0.93;
      const gg = ctx.createRadialGradient(w * 0.13, h * 0.80, 0, w * 0.13, h * 0.80, 175);
      gg.addColorStop(0,    `rgba(232,93,4,${(0.29 * op).toFixed(3)})`);
      gg.addColorStop(0.45, `rgba(232,93,4,${(0.09 * op).toFixed(3)})`);
      gg.addColorStop(1,    'rgba(232,93,4,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, w, h);

      const bp = Math.sin(t * 1.35 + 1.3) * 0.06 + 0.94;
      const bg = ctx.createRadialGradient(w * 0.84, h * 0.17, 0, w * 0.84, h * 0.17, 152);
      bg.addColorStop(0,   `rgba(48,143,216,${(0.20 * bp).toFixed(3)})`);
      bg.addColorStop(0.5, `rgba(30,100,180,${(0.07 * bp).toFixed(3)})`);
      bg.addColorStop(1,   'rgba(30,100,180,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // 4 — twinkling star particles
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
        const twinkle = Math.sin(t * p.tw + p.twOff) * 0.27 + 0.73;
        const alpha = p.baseAlpha * twinkle;
        if (p.r > 1.1) {
          const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.4);
          pg.addColorStop(0, `rgba(145,208,255,${(alpha * 0.52).toFixed(3)})`);
          pg.addColorStop(1, 'rgba(145,208,255,0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(130,200,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      // connection mesh (skip sqrt using squared distance)
      const CD2 = 82 * 82;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          if (dx > 82 || dx < -82) continue;
          const dy = particles[i].y - particles[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CD2) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(100,175,255,${((1 - d2 / CD2) * 0.095).toFixed(3)})`;
            ctx.lineWidth = 0.42;
            ctx.stroke();
          }
        }
      }

      // 5 — shooting meteors
      meteorTimer++;
      if (meteorTimer >= METEOR_INTERVAL && meteors.length < 3) {
        spawnMeteor();
        meteorTimer = 0;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        const tl = m.len * m.life;
        const tx = m.x - (m.vx / spd) * tl;
        const ty = m.y - (m.vy / spd) * tl;

        const mg = ctx.createLinearGradient(tx, ty, m.x, m.y);
        mg.addColorStop(0,    'rgba(255,255,255,0)');
        mg.addColorStop(0.62, `rgba(195,228,255,${(m.life * 0.34).toFixed(3)})`);
        mg.addColorStop(1,    `rgba(255,255,255,${(m.life * 0.88).toFixed(3)})`);
        ctx.strokeStyle = mg;
        ctx.lineWidth = 1.35 * m.life;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        const hg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 7);
        hg.addColorStop(0,   `rgba(255,255,255,${m.life.toFixed(3)})`);
        hg.addColorStop(0.4, `rgba(200,235,255,${(m.life * 0.48).toFixed(3)})`);
        hg.addColorStop(1,   'rgba(200,235,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
        ctx.fill();

        m.x += m.vx; m.y += m.vy; m.life -= m.decay;
        if (m.life <= 0 || m.x > w + 60 || m.y > h + 60) meteors.splice(i, 1);
      }

      if (!reduceMotion) animId = requestAnimationFrame(drawFrame);
    }

    resize();
    initAll();
    drawFrame();

    const handleResize = () => { resize(); initAll(); if (reduceMotion) drawFrame(); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (ro) ro.observe(canvas);
    else window.addEventListener('resize', handleResize);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-canvas" />;
}

const SSO_ERRORS = {
  sso_not_configured: 'SSO is not configured on this server.',
  sso_failed:         'SSO sign-in failed. Please try again or use your password.',
  sso_no_email:       'Your SSO account did not provide an email address.',
  sso_user_not_found: 'No account found for your SSO identity. Contact your administrator.',
  account_disabled:   'Your account has been disabled. Contact your administrator.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLabel,   setSsoLabel]   = useState('SSO');
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err && SSO_ERRORS[err]) toast.error(SSO_ERRORS[err]);
  }, []);

  useEffect(() => {
    api.get('/auth/sso-status')
      .then(r => {
        setSsoEnabled(r.data.enabled);
        if (r.data.providerName) setSsoLabel(r.data.providerName);
      })
      .catch(() => {});
  }, []);

  const handleSso = () => {
    setSsoLoading(true);
    window.location.href = '/api/auth/sso';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      toast.error('Please enter your username and password');
      return;
    }
    setLoading(true);
    try {
      const result = await login(form.username, form.password);
      if (result.mfaRequired) {
        navigate(result.mfaSetup ? '/mfa/setup' : '/mfa/verify', { replace: true });
        return;
      }
      navigate('/');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <main className="login-inner">
        {/* Left sign-in panel */}
        <section className="login-form-panel" aria-label="SERV-IT sign in">
          <div className="login-panel-top">
            <span className="login-secure-label">
              <Shield size={15} aria-hidden="true" />
              SERV-IT Secure Access
            </span>
          </div>

          <div className="login-card">
            <div className="login-card-heading">
              <div className="login-card-icon">
                <Lock size={22} aria-hidden="true" />
              </div>
              <p className="login-eyebrow">Welcome back</p>
            </div>

            <h1 className="login-card-title">Sign in to SERV-IT</h1>
            <p className="login-card-sub">
              Enter your credentials to securely access your enterprise workspace.
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="servit-username">Username <span className="req">*</span></label>
                <div className="input-wrap">
                  <User size={17} className="input-icon" aria-hidden="true" />
                  <input
                    id="servit-username"
                    type="text"
                    placeholder="Enter your username"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    autoComplete="username"
                    aria-required="true"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="servit-password">Password <span className="req">*</span></label>
                <div className="input-wrap">
                  <Lock size={17} className="input-icon" aria-hidden="true" />
                  <input
                    id="servit-password"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="current-password"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    className="input-eye"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="login-options">
                <label className="remember-me">
                  <input
                    type="checkbox"
                    checked={form.remember}
                    onChange={e => setForm(f => ({ ...f, remember: e.target.checked }))}
                  />
                  Remember me
                </label>
                <button type="button" className="forgot-link">Forgot password?</button>
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? <span className="login-spinner" /> : <Lock size={15} />}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {ssoEnabled && (
                <>
                  <div className="login-or"><span>OR</span></div>
                  <button
                    type="button"
                    className="sso-btn"
                    onClick={handleSso}
                    disabled={ssoLoading}
                  >
                    {ssoLoading ? <span className="login-spinner" /> : <Shield size={15} />}
                    {ssoLoading ? 'Redirecting...' : `Sign in with ${ssoLabel}`}
                  </button>
                </>
              )}
            </form>

            <div className="login-trust-note">
              <span className="login-trust-dot" />
              Protected enterprise access
            </div>
          </div>

          <p className="login-footer">© 2026 SERV-IT. All rights reserved.</p>
        </section>

        {/* Right branding panel */}
        <aside className="login-brand-panel" aria-label="SERV-IT platform overview">
          <ParticleCanvas />
          <div className="login-gradient-overlay" />
          <div className="login-brand-accent login-brand-accent-one" />
          <div className="login-brand-accent login-brand-accent-two" />

          <div className="login-brand-content">
            <div className="login-logo-shell">
              <img src="/psh.png" alt="SERV-IT" className="login-left-logo" />
            </div>

            <p className="login-welcome">Connected support. Clear outcomes.</p>
            <h2 className="login-title">
              Enterprise service,
              <span className="login-title-orange"> intelligently delivered.</span>
            </h2>
            <p className="login-subtitle">
              A secure ticketing workspace that keeps teams aligned, requests moving,
              and every service interaction visible.
            </p>

            <div className="login-rule" />

            <div className="login-tagline">
              <div className="login-tagline-icon">
                <Shield size={18} aria-hidden="true" />
              </div>
              <div>
                <p>Secure. Reliable. Built for performance.</p>
                <p className="login-tagline-sub">Your issues. Our priority.</p>
              </div>
            </div>

            <div className="login-badges" aria-label="Platform benefits">
              <span className="login-badge"><b>24/7</b> Service visibility</span>
              <span className="login-badge"><b>99.9%</b> Platform uptime</span>
              <span className="login-badge"><b>One</b> Connected workspace</span>
            </div>
          </div>

          <div className="login-brand-footer">
            <span>Enterprise Ticketing Platform</span>
            <span className="login-brand-footer-line" />
            <span>Serv-IT</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
