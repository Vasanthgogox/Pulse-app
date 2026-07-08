# Pulse Platform — Events

**Status:** Seed — NOT frozen. Do not treat this document as settled.

## What's known (grounded)

The governing principle (already frozen in `01-platform-principles.md` §3): **products communicate through Workspace entities, not direct product dependencies.**

```
❌  Commerce → calls Core

✅  Commerce creates Order
        ↓
    Workspace
        ↓
    Core reads Order, creates Indent/Trip
        ↓
    Workspace
        ↓
    Pilot reads Trip, executes
```

## Explicitly out of scope for this document

Mirroring the boundary already established in `docs/architecture/01-transport-work-v1.md`'s own Non-Goals (which excludes "event architecture" while still documenting an Event Timeline of business-meaningful moments): this document may eventually enumerate business-meaningful moments (Order Created, Indent Created, Trip Started, POD Uploaded, Invoice Generated, ...), but it does **not** define event bus infrastructure, delivery guarantees, schemas, or subscriber mechanics. Those are implementation, not architecture.

## Open question

Should Platform-level events be a superset of each product's own domain events (e.g. Transport Work's own Event Timeline in `01-transport-work-v1.md` §9), or a separate, platform-wide event vocabulary that domain events map onto? Not decided.
