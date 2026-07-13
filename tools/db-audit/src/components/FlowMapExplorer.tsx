import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FlowAppModule, FlowStep, PersonaId } from '@/lib/appFlowModel';
import {
  APP_FLOWS,
  TRIGGER_STEP,
  findStep,
  signupModuleId,
  signupModuleStats,
} from '@/lib/appFlowModel';
import { SignupFlowEmbed } from '@/components/SignupFlowEmbed';
import {
  buildStepInspectorRows,
  layerLabel,
  layerRowClass,
} from '@/lib/stepInspectorTable';

function phaseClass(phase: FlowStep['phase']): string {
  switch (phase) {
    case 'auth':
      return 'phase-auth';
    case 'trigger':
      return 'phase-trigger';
    case 'post-auth':
      return 'phase-post';
    case 'join':
      return 'phase-join';
    default:
      return 'phase-ui';
  }
}

function PhasePill({ phase }: { phase: FlowStep['phase'] }) {
  const labels: Record<FlowStep['phase'], string> = {
    ui: 'UI',
    auth: 'Auth',
    trigger: 'Trigger',
    'post-auth': 'Post-auth',
    join: 'Join',
  };
  return <span className={`flow-phase ${phaseClass(phase)}`}>{labels[phase]}</span>;
}

function SignupModuleCollapsible({
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
              <span className="flow-module-count">
                {module.stepCount} steps
                {personaId === 'business' ? ` · ${module.variantCount} variants` : ''}
              </span>
            </div>
            <div className="flow-module-summary">{module.summary}</div>
            <code className="flow-module-route">{module.route}</code>
          </div>
        </button>
        <button
          type="button"
          className={`flow-module-inspect-btn${selected ? ' active' : ''}`}
          onClick={onInspect}
          title="Inspect signup module"
        >
          Inspect
        </button>
      </div>
      {expanded ? <div className="flow-module-body">{children}</div> : null}
    </div>
  );
}

