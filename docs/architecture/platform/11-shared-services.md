# Pulse Platform — Shared Services

**Status:** Frozen (as a boundary rule) — the services themselves are not yet built; this document exists to prevent them from being built in the wrong place.

## Purpose

Identity and Workspace are the platform's foundation. Beyond them, a growing set of capabilities are used by *every* product and must not become private to any one of them:

```
Identity, Permissions, Notifications, Audit, Files, AI, Search, Automation, Billing, Analytics
```

## The Rule

**Products consume Shared Services. They don't implement them.** (Law #7, `01-platform-principles.md`)

If a capability would otherwise be needed by more than one product, it belongs here — not duplicated inside each product that needs it. Concretely:

- Notifications do not get built inside Commerce.
- AI does not get built inside Core.
- Files/document storage does not get built inside Finance.

Each of those has already happened once in this codebase in a smaller form — the two separate `AuthProvider` implementations (RN app and OMS) are exactly this mistake, applied to Identity. This document exists so it doesn't happen again as the platform grows.

## Current State

None of these are built as shared platform services today. Where equivalents exist, they're product-scoped (e.g. push notifications currently live inside the main app, not as a platform-level service any product could call). No migration of existing functionality is implied by this document — it governs where *new* shared capability goes, starting now.

## Relationship to Other Documents

Shared Services sit **parallel to** Products under Platform, not beneath them:

```
Platform
  ├── Identity
  ├── Workspace
  ├── Shared Services
  └── Products
```

Products consume both Workspace entities (`03-workspace.md`) and Shared Services — they never sit above or own either, and never reach into each other directly (Law #3).
