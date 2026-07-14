import type { FlowWireDiagram } from '@/lib/flowStep.types';

const KIND_CLASS: Record<FlowWireDiagram['nodes'][number]['kind'], string> = {
  event: 'wire-event',
  service: 'wire-service',
  lane: 'wire-lane',
  write: 'wire-write',
  fanout: 'wire-fanout',
};

/** Notebook-style vertical wire chart for inspector / step preview. */
export function WireNotebook({
  diagram,
  compact,
}: {
  diagram: FlowWireDiagram;
  compact?: boolean;
}) {
  return (
    <div className={`wire-notebook${compact ? ' is-compact' : ''}`} aria-label={diagram.title}>
      {!compact ? <div className="wire-notebook-title">{diagram.title}</div> : null}
      {diagram.hint ? <p className="wire-notebook-hint">{diagram.hint}</p> : null}
      <div className="wire-notebook-body">
        {diagram.nodes.map((node, i) => {
          const edge = i > 0 ? diagram.edges.find((e) => e.to === node.id) : undefined;
          return (
            <div key={node.id} className="wire-notebook-row">
              {i > 0 ? (
                <div className="wire-stem" aria-hidden>
                  <span className="wire-stem-line" />
                  {edge?.label ? <span className="wire-stem-label">{edge.label}</span> : null}
                  <span className="wire-stem-arrow">↓</span>
                </div>
              ) : null}
              <div className={`wire-node ${KIND_CLASS[node.kind]}`}>
                <div className="wire-node-kicker">{node.kind}</div>
                <div className="wire-node-label">{node.label}</div>
                {node.detail && !compact ? <div className="wire-node-detail">{node.detail}</div> : null}
                {node.lanes?.length ? (
                  <div className="wire-lanes">
                    {node.lanes.map((lane) => (
                      <span key={lane} className={`wire-lane-chip lane-${lane}`}>
                        {lane}
                      </span>
                    ))}
                  </div>
                ) : null}
                {node.branches?.length ? (
                  <div className="wire-fan">
                    {node.branches.map((branch) => (
                      <div key={branch.label} className="wire-fan-branch">
                        <span className="wire-fan-hook" aria-hidden>
                          ⌞
                        </span>
                        <div className="wire-fan-body">
                          <div className="wire-fan-label">{branch.label}</div>
                          {branch.detail && !compact ? (
                            <div className="wire-fan-detail">{branch.detail}</div>
                          ) : null}
                          {branch.lanes?.length ? (
                            <div className="wire-lanes">
                              {branch.lanes.map((lane) => (
                                <span key={lane} className={`wire-lane-chip lane-${lane}`}>
                                  {lane}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