function StepInspector({ step }: { step: FlowStep | null }) {
  const [view, setView] = useState<'detail' | 'table'>('detail');
  const tableRows = useMemo(() => (step ? buildStepInspectorRows(step) : []), [step]);

  if (!step) {
    return (
      <div className="flow-inspector empty">
        <div className="flow-inspector-placeholder">
          <span className="flow-inspector-icon">◎</span>
          <p>Expand <strong>Signup</strong> or click <strong>Inspect</strong> for module overview.</p>
          <p className="muted">Inside signup, click a step for fields, services, reads, and DB writes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-inspector">
      <div className="flow-inspector-head">
        <div className="flow-inspector-head-top">
          <PhasePill phase={step.phase} />
          <div className="flow-inspector-view-tabs" role="tablist" aria-label="Inspector view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'detail'}
              className={`flow-inspector-view-tab${view === 'detail' ? ' active' : ''}`}
              onClick={() => setView('detail')}
            >
              Detail
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'table'}
              className={`flow-inspector-view-tab${view === 'table' ? ' active' : ''}`}
              onClick={() => setView('table')}
            >
              Table
            </button>
          </div>
        </div>
        <h2 className="flow-inspector-title">
          {step.order > 0 ? `${step.order}. ` : ''}
          {step.title}
        </h2>
        <p className="flow-inspector-sub">{step.subtitle || '—'}</p>
      </div>

      {view === 'table' ? (
        <div className="flow-inspector-table-wrap">
          <table className="flow-inspector-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Field</th>
                <th>Writes to</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={`${row.layer}-${row.field}-${i}`} className={layerRowClass(row.layer)}>
                  <td className="insp-layer">{layerLabel(row.layer)}</td>
                  <td className="insp-field">
                    {row.layer === 'auth' || row.layer === 'meta' ? <code>{row.field}</code> : row.field}
                  </td>
                  <td className="insp-writes">{row.writesTo}</td>
                  <td className="insp-when">{row.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tableRows.length ? (
            <p className="flow-inspector-empty-table">No rows for this step.</p>
          ) : null}
        </div>
      ) : (
        <>
          <dl className="flow-inspector-dl">
            {step.route ? (
              <div>
                <dt>Route</dt>
                <dd>
                  <code>{step.route}</code>
                </dd>
              </div>
            ) : null}
            {step.screen ? (
              <div>
                <dt>Screen / module</dt>
                <dd>{step.screen}</dd>
              </div>
            ) : null}
            {step.service ? (
              <div>
                <dt>Service</dt>
                <dd>
                  <code>{step.service}</code>
                </dd>
              </div>
            ) : null}
          </dl>

          {step.serviceCalls?.length ? (
            <section className="flow-inspector-section">
              <h3>Service calls</h3>
              <ul className="mono-list">
                {step.serviceCalls.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.fields?.length ? (
            <section className="flow-inspector-section">
              <h3>Fields collected</h3>
              <ul>
                {step.fields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.reads?.length ? (
            <section className="flow-inspector-section">
              <h3>Reads (no writes)</h3>
              <ul className="mono-list">
                {step.reads.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.routing?.length ? (
            <section className="flow-inspector-section">
              <h3>Routing outcomes</h3>
              <ul>
                {step.routing.map((r) => (
                  <li key={r.context}>
                    <code>{r.context}</code> · {r.track} → {r.nextScreen}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.authMetadata?.length ? (
            <section className="flow-inspector-section">
              <h3>auth.users metadata</h3>
              <ul className="mono-list">
                {step.authMetadata.map((k) => (
                  <li key={k}>
                    <code>{k}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.tables?.length ? (
            <section className="flow-inspector-section">
              <h3>Tables touched</h3>
              <div className="flow-inspector-chips">
                {step.tables.map((t) => (
                  <span key={t} className="flow-chip table">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {step.notes?.length ? (
            <section className="flow-inspector-section notes">
              <h3>Notes</h3>
              <ul>
                {step.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function FlowMapExplorer({ personaId }: { personaId: PersonaId }) {
  const [signupExpanded, setSignupExpanded] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set());
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const persona = useMemo(
    () => APP_FLOWS.find((p) => p.id === personaId) ?? APP_FLOWS[0],
    [personaId],
  );

  const signupModule = useMemo(() => signupModuleStats(persona), [persona]);

  const selectedStep = useMemo(
    () => (selectedStepId ? findStep(selectedStepId) ?? null : null),
    [selectedStepId],
  );

  useEffect(() => {
    setSignupExpanded(false);
    setSelectedStepId(signupModuleId(personaId));
    setExpandedBranches(new Set());
  }, [personaId]);

  const toggleSignup = useCallback(() => {
    setSignupExpanded((prev) => !prev);
  }, []);

  const inspectSignupModule = useCallback(() => {
    setSelectedStepId(signupModuleId(personaId));
  }, [personaId]);

  const toggleBranch = useCallback((branchId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }, []);

  const expandAllBranches = useCallback(() => {
    setSignupExpanded(true);
    setExpandedBranches(new Set(persona.branches.map((b) => b.id)));
  }, [persona.branches]);

  const collapseAllBranches = useCallback(() => {
    setExpandedBranches(new Set());
  }, []);

  const selectStep = useCallback((stepId: string) => {
    setSelectedStepId((prev) => (prev === stepId ? null : stepId));
  }, []);

  const moduleSelected = selectedStepId === signupModule.id;

  return (
    <div className="flow-explorer">
      <div className="flow-explorer-toolbar">
        <p className="flow-persona-desc inline">
          {persona.label} app flow — signup embedded as one collapsible step.
        </p>
        {signupExpanded ? (
          <div className="flow-toolbar-actions">
            <button type="button" className="flow-tool-btn" onClick={expandAllBranches}>
              Expand all variants
            </button>
            <button type="button" className="flow-tool-btn" onClick={collapseAllBranches}>
              Collapse variants
            </button>
          </div>
        ) : null}
      </div>

      <div className="flow-explorer-split">
        <div className="flow-canvas">
          <section className="flow-section app-flow-section">
            <h3 className="flow-section-label">App flow</h3>

            <SignupModuleCollapsible
              module={signupModule}
              personaId={personaId}
              expanded={signupExpanded}
              onToggleExpand={toggleSignup}
              onInspect={inspectSignupModule}
              selected={moduleSelected}
            >
              <SignupFlowEmbed
                persona={persona}
                personaId={personaId}
                expandedBranches={expandedBranches}
                selectedStepId={selectedStepId}
                onToggleBranch={toggleBranch}
                onSelectStep={selectStep}
              />
            </SignupModuleCollapsible>
          </section>
        </div>

        <aside className="flow-inspector-wrap">
          <div className="flow-inspector-label">Step inspector</div>
          <StepInspector
            step={
              selectedStep ?? (selectedStepId === TRIGGER_STEP.id ? TRIGGER_STEP : null)
            }
          />
        </aside>
      </div>
    </div>
  );
}
