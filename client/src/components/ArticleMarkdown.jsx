import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import MermaidDiagram from './MermaidDiagram';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import './ArticleMarkdown.css';

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const code = React.Children.toArray(children).find(React.isValidElement);
  const language = /language-([\w-]+)/.exec(code?.props.className || '')?.[1];
  const textOf = value => typeof value === 'string' ? value : Array.isArray(value)
    ? value.map(textOf).join('') : React.isValidElement(value) ? textOf(value.props.children) : '';
  const source = textOf(code?.props.children || children).replace(/\n$/, '');
  if (language === 'mermaid') return <MermaidDiagram source={source}/>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(source); setCopied(true); }
    catch { setCopied(false); }
  };
  return <div className="kb-code-block">
    <div className="kb-code-heading"><span>{language || 'text'}</span>
      <button type="button" onClick={copy} onBlur={() => setCopied(false)}>{copied ? 'Copied' : 'Copy code'}</button>
    </div>
    <pre>{children}</pre>
  </div>;
}

const components = {
  pre: CodeBlock,
  table: ({ children }) => <div className="kb-markdown-table" role="region" aria-label="Article table" tabIndex={0}><table>{children}</table></div>,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer"/>,
  img: ({ node, ...props }) => <img {...props} loading="lazy" referrerPolicy="no-referrer"/>,
};

// One renderer is used by the editor preview and the saved article. Raw HTML is
// deliberately not enabled: copied content is data, never executable markup.
export default function ArticleMarkdown({ content = '' }) {
  return <div className="kb-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeHighlight, { detect: false }], [rehypeKatex, { strict: 'ignore', trust: false }]]}
      components={components} skipHtml>{content}</ReactMarkdown>
  </div>;
}
