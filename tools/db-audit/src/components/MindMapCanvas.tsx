import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MIND_KIND_LABEL, type MindNode, type MindNodeKind } from '@/lib/mindMap.types';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

type PortSide = 'east' | 'west' | 'south' | 'north';

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

function isBackendPhase(n: MindNode): boolean {
  return n.kind === 'phase' && /^Backend$/i.test(n.label);
}

function isOpsLeaf(kind: MindNodeKind): boolean {
  return kind === 'read' || kind === 'write' || kind === 'service' || kind === 'route' || kind === 'event';
}

function isJoinFanChildren(kids: MindNode[]): { isJoinFan: boolean; last?: MindNode; priors: MindNode[] } {
  const last = kids[kids.length - 1];
  const priors = kids.slice(0, -1);
  const isJoinFan =
    !!last &&
    priors.length >= 1 &&
    (last.kind === 'module' || last.kind === 'branch') &&
    priors.every((p) => p.kind === 'action' || p.kind === 'fork' || p.kind === 'exit');
  return { isJoinFan, last, priors };
}

function portPoint(
  el: HTMLElement,
  side: PortSide,
  stageBox: DOMRect,
  scale: number,
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const left = (r.left - stageBox.left) / scale;
  const top = (r.top - stageBox.top) / scale;
  const w = r.width / scale;
  const h = r.height / scale;
  switch (side) {
    case 'east':
      return { x: left + w, y: top + h / 2 };
    case 'west':
      return { x: left, y: top + h / 2 };
    case 'south':
      return { x: left + w / 2, y: top + h };
    case 'north':
      return { x: left + w / 2, y: top };
  }
}

function MindMapNodeView({
  node,
  expanded,
  onToggle,
  registerEl,
  rootAddon,
}: {
  node: MindNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  registerEl: (id: string, el: HTMLElement | null) => void;
  rootAddon?: ReactNode;
}) {
  const hasKids = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const kind = node.kind;
  const isRoot = kind === 'root';
  const kids = node.children;
  const { isJoinFan, last, priors } = isJoinFanChildren(kids);

  const backend = kids.find(isBackendPhase);
  const continueKids = backend ? kids.filter((c) => c.id !== backend.id) : kids;
  /** User-action digression: Backend hangs south so join / continue stay on a clear east spine. */
  const actionSouthDetail = kind === 'action' && !!backend && isOpen;
  /** Backend / ops phases: children stack south with indent, not a horizontal fan into the join corridor. */
  const detailSouth =
    isOpen && (isBackendPhase(node) || (kind === 'phase' && kids.every((c) => isOpsLeaf(c.kind))));

  let clusterClass = 'mm-cluster';
  if (isJoinFan && isOpen) clusterClass += ' is-join-fan';
  if (actionSouthDetail) clusterClass += ' is-action-detail';
  if (detailSouth) clusterClass += ' is-detail-south';
  if (isOpen && hasKids) clusterClass += ' is-open';

  const renderChild = (child: MindNode) => (
    <MindMapNodeView
      key={child.id}
      node={child}
      expanded={expanded}
      onToggle={onToggle}
      registerEl={registerEl}
    />
  );

  return (
    <div className={clusterClass} data-cluster={node.id}>
      <div
        className={`mm-node kind-${kind}${isOpen ? ' is-open' : ''}${hasKids ? ' has-kids' : ''}${
          isRoot ? ' mm-root-node' : ''
        }${isOpsLeaf(kind) ? ' is-ops-leaf' : ''}`}
        ref={(el) => registerEl(node.id, el)}
        data-node-id={node.id}
        role={hasKids ? 'button' : undefined}
        tabIndex={hasKids ? 0 : undefined}
        onClick={
          hasKids
            ? (e) => {
                if ((e.target as HTMLElement).closest('button, a, input')) return;
                onToggle(node.id);
              }
            : undefined
        }
        onKeyDown={
          hasKids
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(node.id);
                }
              }
            : undefined
        }
      >
        <div className="mm-node-main">
          {kind !== 'root' ? <span className="mm-node-kind">{MIND_KIND_LABEL[kind] ?? kind}</span> : null}
          <span className="mm-node-label">{node.label}</span>
          {node.detail ? <span className="mm-node-detail">{node.detail}</span> : null}
          {node.lanes?.length ? (
            <span className="mm-node-lanes">
              {node.lanes.map((lane) => (
                <span key={lane} className={`wire-lane-chip lane-${lane}`}>
                  {lane}
                </span>
              ))}
            </span>
          ) : null}
          {isRoot && rootAddon ? <div className="mm-root-addon">{rootAddon}</div> : null}
        </div>
        {hasKids ? (
          <button
            type="button"
            className="mm-toggle"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={() => onToggle(node.id)}
          >
            {isOpen ? '‹' : '›'}
          </button>
        ) : null}
      </div>

      {hasKids && isOpen ? (
        isJoinFan && last ? (
          <>
            <div className="mm-children mm-join-priors" data-parent={node.id}>
              {priors.map(renderChild)}
            </div>
            <div className="mm-join-next" data-join-target={last.id}>
              {renderChild(last)}
            </div>
          </>
        ) : actionSouthDetail && backend ? (
          <>
            {continueKids.length ? (
              <div className="mm-children mm-continue" data-parent={node.id} data-link-from="east">
                {continueKids.map(renderChild)}
              </div>
            ) : null}
            <div
              className="mm-detail-rail"
              data-parent={node.id}
              data-detail-of={node.id}
              data-link-from="south"
            >
              {renderChild(backend)}
            </div>
          </>
        ) : detailSouth ? (
          <div
            className="mm-children mm-children-south"
            data-parent={node.id}
            data-link-from="south"
          >
            {kids.map(renderChild)}
          </div>
        ) : (
          <div className="mm-children" data-parent={node.id} data-link-from="east">
            {kids.map(renderChild)}
          </div>
        )
      ) : null}
    </div>
  );
}

