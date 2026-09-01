# Support System Plan — User Tickets + Admin Ticket Management

**Status (2026-08-31):**

| Phase | State |
|-------|--------|
| **S1 — DB + user support flow** | ✅ Done |
| **S2 — Admin support operations** | ✅ Done (Inbox, Detail, reply / status / priority / internal notes) |
| **S2 UX polish** | ✅ Done — see QA limitations below; not a blocker |
| **S3a — Admin identity & login** | 🟡 Live but mid-correction: bootstrap identity is being moved from a personal Google-linked business account (`vasanth.raj@gogox.com`) to a dedicated `platform-admin@gogox.com` account, so Admin Console identity is never tangled with a personal/business login. See `docs/SUPPORT_S3A_IMPLEMENTATION_PLAN.md`. |
| **S3b — Admin users/roles/permissions** | ⏳ Next, after S3a's dedicated-account cleanup and S4 close |
| **S3c — Support assignment** | ⏳ |
| **S3d — RPC-level enforcement** | ⏳ |
| **S4 attachment capability (pulled forward into Create Ticket)** | ✅ **Migration `20270303010000` pushed and verified live** (bucket, RLS, RPC grants all confirmed on the linked project). Runtime QA still pending — see below. |
| **S5 — Notifications / SLA / automation** | Planned (if we go that far) |

**Attachments on Create Ticket / Ticket Detail / Admin Console are implemented and live** (Storage
bucket + RLS, `record_support_ticket_attachment` RPC, upload/display UI in both the main app and
`analytics/`). Retry-on-failed-upload was explicitly decided as **out of scope for this pass** —
accepted, non-blocking, revisit later if it becomes a real pain point. Runtime QA (the 14-point
checklist) is still pending a real Business-app account — the driver test account can't reach
`/support` (`org`-experience-only route). Do not use SUP-000001 for this QA — it stays retired.

**Sequencing note:** attachment work does not block on S3. The attachment security model already
has the correct separation (Business user → own ticket/attachments via RLS; Admin Console →
service-role → support operations) — S3's eventual per-admin permission enforcement (S3d) tightens
the *Admin* side later without requiring any redesign of the attachment model above.

**S2 UX polish — closed 2026-08-31, two QA items explicitly deferred rather than faked:**
- Status/priority dropdown label collision — fixed (micro-labels above each trigger,
  selected-value checkmark now visible).
- Human-readable context chips (trip/indent/vehicle/market-bid) — implemented and query-logic
  verified against real data (`owner_vehicles` → `"TN 22 AS 2341"`), but **not visually confirmed
  in a live render** — no existing ticket has a populated context FK. Verify the next time a
  ticket carries real trip/indent/vehicle/bid context.
- Responsive QA at 1280×800 / 1600×1000 / 1920×1080 — done, no issues found.
- Inbox at realistic volume (10–20 tickets) — **deferred until real ticket volume exists
  organically**. Deliberately not manufactured by inserting rows outside `submit_support_ticket`,
  consistent with this project's standing rule against fabricating test data/identities.

**`SUP-000001` is retired as the shared QA ticket.** It picked up a mix of manual and automated
test activity (including messages neither party intended, from concurrent console usage) and its
activity history is no longer a clean test record. Left as-is, not deleted or edited for
cleanliness. **For future QA, use a separate, clearly-labelled test ticket** — don't reuse this
one.

**Architecture locked:** customer support tickets live in the **main Pulse
database** (`nafxpivddesgsrthmosv`), the same project everything else in this repo already
uses. `pulsetrack` is **not used for this feature** — it stays exactly what it already is: an
internal PulseTrack engineering/QA bug tracker (its own staff accounts, its own
Backlog/In Progress/In Testing/Resolved/Closed lifecycle), completely untouched by this plan.

