import React from 'react';
import './Button.css';

export default function Button({ children, variant = 'primary', size = 'md', loading, ...props }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${loading ? 'btn-loading' : ''}`} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="btn-spinner" /> : null}
      {children}
    </button>
  );
}
