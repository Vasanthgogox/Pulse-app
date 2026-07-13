import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
  });
  mermaidReady = true;
}

type MermaidDiagramProps = {
  chart: string;
  title?: string;
};

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    ensureMermaid();

    void (async () => {
      try {
        const renderId = `mermaid-${reactId}`;
        const { svg } = await mermaid.render(renderId, chart.trim());
        if (!cancelled) {
          el.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Diagram render failed');
          el.innerHTML = '';
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <figure className="mermaid-figure">
      {title ? <figcaption className="viz-caption">{title}</figcaption> : null}
      {error ? <p className="viz-error">{error}</p> : null}
      <div ref={containerRef} className="mermaid-diagram" role="img" aria-label={title || 'Flow diagram'} />
    </figure>
  );
}