This replaces the previous revision's central open question. It's a strictly better fit: the
customer already has a real, authenticated identity in the main Pulse project, so there's no
cross-project identity bridge to design, no JWT-passthrough scheme, and ticket rows can use real
foreign keys into `auth.users`, `organizations`, `trips`, `indents`, `owner_vehicles`, and
`market_bids` instead of bare value columns. It also means Support's schema goes through the
exact same migration pipeline (`supabase/migrations/`) already used for everything else this
session (WS1/WS6, etc.) — no new infrastructure needed to ship it.

---

## 0. Decisions

### Resolved: support tickets live in the main Pulse DB; `pulsetrack` is untouched

See above. Nothing about `pulsetrack` changes as a result of this feature — no new tables, no
new columns, no new enum values, no migrations, no data. It is out of scope entirely.

### Resolved: admin/support-agent identity is deferred, not a prerequisite

The Admin Console (`analytics/`) still has no per-admin login today — confirmed last revision,
still true, unchanged by this pivot. Rather than block ticket creation and basic ticket
management on fixing that (a materially bigger project touching the whole console, not just
Support), it's explicitly sequenced later as its own phase (S3). Until S3:
- Tickets can be created, replied to, and have their status/priority changed from the Admin
  Console exactly as every other console action works today — attributed to "the console,"
  not to a specific person, same as KYC approve/reject/escalate already are.
- **"Assign" is deliberately excluded from S2.** The `assigned_to` column exists in the schema
  from S1 (nullable) but nothing in S1/S2 writes a real, authenticated value into it — there is
  no trustworthy identity to put there yet. Real assignment, "Assigned to me," and attributed
  audit trail arrive together in S3, once agent auth exists.

### Not yet resolved, smaller: org-wide ticket visibility

Your §6 boundary was "user sees their own tickets." Left as: **a ticket is visible only to the
user who filed it**, not to other members of their organization, for S1. If a Business account
later wants any org member to see tickets filed under that org, that's an additive RLS change,
not a blocker to note now — flagging it so it doesn't get silently assumed either way.

### Notifications — sizing, not a decision

Unchanged from last revision's finding: no generic "notify a Pulse user" mechanism exists yet.
Two narrow, purpose-built outboxes exist (`chat_push_outbox`, `network_notifications`), neither
touched by the Admin Console today. Being in the same project now removes any *cross-project*
notification complexity, but the actual hookup (new outbox row → existing
`send-push-notifications` edge function, or a new small delivery path) is still real work,
scheduled at **S5** (not S4 — S4 is attachments / evidence only).

---

## 1. Product objective

Give Pulse users (drivers, businesses) a lightweight way to report a problem and track its
resolution inside the app they already use, and give support staff a real ticket-management
workspace inside the Admin Console they already use — as one more domain in the main Pulse
database, not a second system to keep in sync.

## 2. User journey

```
Contact Support (existing entry point — see §11A; today just links out, becomes real)
      ↓
Category → Subject → Description → optional screenshot/photo
      ↓
Submit → ticket reference number (e.g. SUP-000123)
      ↓
My Support Tickets — id, subject, status, "updated 12 min ago"
      ↓
Open a ticket → conversation (their messages + support replies) → reply → see status
```

No internal notes, no assignment UI, no priority controls, no other users'/orgs' tickets.

## 3. Admin support journey

```
Support (new Admin Console section)
   ├── Inbox — filters (Open / Unassigned* / Waiting for user / Resolved / Closed / priority /
   │           category), sort (newest/oldest/priority/oldest-unresolved/recently-updated),
   │           search (ticket ID / user / org / subject / reference ID)
   ↓
Ticket Detail — header, conversation, context, internal notes, actions
   ↓
Reply · change status · change priority · resolve · close · reopen      [S2]
Assign · "Assigned to me" · agent-attributed audit trail                [S3]
```
*"Unassigned" as a filter is meaningful from S1 (every ticket starts unassigned), even though
the "Assign" action itself doesn't exist until S3.

## 4. Ticket lifecycle