function scrollFocusTarget(viewport: HTMLElement, target: HTMLElement) {
  const vRect = viewport.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const padX = 48;
  const padY = 32;

  let nextLeft = viewport.scrollLeft;
  let nextTop = viewport.scrollTop;

  if (tRect.right > vRect.right - padX) {
    nextLeft += tRect.right - vRect.right + padX;
  } else if (tRect.left < vRect.left + padX) {
    nextLeft += tRect.left - vRect.left - padX;
  }

  if (tRect.bottom > vRect.bottom - padY) {
    nextTop += tRect.bottom - vRect.bottom + padY;
  } else if (tRect.top < vRect.top + padY) {
    nextTop += tRect.top - vRect.top - padY;
  }

  viewport.scrollTo({ left: Math.max(0, nextLeft), top: Math.max(0, nextTop), behavior: 'smooth' });
}

function linkSides(
  fromId: string,
  toId: string,
  kind: 'tree' | 'join',
  stage: HTMLElement,
): { from: PortSide; to: PortSide } {
  if (kind === 'join') return { from: 'east', to: 'west' };

  const toEl = stage.querySelector(`[data-node-id="${CSS.escape(toId)}"]`);
  if (!toEl) return { from: 'east', to: 'west' };

  const detail = stage.querySelector(`[data-detail-of="${CSS.escape(fromId)}"]`);
  if (detail?.contains(toEl)) return { from: 'south', to: 'north' };

  const southKids = stage.querySelector(
    `[data-parent="${CSS.escape(fromId)}"].mm-children-south`,
  );
  if (southKids?.contains(toEl)) return { from: 'south', to: 'west' };

  return { from: 'east', to: 'west' };
}

