# Pulse Platform — Navigation

**Status:** Seed — NOT frozen. Do not treat this document as settled.

## What's known (grounded)

- **Pulse Home** (renamed from "Product Launcher," then "Workspace Home"/"Workspace Dashboard") is the post-login landing surface — the user's starting point in Pulse, not just a workspace-scoped view. Shows nothing and launches directly when a workspace has exactly one available product; shows a home surface (products, and eventually recent activity, AI assistant, alerts, tasks, approvals, notifications) when it has more than one.
- Per-product internal navigation is that product's own concern, not a platform-level one — e.g. the Operations-tab restructuring discussed in the Transport Work thread (`docs/architecture/04-transport-work-roadmap.md` Phase 5) is internal to the Core product, not part of this document.
- `lib/routes.ts` has no product-based branching today; Suite product selection happens before routing (URL param), and Commerce/OMS is a fully separate app outside the Expo Router tree.

## Open questions

- How does platform-level navigation (switching between products, or between experiences within a product) coexist with each product's own internal navigation stack?
- Does Pulse Home live inside the Core product, or is it genuinely platform-level (outside any single product)? Not decided.

## What NOT to do until this is resolved

Do not build a cross-product navigation shell in Phase 1. Pulse Home is scoped narrowly (per `04-transport-work-roadmap.md`-style phase discipline) to "show products, launch one" — nothing more, until this document is actually frozen.
