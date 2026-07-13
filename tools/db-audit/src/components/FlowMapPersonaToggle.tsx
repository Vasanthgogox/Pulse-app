import { APP_FLOWS, type PersonaId } from '@/lib/appFlowModel';

const PERSONA_META: Record<PersonaId, { icon: string; shortLabel: string }> = {
  business: { icon: '🏢', shortLabel: 'Business user' },
  driver: { icon: '🚛', shortLabel: 'Driver' },
};

type FlowMapPersonaToggleProps = {
  value: PersonaId;
  onChange: (id: PersonaId) => void;
};

export function FlowMapPersonaToggle({ value, onChange }: FlowMapPersonaToggleProps) {
  return (
    <div className="flow-map-persona-toggle" role="tablist" aria-label="Flow persona">
      {APP_FLOWS.map((flow) => {
        const meta = PERSONA_META[flow.id];
        const active = value === flow.id;
        return (
          <button
            key={flow.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`flow-map-persona-toggle-btn${active ? ' active' : ''}`}
            onClick={() => onChange(flow.id)}
          >
            <span className="flow-map-persona-toggle-icon" aria-hidden>
              {meta.icon}
            </span>
            <span className="flow-map-persona-toggle-label">{meta.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
