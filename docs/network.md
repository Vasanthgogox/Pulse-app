# Network / Marketplace Domain

**Canonical architecture:** [`docs/MARKETPLACE_DOMAIN.md`](./MARKETPLACE_DOMAIN.md) — Marketplace Platform (M0–M5), `CommercialOpportunity`, lifecycle rules.

This file is a short pointer + file map. Do not add a second interpretation of commercial state here.

## Overview

Social + load board layer. Dispatchers publish loads (indents / LOAD stories); other orgs bid. Reach distributes frozen commercial listings beyond the network. Relationship after award is owned by ADR-012.

## Files

| Area | Location |
|------|----------|
| Domain (target) | `features/marketplace/domain/` or `features/network/domain/` — see Marketplace Domain doc |
| Network UI / Load Center | `features/network/` |
| Indents | `features/indents/` |
| Reach | `features/reach/` |
| Screen entry | `app/(tabs)/network.tsx` (and related routes) |

## Tables (high level)

- `indents` — commercial source of truth
- `posts` — story projection (LOAD)
- `bids` / `direct_quotes` — append-only offers
- `reach_campaigns` / `reach_campaign_targets` — distribution
- Connection / follow tables — organic network (parallel to commerce-earned path)

Detail: `docs/database/marketplace.md` (keep in sync when schema docs are refreshed).

## Realtime

`useRealtimeNetworkInvalidation()` — connection request approvals; also prefer narrow invalidation after bids (see Reach Stability Sprint).

## Capabilities

- `marketplace_post` — create indents/posts
- `marketplace_bid` — bid on loads
- Asset / Aggregate / Hybrid — see `docs/RBAC_OPERATING_MODEL.md`

## Related

- `docs/ADR-012-commerce-earned-relationship.md`
- `docs/REACH_STABILITY_SPRINT.md`
- `docs/MARKETPLACE_P0_VALIDATION.md`
- `docs/REACH_DELIVERY_ENGINE_DESIGN.md`
- `docs/TRIP_OPERATIONS_PLATFORM.md` (pattern after Award → Trip)
