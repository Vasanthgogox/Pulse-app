# W2 — Operational UI Primitives

Import: `@/components/operational` · Tokens: `@/design-system`

## Design bar

Bloomberg scanability + Stripe polish + Uber operational clarity. **Not** marketing/landing-page UI: no over-rounding, airy dashboards, or gradient chrome.

## Components

| Primitive | Role |
|-----------|------|
| `OperationalButton` | Intent-based CTAs: `primary`, `approval`, `destructiveFinancial`, `utility`, `list`, `bottomSticky` |
| `Surface` | `elevation={0\|1\|2}` + `density` — replaces bordered card soup |
| `OperationalHeader` | Stack/detail/modal/onboarding; breadcrumbs, metrics strip, primary action |
| `OperationalListRow` | Trip/finance/driver/bid/settlement rows; tabular amounts, status, density |
| `OperationalEmptyState` | Guided next step + recovery action |
| `OperationalSkeleton` | Row / metric / detail placeholders — no spinner-lock |
| `MetricDisplay` | Tabular nums, semantic tones, compact/default/hero |
| `OperationalBottomActionBar` | Sticky thumb-zone for commits |
| `useOperationalDensity` | `low` \| `medium` \| `high` spacing for rows, surfaces, headers |

## Rollout order

1. **W2** — primitives (this folder)
2. **W1** — onboarding on primitives
3. **W3** — Trips hub
4. **W4** — Finance ledger
5. **W5** — modal reduction
6. **W6** — driver operational density

## Example

```tsx
import {
  OperationalHeader,
  OperationalListRow,
  OperationalListRowSkeleton,
  Surface,
} from '@/components/operational';

<OperationalHeader
  variant="stack"
  title="Trips"
  breadcrumbs={['Operations', 'Active']}
  metrics={<OperationalMetricSkeleton columns={3} />}
/>

<Surface elevation={0} density="high">
  {loading ? (
    <OperationalListRowSkeleton count={8} density="high" />
  ) : (
    trips.map((t) => (
      <OperationalListRow
        key={t.id}
        preset="trip"
        title={t.ref}
        subtitle={t.route}
        amount={t.revenue}
        amountTone="revenue"
        statusLabel={t.status}
        density="high"
        onPress={() => openTrip(t.id)}
      />
    ))
  )}
</Surface>
```
