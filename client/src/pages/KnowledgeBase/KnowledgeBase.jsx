import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen, Search, Plus, Eye, Edit2, Trash2, X, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './KnowledgeBase.css';

const CATEGORY_COLORS = {
  'General':       { bg: '#EEF2FF', color: '#6366F1' },
  'FAQ':           { bg: '#DCFCE7', color: '#16A34A' },
  'Troubleshooting':{ bg: '#FEF2F2', color: '#EF4444' },
  'How-To Guide':  { bg: '#FEF3C7', color: '#D97706' },
  'Policy':        { bg: '#DBEAFE', color: '#2563EB' },
  'Technical':     { bg: '#F3E8FF', color: '#7C3AED' },
};
const CAT_COLOR = (cat) => CATEGORY_COLORS[cat] || { bg: '#F1F5F9', color: '#64748B' };

const CATEGORIES = ['General', 'FAQ', 'Troubleshooting', 'How-To Guide', 'Policy', 'Technical'];

const EMPTY_FORM = { title: '', content: '', category: 'General', status: 'PUBLISHED' };

// Strip markdown markers for excerpt preview
function stripMarkdown(text = '') {
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

export default function KnowledgeBase() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Handle edit redirect from article detail page
  useEffect(() => {
    const editId = location.state?.editId;
    if (editId && isAdmin) {
      api.get(`/kb/${editId}`).then(r => {
        const art = r.data.article;
        setEditTarget(art);
        setForm({ title: art.title, content: art.content || '', category: art.category, status: art.status });
        setShowModal(true);
        navigate(location.pathname, { replace: true, state: {} });
      }).catch(() => {});
    }
  }, [location.state, isAdmin, navigate, location.pathname]);

  const load = useCallback(() => {
    const endpoint = isAdmin ? '/kb/admin/all' : '/kb';
    const params = {};
    if (search) params.search = search;
    if (activeCategory) params.category = activeCategory;
    api.get(endpoint, { params })
      .then(r => {
        setArticles(r.data.articles || []);
        if (r.data.categories) setCategories(r.data.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, activeCategory, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (e, art) => {
    e.stopPropagation();
    setEditTarget(art);
    setForm({ title: art.title, content: art.content || '', category: art.category, status: art.status });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditTarget(null); setForm(EMPTY_FORM); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.put(`/kb/${editTarget.id}`, form);
        toast.success('Article updated');
      } else {
        await api.post('/kb', form);
        toast.success('Article created');
      }
      closeModal();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save article');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, id, title) => {
    e.stopPropagation();
    if (!window.confirm(`Delete article "${title}"?`)) return;
    try {
      await api.delete(`/kb/${id}`);
      toast.success('Article deleted');
      load();
    } catch {
      toast.error('Failed to delete article');
    }
  };

  const allCats = categories.length
    ? categories
    : CATEGORIES.map(c => ({ category: c, count: 0 }));

  return (
    <div className="kb-page">
      {/* Header */}
      <div className="kb-header">
        <div className="kb-header-left">
          <div className="kb-header-icon"><BookOpen size={22} /></div>
          <div>
            <h1 className="kb-title">Knowledge Base</h1>
            <p className="kb-sub">Browse articles, guides, and FAQs</p>
          </div>
        </div>
        {isAdmin && (
          <button className="kb-new-btn" onClick={openCreate}>
            <Plus size={15} /> New Article
          </button>
        )}
      </div>

      <div className="kb-layout">
        {/* Sidebar: categories */}
        <aside className="kb-sidebar">
          <div className="kb-sidebar-title">Categories</div>
          <button
            className={`kb-cat-btn ${activeCategory === '' ? 'active' : ''}`}
            onClick={() => setActiveCategory('')}
          >
            All Articles
            <span className="kb-cat-count">{articles.length || ''}</span>
          </button>
          {allCats.map(c => (
            <button
              key={c.category}
              className={`kb-cat-btn ${activeCategory === c.category ? 'active' : ''}`}
              onClick={() => setActiveCategory(c.category === activeCategory ? '' : c.category)}
            >
              <span
                className="kb-cat-dot"
                style={{ background: CAT_COLOR(c.category).color }}
              />
              {c.category}
              {c.count > 0 && <span className="kb-cat-count">{c.count}</span>}
            </button>
          ))}
        </aside>

        {/* Main content */}
        <div className="kb-main">
          {/* Search */}
          <div className="kb-search-wrap">
            <Search size={15} className="kb-search-icon" />
            <input
              className="kb-search"
              placeholder="Search articles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="kb-search-clear" onClick={() => setSearch('')}><X size={14} /></button>
            )}
          </div>

          {/* Active category chip */}
          {activeCategory && (
            <div className="kb-active-filter">
              Filtered by:
              <span className="kb-filter-chip" style={CAT_COLOR(activeCategory)}>
                {activeCategory}
                <button onClick={() => setActiveCategory('')}><X size={11} /></button>
              </span>
            </div>
          )}

          {/* Articles grid */}
          {loading ? (
            <div className="kb-loading">Loading articles…</div>
          ) : articles.length === 0 ? (
            <div className="kb-empty">
              <BookOpen size={40} color="#CBD5E1" />
              <p>No articles found</p>
              {isAdmin && <button className="kb-new-btn" onClick={openCreate}><Plus size={14} />Write the first article</button>}
            </div>
          ) : (
            <div className="kb-grid">
              {articles.map(art => (
                <div
                  key={art.id}
                  className="kb-card"
                  onClick={() => navigate(`/knowledge-base/${art.id}`)}
                >
                  <div className="kb-card-top">
                    <span className="kb-cat-badge" style={CAT_COLOR(art.category)}>{art.category}</span>
                    {isAdmin && art.status === 'DRAFT' && (
                      <span className="kb-draft-badge">DRAFT</span>
                    )}
                    {isAdmin && (
                      <div className="kb-card-actions" onClick={e => e.stopPropagation()}>
                        <button className="kb-action-btn edit" onClick={e => openEdit(e, art)} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button className="kb-action-btn del" onClick={e => handleDelete(e, art.id, art.title)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <h3 className="kb-card-title">{art.title}</h3>
                  <p className="kb-card-excerpt">{stripMarkdown(art.excerpt || art.content).slice(0, 130)}…</p>
                  <div className="kb-card-footer">
                    <span className="kb-card-meta">
                      {art.author_name || 'System'} · {format(new Date(art.created_at), 'MMM d, yyyy')}
                    </span>
                    <span className="kb-card-views"><Eye size={12} /> {art.views}</span>
                    <ChevronRight size={14} className="kb-card-arrow" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="kb-modal-overlay" onClick={closeModal}>
          <div className="kb-modal" onClick={e => e.stopPropagation()}>
            <div className="kb-modal-header">
              <h2>{editTarget ? 'Edit Article' : 'New Article'}</h2>
              <button className="kb-modal-close" onClick={closeModal}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="kb-modal-body">
              <div className="kb-field">
                <label>Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Article title…"
                  required
                />
              </div>
              <div className="kb-field-row">
                <div className="kb-field">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="kb-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="PUBLISHED">Published</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>
              <div className="kb-field kb-field-grow">
                <label>
                  Content
                  <span className="kb-field-hint">Supports: # Heading, ## Sub-heading, - bullet, **bold**</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Write article content here…"
                  rows={16}
                  required
                />
              </div>
              <div className="kb-modal-footer">
                <button type="button" className="kb-btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="kb-btn-save" disabled={saving}>
                  {saving ? 'Saving…' : editTarget ? 'Update Article' : 'Publish Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
