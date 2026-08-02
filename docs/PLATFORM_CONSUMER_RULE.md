# Platform Consumer Rule

**Applies to:** Trip Operations Platform, Marketplace Platform, Scalability & Reliability Platform (and any future domain resolvers / platform engines).

## Rule

**No UI component may derive business state directly if a domain resolver exists.**  
**No feature may invent synchronization, transport, or cache policy if the Scalability Platform owns it.**

| Platform | Forbidden in UI / feature code | Required |
|----------|-----------------|----------|
| Trip Operations | Interpret `trips.status` / invent stage, timing, or alerts | `deriveTripStage()`, `getStageMetadata()`, `computeTripStageMetrics()` / `computeJourneyMetrics()`, `evaluateOperationalAlerts()` |
| Marketplace | Interpret `indents.status`, story clocks, or invent price / bid CTA / visibility | `resolveCommercialOpportunity()` → `CommercialOpportunity` |
| Scalability & Reliability | Raw Supabase channels, custom polling/retry/throttle for sync, feature-owned invalidation policy | Shared registry (`lib/realtimeRegistry.ts`), merge-first cache rules, performance budgets in `docs/SCALABILITY_PLATFORM.md` |

## Design review signal

If a PR adds something like:

```ts
if (indent.status === "open") {
  // show Bid
}
```

or

```ts
if (trip.status === "in_transit") {
  // show guidance
}
```

inside a screen or presentational component **without** going through the platform resolver, that is a design-review issue unless the author documents why the resolver cannot answer the question (and then extends the resolver in the same PR).

## Allowed

- Fetching data (queries, services)
- Rendering resolver output (`actions.primary`, `pricing.displayPrice`, stage metadata)
- View-specific layout / filters that still use resolver definitions for “what is open / receiving bids”
- Pure formatting (`formatINR`, date display)

## Core principle (with Product Strategy)

> **Platform exists to eliminate duplicate business logic.  
> Product exists to improve customer outcomes.**

After a platform milestone is complete, optimize user behaviour and business metrics before extending the platform. Full operating model: `docs/PRODUCT_STRATEGY.md`.

## After Marketplace M1 validation

Once the Marketplace cross-surface consistency matrix passes: **feature-freeze Marketplace platform / domain work.** New Marketplace UI must consume `resolveCommercialOpportunity()`; invest in M2 Experience (UX), not new commercial interpreters. Same discipline Trip Operations used after the stage stack landed.

## References

- Trip: `docs/TRIP_OPERATIONS_PLATFORM.md`
- Marketplace: `docs/MARKETPLACE_DOMAIN.md`
- Scalability: `docs/SCALABILITY_PLATFORM.md`
- Product strategy: `docs/PRODUCT_STRATEGY.md`
