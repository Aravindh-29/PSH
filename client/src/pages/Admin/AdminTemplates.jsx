import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { TemplateFields } from '../../components/TicketTemplate';
import './AdminTemplates.css';

const TYPES = { text: 'Text (long or short)', integer: 'Integer (whole number)', dropdown: 'Dropdown', toggle: 'Toggle (On / Off)' };
export default function AdminTemplates() {
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setTemplates((await api.get('/config/templates?all=true')).data.templates); }
    catch { setError('Could not load templates.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const edit = template => setDraft({ ...template, fields: template.fields.map(f => ({ ...f, optionsText: f.options.join('\n') })) });
  const updateField = (id, change) => setDraft(d => ({ ...d, fields: d.fields.map(f => f.id === id ? { ...f, ...change } : f) }));
  const move = (index, direction) => setDraft(d => {
    const fields = [...d.fields];
    [fields[index], fields[index + direction]] = [fields[index + direction], fields[index]];
    return { ...d, fields };
  });
  const save = async () => {
    if (!draft.name.trim()) return toast.error('Enter a template name');
    if (!draft.fields.length) return toast.error('Add at least one field');
    const fields = draft.fields.map(({ optionsText, ...f }) => ({ ...f, options: f.type === 'dropdown' ? (optionsText || '').split('\n').map(o => o.trim()).filter(Boolean) : [] }));
    setBusy(true);
    try {
      const payload = { name: draft.name, fields, is_active: draft.is_active };
      if (draft.id) await api.put(`/config/admin/templates/${draft.id}`, payload);
      else await api.post('/config/admin/templates', payload);
      toast.success('Template saved'); setDraft(null); await load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not save template'); }
    finally { setBusy(false); }
  };
  const toggle = async template => {
    setBusy(true);
    try {
      await api.put(`/config/admin/templates/${template.id}`, { ...template, is_active: !template.is_active });
      toast.success(template.is_active ? 'Template deactivated' : 'Template activated'); await load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not update template'); }
    finally { setBusy(false); }
  };

  if (draft) return <div className="cfg-section template-builder">
    <h2>{draft.id ? 'Edit Template' : 'Create Template'}</h2>
    <p className="cfg-section-desc">Add the fields users will fill in when they select this template. Changes apply to new selections; saved tickets keep their original fields.</p>
    <div className="cfg-form-row"><label htmlFor="template-name">Template Name *</label><input id="template-name" maxLength={150} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} disabled={busy} placeholder="e.g. Delloitte" /></div>
    <div className="cfg-section-header"><h3>Template Fields ({draft.fields.length})</h3><button type="button" className="cfg-btn-primary" disabled={busy} onClick={() => setDraft(d => ({ ...d, fields: [...d.fields, { id: crypto.randomUUID(), label: '', type: 'text', required: false, options: [], optionsText: '' }] }))}>+ Create New Field</button></div>
    {!draft.fields.length && <p className="template-empty">No fields yet. Click Create New Field to add your first field.</p>}
    <fieldset disabled={busy} className="template-fieldset">
      {draft.fields.map((f, index) => <div className="template-editor-field" key={f.id}>
        <div className="template-editor-header"><strong>Field {index + 1}</strong><div className="template-editor-actions">
          <button type="button" className="cfg-btn-cancel" disabled={index === 0} aria-label={`Move field ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="cfg-btn-cancel" disabled={index === draft.fields.length - 1} aria-label={`Move field ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="cfg-btn-cancel" onClick={() => setDraft(d => ({ ...d, fields: d.fields.filter(field => field.id !== f.id) }))}>Remove field {index + 1}</button>
        </div></div>
        <div className="template-editor-grid">
          <div className="cfg-form-row"><label htmlFor={`field-name-${f.id}`}>Field Name *</label><input id={`field-name-${f.id}`} maxLength={150} value={f.label} onChange={e => updateField(f.id, { label: e.target.value })} placeholder="e.g. Investigation Notes" /></div>
          <div className="cfg-form-row"><label htmlFor={`field-type-${f.id}`}>Field Type</label><select id={`field-type-${f.id}`} value={f.type} onChange={e => updateField(f.id, { type: e.target.value })}>{Object.entries(TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        </div>
        {f.type === 'dropdown' && <div className="cfg-form-row"><label htmlFor={`field-options-${f.id}`}>Dropdown Options * (one per line)</label><textarea id={`field-options-${f.id}`} rows={4} value={f.optionsText} onChange={e => updateField(f.id, { optionsText: e.target.value })} placeholder={'Production\nTest\nDevelopment'} /></div>}
        <label className="template-required"><input type="checkbox" checked={f.required} onChange={e => updateField(f.id, { required: e.target.checked })} /> Required field <span>(only when this template is selected)</span></label>
      </div>)}
    </fieldset>
    {draft.fields.length > 0 && <details className="template-preview"><summary>Field preview</summary><TemplateFields template={{ ...draft, fields: draft.fields.map(f => ({ ...f, label: f.label || 'Unnamed field' })) }} readOnly /></details>}
    <div className="template-editor-actions template-footer"><button className="cfg-btn-cancel" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className="cfg-btn-save" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Template'}</button></div>
  </div>;

  return <div className="cfg-section">
    <div className="cfg-section-header"><p className="cfg-section-desc">Manage optional ticket templates and their fields.</p><button className="cfg-btn-primary" onClick={() => setDraft({ name: '', fields: [], is_active: true })}>+ Create Template</button></div>
    {loading ? <p>Loading templates…</p> : error ? <p role="alert">{error} <button className="cfg-btn-cancel" onClick={load}>Retry</button></p> : <div className="cfg-table-wrap"><table className="cfg-table"><thead><tr><th>Template Name</th><th>Fields</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {!templates.length && <tr><td colSpan={4} className="cfg-empty-row">No templates yet. Create your first template to get started.</td></tr>}
      {templates.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.fields.length} fields</td><td><span className={`cfg-status-pill ${t.is_active ? 'active' : 'inactive'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td><td><div className="template-editor-actions"><button className="cfg-btn-cancel" disabled={busy} onClick={() => edit(t)}>Edit</button><button className="cfg-btn-cancel" disabled={busy} onClick={() => toggle(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}
    </tbody></table></div>}
    <p className="template-help">Templates are optional. Deactivating a template hides it from new selections; existing tickets keep their saved fields and values.</p>
  </div>;
}
