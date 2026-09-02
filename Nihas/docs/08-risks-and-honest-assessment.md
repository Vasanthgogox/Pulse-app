# 08 — Risks & Honest Assessment

Read this before committing headcount. The rest of the set describes a coherent system; this
describes why it might not matter.

---

## 1. Risks ranked by expected damage

### R-1 — Drivers won't use the app *(highest, and it invalidates everything)*

The entire value chain is: driver records events → clean trip record → Giver trusts it →
faster payment → Giver retains. Every link depends on the first.

The driver gets **nothing** from this. It's extra work on their phone, on their data plan,
often in a language they don't read well, tracking them for an employer they may not trust.
Their alternative — answering a phone call — is easier and free.

**Signals it's failing:** event completion <40%; drivers marking all five milestones at once
at day's end; POD photos of a photo; ops still phoning drivers.

**Mitigations that actually help:**
- Offline-first, non-negotiable. An app that fails without signal is worse than nothing.
- Two taps per milestone maximum. No forms.
- Never reject a driver's input for being out of order (`05` §4).
- Something in it for the driver — trip history for wage disputes is the most credible.
- WhatsApp/IVR fallback for drivers who won't install anything.
- Instrument driver behaviour in the pilot before building the R2 marketplace on top of it.

**Do not mitigate by mandating it in a contract.** Compliance theatre produces garbage data,
which is worse than no data because the Giver stops trusting the record.

### R-2 — Bidding destroys the relationship it's supposed to serve

Freight relationships are trust arrangements that absorb loss, damage and payment risk.
Reverse auctions optimise price and dissolve that trust. The observed pattern: movers bid
below cost to win, then renegotiate at the pickup gate or after loading, and the Giver ends up
worse off than with a phone call.

**Mitigation:** D0 — execution-first. Bidding restricted to connected movers (D9), no rank
display, no auto-underbid (`04` §3). Track award-to-renegotiation rate as a first-class
metric; if movers habitually renegotiate post-award, bidding is net-negative and should be
switched off.

### R-3 — Aggregated suppliers get all the cost and none of the value

The visibility model is correct for the Mover's commercial interest and actively hostile to
the supplier. A supplier who lends a truck sees: a city, a report-by time, a generic material
class, and their rate. They cannot see where their asset is going, verify the load, or build
their own customer relationships.

Rational supplier response: don't bother with the platform, keep working over the phone.

**Mitigation:** give the supplier something they can't get from a phone call — utilisation
records for their own trucks, verified payment history from the Mover, a settlement trail.
None of this is designed in the current PRD. **R3 is at real risk of shipping a feature only
one side wants.**

### R-4 — Existing q-web codebase collision

`05` §9 exists because this design was written blind. The repo has organizations, clients,
suppliers, connections, network and finance modules already, plus in-flight work on
`sameOrgPartyGuard`. Any of these could mean days of reuse or weeks of untangling.

**Mitigation:** Phase 0 is blocking. Do not let R1 start on optimism about reuse.

### R-5 — Confidentiality bug as a commercial incident

The interesting failures are subtle: a notification template with too much detail; an export
that skips RLS; a `select *` in a list endpoint; a new field added for the Giver that reaches
the supplier view. Any of them can leak a customer identity or a rate.

**Mitigation:** `05` §8's field-enumeration leak test, where a new unasserted column fails the
build. That mechanism, not documentation, is what keeps `04` true in twelve months.

### R-6 — Freight complexity we've declared out of scope

`03` §6 lists what isn't designed: detention charges, partial delivery, damage claims,
per-tonne vs per-trip rates, statutory documents. **Detention and short-delivery disputes are
the majority of real freight arguments.** A tool that can't record them is a tool ops keeps a
spreadsheet alongside — and the spreadsheet wins.

**Mitigation:** pick the top two from the pilot and add them to R2 rather than deferring
indefinitely. Do not pretend the exclusion list is a scope decision; it's a debt list.

### R-7 — Payment expectation gap

POD is positioned as the payment trigger, and there is no payment. Every Giver and Mover will
ask about money in the first demo. Answering "not yet" repeatedly erodes the pitch.

**Mitigation:** either bring basic invoice generation into R2, or stop using "faster payment"
as the primary value claim.

### R-8 — Estimates

26–34 ew is a bottom-up number from a spec that has 16 open decisions, 4 of them blocking, and
zero code reconciliation. `06` applies a 1.4–1.6× multiplier, which is honest but still assumes
the blocking decisions resolve cleanly.

---

## 2. What's genuinely strong here

Not everything is risk:

- **The Load/Trip separation and the accountability-based visibility rule are correct and
  non-obvious.** Most teams model "trip" as one row with an owner and then discover
  aggregation breaks it. Starting from `Resource Owner ≠ Trip Operator` is right.
- **Separate truck-source and driver-source columns** make all four ownership combinations fall
  out of the model instead of being four special cases.
- **`assignment_briefs` as a table rather than a filtered view** is the right instinct: make
  leaking require deliberate new code.
- **Derived trip status from an append-only event log** is what makes the driver app survivable.
- **Append-only assignments and events** give real dispute resolution, which is a genuine
  selling point in a domain full of disputes.

---

## 3. What I'd change if this were my call

1. **Resolve D0 to execution-first and cut bidding from v1 entirely.** Ship a dispatch +
   execution-record tool for Giver↔Mover pairs who already work together. It's a smaller, more
   defensible product, and it tests the risky assumption (drivers) without also betting on the
   marketplace assumption (movers bid).
2. **Cut R3 aggregation from v1.** It's the most complex work and, per R-3, is the piece a key
   participant has least reason to want. Come back to it once you know suppliers will engage.
3. **Spend the freed capacity on the driver app.** It is the product. Everything else is CRUD
   with permissions.
4. **Add detention/halting and short-delivery** to the data model early. They're what ops
   actually argues about.
5. **Find one design-partner Giver before writing code**, one who commits to making their
   drivers use it. Without that, the R1 gate is unmeasurable and this is a nine-month
   speculative build.

---

## 4. Confidence statement

| Doc | Confidence | Why |
|---|---|---|
| `02` domain model | **High** | Follows from the spec; the abstractions hold under aggregation and multi-leg |
| `04` visibility matrix | **High on structure, low on policy** | The mechanism is sound; D3/D4/D7/D8 are business calls I guessed at |
| `05` technical design | **Medium** | Sound Postgres/RLS patterns, but written without reading the existing schema |
| `03` PRD | **Medium** | Acceptance criteria are testable; scope depends on D0 |
| `01` strategy | **Low** | Zero user research. Metrics and segments are hypotheses. |
| `06` delivery plan | **Low** | No team size, no reconciliation done, 4 blocking decisions open |

**Bottom line:** the architecture is worth building on. The business case has not been tested,
and the plan's timeline is the least trustworthy artifact in the set.
