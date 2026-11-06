import React, { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import './TicketTemplate.css';

const defaults = template => Object.fromEntries((template?.fields || []).filter(f => f.type === 'toggle').map(f => [f.id, false]));

export function useTicketTemplate() {
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [values, setValues] = useState({});
  const [ready, setReady] = useState(false);
  const drafts = useRef({});
  useEffect(() => {
    api.get('/config/templates').then(r => { setTemplates(r.data.templates); setReady(true); })
      .catch(() => toast.error('Could not load templates. Reload the page to try again.'));
  }, []);
  const hydrate = ticket => {
    setTemplate(ticket.template_id && ticket.template_snapshot ? { ...ticket.template_snapshot, id: ticket.template_id } : null);
    setValues(ticket.template_values || {});
  };
  const select = id => {
    if (template) drafts.current[template.id] = { template, values };
    const draft = drafts.current[id];
    const next = draft?.template || templates.find(t => t.id === id) || null;
    setTemplate(next);
    setValues(draft?.values || defaults(next));
  };
  const validate = () => {
    for (const f of template?.fields || []) {
      const v = values[f.id];
      if (f.required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) { toast.error(`${f.label} is required`); return false; }
      if (f.type === 'integer' && v !== undefined && v !== '' && (!/^-?\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)))) { toast.error(`${f.label} must be a whole number within the supported range`); return false; }
    }
    return true;
  };
  return { templates, template, values, setValues, select, hydrate, ready, validate,
    payload: { templateId: template?.id || null, templateValues: template ? values : {} } };
}

export function TemplateSelector({ state, disabled }) {
  const options = [...state.templates];
  if (state.template && !options.some(t => t.id === state.template.id)) options.push(state.template);
  return <div className="ticket-template-selector">
    <label htmlFor="ticket-template">Templates <span>(optional)</span></label>
    <select id="ticket-template" value={state.template?.id || ''} onChange={e => state.select(e.target.value)} disabled={disabled || !state.ready}>
      <option value="">{state.ready ? 'None — no template' : 'Loading templates…'}</option>
      {options.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  </div>;
}

export function TemplateFields({ template, values = {}, onChange, readOnly = false, disabled = false }) {
  if (!template) return null;
  return <section className="ip-section ticket-template-fields" aria-label={`${template.name} template fields`}>
    <div className="ip-section-bar"><span>{template.name} — Template Fields</span></div>
    {template.fields.map(field => {
      const id = `template-field-${field.id}`;
      const value = values[field.id];
      const set = next => onChange({ ...values, [field.id]: next });
      return <div className="ticket-template-field" key={field.id}>
        <label htmlFor={id}>{field.label}{!readOnly && field.required && <span className="ip-req"> *</span>}</label>
        {readOnly ? (
          field.type === 'text' ? <div id={id} role="region" aria-label={field.label} tabIndex={0} className="ticket-template-text ticket-template-read">{value || '—'}</div>
            : <div id={id} className="ticket-template-value">{value === undefined || value === null || value === '' ? '—' : field.type === 'toggle' ? (value ? 'On' : 'Off') : String(value)}</div>
        ) : field.type === 'text' ? (
          <textarea id={id} className="ticket-template-text" value={value ?? ''} onChange={e => set(e.target.value)} disabled={disabled} aria-required={field.required} placeholder={`Enter ${field.label.toLowerCase()}…`} />
        ) : field.type === 'dropdown' ? (
          <select id={id} value={value ?? ''} onChange={e => set(e.target.value)} disabled={disabled} aria-required={field.required}>
            <option value="">Select…</option>{field.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === 'toggle' ? (
          <div className="ticket-template-toggle"><button id={id} type="button" role="switch" aria-checked={value === true} aria-label={field.label} disabled={disabled} onClick={() => set(value !== true)}><span /></button><span>{value === true ? 'On' : 'Off'}</span></div>
        ) : <input id={id} type="number" step="1" value={value ?? ''} disabled={disabled} onChange={e => set(e.target.value)} aria-required={field.required} />}
      </div>;
    })}
  </section>;
}
