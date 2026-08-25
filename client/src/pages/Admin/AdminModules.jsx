import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Lock, LockOpen, ChevronUp, ChevronDown, X, AlertTriangle, RotateCcw, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import AdminSLA from './AdminSLA';
import './Admin.css';
import './Configuration.css';

const FIELD_TYPES = [
  { value: 'text',     label: 'Text (single line)' },
  { value: 'textarea', label: 'Text Area (multi-line)' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'number',   label: 'Number' },
];

const TYPE_LABELS = { text: 'Text', textarea: 'Text Area', dropdown: 'Dropdown', number: 'Number', category: 'Category' };

function ConfirmModal({ title, message, confirmLabel = 'Delete', secondaryLabel, onConfirm, onSecondary, onClose }) {
  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal cfg-modal-sm">
        <div className="cfg-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          {secondaryLabel && onSecondary && (
            <button className="cfg-btn-danger-solid" style={{ background: '#dc2626' }}
              onClick={() => { onSecondary(); onClose(); }}>
              {secondaryLabel}
            </button>
          )}
          <button className="cfg-btn-danger-solid" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ResetModal({ onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleReset = async () => {
    if (!password) { setError('Please enter your password'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/config/admin/reset-fields', { password });
      toast.success('Fields reset to defaults');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Reset failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal cfg-modal-sm">
        <div className="cfg-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
            <h3 style={{ margin: 0 }}>Reset Fields to Defaults</h3>
          </div>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 16px', lineHeight: 1.6 }}>
            This will <strong style={{ color: '#f87171' }}>delete all custom fields</strong> and restore the 10 default system fields. Existing ticket data is not affected.
          </p>
          <div className="cfg-form-row">
            <label>Enter your admin password to confirm</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                placeholder="Your password"
                autoFocus
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '6px 0 0' }}>{error}</p>}
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="cfg-btn-danger-solid" onClick={handleReset} disabled={loading}>
            {loading ? 'Resetting…' : 'Reset to Defaults'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionEditor({ options, onChange }) {
  const [newOpt, setNewOpt] = useState('');
  const add = () => {
    const v = newOpt.trim();
    if (!v) return;
    const already = options.find(o => o.label.toLowerCase() === v.toLowerCase());
    if (already) { toast.error('Option already exists'); return; }
    onChange([...options, { label: v, value: v.toUpperCase().replace(/\s+/g, '_') }]);
    setNewOpt('');
  };
  const remove = (idx) => onChange(options.filter((_, i) => i !== idx));
  const editLabel = (idx, label) => {
    const updated = options.map((o, i) => i === idx ? { ...o, label } : o);
    onChange(updated);
  };
  return (
    <div className="cfg-option-editor">
      <div className="cfg-option-list">
        {options.map((opt, i) => (
          <div key={i} className="cfg-option-row">
            <input
              value={opt.label}
              onChange={e => editLabel(i, e.target.value)}
              className="cfg-option-input"
              placeholder="Option label"
            />
            <span className="cfg-option-value">{opt.value}</span>
            <button type="button" className="cfg-option-del" onClick={() => remove(i)}><X size={12} /></button>
          </div>
        ))}
        {options.length === 0 && <p className="cfg-no-opts">No options yet. Add one below.</p>}
      </div>
      <div className="cfg-option-add-row">
        <input
          value={newOpt}
          onChange={e => setNewOpt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="New option label..."
          className="cfg-option-input"
        />
        <button type="button" className="cfg-btn-add-opt" onClick={add}><Plus size={13} /> Add</button>
      </div>
    </div>
  );
}

function FieldModal({ field, onSave, onClose }) {
  const isNew = !field;
  const [label, setLabel]           = useState(field?.label || '');
  const [fieldType, setFieldType]   = useState(field?.field_type || 'text');
  const [isRequired, setIsRequired] = useState(field?.is_required || false);
  const [placeholder, setPlaceholder] = useState(field?.placeholder || '');
  const parseOpts = (o) => {
    if (Array.isArray(o)) return o;
    if (typeof o === 'string') { try { return JSON.parse(o); } catch { return []; } }
    return [];
  };
  const [options, setOptions] = useState(parseOpts(field?.options));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Label is required'); return; }
    if (fieldType === 'dropdown' && options.length === 0) { toast('Dropdown has no options — it will accept free-text input only.', { icon: '⚠️' }); }
    setSaving(true);
    try {
      await onSave({ label: label.trim(), field_type: fieldType, is_required: isRequired, placeholder, options });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal">
        <div className="cfg-modal-header">
          <h3>{isNew ? 'Add New Field' : 'Edit Field'}</h3>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-row">
            <label>Field Label <span className="req">*</span></label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Serial Number" />
          </div>
          {isNew && (
            <div className="cfg-form-row">
              <label>Field Type</label>
              <select value={fieldType} onChange={e => setFieldType(e.target.value)}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div className="cfg-form-row">
            <label>Placeholder text</label>
            <input value={placeholder} onChange={e => setPlaceholder(e.target.value)} placeholder="Hint shown inside the field" />
          </div>
          <div className="cfg-form-row cfg-form-check">
            <label>
              <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />
              Required field <span className="cfg-req-note">(users must fill this in)</span>
            </label>
          </div>
          {(fieldType === 'dropdown' || fieldType === 'text' ||
            field?.field_type === 'dropdown' || field?.field_type === 'text') && (
            <div className="cfg-form-row">
              <label>
                {fieldType === 'text' || field?.field_type === 'text'
                  ? 'Dropdown Suggestions'
                  : 'Options'}
              </label>
              {(fieldType === 'text' || (field?.field_type === 'text' && !fieldType)) && (
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.5 }}>
                  These values appear as searchable suggestions in the field on ticket forms.
                </p>
              )}
              <OptionEditor options={options} onChange={setOptions} />
            </div>
          )}
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="cfg-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Field'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ category, onSaved, onClose }) {
  const isNew = !category;
  const [name, setName]         = useState(category?.name || '');
  const [saving, setSaving]     = useState(false);
  const [subcats, setSubcats]   = useState([]);
  const [subLoading, setSubLoading] = useState(false);
  const [newSub, setNewSub]     = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [editSubId, setEditSubId] = useState(null);
  const [editSubName, setEditSubName] = useState('');

  useEffect(() => {
    if (!isNew) {
      setSubLoading(true);
      api.get('/subcategories/admin/all', { params: { categoryId: category.id } })
        .then(r => setSubcats(r.data.subcategories || []))
        .catch(() => toast.error('Failed to load subcategories'))
        .finally(() => setSubLoading(false));
    }
  }, []);

  const handleAddSub = async () => {
    const n = newSub.trim();
    if (!n) return;
    if (subcats.find(s => s.name.toLowerCase() === n.toLowerCase())) {
      toast.error('Subcategory already exists'); return;
    }
    if (isNew) {
      setSubcats(p => [...p, { _local: true, _key: Date.now(), name: n, is_active: true }]);
      setNewSub('');
      return;
    }
    setAddingSub(true);
    try {
      const r = await api.post('/subcategories', { name: n, categoryId: category.id });
      const sub = r.data.subcategory || r.data;
      setSubcats(p => [...p, { id: sub.id, name: n, is_active: true }]);
      setNewSub('');
      toast.success('Subcategory added');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add');
    } finally { setAddingSub(false); }
  };

  const handleDeleteSub = async (sub, idx) => {
    if (isNew || sub._local) { setSubcats(p => p.filter((_, i) => i !== idx)); return; }
    try {
      await api.delete(`/subcategories/${sub.id}`);
      setSubcats(p => p.filter(s => s.id !== sub.id));
    } catch { toast.error('Failed to delete'); }
  };

  const handleToggleSub = async (sub) => {
    if (isNew || sub._local) return;
    try {
      await api.put(`/subcategories/${sub.id}`, { is_active: !sub.is_active });
      setSubcats(p => p.map(s => s.id === sub.id ? { ...s, is_active: !s.is_active } : s));
    } catch { toast.error('Update failed'); }
  };

  const handleSaveEdit = async (sub, idx) => {
    const n = editSubName.trim();
    if (!n) { setEditSubId(null); return; }
    if (isNew || sub._local) {
      setSubcats(p => p.map((s, i) => i === idx ? { ...s, name: n } : s));
      setEditSubId(null); return;
    }
    try {
      await api.put(`/subcategories/${sub.id}`, { name: n });
      setSubcats(p => p.map(s => s.id === sub.id ? { ...s, name: n } : s));
      setEditSubId(null);
    } catch { toast.error('Update failed'); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Category name is required'); return; }
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post('/config/admin/categories', { name: name.trim() });
        const newId = r.data.category?.id || r.data.id;
        for (const sub of subcats) {
          await api.post('/subcategories', { name: sub.name, categoryId: newId });
        }
        toast.success('Category added');
      } else {
        if (name.trim() !== category.name) {
          await api.put(`/config/admin/categories/${category.id}`, { name: name.trim() });
          toast.success('Category updated');
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal cfg-cat-modal">
        <div className="cfg-modal-header">
          <h3>{isNew ? 'Add Category' : `Edit Category`}</h3>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          {/* Category name */}
          <div className="cfg-form-row">
            <label>Category Name <span className="req">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Incident"
              autoFocus
            />
          </div>

          {/* Subcategories section */}
          <div className="cfg-subcat-section">
            <div className="cfg-subcat-header">
              <span>Subcategories</span>
              <span className="cfg-subcat-count">{subcats.length}</span>
            </div>

            {subLoading ? (
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0' }}>Loading…</p>
            ) : (
              <>
                {/* Existing subcats list */}
                {subcats.length > 0 && (
                  <div className="cfg-subcat-list">
                    {subcats.map((s, idx) => (
                      <div key={s.id || s._key || idx} className={`cfg-subcat-row ${!s.is_active ? 'cfg-subcat-inactive' : ''}`}>
                        {editSubId === (s.id || s._key) ? (
                          <input
                            className="cfg-subcat-edit-input"
                            value={editSubName}
                            onChange={e => setEditSubName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveEdit(s, idx);
                              if (e.key === 'Escape') setEditSubId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="cfg-subcat-name">{s.name}</span>
                        )}
                        <div className="cfg-subcat-actions">
                          {editSubId === (s.id || s._key) ? (
                            <>
                              <button className="cfg-subcat-btn cfg-subcat-save" onClick={() => handleSaveEdit(s, idx)} title="Save">✓</button>
                              <button className="cfg-subcat-btn" onClick={() => setEditSubId(null)} title="Cancel"><X size={12} /></button>
                            </>
                          ) : (
                            <>
                              <button
                                className="cfg-subcat-btn"
                                onClick={() => { setEditSubId(s.id || s._key); setEditSubName(s.name); }}
                                title="Rename"
                              ><Pencil size={12} /></button>
                              {!isNew && !s._local && (
                                <button
                                  className={`cfg-subcat-btn ${s.is_active ? 'cfg-subcat-toggle-on' : 'cfg-subcat-toggle-off'}`}
                                  onClick={() => handleToggleSub(s)}
                                  title={s.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  {s.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                              )}
                              <button className="cfg-subcat-btn cfg-subcat-del" onClick={() => handleDeleteSub(s, idx)} title="Delete">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add subcategory row */}
                <div className="cfg-subcat-add-row">
                  <input
                    className="cfg-subcat-add-input"
                    value={newSub}
                    onChange={e => setNewSub(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSub())}
                    placeholder="New subcategory name…"
                  />
                  <button
                    className="cfg-subcat-add-btn"
                    onClick={handleAddSub}
                    disabled={!newSub.trim() || addingSub}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="cfg-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) { setError('Password is required'); return; }
    setLoading(true); setError('');
    try {
      await onConfirm(password);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal cfg-modal-sm">
        <div className="cfg-modal-header">
          <h3>{title}</h3>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>{message}</p>
          <div className="cfg-form-row">
            <label>Confirm with your admin password <span className="req">*</span></label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Enter your password"
              autoFocus
            />
            {error && <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'block' }}>{error}</span>}
          </div>
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="cfg-btn-save"
            style={{ background: confirmLabel.toLowerCase().includes('delete') ? 'var(--danger)' : undefined }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Verifying…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketTypeModal({ ticketType, onSave, onClose }) {
  const [name, setName]         = useState(ticketType?.name || '');
  const [description, setDesc]  = useState(ticketType?.description || '');
  const [prefix, setPrefix]     = useState(ticketType?.prefix || '');
  const [saving, setSaving]     = useState(false);
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Type name is required'); return; }
    if (!prefix.trim()) { toast.error('Prefix is required (e.g. INC, CHG)'); return; }
    setSaving(true);
    try { await onSave(name.trim(), description.trim(), prefix.trim().toUpperCase()); onClose(); } catch {} finally { setSaving(false); }
  };
  return (
    <div className="cfg-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal cfg-modal-sm">
        <div className="cfg-modal-header">
          <h3>{ticketType ? 'Edit Ticket Type' : 'Add Ticket Type'}</h3>
          <button className="cfg-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-row">
            <label>Type Name <span className="req">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Incident" autoFocus />
          </div>
          <div className="cfg-form-row">
            <label>Prefix <span className="req">*</span></label>
            <input
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. INC, CHG, PRB, SR"
              style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}
              maxLength={6}
            />
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
              Ticket numbers will be formatted as {prefix || 'XXX'}000001, {prefix || 'XXX'}000002, …
            </span>
          </div>
          <div className="cfg-form-row">
            <label>Description</label>
            <input value={description} onChange={e => setDesc(e.target.value)} placeholder="Short description of this type" />
          </div>
        </div>
        <div className="cfg-modal-footer">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="cfg-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminModules() {
  const [tab, setTab]             = useState('fields');
  const [fields, setFields]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fieldModal, setFieldModal] = useState(null); // null | 'new' | field object
  const [catModal, setCatModal]   = useState(null);   // null | 'new' | category object
  const [typeModal, setTypeModal] = useState(null);   // null | 'new' | type object
  const [confirmModal, setConfirmModal] = useState(null); // null | { title, message, onConfirm }
  const [pwdModal, setPwdModal]         = useState(null); // null | { title, message, confirmLabel, onConfirm }
  const [showResetModal, setShowResetModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [f, c, tt] = await Promise.all([
        api.get('/config/admin/fields'),
        api.get('/config/categories'),
        api.get('/config/admin/ticket-types'),
      ]);
      setFields(f.data.fields);
      setCategories(c.data.categories);
      setTicketTypes(tt.data.types || []);
    } catch { toast.error('Failed to load configuration'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Field operations ──
  const saveField = async (data) => {
    try {
      if (fieldModal === 'new') {
        await api.post('/config/admin/fields', data);
        toast.success('Field added');
      } else {
        await api.put(`/config/admin/fields/${fieldModal.id}`, data);
        toast.success('Field updated');
      }
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
      throw err;
    }
  };

  const deleteField = (id) => {
    setConfirmModal({
      title: 'Delete Field',
      message: 'Delete this custom field? Values stored on existing tickets will remain but will no longer be displayed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDeletingId(id);
        try {
          await api.delete(`/config/admin/fields/${id}`);
          toast.success('Field deleted');
          setFields(prev => prev.filter(f => f.id !== id));
        } catch (err) {
          toast.error(err?.response?.data?.message || 'Delete failed');
        } finally { setDeletingId(null); }
      },
    });
  };

  const moveField = async (id, dir) => {
    const idx = fields.findIndex(f => f.id === id);
    const swap = fields[idx + dir];
    if (!swap) return;
    try {
      await Promise.all([
        api.put(`/config/admin/fields/${id}`,   { field_order: swap.field_order }),
        api.put(`/config/admin/fields/${swap.id}`, { field_order: fields[idx].field_order }),
      ]);
      await loadAll();
    } catch { toast.error('Reorder failed'); }
  };

  const toggleRequired = async (field) => {
    try {
      await api.put(`/config/admin/fields/${field.id}`, { is_required: !field.is_required });
      setFields(prev => prev.map(f => f.id === field.id ? { ...f, is_required: !f.is_required } : f));
    } catch { toast.error('Update failed'); }
  };

  const toggleActive = async (field) => {
    try {
      await api.put(`/config/admin/fields/${field.id}`, { is_active: !field.is_active });
      setFields(prev => prev.map(f => f.id === field.id ? { ...f, is_active: !f.is_active } : f));
    } catch { toast.error('Update failed'); }
  };

  const toggleLock = async (field) => {
    const willLock = !field.is_system;
    try {
      await api.put(`/config/admin/fields/${field.id}`, { is_system: willLock });
      setFields(prev => prev.map(f => f.id === field.id ? { ...f, is_system: willLock } : f));
      toast.success(willLock ? `"${field.label}" protected from deletion` : `"${field.label}" unlocked`);
    } catch { toast.error('Update failed'); }
  };

  // ── Category operations ──
  // saveCategory is now handled inside CategoryModal itself; this just reloads.
  const reloadAfterCategorySave = () => loadAll();

  const deleteCategory = (cat) => {
    setConfirmModal({
      title: 'Delete Category',
      message: `Delete category "${cat.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.delete(`/config/admin/categories/${cat.id}`);
          toast.success('Category deleted');
          setCategories(prev => prev.filter(c => c.id !== cat.id));
        } catch (err) {
          if (err?.response?.status === 409 && err.response.data.inUse) {
            const { count } = err.response.data;
            setConfirmModal({
              title: 'Category In Use',
              message: `${count} existing ticket${count > 1 ? 's use' : ' uses'} "${cat.name}". You can deactivate it — it won't appear for new tickets but existing tickets keep their reference. Or force-delete it (existing tickets lose their category).`,
              confirmLabel: 'Deactivate',
              secondaryLabel: 'Force Delete',
              onConfirm: async () => {
                await api.put(`/config/admin/categories/${cat.id}`, { is_active: false });
                toast.success(`"${cat.name}" deactivated`);
                await loadAll();
              },
              onSecondary: async () => {
                await api.delete(`/config/admin/categories/${cat.id}?force=true`);
                toast.success('Category deleted');
                setCategories(prev => prev.filter(c => c.id !== cat.id));
              },
            });
          } else {
            toast.error(err?.response?.data?.message || 'Delete failed');
          }
        }
      },
    });
  };

  // ── Ticket Type operations ──
  const saveTicketType = async (name, description, prefix) => {
    try {
      if (typeModal === 'new') {
        await api.post('/config/admin/ticket-types', { name, description, prefix });
        toast.success('Ticket type added');
      } else {
        await api.put(`/config/admin/ticket-types/${typeModal.id}`, { name, description, prefix });
        toast.success('Ticket type updated');
      }
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
      throw err;
    }
  };

  const deactivateTicketType = (tt) => {
    setPwdModal({
      title: 'Deactivate Ticket Type',
      message: `You are about to deactivate "${tt.name}". It will be removed from the New Ticket form immediately. Existing tickets are unaffected. You can re-activate it later with your password.`,
      confirmLabel: 'Deactivate',
      onConfirm: async (password) => {
        await api.put(`/config/admin/ticket-types/${tt.id}`, { is_active: false, adminPassword: password });
        setTicketTypes(prev => prev.map(t => t.id === tt.id ? { ...t, is_active: false } : t));
        toast.success(`"${tt.name}" deactivated`);
      },
    });
  };

  const reactivateTicketType = (tt) => {
    setPwdModal({
      title: 'Re-activate Ticket Type',
      message: `Re-activate "${tt.name}"? It will appear again in the New Ticket form and new tickets can be created with this type.`,
      confirmLabel: 'Re-activate',
      onConfirm: async (password) => {
        await api.put(`/config/admin/ticket-types/${tt.id}`, { is_active: true, adminPassword: password });
        setTicketTypes(prev => prev.map(t => t.id === tt.id ? { ...t, is_active: true } : t));
        toast.success(`"${tt.name}" re-activated`);
      },
    });
  };

  const deleteTicketType = (tt) => {
    const hasTickets = parseInt(tt.ticket_count || 0) > 0;
    setPwdModal({
      title: 'Permanently Delete Ticket Type',
      message: hasTickets
        ? `You are about to permanently delete "${tt.name}". This type has ${tt.ticket_count} existing ticket${tt.ticket_count > 1 ? 's' : ''} — they will lose their type reference but remain intact. This cannot be undone.`
        : `You are about to permanently delete type "${tt.name}". This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      onConfirm: async (password) => {
        await api.delete(`/config/admin/ticket-types/${tt.id}`, { data: { adminPassword: password } });
        toast.success('Ticket type permanently deleted');
        setTicketTypes(prev => prev.filter(t => t.id !== tt.id));
      },
    });
  };

  const parseOptions = (opts) => {
    if (Array.isArray(opts)) return opts;
    try { return JSON.parse(opts || '[]'); } catch { return []; }
  };

  if (loading) return <div className="admin-page"><div style={{ padding: 40, color: '#64748b' }}>Loading...</div></div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Configuration</h1>
        <p>Manage ticket fields and category options.</p>
      </div>

      {/* Tabs */}
      <div className="cfg-tabs">
        <button className={`cfg-tab ${tab === 'fields' ? 'active' : ''}`} onClick={() => setTab('fields')}>
          Ticket Fields
          <span className="cfg-tab-count">{fields.length}</span>
        </button>
        <button className={`cfg-tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>
          Categories
          <span className="cfg-tab-count">{categories.length}</span>
        </button>
        <button className={`cfg-tab ${tab === 'types' ? 'active' : ''}`} onClick={() => setTab('types')}>
          Ticket Types
          <span className="cfg-tab-count">{ticketTypes.length}</span>
        </button>
        <button className={`cfg-tab ${tab === 'sla' ? 'active' : ''}`} onClick={() => setTab('sla')}>
          SLA
        </button>
      </div>

      {/* ── Fields tab ── */}
      {tab === 'fields' && (
        <div className="cfg-section">
          <div className="cfg-section-header">
            <div>
              <p className="cfg-section-desc">
                Add, edit, reorder, or delete any field. Use <strong style={{ color: '#e2e8f0' }}>Reset to Defaults</strong> to restore the original 9 fields if needed.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="cfg-btn-reset" onClick={() => setShowResetModal(true)}>
                <RotateCcw size={13} /> Reset to Defaults
              </button>
              <button className="cfg-btn-primary" onClick={() => setFieldModal('new')}>
                <Plus size={14} /> Add Field
              </button>
            </div>
          </div>

          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Options</th>
                  <th>Required</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, idx) => {
                  const opts = parseOptions(f.options);
                  return (
                    <tr key={f.id} className={!f.is_active ? 'cfg-row-inactive' : ''}>
                      <td className="cfg-td-order">
                        <div className="cfg-order-btns">
                          <button onClick={() => moveField(f.id, -1)} disabled={idx === 0} title="Move up"><ChevronUp size={13} /></button>
                          <button onClick={() => moveField(f.id, 1)} disabled={idx === fields.length - 1} title="Move down"><ChevronDown size={13} /></button>
                        </div>
                      </td>
                      <td>
                        <div className="cfg-field-label">
                          <span>{f.label}</span>
                          {f.placeholder && <span className="cfg-placeholder-hint">"{f.placeholder}"</span>}
                        </div>
                      </td>
                      <td><span className="cfg-type-badge">{TYPE_LABELS[f.field_type] || f.field_type}</span></td>
                      <td>
                        {(f.field_type === 'dropdown' || f.field_type === 'text') && opts.length > 0
                          ? <span className="cfg-opts-count">{opts.length} {f.field_type === 'text' ? 'suggestions' : 'options'}</span>
                          : f.field_type === 'category'
                          ? <span className="cfg-opts-count">from Categories tab</span>
                          : <span className="cfg-opts-none">—</span>}
                      </td>
                      <td>
                        <label className="cfg-toggle" title="Toggle required">
                          <input type="checkbox" checked={f.is_required} onChange={() => toggleRequired(f)} />
                          <span className="cfg-toggle-track" />
                        </label>
                      </td>
                      <td>
                        <label className="cfg-toggle" title="Toggle active">
                          <input type="checkbox" checked={f.is_active} onChange={() => toggleActive(f)} />
                          <span className="cfg-toggle-track" />
                        </label>
                      </td>
                      <td>
                        <div className="cfg-actions">
                          <button className="cfg-btn-icon" onClick={() => setFieldModal(f)} title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button
                            className={`cfg-btn-icon cfg-btn-danger${f.is_system ? ' cfg-btn-del-disabled' : ''}`}
                            onClick={() => !f.is_system && deleteField(f.id)}
                            disabled={deletingId === f.id || f.is_system}
                            title={f.is_system ? 'Unlock the field first to delete' : 'Delete field'}
                          ><Trash2 size={13} /></button>
                          <button
                            className={`cfg-btn-icon ${f.is_system ? 'cfg-btn-locked-on' : 'cfg-btn-unlocked'}`}
                            onClick={() => toggleLock(f)}
                            title={f.is_system ? 'Locked — click to unlock (enable delete)' : 'Unlocked — click to lock (protect from delete)'}
                          >
                            {f.is_system ? <Lock size={13} /> : <LockOpen size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Categories tab ── */}
      {tab === 'categories' && (
        <div className="cfg-section">
          <div className="cfg-section-header">
            <p className="cfg-section-desc">These options appear in the Category dropdown on all ticket forms.</p>
            <button className="cfg-btn-primary" onClick={() => setCatModal('new')}>
              <Plus size={14} /> Add Category
            </button>
          </div>

          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 && (
                  <tr><td colSpan={3} className="cfg-empty-row">No categories yet. Add one above.</td></tr>
                )}
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td>{cat.name}</td>
                    <td><span className={`cfg-status-pill ${cat.is_active ? 'active' : 'inactive'}`}>{cat.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="cfg-actions">
                        <button className="cfg-btn-icon" onClick={() => setCatModal(cat)} title="Rename"><Pencil size={13} /></button>
                        <button className="cfg-btn-icon cfg-btn-danger" onClick={() => deleteCategory(cat)} title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ticket Types tab ── */}
      {tab === 'types' && (
        <div className="cfg-section">
          <div className="cfg-section-header">
            <div>
              <p className="cfg-section-desc">
                Define ticket types (Incident, Service Request, Problem, Change Request). Types cascade to filter Categories.
              </p>
            </div>
            <button className="cfg-btn-primary" onClick={() => setTypeModal('new')}>
              <Plus size={14} /> Add Type
            </button>
          </div>
          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Type Name</th>
                  <th>Prefix</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ticketTypes.length === 0 && (
                  <tr><td colSpan={5} className="cfg-empty-row">No ticket types yet.</td></tr>
                )}
                {ticketTypes.map(tt => {
                  const count = parseInt(tt.ticket_count || 0);
                  // state: 'system' | 'free' | 'active-inuse' | 'inactive-inuse'
                  const state = tt.is_system ? 'system'
                    : count === 0 ? 'free'
                    : tt.is_active ? 'active-inuse'
                    : 'inactive-inuse';

                  return (
                    <tr key={tt.id} className={!tt.is_active ? 'cfg-row-inactive' : ''}>
                      <td style={{ fontWeight: 500 }}>
                        {tt.name}
                        {(state === 'system') && (
                          <Lock size={12} style={{ marginLeft: 6, color: '#94A3B8', verticalAlign: 'middle' }} title="Built-in system type — permanently fixed" />
                        )}
                      </td>
                      <td>
                        {tt.prefix
                          ? <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{tt.prefix}</span>
                          : <span style={{ color: '#F59E0B', fontSize: 12 }}>⚠ Not set</span>
                        }
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{tt.description || '—'}</td>
                      <td><span className={`cfg-status-pill ${tt.is_active ? 'active' : 'inactive'}`}>{tt.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="cfg-actions">
                          {state === 'system' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94A3B8', padding: '4px 8px', background: '#F8FAFC', borderRadius: 5, border: '1px solid #E2E8F0' }}>
                              <Lock size={11} /> System
                            </span>
                          )}
                          {state === 'free' && (
                            <>
                              <button className="cfg-btn-icon" onClick={() => setTypeModal(tt)} title="Edit"><Pencil size={13} /></button>
                              <button className="cfg-btn-icon" onClick={() => deactivateTicketType(tt)} title="Deactivate"><EyeOff size={13} /></button>
                              <button className="cfg-btn-icon cfg-btn-danger" onClick={() => deleteTicketType(tt)} title="Delete"><Trash2 size={13} /></button>
                            </>
                          )}
                          {state === 'active-inuse' && (
                            <button
                              className="cfg-btn-icon"
                              onClick={() => deactivateTicketType(tt)}
                              title={`Deactivate — removes from new tickets (${count} existing ticket${count > 1 ? 's' : ''} unaffected)`}
                              style={{ color: '#F59E0B' }}
                            >
                              <EyeOff size={13} />
                            </button>
                          )}
                          {state === 'inactive-inuse' && (
                            <>
                              <button
                                className="cfg-btn-icon"
                                onClick={() => reactivateTicketType(tt)}
                                title="Re-activate — requires admin password"
                                style={{ color: '#22C55E' }}
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                className="cfg-btn-icon cfg-btn-danger"
                                onClick={() => deleteTicketType(tt)}
                                title={`Delete permanently (${count} existing ticket${count > 1 ? 's' : ''} will lose type reference)`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SLA tab ── */}
      {tab === 'sla' && <AdminSLA />}

      {/* ── Modals ── */}
      {fieldModal !== null && (
        <FieldModal
          field={fieldModal === 'new' ? null : fieldModal}
          onSave={saveField}
          onClose={() => setFieldModal(null)}
        />
      )}
      {catModal !== null && (
        <CategoryModal
          category={catModal === 'new' ? null : catModal}
          onSaved={reloadAfterCategorySave}
          onClose={() => setCatModal(null)}
        />
      )}
      {typeModal !== null && (
        <TicketTypeModal
          ticketType={typeModal === 'new' ? null : typeModal}
          onSave={saveTicketType}
          onClose={() => setTypeModal(null)}
        />
      )}
      {confirmModal !== null && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          secondaryLabel={confirmModal.secondaryLabel}
          onConfirm={confirmModal.onConfirm}
          onSecondary={confirmModal.onSecondary}
          onClose={() => setConfirmModal(null)}
        />
      )}
      {showResetModal && (
        <ResetModal
          onClose={() => setShowResetModal(false)}
          onSuccess={loadAll}
        />
      )}
      {pwdModal !== null && (
        <PasswordConfirmModal
          title={pwdModal.title}
          message={pwdModal.message}
          confirmLabel={pwdModal.confirmLabel}
          onConfirm={pwdModal.onConfirm}
          onClose={() => setPwdModal(null)}
        />
      )}
    </div>
  );
}
