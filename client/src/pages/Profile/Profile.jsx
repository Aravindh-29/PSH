import React, { useEffect, useState } from 'react';
import { User, Mail, Lock, Save } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Profile.css';

export default function Profile() {
  const { user: authUser, setUser } = useAuth();
  const [info, setInfo]       = useState({ fullName: '', email: '' });
  const [pwForm, setPwForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving]   = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api.get('/users/me').then(r => {
      setInfo({ fullName: r.data.user.full_name || '', email: r.data.user.email || '' });
    }).catch(() => {});
  }, []);

  const handleInfoSave = async (e) => {
    e.preventDefault();
    if (!info.fullName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const r = await api.put('/users/me', { fullName: info.fullName, email: info.email });
      if (setUser) setUser(prev => ({ ...prev, fullName: r.data.user.full_name, email: r.data.user.email }));
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (!pwForm.currentPassword) { toast.error('Current password required'); return; }
    if (pwForm.newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      await api.put('/users/me', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Password changed');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>My Profile</h1>
        <p>Manage your account information and security settings.</p>
      </div>

      <div className="profile-body">
        {/* Avatar card */}
        <div className="profile-avatar-card">
          <div className="profile-avatar-circle">
            {(info.fullName || authUser?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="profile-avatar-name">{info.fullName || authUser?.username}</div>
          <div className="profile-avatar-role">{authUser?.role}</div>
          <div className="profile-avatar-user">@{authUser?.username}</div>
        </div>

        {/* Info & Password forms */}
        <div className="profile-forms">
          {/* Personal Information */}
          <div className="profile-card">
            <h2 className="profile-card-title"><User size={16} /> Personal Information</h2>
            <form onSubmit={handleInfoSave} className="profile-form">
              <div className="profile-field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={info.fullName}
                  onChange={e => setInfo(p => ({ ...p, fullName: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  value={info.email}
                  onChange={e => setInfo(p => ({ ...p, email: e.target.value }))}
                  placeholder="your@email.com"
                />
              </div>
              <button type="submit" className="profile-save-btn" disabled={saving}>
                <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div className="profile-card">
            <h2 className="profile-card-title"><Lock size={16} /> Change Password</h2>
            <form onSubmit={handlePasswordSave} className="profile-form">
              <div className="profile-field">
                <label>Current Password</label>
                <input
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="Enter current password"
                />
              </div>
              <div className="profile-field">
                <label>New Password</label>
                <input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="profile-field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Repeat new password"
                />
              </div>
              <button type="submit" className="profile-save-btn" disabled={savingPw}>
                <Lock size={14} /> {savingPw ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
