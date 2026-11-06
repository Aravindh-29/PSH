import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the real renderer, including its plugins, without starting a browser.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { default: ArticleMarkdown } = await server.ssrLoadModule('/src/components/ArticleMarkdown.jsx');
  const render = content => renderToStaticMarkup(React.createElement(ArticleMarkdown, { content }));
  const table = render('| Role | Scope |\n| :--- | ---: |\n| **Manager** | Selected Groups |');
  assert.match(table, /<table>/); assert.match(table, /<strong>Manager<\/strong>/);
  assert.match(table, /text-align:right/); assert.equal((table.match(/<td/g) || []).length, 2);
  const prose = render('# Heading\n\n*Italic* and ~~old~~\n\n1. First\n2. Second\n   - Nested\n\n> Quote\n\n- [x] Done\n- [ ] Pending');
  for (const tag of ['h1', 'em', 'del', 'ol', 'ul', 'blockquote']) assert.match(prose, new RegExp('<' + tag + '[ >]'));
  assert.match(prose, /type="checkbox"/); assert.match(prose, /checked/);
  const code = render('```javascript\nconst message = "hello";\n```');
  assert.match(code, /hljs-keyword/); assert.match(code, /Copy code/);
  assert.match(render('Formula: $E = mc^2$'), /class="katex"/);
  assert.match(render('```mermaid\nflowchart LR\nA --> B\n```'), /Rendering diagram/);
  const unsafe = render('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(unsafe, /<script|onerror=|href="javascript:/);
  assert.match(render('[link](https://example.com)'), /rel="noopener noreferrer"/);
  assert.doesNotMatch(render('```html\n<script>example<\/script>\n```'), /<script>/);
  assert.equal(render(''), '<div class="kb-markdown"></div>');
  console.log('PASS: tables, alignment, inline formatting, nested lists, tasks, code highlighting, math, diagram loading, safe URLs/HTML, empty articles.');
} finally {
  await server.close();
}
