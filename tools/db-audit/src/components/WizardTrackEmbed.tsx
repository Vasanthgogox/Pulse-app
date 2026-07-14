import { useMemo, useState } from 'react';
import type { FlowStep, FlowWizardTrack } from '@/lib/flowStep.types';
import { FlowStepCard } from '@/components/FlowStepCard';
import { FlowStepConnector } from '@/components/FlowStepConnector';

function StepChain({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: FlowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}) {
  return (
    <>
      {steps.map((step, i) => (
        <div key={step.id} className="flow-shared-row">
          {i > 0 ? <FlowStepConnector fromStep={steps[i - 1]!} /> : null}
          <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} showTableChips={false} />
        </div>
      ))}
    </>
  );
}

function TrackExits({ exits }: { exits: FlowWizardTrack['exits'] }) {
  if (!exits?.length) return null;
  return (
    <div className="flow-track-exits" aria-label="Track exit">
      <span className="flow-track-exits-label">Then →</span>
      {exits.map((ex) => (
        <span key={`${ex.route}-${ex.label}`} className="flow-track-exit-pill" title={ex.route}>
          {ex.context ? <span className="flow-track-exit-ctx">{ex.context}</span> : null}
          <span className="flow-track-exit-label">{ex.label}</span>
          <code className="flow-track-exit-route">{ex.route}</code>
        </span>
      ))}
    </div>
  );
}

