import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, ChevronDown, LogOut, User, Loader, Bell, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { StatusBadge, PriorityBadge } from './Badge';
import api from '../api/axios';
import './Topbar.css';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function Topbar({ onMenuClick, darkMode, onThemeToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unread, markRead, markAllRead } = useNotifications();

  // user dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // notifications dropdown
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  // search
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(-1); // keyboard nav index

  const inputRef    = useRef(null);
  const containerRef = useRef(null);
  const debouncedQ  = useDebounce(query, 280);

  // ── fetch results ──────────────────────────────────────
  useEffect(() => {
    const q = debouncedQ.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    setSearching(true);
    api.get(`/tickets?search=${encodeURIComponent(q)}&limit=12`)
      .then(res => {
        setResults(res.data.tickets || []);
        setOpen(true);
        setFocused(-1);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQ]);

  // ── Ctrl+K → focus input ───────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── click outside → close search ─────────────────────
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ── click outside → close notification dropdown ───────
  useEffect(() => {
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ── keyboard navigation inside dropdown ───────────────
  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && focused >= 0) { goToTicket(results[focused]); }
  };

  const goToTicket = (t) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(`/tickets/${t.id}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={onMenuClick}>
        <Menu size={20} />
      </button>

      {/* ── Global Search ── */}
      <div className={`topbar-search ${open ? 'search-active' : ''}`} ref={containerRef}>
        {searching
          ? <Loader size={14} className="search-icon search-spin" />
          : <Search size={14} className="search-icon" />}
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tickets..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {query ? (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}>✕</button>
        ) : (
          <kbd>Ctrl + K</kbd>
        )}

        {/* ── Dropdown results ── */}
        {open && (
          <div className="search-dropdown">
            {results.length === 0 && !searching && (
              <div className="search-empty">No tickets found for "<strong>{query}</strong>"</div>
            )}
            {results.map((t, i) => (
              <div
                key={t.id}
                className={`search-result ${i === focused ? 'search-result-focused' : ''}`}
                onMouseDown={() => goToTicket(t)}
                onMouseEnter={() => setFocused(i)}
              >
                <span className="sr-num">{t.ticket_number}</span>
                <div className="sr-body">
                  <span className="sr-subj">{t.short_description}</span>
                  <span className="sr-customer">{t.customer_name}</span>
                </div>
                <div className="sr-badges">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
              </div>
            ))}
            {results.length > 0 && (
              <div className="search-footer">
                {results.length} result{results.length !== 1 ? 's' : ''} · Press Enter to open highlighted
              </div>
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        {/* ── Theme Toggle ── */}
        <button
          className="theme-toggle-btn"
          onClick={onThemeToggle}
          title={darkMode ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* ── Notification Bell ── */}
        <div className="notif-wrapper" ref={notifRef}>
          <button
            className="topbar-icon-btn"
            onClick={() => setNotifOpen(o => !o)}
            title="Notifications"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span>Notifications</span>
                {unread > 0 && (
                  <button className="notif-mark-all" onClick={() => markAllRead()}>
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.filter(n => !n.is_read).length === 0 ? (
                <div className="notif-empty">No new notifications</div>
              ) : (
                <div className="notif-list">
                  {notifications.filter(n => !n.is_read).map(n => (
                    <div
                      key={n.id}
                      className={`notif-item ${!n.is_read ? 'notif-unread' : ''}`}
                      onClick={() => {
                        markRead(n.id);
                        if (n.ticket_id) {
                          setNotifOpen(false);
                          navigate(`/tickets/${n.ticket_id}`);
                        }
                      }}
                    >
                      {!n.is_read && <span className="notif-dot" />}
                      <div className="notif-body">
                        <div className="notif-title">{n.title}</div>
                        {n.message && <div className="notif-msg">{n.message}</div>}
                        <div className="notif-time">{relativeTime(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
          <div className="topbar-avatar">{user?.fullName?.[0] || 'U'}</div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{user?.fullName}</div>
            <div className="topbar-user-role">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</div>
          </div>
          <ChevronDown size={14} className={`topbar-chevron ${dropdownOpen ? 'open' : ''}`} />

          {dropdownOpen && (
            <div className="topbar-dropdown">
              <button onClick={() => { setDropdownOpen(false); navigate('/profile'); }}>
                <User size={14} /> My Profile
              </button>
              <hr />
              <button onClick={handleLogout} className="logout-item">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
