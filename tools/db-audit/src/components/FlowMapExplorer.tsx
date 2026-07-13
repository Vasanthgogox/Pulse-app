import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowStep, PersonaId } from '@/lib/appFlowModel';
import { AppFlowModuleCard } from '@/components/AppFlowModuleCard';
import { BranchStepsEmbed } from '@/components/BranchStepsEmbed';
import { LinearStepsEmbed } from '@/components/LinearStepsEmbed';
import { SignupFlowEmbed } from '@/components/SignupFlowEmbed';
import { WizardTrackEmbed } from '@/components/WizardTrackEmbed';
import {
  APP_FLOWS,
  TRIGGER_STEP,
  allBranchIds,
  createTripAssetTrackIds,
  createTripAggregateTrackIds,
  createTripModuleId,
  createTripTrackIds,
  DEFAULT_CREATE_TRIP_TRACK_ID,
  DEFAULT_MANAGE_TRIP_TRACK_ID,
  findStep,
  fleetPartyRosterBranchIds,
  fleetPartyRosterModuleId,
  getAppModules,
  manageTripModuleId,
  manageTripTrackIds,
  signupModuleId,
} from '@/lib/appFlowModel';
import {
  buildStepInspectorRows,
  layerLabel,
  layerRowClass,
} from '@/lib/stepInspectorTable';
import { FlowStepOpBadges } from '@/components/FlowStepOpBadges';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';
import { findCreateTripTrackForStep } from '@/lib/flows/business/steps/step05CreateTripTracks';
import { findManageTripTrackForStep } from '@/lib/flows/business/steps/step05ManageTripTracks';

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

