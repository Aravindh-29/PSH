import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Profile.css';

export default function Profile() {
  const { user: authUser } = useAuth();
  const [pwForm, setPwForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const initial = (authUser?.fullName || authUser?.username || 'U')[0].toUpperCase();

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>My Profile</h1>
        <p>Manage your account and security settings.</p>
      </div>

      <div className="profile-body">
        {/* Avatar card */}
        <div className="profile-avatar-card">
          <div className="profile-avatar-circle">{initial}</div>
          <div className="profile-avatar-name">{authUser?.fullName || authUser?.username}</div>
          <div className="profile-avatar-role">{authUser?.role}</div>
          <div className="profile-avatar-user">@{authUser?.username}</div>
        </div>

        {/* Password form */}
        <div className="profile-forms">
          <div className="profile-card">
            <h2 className="profile-card-title"><Lock size={16} /> Change Password</h2>
            <form onSubmit={handlePasswordSave} className="profile-form">
              <div className="profile-field">
                <label>Current Password</label>
                <div className="profile-pw-wrap">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                  <button type="button" className="profile-pw-eye" onClick={() => setShowCurrent(v => !v)}>
                    {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="profile-field">
                <label>New Password</label>
                <div className="profile-pw-wrap">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={pwForm.newPassword}
                    onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="At least 6 characters"
                  />
                  <button type="button" className="profile-pw-eye" onClick={() => setShowNew(v => !v)}>
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="profile-field">
                <label>Confirm New Password</label>
                <div className="profile-pw-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={pwForm.confirmPassword}
                    onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Repeat new password"
                  />
                  <button type="button" className="profile-pw-eye" onClick={() => setShowConfirm(v => !v)}>
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
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
