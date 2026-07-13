import type { FlowAppModule, PersonaId } from '@/lib/flowStep.types';
import type { ReactNode } from 'react';

export function AppFlowModuleCard({
  module,
  personaId,
  expanded,
  onToggleExpand,
  onInspect,
  selected,
  children,
}: {
  module: FlowAppModule;
  personaId: PersonaId;
  expanded: boolean;
  onToggleExpand: () => void;
  onInspect: () => void;
  selected: boolean;
  children: ReactNode;
}) {
  const countLabel =
    module.kind === 'signup-embed' && personaId === 'business'
      ? `${module.stepCount} steps · ${module.variantCount} variants`
      : `${module.stepCount} steps`;

  return (
    <div className={`flow-module${expanded ? ' expanded' : ''}${selected ? ' selected' : ''}`}>
      <div className="flow-module-header-row">
        <button
          type="button"
          className="flow-module-header"
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          <span className="flow-module-chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <span className="flow-module-order">{module.order}</span>
          <div className="flow-module-meta">
            <div className="flow-module-title-row">
              <span className="flow-module-label">{module.label}</span>
              <span className="flow-module-title">{module.title}</span>
              <span className="flow-module-count">{countLabel}</span>
            </div>
            <div className="flow-module-summary">{module.summary}</div>
            <code className="flow-module-route">{module.route}</code>
          </div>
        </button>
        <button
          type="button"
          className={`flow-module-inspect-btn${selected ? ' active' : ''}`}
          onClick={onInspect}
          title={`Inspect ${module.label} module`}
        >
          Inspect
        </button>
      </div>
      {expanded ? <div className="flow-module-body">{children}</div> : null}
    </div>
  );
}