function StepInspector({ step }: { step: FlowStep | null }) {
  const [view, setView] = useState<'detail' | 'table'>('detail');
  const tableRows = useMemo(() => (step ? buildStepInspectorRows(step) : []), [step]);
  const trackContext = useMemo(() => {
    if (!step) return null;
    return findCreateTripTrackForStep(step.id) ?? findManageTripTrackForStep(step.id) ?? null;
  }, [step]);

  if (!step) {
    return (
      <div className="flow-inspector empty">
        <div className="flow-inspector-placeholder">
          <span className="flow-inspector-icon">◎</span>
          <p>Expand an <strong>app flow step</strong> or click <strong>Inspect</strong> for module overview.</p>
          <p className="muted">Inside a module, click a step for fields, services, reads, and DB writes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-inspector">
      <div className="flow-inspector-head">
        <div className="flow-inspector-head-top">
          <PhasePill phase={step.phase} />
          <FlowStepOpBadges ops={getStepOperationBadges(step)} />
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
        {trackContext ? (
          <p className="flow-inspector-track">
            Journey: <strong>{trackContext.label}</strong>
          </p>
        ) : null}
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

          {step.queries?.length ? (
            <section className="flow-inspector-section">
              <h3>Exact queries</h3>
              {step.queries.map((q) => (
                <div key={q.label} className="flow-inspector-query-block">
                  <div className="flow-inspector-query-label">
                    {q.label} <span className="muted">· {q.when}</span>
                  </div>
                  <pre className="flow-inspector-query-sql">{q.sql}</pre>
                </div>
              ))}
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

function AppFlowModuleList({
  personaId,
  expandedModules,
  expandedBranches,
  expandedTracks,
  expandedForks,
  selectedStepId,
  onToggleModule,
  onInspectModule,
  onToggleBranch,
  onToggleTrack,
  onToggleFork,
  onSelectStep,
}: {
  personaId: PersonaId;
  expandedModules: Set<string>;
  expandedBranches: Set<string>;
  expandedTracks: Set<string>;
  expandedForks: Set<string>;
  selectedStepId: string | null;
  onToggleModule: (moduleId: string) => void;
  onInspectModule: (moduleId: string) => void;
  onToggleBranch: (branchId: string) => void;
  onToggleTrack: (trackId: string) => void;
  onToggleFork: (forkId: string) => void;
  onSelectStep: (stepId: string) => void;
}) {
  const persona = APP_FLOWS.find((p) => p.id === personaId) ?? APP_FLOWS[0];
  const modules = getAppModules(persona);

  return (
    <div className="app-flow-modules">
      {modules.map((mod) => (
        <AppFlowModuleCard
          key={mod.id}
          module={mod}
          personaId={personaId}
          expanded={expandedModules.has(mod.id)}
          onToggleExpand={() => onToggleModule(mod.id)}
          onInspect={() => onInspectModule(mod.id)}
          selected={selectedStepId === mod.id}
        >
          {mod.kind === 'signup-embed' ? (
            <SignupFlowEmbed
              persona={persona}
              personaId={personaId}
              expandedBranches={expandedBranches}
              selectedStepId={selectedStepId}
              onToggleBranch={onToggleBranch}
              onSelectStep={onSelectStep}
            />
          ) : mod.kind === 'branch-embed' && mod.embeddedBranches ? (
            <BranchStepsEmbed
              branches={mod.embeddedBranches}
              expandedBranches={expandedBranches}
              selectedStepId={selectedStepId}
              onToggleBranch={onToggleBranch}
              onSelectStep={onSelectStep}
              entryTitle="Party directory"
              entryRoute={mod.route}
              entryScreen={mod.screen}
              sectionHint="Each party type is a nested card — inner steps show what the user enters and where it is stored."
            />
          ) : mod.kind === 'wizard-embed' && mod.embeddedTracks ? (
            <WizardTrackEmbed
              prefixSteps={mod.embeddedPrefixSteps}
              tracks={mod.embeddedTracks}
              suffixSteps={mod.embeddedSuffixSteps}
              expandedTracks={expandedTracks}
              expandedForks={expandedForks}
              selectedStepId={selectedStepId}
              onToggleTrack={onToggleTrack}
              onToggleFork={onToggleFork}
              onSelectStep={onSelectStep}
              mode={mod.wizardTrackMode ?? 'create'}
              entryRoute={mod.route}
              entryScreen={mod.screen}
            />
          ) : (
            <LinearStepsEmbed
              steps={mod.embeddedStepGroups ? undefined : mod.embeddedSteps ?? []}
              groups={mod.embeddedStepGroups}
              selectedStepId={selectedStepId}
              onSelectStep={onSelectStep}
              sectionLabel={mod.embeddedSectionLabel ?? 'Inner steps'}
            />
          )}
        </AppFlowModuleCard>
      ))}
    </div>
  );
}

export function FlowMapExplorer({ personaId }: { personaId: PersonaId }) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set());
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => new Set());
  const [expandedForks, setExpandedForks] = useState<Set<string>>(() => new Set());
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const persona = useMemo(
    () => APP_FLOWS.find((p) => p.id === personaId) ?? APP_FLOWS[0],
    [personaId],
  );

  const signupModuleIdForPersona = signupModuleId(personaId);
  const fleetRosterModuleIdForPersona = fleetPartyRosterModuleId(personaId);
  const createTripModuleIdForPersona = createTripModuleId(personaId);
  const manageTripModuleIdForPersona = manageTripModuleId(personaId);

  const selectedStep = useMemo(
    () => (selectedStepId ? findStep(selectedStepId) ?? null : null),
    [selectedStepId],
  );

  useEffect(() => {
    setExpandedModules(new Set());
    setSelectedStepId(signupModuleId(personaId));
    setExpandedBranches(new Set(allBranchIds(persona)));
    setExpandedTracks(new Set());
    setExpandedForks(new Set());
  }, [personaId, persona]);

  const toggleModule = useCallback(
    (moduleId: string) => {
      setExpandedModules((prev) => {
        const next = new Set(prev);
        const opening = !next.has(moduleId);
        if (next.has(moduleId)) next.delete(moduleId);
        else next.add(moduleId);
        if (opening && moduleId === signupModuleId(personaId)) {
          setExpandedBranches(new Set(allBranchIds(persona)));
        }
        if (opening && moduleId === fleetRosterModuleIdForPersona) {
          setExpandedBranches(new Set(fleetPartyRosterBranchIds()));
        }
        if (opening && moduleId === createTripModuleIdForPersona) {
          setExpandedTracks(new Set([DEFAULT_CREATE_TRIP_TRACK_ID]));
          setExpandedForks(new Set());
        }
        if (opening && moduleId === manageTripModuleIdForPersona) {
          setExpandedTracks(new Set([DEFAULT_MANAGE_TRIP_TRACK_ID]));
        }
        return next;
      });
    },
    [
      persona,
      personaId,
      fleetRosterModuleIdForPersona,
      createTripModuleIdForPersona,
      manageTripModuleIdForPersona,
    ],
  );

  const inspectModule = useCallback((moduleId: string) => {
    setSelectedStepId(moduleId);
  }, []);

  const toggleTrack = useCallback((trackId: string) => {
    setExpandedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const toggleFork = useCallback((forkId: string) => {
    setExpandedForks((prev) => {
      const next = new Set(prev);
      if (next.has(forkId)) next.delete(forkId);
      else next.add(forkId);
      return next;
    });
  }, []);

  const expandAllCreateTracks = useCallback(() => {
    setExpandedModules((prev) => new Set(prev).add(createTripModuleIdForPersona));
    setExpandedTracks(new Set(createTripTrackIds()));
  }, [createTripModuleIdForPersona]);

  const expandAssetTracksOnly = useCallback(() => {
    setExpandedModules((prev) => new Set(prev).add(createTripModuleIdForPersona));
    setExpandedTracks(new Set(createTripAssetTrackIds()));
  }, [createTripModuleIdForPersona]);

  const expandAggregateTracksOnly = useCallback(() => {
    setExpandedModules((prev) => new Set(prev).add(createTripModuleIdForPersona));
    setExpandedTracks(new Set(createTripAggregateTrackIds()));
  }, [createTripModuleIdForPersona]);

  const collapseToDefaultCreateTrack = useCallback(() => {
    setExpandedTracks(new Set([DEFAULT_CREATE_TRIP_TRACK_ID]));
    setExpandedForks(new Set());
  }, []);

  const expandAllManageTracks = useCallback(() => {
    setExpandedModules((prev) => new Set(prev).add(manageTripModuleIdForPersona));
    setExpandedTracks(new Set(manageTripTrackIds()));
  }, [manageTripModuleIdForPersona]);

  const collapseToDefaultManageTrack = useCallback(() => {
    setExpandedTracks(new Set([DEFAULT_MANAGE_TRIP_TRACK_ID]));
  }, []);

  const toggleBranch = useCallback((branchId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }, []);

  const expandAllBranches = useCallback(() => {
    setExpandedModules((prev) => new Set(prev).add(signupModuleIdForPersona));
    setExpandedBranches(new Set(persona.branches.map((b) => b.id)));
  }, [persona.branches, signupModuleIdForPersona]);

  const collapseAllBranches = useCallback(() => {
    setExpandedBranches(new Set());
  }, []);

  const collapseToDefaultBranch = useCallback(() => {
    const preferred = persona.id === 'business' ? 'owner' : 'driver-main';
    const id = persona.branches.find((b) => b.id === preferred)?.id ?? persona.branches[0]?.id;
    setExpandedBranches(id ? new Set([id]) : new Set());
  }, [persona]);

  const selectStep = useCallback((stepId: string) => {
    setSelectedStepId((prev) => (prev === stepId ? null : stepId));
  }, []);

  const signupExpanded = expandedModules.has(signupModuleIdForPersona);
  const createTripExpanded = expandedModules.has(createTripModuleIdForPersona);
  const manageTripExpanded = expandedModules.has(manageTripModuleIdForPersona);

  return (
    <div className="flow-explorer">
      <div className="flow-explorer-toolbar">
        <p className="flow-persona-desc inline">
          {persona.label} app flow — {getAppModules(persona).length} top-level steps (collapsible).
        </p>
        {signupExpanded ? (
          <div className="flow-toolbar-actions">
            <button type="button" className="flow-tool-btn" onClick={expandAllBranches}>
              Expand all variants
            </button>
            <button type="button" className="flow-tool-btn" onClick={collapseToDefaultBranch}>
              {personaId === 'business' ? 'Owner only' : 'Driver path only'}
            </button>
            <button type="button" className="flow-tool-btn" onClick={collapseAllBranches}>
              Collapse variants
            </button>
          </div>
        ) : null}
        {createTripExpanded ? (
          <div className="flow-toolbar-actions">
            <button type="button" className="flow-tool-btn" onClick={expandAllCreateTracks}>
              All journeys
            </button>
            <button type="button" className="flow-tool-btn" onClick={expandAssetTracksOnly}>
              Asset only
            </button>
            <button type="button" className="flow-tool-btn" onClick={expandAggregateTracksOnly}>
              Aggregate only
            </button>
            <button type="button" className="flow-tool-btn" onClick={collapseToDefaultCreateTrack}>
              Default path
            </button>
          </div>
        ) : null}
        {manageTripExpanded ? (
          <div className="flow-toolbar-actions">
            <button type="button" className="flow-tool-btn" onClick={expandAllManageTracks}>
              All assign paths
            </button>
            <button type="button" className="flow-tool-btn" onClick={collapseToDefaultManageTrack}>
              Fleet path only
            </button>
          </div>
        ) : null}
      </div>

      <div className="flow-explorer-split">
        <div className="flow-canvas">
          <section className="flow-section app-flow-section">
            <h3 className="flow-section-label">App flow</h3>
            <AppFlowModuleList
              personaId={personaId}
              expandedModules={expandedModules}
              expandedBranches={expandedBranches}
              expandedTracks={expandedTracks}
              expandedForks={expandedForks}
              selectedStepId={selectedStepId}
              onToggleModule={toggleModule}
              onInspectModule={inspectModule}
              onToggleBranch={toggleBranch}
              onToggleTrack={toggleTrack}
              onToggleFork={toggleFork}
              onSelectStep={selectStep}
            />
          </section>
        </div>

        <aside className="flow-inspector-wrap">
          <div className="flow-inspector-label">Step inspector</div>
          <StepInspector
            step={selectedStep ?? (selectedStepId === TRIGGER_STEP.id ? TRIGGER_STEP : null)}
          />
        </aside>
      </div>
    </div>
  );
}
