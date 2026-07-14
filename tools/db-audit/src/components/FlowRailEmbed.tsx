import { useEffect, useMemo, useState } from 'react';
import type { FlowStep, FlowTrackExit, FlowWizardTrack } from '@/lib/flowStep.types';
import { FlowRailMarker, FlowRailStepRow } from '@/components/FlowRailStepRow';
import { DEFAULT_CREATE_TRIP_TRACK_ID } from '@/lib/flows/business/steps/step05CreateTripTracks';
import { DEFAULT_MANAGE_TRIP_TRACK_ID } from '@/lib/flows/business/steps/step05ManageTripTracks';

function TrackExitRow({ exits }: { exits: FlowTrackExit[] }) {
  return (
    <div className="flow-rail-exits">
      {exits.map((ex) => (
        <div key={`${ex.route}-${ex.label}`} className="flow-rail-exit-card">
          <span className="flow-rail-exit-eyebrow">{ex.context ?? 'Then'}</span>
          <span className="flow-rail-exit-title">{ex.label}</span>
          <code className="flow-rail-exit-route">{ex.route}</code>
        </div>
      ))}
    </div>
  );
}

function FlowRailTrackColumn({
  track,
  mode,
  selectedStepId,
  onSelectStep,
  expandedForks,
  onToggleFork,
  compact,
}: {
  track: FlowWizardTrack;
  mode: 'create' | 'manage';
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  expandedForks: Set<string>;
  onToggleFork: (forkId: string) => void;
  compact?: boolean;
}) {
  const saveLabel = mode === 'create' ? 'Save trip' : '';
  const allocLabel = mode === 'create' ? 'Allocate' : 'Re-assign path';

  let stepIndex = 4;

  return (
    <div className={`flow-rail-track-column${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <header className="flow-rail-track-header">
          <div className="flow-rail-track-title-row">
            <h4 className="flow-rail-track-title">{track.label}</h4>
            {track.badge ? <span className={`flow-branch-badge ${track.badge}`}>{track.badge}</span> : null}
          </div>
          <p className="flow-rail-track-summary">{track.summary}</p>
        </header>
      ) : (
        <header className="flow-rail-track-header compact">
          <span className="flow-rail-track-title">{track.label}</span>
        </header>
      )}

      <div className="flow-rail-timeline">
        <FlowRailMarker label={allocLabel} sublabel="Step ④" variant="phase" />

        {track.allocationSteps.map((step, i) => {
          const idx = stepIndex++;
          const isLastAlloc = i === track.allocationSteps.length - 1 && !track.submitSteps?.length;
          return (
            <FlowRailStepRow
              key={step.id}
              step={step}
              index={idx}
              selected={selectedStepId === step.id}
              isFirst={i === 0}
              isLast={isLastAlloc && !track.submitForks?.length}
              onSelect={onSelectStep}
            />
          );
        })}

        {track.submitSteps && track.submitSteps.length > 0 ? (
          <>
            <FlowRailMarker label={saveLabel || 'Save'} sublabel="Step ⑤" variant="phase" />
            {track.submitSteps.map((step, i) => {
              const idx = stepIndex++;
              const isLastSubmit = i === track.submitSteps!.length - 1;
              return (
                <div key={step.id} className="flow-rail-step-with-fork">
                  <FlowRailStepRow
                    step={step}
                    index={idx}
                    selected={selectedStepId === step.id}
                    isFirst={i === 0}
                    isLast={isLastSubmit && !track.submitForks?.length}
                    onSelect={onSelectStep}
                  />
                  {isLastSubmit && track.submitForks && track.submitForks.length > 0 ? (
                    <div className="flow-rail-side-forks">
                      {track.submitForks.map((fork) => {
                        const open = expandedForks.has(fork.id);
                        return (
                          <div key={fork.id} className={`flow-rail-side-fork${open ? ' is-open' : ''}`}>
                            <button
                              type="button"
                              className="flow-rail-side-fork-toggle"
                              onClick={() => onToggleFork(fork.id)}
                            >
                              <span className="flow-rail-side-fork-bracket" aria-hidden />
                              <span className="flow-rail-side-fork-label">{fork.label}</span>
                              <span className="flow-rail-side-fork-chevron">{open ? '▾' : '▸'}</span>
                            </button>
                            {open ? (
                              <div className="flow-rail-side-fork-body">
                                {fork.summary ? <p className="flow-rail-side-fork-summary">{fork.summary}</p> : null}
                                {fork.steps.map((fStep, fi) => (
                                  <FlowRailStepRow
                                    key={fStep.id}
                                    step={fStep}
                                    index={`${idx}.${fi + 1}`}
                                    selected={selectedStepId === fStep.id}
                                    isFirst={fi === 0}
                                    isLast={fi === fork.steps.length - 1}
                                    onSelect={onSelectStep}
                                  />
                                ))}
                                {fork.exits?.length ? <TrackExitRow exits={fork.exits} /> : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}

        {track.exits && track.exits.length > 0 ? (
          <>
            <FlowRailMarker label="Exit" variant="exit" />
            <div className="flow-rail-row flow-rail-exit-row">
              <div className="flow-rail-spine-col" />
              <div className="flow-rail-attach-col">
                <TrackExitRow exits={track.exits} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function resolveActiveTrackId(
  tracks: FlowWizardTrack[],
  expandedTracks: Set<string>,
  mode: 'create' | 'manage',
): string {
  if (expandedTracks.size === 1) {
    const id = [...expandedTracks][0]!;
    if (tracks.some((t) => t.id === id)) return id;
  }
  return mode === 'create' ? DEFAULT_CREATE_TRIP_TRACK_ID : DEFAULT_MANAGE_TRIP_TRACK_ID;
}

export function FlowRailEmbed({
  prefixSteps,
  tracks,
  suffixSteps,
  expandedTracks,
  expandedForks,
  selectedStepId,
  onSelectTrack,
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
  onSelectTrack: (trackId: string) => void;
  onToggleFork: (forkId: string) => void;
  onSelectStep: (stepId: string) => void;
  mode?: 'create' | 'manage';
  entryRoute?: string;
  entryScreen?: string;
}) {
  const compareMode = expandedTracks.size > 1;
  const activeTrackId = useMemo(
    () => resolveActiveTrackId(tracks, expandedTracks, mode),
    [tracks, expandedTracks, mode],
  );
  const [filter, setFilter] = useState<'all' | 'asset' | 'aggregate'>('all');

  const filteredTracks = useMemo(() => {
    if (filter === 'all' || mode === 'manage') return tracks;
    return tracks.filter((t) => t.badge === filter);
  }, [tracks, filter, mode]);

  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? tracks[0];

  useEffect(() => {
    if (filter !== 'all' && activeTrack && activeTrack.badge !== filter) {
      const next = filteredTracks[0];
      if (next) onSelectTrack(next.id);
    }
  }, [filter, activeTrack, filteredTracks, onSelectTrack]);

  return (
    <div className="flow-rail-canvas">
      {(entryRoute || entryScreen) && (
        <div className="flow-rail-meta">
          {entryRoute ? <code className="flow-rail-meta-route">{entryRoute}</code> : null}
          {entryScreen ? <span className="flow-rail-meta-screen">{entryScreen}</span> : null}
        </div>
      )}

      {prefixSteps && prefixSteps.length > 0 ? (
        <section className="flow-rail-section">
          <div className="flow-rail-section-head">
            <span className="flow-rail-section-eyebrow">Shared path</span>
            <h3 className="flow-rail-section-title">
              {mode === 'create' ? 'Route → Load → Sale' : 'Trip detail'}
            </h3>
          </div>
          <div className="flow-rail-timeline flow-rail-timeline-prefix">
            {prefixSteps.map((step, i) => (
              <FlowRailStepRow
                key={step.id}
                step={step}
                index={i + 1}
                selected={selectedStepId === step.id}
                isFirst={i === 0}
                isLast={i === prefixSteps.length - 1}
                onSelect={onSelectStep}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flow-rail-section flow-rail-fork-section">
        <FlowRailMarker
          label={mode === 'create' ? 'Supply & assignment' : 'Re-assign'}
          sublabel="Choose one journey"
          variant="fork"
        />

        <div className="flow-rail-fork-panel">
          {mode === 'create' ? (
            <div className="flow-rail-filter" role="tablist" aria-label="Filter journeys">
              {(['all', 'asset', 'aggregate'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  className={`flow-rail-filter-btn${filter === f ? ' is-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'asset' ? 'Asset' : 'Aggregate'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flow-rail-track-chips" role="listbox" aria-label="Journey tracks">
            {filteredTracks.map((track) => {
              const isActive = compareMode ? expandedTracks.has(track.id) : track.id === activeTrackId;
              return (
                <button
                  key={track.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`flow-rail-track-chip${isActive ? ' is-active' : ''}${track.badge ? ` badge-${track.badge}` : ''}`}
                  onClick={() => onSelectTrack(track.id)}
                >
                  <span className="flow-rail-track-chip-label">{track.label}</span>
                  {track.exits?.[0] ? (
                    <span className="flow-rail-track-chip-exit">→ {track.exits[0].label}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flow-rail-section flow-rail-active-section">
        <div className="flow-rail-section-head">
          <span className="flow-rail-section-eyebrow">{compareMode ? 'Compare journeys' : 'Active journey'}</span>
          {!compareMode && activeTrack ? (
            <h3 className="flow-rail-section-title">{activeTrack.label}</h3>
          ) : null}
        </div>

        <div className={`flow-rail-track-stage${compareMode ? ' is-compare' : ''}`}>
          {compareMode ? (
            filteredTracks
              .filter((t) => expandedTracks.has(t.id))
              .map((track) => (
                <FlowRailTrackColumn
                  key={track.id}
                  track={track}
                  mode={mode}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                  expandedForks={expandedForks}
                  onToggleFork={onToggleFork}
                  compact
                />
              ))
          ) : activeTrack ? (
            <FlowRailTrackColumn
              track={activeTrack}
              mode={mode}
              selectedStepId={selectedStepId}
              onSelectStep={onSelectStep}
              expandedForks={expandedForks}
              onToggleFork={onToggleFork}
            />
          ) : null}
        </div>
      </section>

      {suffixSteps && suffixSteps.length > 0 ? (
        <section className="flow-rail-section flow-rail-suffix-section">
          <div className="flow-rail-section-head">
            <span className="flow-rail-section-eyebrow">Shared tail</span>
            <h3 className="flow-rail-section-title">Ops → Verify</h3>
          </div>
          <div className="flow-rail-timeline">
            {suffixSteps.map((step, i) => (
              <FlowRailStepRow
                key={step.id}
                step={step}
                index={i + 1}
                selected={selectedStepId === step.id}
                isFirst={i === 0}
                isLast={i === suffixSteps.length - 1}
                onSelect={onSelectStep}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flow-rail-legend">
        <span className="flow-rail-legend-item">
          <span className="flow-rail-legend-dot spine" /> Main flow
        </span>
        <span className="flow-rail-legend-item">
          <span className="flow-rail-legend-dot attach" /> Side attachment (DB / service)
        </span>
      </div>
    </div>
  );
}
