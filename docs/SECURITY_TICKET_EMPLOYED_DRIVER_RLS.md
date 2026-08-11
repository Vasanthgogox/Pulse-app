# Security ticket — Employed Driver RLS role gap (TRACK ONLY)

**Status:** Open — tracked separately from Driver Fleet Owner work.  
**Do not fix inside FO / Reach / `get_network_feed` grant patches.**  
**Discovered:** FO Go/No-Go security audit (pre-3B.2), Aug 2026.

---

## What's the issue?

`is_org_member(org_id)` checks active `organization_members` membership only — **not** role.  
Many INSERT/UPDATE policies on operational tables (trips, indents, etc.) use that helper (or equivalent role-blind OM predicates). An **employed Driver** can therefore satisfy those policies at the database layer even when product UI never exposes the action.

| Fact | |
|------|--|
| Pre-existing | ✅ Yes — inventory lives in ADR-010 |
| Related to Fleet Owner organic capacity / Boost | ❌ No |
| Exploitable by independent FO (no org membership) | ❌ No |

---

## Correct fix path (out of scope here)

Follow **[`docs/ADR-010-RLS-AUDIT.md`](./ADR-010-RLS-AUDIT.md)** and **[`docs/decisions.md`](./decisions.md)** ADR-010:

1. Role matrix sign-off (Deliverable 2) before policy edits.
2. Introduce / use `is_org_staff` (or equivalent) for operational CUD.
3. Keep `is_org_member` as tenancy ("belongs"), not authority ("acts for org").
4. Prefer **Restrict** staff policies; keep dedicated driver own-row policies.

**Do not** redefine `is_org_member` to exclude drivers as a quick FO follow-up — that breaks legitimate belonging checks.

---

## Acceptance when this ticket is worked

- Employed `role='driver'` cannot INSERT trips/indents (and other staff-only tables per signed matrix) via PostgREST/`anon`+JWT as that driver.
- Staff roles retain intended CUD.
- No regression to FO isolation (FO has no Business org membership).

---

## References

- `docs/ADR-010-RLS-AUDIT.md`
- `docs/decisions.md` (ADR-010)
- FO audit Go/No-Go table: employed Driver RLS = 🟡 TRACK separately
