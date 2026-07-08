# Pulse Platform Architecture — Principles

**Version:** 1.0
**Status:** Frozen
**Owner:** Pulse Core Architecture
**Last Updated:** 2026-07-08
**Supersedes:** None

This is the constitution for the Pulse Platform — the system architecture governing how Identity, Workspace, Products, and Experiences relate. It is a different layer from `docs/architecture/01-transport-work-v1.md` (the Transport Work domain architecture): Platform defines how products and shared services relate to each other and to the Workspace; Transport Work defines a specific business lifecycle (trip/indent/marketplace) that lives *inside* products (Core, Pilot) and operates on Workspace-owned entities under these same rules.

## Non-Goals

This specification does not define:

- Database schema
- Specific API/RPC design
- UI/UX implementation
- Specific event bus or messaging infrastructure
- Specific permission enforcement mechanics
- Repository/folder restructuring beyond `packages/platform/`

These belong to the numbered sub-documents (where frozen) or to future implementation specifications (where the sub-document is still a seed).

## Vocabulary (Frozen)

| Concept | Meaning |
|---|---|
| **Platform** | The Pulse ecosystem — identity, workspace, products, and the shared services connecting them |
| **Workspace** | The operating boundary and owner of all business data |
| **Product** | A business capability (Core, Commerce, Finance, POD, Fleet, etc.) |
| **Experience** | A UI optimized for a persona or device within a product (Desktop, Driver Mobile, Warehouse Scanner, Customer Portal, etc.) |
| **Module** | A functional area inside a product |
| **Feature** | An individual capability |
| **Entity** | Shared business data owned by the Workspace |

If these seven definitions never change, the architecture stays understandable as it grows.

## Platform Lifecycle (Frozen)

```
Identity
  ↓
Workspace
  ↓
Product
  ↓
Experience
  ↓
Module
  ↓
Feature
  ↓
Entity
```

The complete hierarchy. Every concept in this architecture sits at exactly one of these levels — a new capability being designed should always be placeable on this line before it's built.

## Laws

**Law #1 — Workspace owns business data. Products never own business data.** This is the most important sentence in the whole architecture; everything else follows from it. Products provide experiences that create, read, update, and visualize Workspace data according to permissions.

**Law #2 — Products own experiences, not data.** A product's boundary is its UI and business logic, never a private copy of business records.

**Law #3 — Products never depend on other products. They depend on Workspace entities.** Never `Commerce → calls Core`. Instead: Commerce creates an Order → the Workspace holds it → Core reads the Order and creates an Indent/Trip → the Workspace holds those → Pilot reads the Trip and executes it. A product may be replaced, rebuilt, or removed without any other product's code changing, because none of them ever called it directly.

**Law #4 — Products are business capabilities, not independent applications.** Framework, bundler, and UI differences (Expo/React Native, Vite/React, a future Next.js app) are implementation details. Architecturally, Core, Commerce, and Pilot are products inside one Workspace.

**Law #5 — Every product exposes itself through the Product Registry** (`08-product-registry.md`) — declaratively, via metadata (routes, branding, activation, data lineage) — never through another product hardcoding knowledge of it (e.g. `if (product === 'commerce')`).

**Law #6 — Identity only authenticates. It never decides business logic.** Product/workspace/permission decisions happen downstream of authentication, not inside it.

**Law #7 — Products consume Shared Services. They don't implement them.** Notifications, AI, Search, Files, Audit, Billing, and Automation are platform services (`11-shared-services.md`), not something each product reimplements or owns a private copy of.