```
OPEN → ASSIGNED → IN PROGRESS → WAITING FOR USER → RESOLVED → CLOSED
```
with reopen allowed from RESOLVED/CLOSED back to OPEN. A fresh enum, defined for this feature
alone — no inherited conflict with `pulsetrack`'s own dev-tracker lifecycle, since that table
is no longer in play. `ASSIGNED` exists in the enum from S1 for completeness but has no real
UI path to reach it until S3's assignment action ships; a ticket can move
`OPEN → IN PROGRESS → WAITING FOR USER → RESOLVED → CLOSED` without ever passing through it in
S1/S2, which is fine.

## 5. Ticket data model

New tables, new migration(s), in the main Pulse project, alongside everything else in
`supabase/migrations/`:

- **`support_tickets`**: `id` (uuid or a display-friendly `SUP-nnnnnn` sequence — worth
  deciding at build time, not here), `created_by_user_id uuid references auth.users(id)`,
  `organization_id uuid references organizations(id)` (nullable — a driver without an org
  context can still file one), `category text`, `subject text`, `description text`, `status`
  (the enum above), `priority` (`low/medium/high/critical`), `assigned_to uuid` (nullable,
  real FK target TBD at S3), `source_screen text`, `trip_id uuid references trips(id)` nullable,
  `indent_id uuid references indents(id)` nullable, `owner_vehicle_id uuid references
  owner_vehicles(id)` nullable, `market_bid_id uuid references market_bids(id)` nullable,
  `created_at`, `updated_at`, `resolved_at`, `closed_at`.
- **`support_ticket_comments`**: `id`, `ticket_id references support_tickets(id)`,
  `author_user_id uuid references auth.users(id)`, `body text`, `visibility` (`public`/
  `internal`), `created_at`. `visibility='internal'` is what §6's "hidden from users" enforces,
  via RLS + query-layer filtering.
- **`support_ticket_activity`**: `id`, `ticket_id`, `actor_user_id`, `action text`,
  `detail text`, `created_at` — same shape as every other activity-log table in this repo
  (e.g. `verification_audit_logs`), rendered with the same icon-timeline pattern as
  `analytics/src/components/queue/AuditTrail.tsx`.
- **`support_ticket_attachments`**: `id`, `ticket_id`, `comment_id` **nullable in S1 schema
  (must become required for new message evidence in S4)**, `storage_path`,
  `mime_type`, `size_bytes`, `uploaded_by_user_id`.
  **Target association model (S4):** attachments hang off a **comment**, not a flat pile on
  the ticket:

  ```
  Ticket
   ├── Comment 1  →  screenshot.png
   ├── Comment 2  →  invoice.pdf, error.png
   └── Comment 3  →  (no attachment)
  ```

  S1 landed the table so migrations/RPCs do not need a shape change later; **no bucket, no
  upload UI** until S4 (§16).

Real foreign keys throughout — no snapshot-only value columns needed for the core relations,
since everything lives in one database. Still worth snapshotting `reporter_display_name`/
`organization_name` at creation time for the *list view* (avoids a join for the common case),
refreshed lazily rather than treated as authoritative.

## 6. User/Admin permission model

- **User side**: real RLS, real `auth.uid()`, no bridge needed —
  `created_by_user_id = auth.uid()` for `support_tickets`/`support_ticket_comments` reads;
  inserts via a `submit_support_ticket()`-style RPC (mirroring `submit_market_bid`'s shape)
  rather than raw table inserts, so validation (non-empty subject, valid category, etc.) lives
  in one place. `visibility='internal'` comments never returned to the user regardless of RLS,
  as a second layer, not just a filter.
- **Admin/support side**: unchanged from today's console-wide pattern until S3 — the console
  runs under service_role, so this is consistent with every other panel, not a new gap
  introduced by Support.

## 7. `pulsetrack` — explicitly out of scope, for the record

Confirmed last revision, restated because it's load-bearing: 4 tables (`tickets`, `comments`,
`activity_log`, `profiles`), its own `auth.users` (8 internal staff), its own
`ticket_status`/`ticket_type`/`user_role` enums built for dev/QA triage (`Backlog → In
Progress → In Testing → Resolved → Closed`, `Bug/Feature/Enhancement/UI Issue/Performance`,
`Admin/Dev/Tester/Reporter`), zero storage buckets. **None of this is touched, extended, or
migrated by this plan.**

