# Pulse Platform — Products

**Status:** Frozen

## Purpose

A Product is a business capability operating on Workspace data — not an independent application.

## Current State (grounded) — two unconnected systems being flattened into one

- **Suite** (`lib/suite/suiteProducts.ts`): `SuiteProductId = 'core' | 'pilot' | 'commerce'` — separate apps/base paths (`/`, `/(driver)`, `/oms`), resolved via URL param at sign-in, no DB-backed activation.
- **Workspace Products** (`lib/productRegistry.ts` + `workspace_products` table): 15 in-app add-ons (Fleet Pro, Finance Pro, POD Pro, Marketplace, etc.) with real per-org activation status, trial/billing tracking, and a waitlist mechanism.
- The target architecture's "Products" list (Core, Commerce, Fleet, Finance, Warehouse, CRM, Marketplace, Compliance, AI, ...) spans both of these existing systems — this was the central naming ambiguity resolved by flattening them into one model (see `08-product-registry.md`).

## Target

- One flat list of products. Core, Commerce, and Pilot are not "above" Fleet, Finance, or POD — every product is a sibling entry in the same Product Registry.
- Each product declares whether it's always enabled for a workspace or requires activation (`08-product-registry.md`).
- A product may expose more than one Experience (`05-experiences.md`).

## Principle

Products are business capabilities, not independent applications. Framework and UI differences are implementation details that do not change this architecture.
