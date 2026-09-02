# TMS Documentation Set

Read in this order. Each doc has one job. If two docs disagree, the lower-numbered one wins.

| # | Doc | Answers | Owner |
|---|-----|---------|-------|
| 01 | `01-strategy-brief.md` | Why build this, for whom, what "success" means | Product |
| 02 | `02-domain-model.md` | Vocabulary + entity/state definitions (source of truth for naming) | Product + Tech |
| 03 | `03-prd.md` | What we ship, in what order, with acceptance criteria | Product |
| 04 | `04-visibility-matrix.md` | Who can see/do what. The hardest part of this product. | Product + Tech |
| 05 | `05-technical-design.md` | How it's built: schema, RLS, APIs, rollout | Tech |
| 06 | `06-delivery-plan.md` | Milestones, sequencing, what gets cut | Eng lead |
| 07 | `07-open-decisions.md` | Unresolved calls, blocking status, owners | Product |
| 08 | `08-risks-and-honest-assessment.md` | Where this plan is likely to fail | Everyone |
| 09 | `09-gst-eway-bill-research.md` | GST/e-way bill API access findings (D15) | Product |

## Conventions

- `[ASSUMPTION — CONFIRM]` = I made a call to keep moving. Wrong assumption = rework. Verify these first.
- `[UNKNOWN]` = genuinely not decided. Do not build past it.
- `[DECIDED yyyy-mm-dd]` = locked. Changing it requires a decision-log entry in `07`.
- Status/enum values are written in `SCREAMING_SNAKE` and are the literal DB values.

## Status of this set

Drafted 2026-09-02 from a single verbal spec. **Not validated against users, not validated against
existing q-web code.** Treat every number (timelines, metrics, volumes) as a placeholder until
someone puts real data behind it.
