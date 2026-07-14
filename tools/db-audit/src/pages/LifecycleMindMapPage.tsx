import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MindMapCanvas } from '@/components/MindMapCanvas';
import { buildLifecycleMindTree } from '@/lib/lifecycleMindTree';
import { rootOnlyExpandedIds } from '@/lib/mindMap.types';
import { ROUTES } from '@/lib/routes';

export function LifecycleMindMapPage() {
  const tree = useMemo(() => buildLifecycleMindTree(), []);
  const defaults = useMemo(() => rootOnlyExpandedIds(tree), [tree]);

  return (
    <div className="app life-app">
      <div className="titlebar">
        <div className="titlebar-brand">
          <div className="brand-mark">⚡</div>
          <div className="tbar-name">
            <em>Pulse Logistics</em> · DBA Audit System
          </div>
          <Link to={ROUTES.AUDIT} className="tbar-nav-link">
            Audit
          </Link>
          <Link to={ROUTES.FLOW_MAP} className="tbar-nav-link">
            Flow Map
          </Link>
          <span className="tbar-nav-link is-active">Lifecycle Map</span>
        </div>
        <div className="titlebar-spacer" />
      </div>

      <main className="life-page" aria-label="Pulse Lifecycle Mind Map">
        <header className="life-header life-header-inline">
          <span className="life-eyebrow">System designer</span>
          <h1 className="life-title">Full lifecycle mind map</h1>
          <p className="life-sub">
            Open › — <strong>Org owner</strong> · <strong>Driver</strong> · <strong>Team member</strong>
          </p>
        </header>

        <div className="life-map-frame">
          <MindMapCanvas
            tree={tree}
            defaultExpanded={defaults}
            className="life-mm"
            rootAddon={<span className="mm-root-hint">Three paths →</span>}
          />
        </div>
      </main>
    </div>
  );
}
