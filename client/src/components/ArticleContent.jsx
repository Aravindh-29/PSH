import React, { lazy, Suspense } from 'react';

const Markdown = lazy(() => import('./ArticleMarkdown'));

// Formatting libraries are downloaded only when an article or preview is opened.
export default function ArticleContent(props) {
  return <Suspense fallback={<p role="status">Loading article formatting…</p>}>
    <Markdown {...props}/>
  </Suspense>;
}
