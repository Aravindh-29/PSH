import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, Loader, Tag } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './AdminSubcategories.css';

export default function AdminSubcategories() {
  const [categories, setCategories]   = useState([]);
  const [subMap, setSubMap]           = useState({}); // categoryId → subcategories[]
  const [loading, setLoading]         = useState(true);
  const [expandedId, setExpandedId]   = useState(null);
  const [subLoading, setSubLoading]   = useState({});
  // form state: { categoryId, name, editId }
  const [form, setForm]               = useState(null);
  const [saving, setSaving]           = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/config/categories')
      .then(r => setCategories(r.data.categories || []))
      .catch(() => toast.error('Failed to load categories'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadSubs = async (catId) => {
    setSubLoading(p => ({ ...p, [catId]: true }));
    try {
      const r = await api.get(`/subcategories/admin/all?categoryId=${catId}`);
      setSubMap(p => ({ ...p, [catId]: r.data.subcategories || [] }));
    } catch { toast.error('Failed to load subcategories'); }
    finally { setSubLoading(p => ({ ...p, [catId]: false })); }
  };

  const toggle = (catId) => {
    if (expandedId === catId) { setExpandedId(null); setForm(null); return; }
    setExpandedId(catId);
    setForm(null);
    if (!subMap[catId]) loadSubs(catId);
  };

  const startAdd = (catId) => setForm({ categoryId: catId, name: '', editId: null });
  const startEdit = (catId, sub) => setForm({ categoryId: catId, name: sub.name, editId: sub.id, isActive: sub.is_active });

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (form.editId) {
        await api.put(`/subcategories/${form.editId}`, { name: form.name });
        toast.success('Subcategory updated');
      } else {
        await api.post('/subcategories', { name: form.name, categoryId: form.categoryId });
        toast.success('Subcategory added');
      }
      setForm(null);
      await loadSubs(form.categoryId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (catId, sub) => {
    try {
      await api.put(`/subcategories/${sub.id}`, { is_active: !sub.is_active });
      toast.success(sub.is_active ? 'Subcategory deactivated' : 'Subcategory activated');
      await loadSubs(catId);
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = async (catId, sub) => {
    if (!window.confirm(`Delete subcategory "${sub.name}"?`)) return;
    try {
      await api.delete(`/subcategories/${sub.id}`);
      toast.success('Subcategory deleted');
      await loadSubs(catId);
    } catch { toast.error('Delete failed'); }
  };

  if (loading) return <div className="sub-loading"><Loader size={20} className="sub-spin" /> Loading…</div>;

  return (
    <div className="sub-page">
      <div className="sub-header">
        <div>
          <h1 className="sub-title">Subcategories</h1>
          <p className="sub-desc">Manage subcategories under each category. Subcategories appear in the Create Ticket form.</p>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="sub-empty">
          <Tag size={36} strokeWidth={1.5} />
          <p>No categories found. Create categories first in Configuration.</p>
        </div>
      ) : (
        <div className="sub-list">
          {categories.map(cat => (
            <div key={cat.id} className="sub-cat-item">
              <div className="sub-cat-header" onClick={() => toggle(cat.id)}>
                <div className="sub-cat-info">
                  <span className="sub-cat-name">{cat.name}</span>
                  <span className="sub-cat-count">
                    {subMap[cat.id] ? `${subMap[cat.id].length} subcategor${subMap[cat.id].length !== 1 ? 'ies' : 'y'}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {expandedId === cat.id && (
                    <button className="sub-add-btn" onClick={e => { e.stopPropagation(); startAdd(cat.id); }}>
                      <Plus size={13} /> Add Subcategory
                    </button>
                  )}
                  {expandedId === cat.id ? <ChevronUp size={16} style={{ color: '#94a3b8' }} /> : <ChevronDown size={16} style={{ color: '#94a3b8' }} />}
                </div>
              </div>

              {expandedId === cat.id && (
                <div className="sub-panel">
                  {subLoading[cat.id] ? (
                    <div className="sub-loading-inline"><Loader size={14} className="sub-spin" /> Loading…</div>
                  ) : (
                    <>
                      {/* Add/Edit form */}
                      {form?.categoryId === cat.id && (
                        <div className="sub-form-row">
                          <input
                            autoFocus
                            className="sub-input"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder="Subcategory name…"
                          />
                          <button className="sub-save-btn" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader size={12} className="sub-spin" /> : <Save size={12} />}
                            {saving ? 'Saving…' : form.editId ? 'Update' : 'Add'}
                          </button>
                          <button className="sub-cancel-btn" onClick={() => setForm(null)}><X size={12} /></button>
                        </div>
                      )}

                      {/* Subcategory list */}
                      {(subMap[cat.id] || []).length === 0 && !form ? (
                        <div className="sub-empty-panel">No subcategories yet. Click Add Subcategory above.</div>
                      ) : (
                        <div className="sub-items">
                          {(subMap[cat.id] || []).map(sub => (
                            <div key={sub.id} className={`sub-item ${!sub.is_active ? 'sub-item-inactive' : ''}`}>
                              <span className="sub-item-name">
                                {sub.name}
                                {!sub.is_active && <span className="sub-inactive-tag">Inactive</span>}
                              </span>
                              <div className="sub-item-actions">
                                <button className="sub-action-btn" onClick={() => startEdit(cat.id, sub)} title="Edit"><Pencil size={12} /></button>
                                <button
                                  className={`sub-action-btn ${sub.is_active ? 'sub-btn-deactivate' : 'sub-btn-activate'}`}
                                  onClick={() => handleToggleActive(cat.id, sub)}
                                  title={sub.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  {sub.is_active ? <X size={12} /> : <Save size={12} />}
                                </button>
                                <button className="sub-action-btn sub-btn-danger" onClick={() => handleDelete(cat.id, sub)} title="Delete"><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
