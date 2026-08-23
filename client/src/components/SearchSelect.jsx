import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  allowFreeText = false,
  disabled = false,
  searchPlaceholder = null,   // when set, always shows internal search box with this text
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const wrapRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // Auto-focus internal search when dropdown opens (standard mode only)
  useEffect(() => {
    if (open && !allowFreeText && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, allowFreeText]);

  // Close when click outside
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // ── Free-text / combobox mode ─────────────────────────────────────────────
  if (allowFreeText) {
    const comboDisplay = open ? query : (selected?.label || value || '');
    return (
      <div ref={wrapRef} className="ss-wrap">
        <div className="ss-input-wrap">
          <input
            className="ss-input"
            type="text"
            value={comboDisplay}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            onChange={e => {
              setQuery(e.target.value);
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {!disabled && (
            <span
              className={`ss-chevron${open ? ' ss-chevron-open' : ''}`}
              onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
            >
              <ChevronDown size={14} />
            </span>
          )}
        </div>
        {open && options.length > 0 && (
          <div className="ss-dropdown">
            {filtered.length === 0
              ? <div className="ss-no-results">No results</div>
              : filtered.map(o => (
                <div
                  key={o.value}
                  className={`ss-option${String(o.value) === String(value) ? ' ss-active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                >
                  {o.label}
                </div>
              ))
            }
          </div>
        )}
      </div>
    );
  }

  // ── Standard mode: display input + internal search in dropdown ────────────
  // NOTE: no e.preventDefault() on input's onMouseDown so the browser naturally
  // focuses it — this makes :focus-within work for the z-index elevation trick.
  const displayText = selected?.label || '';

  return (
    <div ref={wrapRef} className="ss-wrap">
      <div className="ss-input-wrap">
        <input
          className="ss-input"
          type="text"
          value={displayText}
          placeholder={placeholder}
          disabled={disabled}
          readOnly
          autoComplete="off"
          onMouseDown={() => { if (!disabled) setOpen(v => !v); }}
          onKeyDown={e => {
            if (!disabled && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) {
              e.preventDefault();
              setOpen(true);
            }
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          }}
        />
        {!disabled && (
          <span
            className={`ss-chevron${open ? ' ss-chevron-open' : ''}`}
            onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
          >
            <ChevronDown size={14} />
          </span>
        )}
      </div>
      {open && (
        <div className="ss-dropdown">
          {(searchPlaceholder || options.length > 5) && (
            <div className="ss-search-wrap">
              <input
                ref={searchRef}
                className="ss-search-input"
                type="text"
                value={query}
                placeholder={searchPlaceholder || 'Search...'}
                autoComplete="off"
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
              />
            </div>
          )}
          {filtered.length === 0
            ? <div className="ss-no-results">No results</div>
            : filtered.map(o => (
              <div
                key={o.value}
                className={`ss-option${String(o.value) === String(value) ? ' ss-active' : ''}`}
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {o.label}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
