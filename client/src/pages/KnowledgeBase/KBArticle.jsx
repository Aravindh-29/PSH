import useAccess from '../../hooks/useAccess';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, BookOpen, Edit2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { format } from 'date-fns';
import './KnowledgeBase.css';
import ArticleMarkdown from '../../components/ArticleContent';

const CATEGORY_COLORS = {
  'General':        { bg: '#EEF2FF', color: '#6366F1' },
  'FAQ':            { bg: '#DCFCE7', color: '#16A34A' },
  'Troubleshooting':{ bg: '#FEF2F2', color: '#EF4444' },
  'How-To Guide':   { bg: '#FEF3C7', color: '#D97706' },
  'Policy':         { bg: '#DBEAFE', color: '#2563EB' },
  'Technical':      { bg: '#F3E8FF', color: '#7C3AED' },
};
const CAT_COLOR = (cat) => CATEGORY_COLORS[cat] || { bg: '#F1F5F9', color: '#64748B' };

export default function KBArticle() {
  const {can}=useAccess();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = can('kb.edit');

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/kb/${id}`)
      .then(r => setArticle(r.data.article))
      .catch(() => navigate('/knowledge-base', { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <div className="kb-page"><div className="kb-loading">Loading…</div></div>;
  if (!article) return null;

  const catStyle = CAT_COLOR(article.category);

  return (
    <div className="kb-page">
      {/* Breadcrumb */}
      <div className="kba-breadcrumb">
        <button className="kba-back-btn" onClick={() => navigate('/knowledge-base')}>
          <ArrowLeft size={14} /> Knowledge Base
        </button>
        <span className="kba-breadcrumb-sep">/</span>
        <span className="kba-breadcrumb-cat" style={{ color: catStyle.color }}>{article.category}</span>
        <span className="kba-breadcrumb-sep">/</span>
        <span className="kba-breadcrumb-title">{article.title}</span>
      </div>

      <div className="kba-layout">
        {/* Article */}
        <article className="kba-article">
          <div className="kba-article-top">
            <span className="kb-cat-badge" style={catStyle}>{article.category}</span>
            {isAdmin && (
              <button
                className="kba-edit-btn"
                onClick={() => navigate('/knowledge-base', { state: { editId: article.id } })}
              >
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>
          <h1 className="kba-article-title">{article.title}</h1>
          <div className="kba-article-meta">
            <span><BookOpen size={13} /> {article.author_name || 'System'}</span>
            <span>·</span>
            <span>{format(new Date(article.created_at), 'MMMM d, yyyy')}</span>
            <span>·</span>
            <span><Eye size={13} /> {article.views} views</span>
          </div>
          <hr className="kba-divider" />
          <div className="kba-content">
            <ArticleMarkdown content={article.content}/>
          </div>
        </article>

        {/* Sidebar: back + metadata */}
        <aside className="kba-meta-sidebar">
          <button className="kba-back-card" onClick={() => navigate('/knowledge-base')}>
            <ArrowLeft size={14} /> Back to Knowledge Base
          </button>
          <div className="kba-info-card">
            <div className="kba-info-row">
              <span className="kba-info-label">Category</span>
              <span className="kb-cat-badge" style={catStyle}>{article.category}</span>
            </div>
            <div className="kba-info-row">
              <span className="kba-info-label">Author</span>
              <span className="kba-info-val">{article.author_name || 'System'}</span>
            </div>
            <div className="kba-info-row">
              <span className="kba-info-label">Published</span>
              <span className="kba-info-val">{format(new Date(article.created_at), 'MMM d, yyyy')}</span>
            </div>
            <div className="kba-info-row">
              <span className="kba-info-label">Last Updated</span>
              <span className="kba-info-val">{format(new Date(article.updated_at), 'MMM d, yyyy')}</span>
            </div>
            <div className="kba-info-row">
              <span className="kba-info-label">Views</span>
              <span className="kba-info-val">{article.views}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