## 8. Pulse ↔ pulsetrack integration

**N/A — removed.** There is no integration to design; the two systems don't talk to each other.
If a future need arises to cross-reference "is this Support ticket related to a known
PulseTrack engineering bug," that's a manual, human-initiated link (e.g. an internal note
mentioning a `PLS-xxx` ID as plain text), not a system integration — out of scope here.

## 9. Attachments (S4 — planned; not current work)

**Expected today:** neither Pulse Ticket Detail nor Admin Console Reply shows 📎 Attach files.
That matches the S2 cut: schema only. Treat missing attach UI as **roadmap debt for S4**, not
a regression.

### Product target — first-class ticket evidence

Attachments appear **in the conversation**, next to the message — not only as ticket-header
chrome.

**Pulse user composer**

```
┌─────────────────────────────────────────────┐
│ Add a reply...                              │
│                                             │
│ 📎 Attach files                             │
│                                             │
│ screenshot.png   ×                          │
└─────────────────────────────────────────────┘
                         [Send]
```

**Admin Console composer** (Reply to user | Internal note)

```
┌─────────────────────────────────────────────┐
│ Reply to user | Internal note               │
│                                             │
│ Reply...                                    │
│                                             │
│ 📎 Attach files                             │
│                                             │
│ error-screen.png  ×                         │
└─────────────────────────────────────────────┘
                         [Send reply]
```

**In-thread rendering (example)**

```
You · 4:48 PM
The trip is showing the wrong status.
📎 trip-status.png · 1.2 MB
[View]
```

### Implementation approach (when S4 starts)

Mirror `features/chat/utils/chatImageUpload.util.ts` (compress to ≤800px long edge, JPEG @ 0.65,
size caps) against a **new dedicated bucket** (e.g. `support-attachments`) — do **not** reuse
`trip-documents` RLS. Users read/write only attachments on their own tickets; Admin uses
service_role (until S3 identity). Multiple attachments per comment; image preview +
download/open for supported types; file size/type allowlist.

Full S4 checklist: **§16**.

## 10. Notifications (S5 — planned)

