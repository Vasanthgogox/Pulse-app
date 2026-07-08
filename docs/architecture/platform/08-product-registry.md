# Pulse Platform — Product Registry

**Status:** Frozen

## Purpose

One canonical, declarative list of every product. Nothing about a product is hardcoded into another product or into Identity/Workspace — everything comes from this registry's metadata.

## Schema

```
id                string      — e.g. "commerce"
name              string
category          string      — e.g. "operations", "finance"
interfaces        string[]    — e.g. ["desktop", "mobile"]
defaultRoute      string
icon              —
theme             —
activation        "always" | "required"
dependencies      string[]    — other product ids this one depends on
creates           string[]    — entities this product originates (e.g. "Order")
reads             string[]    — entities this product consumes (e.g. "Customer", "Vehicle", "Rate Card")
writes            string[]    — entities this product mutates (e.g. "Order", "Planning Request")
owns              string[]    — entities this product is the source of truth for
```

`owns` is not redundant with `creates`: multiple products may legitimately `write` to an entity (Finance writes to Invoice to update payment status), but exactly one product `owns` it — the one whose write defines what the entity fundamentally *is*. Ownership never transfers between products just because another product also has write access.

## Example

```
Commerce
  creates: [Order]
  reads:   [Customer, Vehicle, Rate Card]
  writes:  [Order, Planning Request]
  owns:    [Order]

Core
  creates: [Indent, Trip]
  reads:   [Order, Vehicle, Driver]
  writes:  [Trip, Indent]
  owns:    [Trip, Indent]

Invoice
  creates: [Invoice]
  reads:   [Trip, POD]
  writes:  [Invoice]
  owns:    [Invoice]

Finance
  reads:   [Invoice]
  writes:  [Invoice]        — updates payment status; does not own it
```

`creates`/`reads`/`writes`/`owns` is a data-lineage declaration — it directly parallels the Source of Truth Matrix in `docs/architecture/01-transport-work-v1.md` §5, applied at the product level instead of the domain-object level. It becomes the foundation for later AI agents, automation, eventing, dependency analysis, and impact analysis — none of which are built yet, but the registry should be shaped to support them from the start.

## Current State (grounded)

Two separate, unconnected sources exist today: `lib/suite/suiteProducts.ts` (Core/Pilot/Commerce) and `lib/productRegistry.ts` + `workspace_products` table (15 in-app add-ons).

## Migration Strategy — Adapter Pattern (Phase 1)

**Do not replace `suiteProducts.ts` or `productRegistry.ts` directly.** Introduce the new canonical registry in `packages/platform/products/`, then make each existing file a thin adapter that delegates to it while keeping its own external API byte-for-byte identical:

```
Platform Product Registry
        ↓
    Adapter
        ↓
  suiteProducts.ts  →  existing consumers (unchanged)

Platform Product Registry
        ↓
    Adapter
        ↓
  productRegistry.ts  →  existing consumers (unchanged)
```

Existing call sites do not change in Phase 1. Adapters are deleted only once every consumer has migrated to import the canonical registry directly — a separate, later, low-risk cleanup phase.

## Product Resolver

```
Registry + Workspace Activation → Available Products
```

One canonical registry (static metadata) merged with one per-workspace activation source (`workspace_products`, read via the existing `get_active_products()` RPC) — not two lists merged together.
