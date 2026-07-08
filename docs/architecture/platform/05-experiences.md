# Pulse Platform — Experiences

**Status:** Frozen

## Purpose

An Experience is a UI optimized for a persona or device, within a Product. A product may expose more than one experience without becoming a different product.

## Examples

```
Product: Commerce
  ├── Desktop Experience
  ├── Warehouse Scanner Experience
  └── Customer Portal Experience

Product: Pilot
  └── Driver Mobile Experience

Product: Core
  ├── Desktop Experience
  └── Mobile Experience
```

## Resolved Context Shape

```
Platform
  └── Workspace
        └── Current Product
              └── Current Experience
```

Both are tracked, not one collapsing into the other — `currentProduct` answers "is this product active for this workspace"; `currentExperience` answers "which interface, within that product, is the user in right now." Experience is scoped to (nested under) the current product, not a platform-wide flat value.

## Current State

Not built today. Each existing product effectively has exactly one implicit experience (Commerce = desktop only, Pilot = driver mobile only). Phase 1 does not need to build experience-switching — it needs the resolved context shape to *accommodate* multiple experiences later without a breaking change to consumers.
