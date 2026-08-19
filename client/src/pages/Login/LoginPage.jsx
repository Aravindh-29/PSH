import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, Lock, User, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import './LoginPage.css';

function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let w, h;

    const PARTICLE_COUNT = 80;
    const particles = [];

    function resize() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.5 + 0.2,
        });
      }
    }

    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, w, h);
      t += 0.005;

      // Wave mesh lines
      ctx.save();
      const waveRows = 6;
      const cols = 12;
      for (let row = 0; row < waveRows; row++) {
        const baseY = h * 0.45 + row * 55;
        ctx.beginPath();
        for (let col = 0; col <= cols; col++) {
          const x = (col / cols) * w;
          const wave = Math.sin(t + col * 0.5 + row * 0.3) * 25 + Math.sin(t * 0.7 + col * 0.3) * 15;
          const y = baseY + wave;
          if (col === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = 0.15 - row * 0.015;
        ctx.strokeStyle = `rgba(100, 180, 255, ${Math.max(0.03, alpha)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Vertical connecting lines
        for (let col = 0; col <= cols; col++) {
          if (row < waveRows - 1) {
            const x = (col / cols) * w;
            const wave1 = Math.sin(t + col * 0.5 + row * 0.3) * 25 + Math.sin(t * 0.7 + col * 0.3) * 15;
            const wave2 = Math.sin(t + col * 0.5 + (row + 1) * 0.3) * 25 + Math.sin(t * 0.7 + col * 0.3) * 15;
            const y1 = baseY + wave1;
            const y2 = (h * 0.45 + (row + 1) * 55) + wave2;
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
            ctx.strokeStyle = `rgba(80, 150, 255, ${Math.max(0.02, alpha * 0.5)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Dot at intersections
            ctx.beginPath();
            ctx.arc(x, y1, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = col % 3 === 0 ? `rgba(100, 180, 255, 0.6)` : `rgba(80, 150, 255, 0.3)`;
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // Orange glow point (bottom-left area)
      const glowX = w * 0.18;
      const glowY = h * 0.72;
      const grad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 120);
      grad.addColorStop(0, 'rgba(232, 93, 4, 0.35)');
      grad.addColorStop(0.4, 'rgba(232, 93, 4, 0.1)');
      grad.addColorStop(1, 'rgba(232, 93, 4, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Floating particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${p.alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    initParticles();
    draw();

    const ro = new ResizeObserver(() => { resize(); initParticles(); });
    ro.observe(canvas);

    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="login-canvas" />;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      toast.error('Please enter your username and password');
      return;
    }
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <ParticleCanvas />
      <div className="login-gradient-overlay" />

      {/* Top logo bar */}
      <div className="login-topbar">
        <div className="login-brand">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="#E85D04" />
            <path d="M16 8L23 12V20L16 24L9 20V12L16 8Z" fill="white" opacity="0.9" />
          </svg>
          <span className="login-brand-name"><strong>PURE</strong>STORAGE<sup>®</sup></span>
        </div>
      </div>

      {/* Center layout */}
      <div className="login-inner">
        {/* Left branding */}
        <div className="login-left">
          <p className="login-welcome">Welcome to</p>
          <h1 className="login-title">
            Pure Storage<br />
            <span className="login-title-orange">Horizon</span>
          </h1>
          <p className="login-subtitle">Enterprise Ticketing Platform</p>
          <div className="login-rule" />
          <div className="login-tagline">
            <Shield size={15} color="rgba(255,255,255,0.45)" />
            <div>
              <p>Secure. Reliable. Built for Performance.</p>
              <p className="login-tagline-sub">Your issues. Our priority.</p>
            </div>
          </div>
          <div className="login-badges">
            <span className="login-badge">🔒 Enterprise Security</span>
            <span className="login-badge">⚡ 99.9% Uptime</span>
            <span className="login-badge">🌐 Global Access</span>
          </div>
        </div>

        {/* Right card */}
        <div className="login-right">
        <div className="login-card">
          <div className="login-card-icon">
            <Shield size={24} color="var(--orange)" />
          </div>

          <h2 className="login-card-title">Sign in to your account</h2>
          <p className="login-card-sub">Enter your credentials to access the ticketing system</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>Username or Email <span className="req">*</span></label>
              <div className="input-wrap">
                <User size={15} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter your username or email"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password <span className="req">*</span></label>
              <div className="input-wrap">
                <Lock size={15} className="input-icon" />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                />
                <button type="button" className="input-eye" onClick={() => setShowPass(s => !s)}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" checked={form.remember} onChange={e => setForm(f => ({ ...f, remember: e.target.checked }))} />
                Remember me
              </label>
              <button type="button" className="forgot-link">Forgot password?</button>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="login-spinner" /> : <Lock size={15} />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="login-or"><span>OR</span></div>

            <button type="button" className="sso-btn">
              <Shield size={15} />
              Sign in with SSO
            </button>
          </form>

          <p className="login-footer">© 2024 Pure Storage Horizon. All rights reserved.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