/** Interactive left→right mind map (NotebookLM Schema Map style). */
export function MindMapCanvas({
  tree,
  defaultExpanded,
  compact,
  className,
  rootAddon,
}: {
  tree: MindNode;
  defaultExpanded: Set<string>;
  compact?: boolean;
  className?: string;
  rootAddon?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const [zoom, setZoom] = useState(1);
  const [links, setLinks] = useState<
    {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      key: string;
      kind: 'tree' | 'join';
      fromSide: PortSide;
      toSide: PortSide;
    }[]
  >([]);
  const [focusTick, setFocusTick] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const elMap = useRef(new Map<string, HTMLElement>());
  const focusIdRef = useRef<string | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const treeKey = tree.id;
  const defaultRef = useRef(defaultExpanded);
  defaultRef.current = defaultExpanded;

  useEffect(() => {
    setExpanded(new Set(defaultRef.current));
    setZoom(1);
  }, [treeKey]);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) elMap.current.set(id, el);
    else elMap.current.delete(id);
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        focusIdRef.current = id;
        setFocusTick((t) => t + 1);
      }
      return next;
    });
  }, []);

  const resetExpanded = useCallback(() => {
    setExpanded(new Set(defaultRef.current));
    setZoom(1);
    focusIdRef.current = tree.id;
    setFocusTick((t) => t + 1);
  }, [tree.id]);

  const applyZoom = useCallback((nextRaw: number, pivot?: { clientX: number; clientY: number }) => {
    const viewport = viewportRef.current;
    const prev = zoomRef.current;
    const next = clampZoom(nextRaw);
    if (next === prev) return;

    if (viewport && pivot) {
      const rect = viewport.getBoundingClientRect();
      const x = pivot.clientX - rect.left + viewport.scrollLeft;
      const y = pivot.clientY - rect.top + viewport.scrollTop;
      const ratio = next / prev;
      viewport.scrollLeft = x * ratio - (pivot.clientX - rect.left);
      viewport.scrollTop = y * ratio - (pivot.clientY - rect.top);
    }

    setZoom(next);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || compact) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.008);
      applyZoom(zoomRef.current * factor, { clientX: e.clientX, clientY: e.clientY });
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [compact, applyZoom]);

  const recomputeLinks = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageBox = stage.getBoundingClientRect();
    const scale = zoomRef.current || 1;
    const collected: { fromId: string; toId: string; kind: 'tree' | 'join' }[] = [];

    const walk = (n: MindNode) => {
      if (!expanded.has(n.id)) return;
      const kids = n.children;
      const { isJoinFan, last, priors } = isJoinFanChildren(kids);

      for (const c of kids) {
        if (isJoinFan && last && c.id === last.id) continue;
        collected.push({ fromId: n.id, toId: c.id, kind: 'tree' });
      }
      if (isJoinFan && last) {
        // Parallel wizard steps converge into the next module (Enter workspace)
        for (const p of priors) {
          if (p.kind === 'action' || p.kind === 'fork') {
            collected.push({ fromId: p.id, toId: last.id, kind: 'join' });
          }
        }
      }
      for (const c of kids) walk(c);
    };
    walk(tree);

    const next: typeof links = [];
    for (const link of collected) {
      const a = elMap.current.get(link.fromId);
      const b = elMap.current.get(link.toId);
      if (!a || !b) continue;
      const sides = linkSides(link.fromId, link.toId, link.kind, stage);
      const p1 = portPoint(a, sides.from, stageBox, scale);
      const p2 = portPoint(b, sides.to, stageBox, scale);
      next.push({
        key: `${link.kind}:${link.fromId}->${link.toId}`,
        kind: link.kind,
        fromSide: sides.from,
        toSide: sides.to,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      });
    }
    setLinks(next);
  }, [expanded, tree]);

  const syncSpacer = useCallback(() => {
    const stage = stageRef.current;
    const spacer = spacerRef.current;
    if (!stage || !spacer) return;
    const z = zoomRef.current;
    spacer.style.width = `${Math.ceil(stage.offsetWidth * z)}px`;
    spacer.style.height = `${Math.ceil(stage.offsetHeight * z)}px`;
  }, []);

  useLayoutEffect(() => {
    recomputeLinks();
    syncSpacer();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      recomputeLinks();
      syncSpacer();
    });
    ro.observe(stage);
    window.addEventListener('resize', recomputeLinks);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputeLinks);
    };
  }, [recomputeLinks, syncSpacer, zoom, expanded]);

  useLayoutEffect(() => {
    const id = focusIdRef.current;
    if (!id || focusTick === 0) return;
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;

    const run = () => {
      const kids = stage.querySelector(
        `[data-parent="${CSS.escape(id)}"], [data-detail-of="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      const cluster = stage.querySelector(`[data-cluster="${CSS.escape(id)}"]`) as HTMLElement | null;
      const target = kids ?? cluster ?? elMap.current.get(id);
      if (target) scrollFocusTarget(viewport, target);
      focusIdRef.current = null;
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [focusTick, expanded, links]);

  const mergedRootAddon = (
    <>
      {rootAddon}
      <button type="button" className="mm-root-reset" onClick={resetExpanded} title="Collapse to first level">
        Reset map
      </button>
    </>
  );

  return (
    <div className={`mm-shell${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="mm-viewport" ref={viewportRef}>
        <div className="mm-zoom-spacer" ref={spacerRef}>
          <div
            className="mm-stage"
            ref={stageRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            <svg className="mm-wires" aria-hidden>
              {links.map((l) => {
                const vertical = l.fromSide === 'south' || l.toSide === 'north';
                let d: string;
                if (vertical) {
                  const dy = Math.max(28, (l.y2 - l.y1) * 0.45);
                  d = `M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + dy}, ${l.x2} ${l.y2 - dy}, ${l.x2} ${l.y2}`;
                } else {
                  const dx = Math.max(48, (l.x2 - l.x1) * 0.45);
                  d = `M ${l.x1} ${l.y1} C ${l.x1 + dx} ${l.y1}, ${l.x2 - dx} ${l.y2}, ${l.x2} ${l.y2}`;
                }
                return (
                  <path
                    key={l.key}
                    className={l.kind === 'join' ? 'mm-curve mm-curve-join' : 'mm-curve'}
                    d={d}
                    fill="none"
                  />
                );
              })}
            </svg>
            <MindMapNodeView
              node={tree}
              expanded={expanded}
              onToggle={toggle}
              registerEl={registerEl}
              rootAddon={mergedRootAddon}
            />
          </div>
        </div>
      </div>

      {!compact ? (
        <div className="mm-zoom" role="toolbar" aria-label="Zoom">
          <span className="mm-zoom-pct" title="Pinch trackpad or ⌃/⌘ + scroll to zoom">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" onClick={() => applyZoom(1)} title="Reset zoom (100%)">
            ◎
          </button>
          <button type="button" onClick={() => applyZoom(zoomRef.current + ZOOM_STEP)} title="Zoom in">
            +
          </button>
          <button type="button" onClick={() => applyZoom(zoomRef.current - ZOOM_STEP)} title="Zoom out">
            −
          </button>
        </div>
      ) : null}
    </div>
  );
}