function TrackSection({
  track,
  expanded,
  expandedForks,
  selectedStepId,
  onToggle,
  onToggleFork,
  onSelectStep,
  mode,
}: {
  track: FlowWizardTrack;
  expanded: boolean;
  expandedForks: Set<string>;
  selectedStepId: string | null;
  onToggle: (trackId: string) => void;
  onToggleFork: (forkId: string) => void;
  onSelectStep: (stepId: string) => void;
  mode: 'create' | 'manage';
}) {
  const allocLabel = mode === 'create' ? '④ Allocate' : 'Re-assign';
  const saveLabel = mode === 'create' ? '⑤ Save trip' : '';
  const lifeLabel = mode === 'create' ? '⑥ After create' : 'After re-assign';
  const stepTotal =
    track.allocationSteps.length +
    (track.submitSteps?.length ?? 0) +
    (track.submitForks?.reduce((n, f) => n + f.steps.length, 0) ?? 0) +
    (track.lifecycleSteps?.length ?? 0);

  const containsSelection = useMemo(() => {
    if (
      track.allocationSteps.some((s) => s.id === selectedStepId) ||
      track.submitSteps?.some((s) => s.id === selectedStepId) ||
      track.lifecycleSteps?.some((s) => s.id === selectedStepId)
    ) {
      return true;
    }
    return track.submitForks?.some((f) => f.steps.some((s) => s.id === selectedStepId)) ?? false;
  }, [track, selectedStepId]);

  return (
    <div
      className={`flow-wizard-track${expanded ? ' expanded' : ''}${containsSelection ? ' contains-selection' : ''}`}
    >
      <button type="button" className="flow-wizard-track-header" onClick={() => onToggle(track.id)}>
        <span className="flow-branch-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
        <div className="flow-wizard-track-meta">
          <div className="flow-branch-title-row">
            <span className="flow-branch-title">{track.label}</span>
            {track.badge ? <span className={`flow-branch-badge ${track.badge}`}>{track.badge}</span> : null}
            <span className="flow-branch-count">{stepTotal} steps</span>
          </div>
          <div className="flow-branch-summary">{track.summary}</div>
          {!expanded && track.exits?.length ? (
            <div className="flow-track-exits compact">
              <span className="flow-track-exits-label">→</span>
              {track.exits.map((ex) => (
                <span key={`${ex.route}-${ex.label}`} className="flow-track-exit-pill compact">
                  {ex.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="flow-wizard-track-body">
          <div className="flow-track-phase">
            <div className="flow-track-phase-label">{allocLabel}</div>
            <StepChain steps={track.allocationSteps} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
          </div>

          {track.submitSteps && track.submitSteps.length > 0 ? (
            <>
              <div className="flow-track-divider" role="separator">
                <span className="flow-track-divider-line" />
                <span className="flow-track-divider-label">{saveLabel}</span>
                <span className="flow-track-divider-line" />
              </div>
              <div className="flow-track-phase">
                <StepChain steps={track.submitSteps} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
              </div>
            </>
          ) : null}

          {track.submitForks?.map((fork) => {
            const forkOpen = expandedForks.has(fork.id);
            return (
              <div key={fork.id} className={`flow-track-fork${forkOpen ? ' expanded' : ''}`}>
                <button type="button" className="flow-track-fork-header" onClick={() => onToggleFork(fork.id)}>
                  <span className="flow-branch-chevron" aria-hidden>
                    {forkOpen ? '▾' : '▸'}
                  </span>
                  <span className="flow-track-fork-label">{fork.label}</span>
                  {fork.summary ? <span className="flow-track-fork-summary">{fork.summary}</span> : null}
                </button>
                {forkOpen ? (
                  <div className="flow-track-fork-steps">
                    <StepChain steps={fork.steps} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
                    <TrackExits exits={fork.exits} />
                  </div>
                ) : null}
              </div>
            );
          })}

          {track.lifecycleSteps && track.lifecycleSteps.length > 0 ? (
            <>
              <div className="flow-track-divider" role="separator">
                <span className="flow-track-divider-line" />
                <span className="flow-track-divider-label">{lifeLabel}</span>
                <span className="flow-track-divider-line" />
              </div>
              <div className="flow-track-phase">
                <StepChain
                  steps={track.lifecycleSteps}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                />
              </div>
            </>
          ) : null}

          <TrackExits exits={track.exits} />
        </div>
      ) : null}
    </div>
  );
}

export function WizardTrackEmbed({
  prefixSteps,
  tracks,
  suffixSteps,
  expandedTracks,
  expandedForks,
  selectedStepId,
  onToggleTrack,
  onToggleFork,
  onSelectStep,
  mode = 'create',
  entryRoute,
  entryScreen,
}: {
  prefixSteps?: FlowStep[];
  tracks: FlowWizardTrack[];
  suffixSteps?: FlowStep[];
  expandedTracks: Set<string>;
  expandedForks: Set<string>;
  selectedStepId: string | null;
  onToggleTrack: (trackId: string) => void;
  onToggleFork: (forkId: string) => void;
  onSelectStep: (stepId: string) => void;
  mode?: 'create' | 'manage';
  entryRoute?: string;
  entryScreen?: string;
}) {
  const [localFilter, setLocalFilter] = useState<'all' | 'asset' | 'aggregate'>('all');

  const visibleTracks = useMemo(() => {
    if (localFilter === 'all' || mode === 'manage') return tracks;
    return tracks.filter((t) => t.badge === localFilter);
  }, [tracks, localFilter, mode]);

  return (
    <div className="flow-wizard-track-embed">
      {(entryRoute || entryScreen) && (
        <div className="flow-wizard-entry compact">
          {entryRoute ? <code className="flow-entry-route">{entryRoute}</code> : null}
          {entryScreen ? <div className="flow-wizard-entry-screen">{entryScreen}</div> : null}
        </div>
      )}

      {prefixSteps && prefixSteps.length > 0 ? (
        <div className="flow-linear-section">
          <div className="flow-section-label">
            {mode === 'create' ? 'Steps ①–③ — same for every path' : 'Open trip'}
          </div>
          <StepChain steps={prefixSteps} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
          <div className="flow-track-fork-hint">
            ↓ Pick one journey below — allocation and save stay on the same track
          </div>
        </div>
      ) : null}

      {mode === 'create' && tracks.some((t) => t.badge) ? (
        <div className="flow-track-filter" role="tablist" aria-label="Filter tracks">
          {(['all', 'asset', 'aggregate'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={localFilter === f}
              className={`flow-track-filter-btn${localFilter === f ? ' active' : ''}`}
              onClick={() => setLocalFilter(f)}
            >
              {f === 'all' ? 'All paths' : f === 'asset' ? 'Asset' : 'Aggregate'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flow-op-legend" aria-label="Step operation legend">
        <span className="flow-op-badge op-input">Input</span>
        <span className="flow-op-badge op-read">Read</span>
        <span className="flow-op-badge op-write">Write</span>
        <span className="flow-op-legend-hint">
          {mode === 'create'
            ? 'One card = allocate → save → after-create (parties · chat · finance)'
            : 'One card = re-assign path → chat / OTP visibility'}
        </span>
      </div>

      <section className="flow-section flow-wizard-tracks">
        {visibleTracks.map((track) => (
          <TrackSection
            key={track.id}
            track={track}
            expanded={expandedTracks.has(track.id)}
            expandedForks={expandedForks}
            selectedStepId={selectedStepId}
            onToggle={onToggleTrack}
            onToggleFork={onToggleFork}
            onSelectStep={onSelectStep}
            mode={mode}
          />
        ))}
      </section>

      {suffixSteps && suffixSteps.length > 0 ? (
        <div className="flow-linear-section">
          <div className="flow-section-label">Shared after assignment — every trip</div>
          <StepChain steps={suffixSteps} selectedStepId={selectedStepId} onSelectStep={onSelectStep} />
        </div>
      ) : null}
    </div>
  );
}
