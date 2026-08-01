# Marketplace Release Checklist

**Required** before releasing changes that touch any of:

- bidding  
- campaigns / Reach  
- visibility / feed / story lifetime  
- pricing / snapshots  
- commercial resolver (M1+)  
- marketplace notifications  

Copy into the PR or release note and tick what you ran.

```
Marketplace Release Checklist

□ Gate 1 — Lifetime (story stays open until award / cancel / withdraw)
□ Gate 2 — Branch B (scripts/marketplace/GATE2_BRANCH_B_RUNBOOK.md)
□ Gate 3 — Concurrent bids (npm run marketplace:gate3-harness)
□ Gate 4 — Three-org journey (scripts/marketplace/GATE4_THREE_ORG_JOURNEY.md)
□ Domain / unit tests for touched services
□ Production smoke (publish → bid → award on a safe account)
```

### Minimum by change type

| Change area | Must re-run |
|-------------|-------------|
| Bidding RPC / bid UI | Gate 3 + Gate 4 smoke |
| Campaigns / snapshots | Gate 2 (+ Gate 1 smoke) |
| Feed / visibility / lifetime | Gate 1 + Gate 2 |
| Pricing display | Gate 2 |
| Notifications | Gate 4 smoke |
| Resolver (M1+) | All four gates |

### Pointers

| Artifact | Path |
|----------|------|
| Validation observations + 1–5 scores | `scripts/marketplace/VALIDATION_OBSERVATIONS.md` |
| M1 consistency matrix | `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md` |
| Feature intake | KPI → hesitation → consume platform? (extend only if no) |
| Next operating plan / v1 exit | `docs/MARKETPLACE_NEXT_OPERATING_PLAN.md` |
| M0 go/no-go | `docs/MARKETPLACE_P0_VALIDATION.md` |
| Gate 2 runbook | `scripts/marketplace/GATE2_BRANCH_B_RUNBOOK.md` |
| Gate 3 harness | `npm run marketplace:gate3-harness` |
| Gate 4 runbook | `scripts/marketplace/GATE4_THREE_ORG_JOURNEY.md` |

**No new Marketplace code** until M0 rows in `MARKETPLACE_P0_VALIDATION.md` are all ✅ including production sign-off.
