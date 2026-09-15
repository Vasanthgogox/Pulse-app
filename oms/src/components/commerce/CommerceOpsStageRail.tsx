import {
  COMMERCE_OPS_RAIL_LABEL,
  COMMERCE_OPS_RAIL_ORDER,
  type CommerceOpsRailId,
} from '@/lib/commerce-ops-hub';

export function CommerceOpsStageRail({
  active,
  counts,
  onChange,
}: {
  active: CommerceOpsRailId;
  counts: Record<CommerceOpsRailId, number>;
  onChange: (id: CommerceOpsRailId) => void;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1"
      role="tablist"
      aria-label="Execution stage"
    >
      {COMMERCE_OPS_RAIL_ORDER.map(id => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-2xs font-semibold tracking-wide min-h-11 ${
              selected
                ? 'bg-[var(--pulse-hero-blue)] text-white'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {COMMERCE_OPS_RAIL_LABEL[id]} ({counts[id]})
          </button>
        );
      })}
    </div>
  );
}
