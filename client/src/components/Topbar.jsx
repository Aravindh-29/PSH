import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, ChevronDown, LogOut, User, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // user dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);

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

  // ── click outside → close ─────────────────────────────
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
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
        <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
          <div className="topbar-avatar">{user?.fullName?.[0] || 'U'}</div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{user?.fullName}</div>
            <div className="topbar-user-role">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</div>
          </div>
          <ChevronDown size={14} className={`topbar-chevron ${dropdownOpen ? 'open' : ''}`} />

          {dropdownOpen && (
            <div className="topbar-dropdown">
              <button onClick={() => setDropdownOpen(false)}>
                <User size={14} /> Profile
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
