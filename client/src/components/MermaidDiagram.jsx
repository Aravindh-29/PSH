import React, { useEffect, useId, useState } from 'react';
import DOMPurify from 'dompurify';

let engine;
function getEngine() {
  if (!engine) engine = import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral',
      suppressErrorRendering: true, maxTextSize: 30000, maxEdges: 500, htmlLabels: false,
      flowchart: { htmlLabels: false },
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
        'suppressErrorRendering', 'dompurifyConfig', 'themeCSS', 'fontFamily', 'altFontFamily', 'htmlLabels'],
    });
    return mermaid;
  });
  return engine;
}

export default function MermaidDiagram({ source }) {
  const id = 'kb-diagram-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [result, setResult] = useState({ source: '', svg: '', error: '' });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (source.length > 30000) throw new Error('Diagram is too large.');
        // Article text cannot override the application's renderer configuration.
        if (/%%\s*\{|^\s*---/m.test(source)) throw new Error('Remove diagram configuration directives and try again.');
        const mermaid = await getEngine();
        await mermaid.parse(source);
        if (cancelled) return;
        // Mermaid removes existing elements that use its render ID. A fresh ID
        // prevents a new render from removing a diagram already on the page.
        const { svg } = await mermaid.render(id + '-' + crypto.randomUUID(), source);
        const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['foreignObject', 'script', 'iframe'], FORBID_ATTR: ['onload', 'onclick'] });
        if (!cancelled) setResult({ source, svg: clean, error: '' });
      } catch {
        if (!cancelled) setResult({ source, svg: '', error: 'This diagram could not be rendered. Check its Mermaid syntax.' });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, id]);
  const current = result.source === source;
  return <figure className="kb-diagram" aria-label="Mermaid diagram">
    {!current ? <p role="status">Rendering diagram…</p> : result.error
      ? <><p role="alert">{result.error}</p><pre><code>{source}</code></pre></>
      : <div className="kb-diagram-svg" dangerouslySetInnerHTML={{ __html: result.svg }}/>}
    <details><summary>Diagram source</summary><pre><code>{source}</code></pre></details>
  </figure>;
}
