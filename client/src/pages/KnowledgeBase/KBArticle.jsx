import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, BookOpen, Edit2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { format } from 'date-fns';
import './KnowledgeBase.css';

const CATEGORY_COLORS = {
  'General':        { bg: '#EEF2FF', color: '#6366F1' },
  'FAQ':            { bg: '#DCFCE7', color: '#16A34A' },
  'Troubleshooting':{ bg: '#FEF2F2', color: '#EF4444' },
  'How-To Guide':   { bg: '#FEF3C7', color: '#D97706' },
  'Policy':         { bg: '#DBEAFE', color: '#2563EB' },
  'Technical':      { bg: '#F3E8FF', color: '#7C3AED' },
};
const CAT_COLOR = (cat) => CATEGORY_COLORS[cat] || { bg: '#F1F5F9', color: '#64748B' };

function renderContent(content) {
  if (!content) return null;
  const boldify = (text) =>
    text.split(/(\*\*.+?\*\*)/).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part
    );

  const lines = content.split('\n');
  const elements = [];
  let listItems = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length) {
      elements.push(
        <ul key={`ul-${key++}`} className="kb-content-list">
          {listItems.map((item, i) => <li key={i}>{boldify(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach(line => {
    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={key++} className="kb-content-h2">{line.slice(2)}</h2>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={key++} className="kb-content-h3">{line.slice(3)}</h3>);
    } else if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={key++} className="kb-content-p">{boldify(line)}</p>);
    }
  });
  flushList();
  return elements;
}

export default function KBArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

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
            {renderContent(article.content)}
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