Unchanged finding, simpler mechanically: extend or sit alongside the existing
`send-push-notifications` edge function (same project, same cron) with a new outbox insert on
ticket-created / support-replied / status-changed / resolved, rather than building a fully
separate pipeline. Sizing this precisely (how coupled that function currently is to
`chat_push_outbox`'s specific shape) is **Phase S5** work, not S4.

## 11. Existing-system inspection (facts from last revision, still true, now recontextualized)

**A. Pulse App**
- "Contact Support" today is `features/network/components/NetworkSupportHelpCards.tsx` →
  `Linking.openURL()` to an external URL/`mailto:` — no in-app record created. Lives on the
  business/dispatcher Network hub (`NetworkScreen.tsx`, `NetworkDesktopHub.tsx`); this becomes
  the real entry point per your §1, replacing the external link with in-app navigation to the
  ticket composer. No equivalent found yet on the driver side — needs a decision at build time
  (shared entry point vs. driver gets its own "Contact Support," per your "reuse rather than
  create competing destinations" instruction).
- No `support` route in `lib/routes.ts` yet.
- Push infra real and reusable at the mechanical level (`usePushTokenRegistration.ts` →
  `pushToken.service.ts` → `supabase/functions/send-push-notifications`), just not generic
  today (§10).
- Upload pattern to mirror: `chatImageUpload.util.ts` (§9).
- No `'support'` permission/role string anywhere in the main app's own IAM code today.

**B. Admin Console** (`analytics/`)
- `analytics/src/App.tsx`: single-page shell, `ConsoleView` union type, `Topbar` nav, `AdminShell`
  switch. Adding Support = one more `ConsoleView` variant + one more nav button + one more
  branch — matches existing convention exactly, confirmed capable of accommodating this without
  restructuring anything, per your own read.
- No shared table/filter-chip component — every list panel (`ApplicationQueue`,
  `DriverKycPanel`) reimplements search/filter locally (Tabs-as-pills + plain `.filter()`); a
  new Support Inbox follows the same convention rather than introducing a new shared
  abstraction.
- Detail pattern to mirror: header strip + tabbed body + docked action bar
  (`OrgStrip`/`OrgWorkspace`/`VerificationActionPanel`), one shared `AdminDataProvider`
  context, direct `supabase.rpc()` calls, `alert()` for errors (no toast system exists).
- Runs under the service_role key, no per-admin session — unchanged fact, now explicitly
  deferred to S3 rather than blocking anything (§0).
- `AuditTrail.tsx` — reusable icon-timeline pattern for ticket activity history.
- No notification-sending code anywhere in `analytics/src` (§10).

## 12. Implementation phases

**S1 — Support foundation** ✅  
Migration(s) for `support_tickets` / `support_ticket_comments` / `support_ticket_activity` /
`support_ticket_attachments` (**schema only** for attachments) + RLS + submit/reply RPCs.
Pulse App: Contact Support → Create Ticket → My Tickets → Ticket Detail → Reply.

**S2 — Admin Support operations** ✅  
Admin Console Support Inbox + Ticket Detail, reply / status / priority / internal notes,
console-wide access (no per-agent gating yet).

**S2 UX polish** ← **current**  
Visual / interaction polish on user Ticket Detail and Admin Support surfaces. **Explicitly
excludes** attachment upload UI and storage bucket work.

**S3 — Agent identity + assignment**  
Real support-agent authentication for the Admin Console, `assigned_to` becomes a real FK,
"Assigned to me," agent-attributed activity log.

**S4 — Attachments + richer evidence**  
Storage bucket, Pulse + Admin upload, multi-file per comment, in-thread preview/download,
secure access, `comment_id`-scoped metadata — full scope in **§16**. **Not** notifications.

**S5 — Notifications / SLA / automation** (optional stretch)  
Outbox hookup for ticket-created / replied / resolved; open/unresolved counts, first-response /
resolution time, aging, reopened, by agent (agent metrics need S3).

Each phase independently typechecked.

## 13. Security/RLS

Simplified by this revision — no cross-project auth bridge, no JWT passthrough scheme needed.
Real RLS on `support_tickets`/`support_ticket_comments`/`support_ticket_attachments` scoped to
`created_by_user_id = auth.uid()`, `visibility='internal'` comments excluded from user-facing
reads at both the RLS and query layer. Admin/support-side access remains the console's existing
service_role pattern until S3 — not a new gap, not resolved by Support, explicitly out of this
plan's scope to fix. S4 must extend attachment policies so users only access files on **their**
tickets (and only public-comment evidence), with Admin/service-role for console.

## 14. Report

**What already exists and is reusable as a pattern:** the Admin Console's queue/filter idiom,
its KYC detail-screen layout, `AuditTrail`'s icon-timeline, the chat attachment compress/upload
approach, the push-notification edge function + cron.

**What is built:** S1 tables + RPCs + user flow; S2 Admin Support Inbox/Detail.

**What is next:** S2 UX polish (no attachments). Then S3 identity, then S4 attachments (§16),
then S5 notifications/SLA if pursued.

**Risky / easy-to-forget:** treating missing 📎 as an S2 bug and shipping half-baked upload
without comment association or bucket RLS. Keep that work gated to S4.

**Decisions still open (non-blocking):** org-wide ticket visibility (§0); driver-side Contact
Support entry point (§11A).

---

## 15. S2 — Admin Support Console

**Status:** S2 admin operations shipped; remaining work is **S2 UX polish** only (see status
table at top). Historical discovery notes below kept for decisions A/B.

Builds entirely on the four S1 tables and existing RPCs — no change to
`support_tickets`/`support_ticket_comments`/`support_ticket_activity`/`support_ticket_attachments`
for attachment **upload** (that is S4). `submit_support_ticket` / `reply_to_support_ticket`
stay as deployed unless a polish bug requires a narrow fix.

### Decision A — service-role-in-client vs. a server-side layer

Verified directly (`analytics/src/lib/supabase.ts`): **every existing Admin Console panel already
embeds the `service_role` key in the client bundle today** —
`VITE_SUPABASE_SERVICE_ROLE_KEY`, with the code's own comment: *"Admin console uses service role
to bypass RLS — local/dev only; never ship publicly."* Verification, Driver KYC, Credits,
Referrals, Reward Rules, and Boost Ops all work this way. There is no existing server-side layer
(Edge Function or otherwise) that the console calls instead — confirmed, none found.

Your instruction this round asked for service-role/server-side access instead of exposing it to
the client. That's a real fork, not a detail:

- **(a) Match the existing convention** — the Support panel uses the same already-embedded
  `analytics/src/lib/supabase.ts` client every other panel uses, calling new admin RPCs (§ below)
  directly. Zero new infrastructure, consistent with 100% of the console's current panels, but
  it's the same "local/dev only, never ship publicly" risk posture the console already carries
  everywhere else — not a new risk, but not a smaller one either.
- **(b) Build a server-side layer for Support specifically** — e.g. a Supabase Edge Function
  holding the service-role key server-side, called by the Admin Console over HTTP instead of the
  client SDK. Satisfies "don't expose service-role to the client" for this one panel, but makes
  Support the *only* panel in the console with a different access architecture from everything
  else — new infrastructure with no existing precedent to follow, and a real question of how the
  Admin Console (itself running with no per-admin auth — see Decision B) would authenticate to
  that Edge Function at all.

I'd default to (a) purely because it's the documented, working, already-accepted pattern this
exact console uses everywhere else — but this is squarely your call, and I'm not picking it
unilaterally.

### Decision B — what "Assignment" means in S2, given the S3 boundary already agreed

The phase split locked earlier this session put "real support-agent authentication, assignment,
'Assigned to me', agent attribution" entirely in **S3**, with S2 explicitly limited to "Inbox,
Ticket detail, Reply/status/priority" — assignment deliberately excluded. This round's S2
structure lists "Assign owner/agent" and "Assignment" again under S2. I'm flagging the
contradiction rather than silently picking a side:

- If "Assignment" in S2 means picking a name from a **plain list/free-text field** (no real
  authenticated agent session, `assigned_to` stores a label or an existing `auth.users` id chosen
  from a static dropdown of known staff, with no session-based "assign to **me**" since there's no
  "me" yet) — that's compatible with deferring real agent auth to S3, and is a small, additive
  RPC (`admin_assign_support_ticket(ticket_id, assignee_user_id)`).
- If "Assignment" means real per-admin identity ("assigned to me," attributed audit trail) — that
  structurally requires S3's agent auth first; building it now would mean quietly doing S3's work
  inside "S2."

I'd build the first (a plain, unauthenticated assignee field) if you want Assignment in S2 at
all — same conclusion as the already-agreed S3 boundary, just naming precisely what a
non-authenticated "assignment" can and can't mean.

### IA — reusing existing Admin Console patterns exactly

- One more `ConsoleView` variant (`'support'`) + one more `Topbar` button + one more branch in
  `AdminShell` — the console's own existing convention for a new top-level section
  (`analytics/src/App.tsx`), confirmed capable of this without restructuring anything.
- **Support Inbox**: same shape as `ApplicationQueue.tsx`/`DriverKycPanel.tsx` — local filter
  state, `Tabs`-as-pills for status with live counts, plain search input, array `.filter()`. No
  shared `DataTable` exists to extend; a new Support Inbox follows the same per-panel convention
  rather than introducing one.
- **Ticket workspace**: mirrors the KYC flow's three-part layout — a header strip (SUP-id,
  subject, reporter, org, status/priority badges, à la `OrgStrip`), a tabbed body
  (Conversation / Context / Internal, à la `OrgWorkspace`), and a docked action bar (reply /
  internal note / status / priority, à la `VerificationActionPanel`'s `Dialog`-confirmation
  pattern). `AuditTrail.tsx`'s icon-timeline renders `support_ticket_activity` directly — same
  component shape, new data source.

### New RPCs needed (additive only — the two S1 RPCs are untouched)

- `admin_reply_to_support_ticket(ticket_id, body)` — inserts a `visibility='public'` comment.
  Needs one small additive column to distinguish agent replies from user replies in the
  conversation UI: `support_ticket_comments.author_type text not null default 'user'` (values
  `'user'`/`'agent'`) — the current schema only has `author_user_id`, which isn't enough once two
  different kinds of people can post. Flagging this now rather than silently adding it later.
- `admin_add_internal_note(ticket_id, body)` — inserts a `visibility='internal'` comment.
- `admin_change_support_ticket_status(ticket_id, status)`.
- `admin_change_support_ticket_priority(ticket_id, priority)`.
- `admin_assign_support_ticket(ticket_id, assignee_user_id)` — only if Decision B resolves to
  "build it now" as a plain field.

All five follow the same shape as `admin_approve_profile`/`admin_reject_profile` (the existing
KYC precedent): callable under service_role, each one also appending a row to
`support_ticket_activity` so the audit trail stays centralized in the RPC rather than scattered
across client-side inserts.

### What S2 does not touch

`pulsetrack` (still out of scope entirely), real agent authentication (S3), **attachments /
evidence upload (S4)**, notifications / SLA (S5). Admin ops for reply/status/priority/notes
are in; 📎 is not.

---

## 16. S4 — Attachments + richer evidence (plan only — do not start during S2 polish)

Gate: S2 UX polish complete (or explicitly waived). Do **not** start S4 while polishing S2.

### Scope checklist

| Item | Notes |
|------|--------|
| Storage bucket `support-attachments` (or equivalent) | Dedicated; not `trip-documents` |
| Upload from Pulse (create ticket + reply) | 📎 row + chip remove (×) |
| Upload from Admin Console (public reply + internal note) | Same composer pattern |
| Multiple attachments per **comment** | N files per message |
| In-thread display | Filename · size · View / open |
| Image preview | Inline or lightbox for images |
| Download/open for supported non-image types | PDF etc. per allowlist |
| File size / MIME allowlist | Mirror chat caps unless product changes |
| Secure access — users only their tickets | RLS + signed URLs |
| Admin / service-role access | Console can read all ticket evidence |
| Metadata in `support_ticket_attachments` | path, mime, size, uploader, timestamps |
| **Associate with `comment_id`, not ticket-only pile** | Prefer NOT NULL `comment_id` for new rows |

### Out of S4

- Agent identity / assignment → **S3**
- Push / email / SLA automation → **S5**
- Flat ticket-header-only gallery without message association → **rejected** as the product
  model

### Schema note

S1 `comment_id` is nullable. S4 should require `comment_id` for composer uploads (create
reply/note first or in one RPC that inserts comment + attachment rows). Ticket-level-only rows
are legacy/optional; do not design the UI around a flat ticket file dump.

---

**Current instruction:** continue **S2 UX polish** only. Do **not** implement attachments until
S4 is authorized.
