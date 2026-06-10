# Admin Console — Design Specification

**Purpose:** God-level control panel for platform operators and developers to manage configuration, users, and operations across the entire Pulse / pulse-unified-base ecosystem—modeled on how Uber, Rapido, and similar platforms run their systems at scale.

**Audience:** Senior product/UX reference and implementation blueprint for the admin console (separate from the mobile app; typically a web app or dedicated admin surface).

---

## 1. High-Level System Overview

### What the Admin Console Does

The **Admin Console** is a **platform-level** control plane that sits **above** tenant organizations. It is not the same as “dispatcher” or “fleet owner” capabilities inside the app:

| Layer | Who | Scope |
|-------|-----|--------|
| **Platform (Admin Console)** | Platform ops, developers, super-admins | All orgs, all users, global config, compliance, money flow |
| **Organization (Pulse app)** | Dispatcher, fleet owner (unified role) | One org: trips, drivers, clients, suppliers, finance (via capabilities) |

The console enables:

- **User lifecycle:** Create, suspend, verify, and role-assign platform users (drivers, passengers, support, admins).
- **Configuration:** Pricing, surge/multipliers, service areas, feature flags, payment and payout settings.
- **Visibility:** Real-time metrics, health, transactions, and audit trails.
- **Operations:** Disputes, support tickets, safety incidents, financial reconciliation.
- **Compliance:** Document verification, regulatory reporting, and safety controls.

Access is **role-based** and **audited**; no single “god” login without traceability.

---

## 2. Core Admin Modules and Primary Functions

### 2.1 User Management

**Purpose:** Single place to see and act on every user type across the platform.

| User type | Admin sees at a glance | Key actions | Audit |
|-----------|------------------------|-------------|--------|
| **Drivers** | Status (active/suspended/pending verification), org, last trip, rating, document status | Activate, suspend, require re-verification, assign to org, view documents | All status changes and role changes logged with admin ID and reason |
| **Passengers / clients** | Org, trip count, disputes, payment method status | Suspend, limit booking, flag for review | Same |
| **Support staff** | Scope (org or global), ticket stats, SLA | Create, edit scope, revoke access | Login and permission changes |
| **Admins** | Role, last login, scope (global vs regional) | Create, demote, scope change, MFA reset | Full audit; sensitive actions require second admin or reason |

**Key metrics (list/dashboard):**

- Total users by type and status (active, suspended, pending verification).
- New signups (24h / 7d / 30d).
- Verification backlog (documents pending review).
- Users suspended or flagged in last 24h.

**Permission levels:**

- **View only:** See user list and profile (no PII beyond what’s needed for support).
- **Support:** Can change “soft” status (e.g. flag, add note); cannot suspend or change roles.
- **User admin:** Can suspend, activate, require re-verification, assign org.
- **Super admin:** Can create/edit admin accounts and assign admin roles.

---

### 2.2 Configuration Management

**Purpose:** Control how the product and business logic behave globally or per region/org.

| Config area | What’s managed | At a glance | Actions | Audit |
|-------------|----------------|-------------|---------|--------|
| **Pricing** | Base fares, per-km, per-min, min fare, cancellation fees | Current active profile name, effective date, region/org override | Create version, set effective date, clone, rollback | Version history; who set effective and when |
| **Surge / multipliers** | Multiplier rules, time windows, geo boundaries | Current multiplier zones, last updated | Enable/disable surge, set multiplier cap, set geo rules | All changes with operator and timestamp |
| **Service areas** | Geo polygons, city/region definitions | Map of active areas, “live” flag | Add/edit/archive area, set live | Same |
| **Feature flags** | Kill switches, beta features, org overrides | List of flags, % rollout or org list | Toggle on/off, set % or allowlist, schedule | Change log with who/when |
| **Payment settings** | Gateways, payout schedule, hold rules, currency | Active gateway, payout frequency, min payout | Edit settings, add gateway, change schedule | Full log |
| **Compliance rules** | Max hours, rest rules, document expiry | Current rules per region | Edit thresholds, add region | Versioned |

**Key metrics:**

- Active config version per region.
- Pending (scheduled) config changes.
- Feature flag rollout state.

**Permission levels:**

- **View:** See current config and history.
- **Config editor:** Propose or edit draft config; no “go live” without approval if org policy requires it.
- **Config publisher:** Set effective date / go live (optionally gated by approval workflow).
- **Super admin:** Bypass approval, emergency rollback.

---

### 2.3 Real-Time Monitoring and Analytics

**Purpose:** Know what’s happening now and over time across the platform.

| Area | At a glance | Drill-down | Actions |
|------|-------------|------------|---------|
| **Live ops** | Active users (drivers/riders), active trips, trips in last 15m/1h | By region, org, city | Link to trip list, user list; trigger alert if threshold breached |
| **Transactions** | Volume and value (last 1h/24h), success vs failure rate | By gateway, org, user | Export, open dispute list, reconciliation view |
| **System health** | API latency, error rate, Supabase/queue status | By service, region | Link to runbooks, create incident, notify on-call |
| **Business metrics** | Completed trips, GMV, take rate, cancellations | By day/org/region | Compare to target, export, link to reports |

**Permission levels:**

- **Viewer:** Dashboards and read-only reports.
- **Analyst:** Can create saved views, scheduled reports, and alerts (no config or user actions).

---

### 2.4 Dispute and Support Ticket Management

**Purpose:** Triage, resolve, and learn from disputes and support cases.

| Entity | At a glance | Actions | Audit |
|--------|-------------|---------|--------|
| **Disputes** | Trip ID, amount, parties, status (open/escalated/closed), age | Assign, add note, refund/partial refund, reject, escalate to safety | Full thread and status history with operator ID |
| **Support tickets** | User, subject, channel, priority, SLA countdown | Assign, reply, close, escalate, merge | Same |
| **Safety incidents** | Type, severity, trip/user, reported at | Assign, mark under review, close, escalate to compliance | Sensitive; access logged and restricted |

**Key metrics:**

- Open disputes/tickets by age and priority.
- SLA breach count.
- Resolution time (median, p95).

**Permission levels:**

- **Support agent:** View and reply; resolve within policy (e.g. standard refund).
- **Support lead:** Override resolution, escalate, assign.
- **Safety/compliance:** Access safety incidents; special handling and reporting.

---

### 2.5 Financial Reconciliation and Reporting

**Purpose:** Ensure money in (payments) and money out (payouts, refunds) match and are explainable.

| Function | At a glance | Actions | Audit |
|----------|-------------|---------|--------|
| **Daily/weekly reconciliation** | Expected vs actual by gateway, org, currency | Mark reconciled, flag mismatch, attach memo | Reconciliation events with operator |
| **Payout runs** | Status (scheduled/processing/done), total amount, failure count | Trigger run, retry failed, hold payout | Run id, triggerer, timestamp |
| **Refunds and adjustments** | List of refunds, reason, status | Approve/reject refund, bulk export | Approval chain logged |
| **Invoices and statements** | Generated docs per org/driver | Regenerate, download, send | Download and send events |

**Key metrics:**

- Unreconciled days.
- Payout failure rate.
- Refund queue (pending approval).

**Permission levels:**

- **Finance viewer:** Reports and read-only reconciliation.
- **Finance operator:** Mark reconciled, run payouts (within policy).
- **Finance approver:** Approve refunds above threshold, adjust holds.

---

### 2.6 Safety and Compliance Controls

**Purpose:** Enforce safety and regulatory rules and prove it to auditors.

| Area | At a glance | Actions | Audit |
|------|-------------|---------|--------|
| **Driver hours / rest** | Violations (over hours, insufficient rest), by driver/org | Waive (with reason), suspend until compliant | Waiver and suspension logged |
| **Document validity** | Expiring soon, expired, rejected | Extend (with reason), request re-upload, suspend | All changes logged |
| **Incident reports** | Count by severity/type, open investigations | Assign, close, export for regulator | Access and status change logged |
| **Regulatory reporting** | Report type, period, status | Generate, submit (or mark submitted), archive | Report generation and submission |

**Permission levels:**

- **Compliance viewer:** See reports and status.
- **Compliance officer:** Waive, extend, close incidents (with mandatory reason).
- **Super admin:** Emergency overrides (rare; full audit).

---

### 2.7 Driver/Passenger Verification and Document Management

**Purpose:** Verify identity and eligibility before and during platform use.

| Document type | Admin sees | Actions | Audit |
|---------------|------------|---------|--------|
| **ID (driver/passenger)** | Status (pending/approved/rejected), expiry, last reviewed | Approve, reject with reason, request new | Decision and reason stored |
| **License (driver)** | Same + license class and restrictions | Same + add restriction note | Same |
| **Vehicle / insurance** | Linked vehicle, expiry | Approve, reject, request new | Same |
| **Other (e.g. permit)** | By region requirement | Approve, reject, exempt (with reason) | Same |

**Key metrics:**

- Verification queue size and oldest item.
- Approval/rejection rate.
- Documents expiring in 7/30 days.

**Permission levels:**

- **Verification agent:** Approve/reject within policy; cannot override rejection reason template.
- **Verification lead:** Override, add exception, bulk actions.

---

## 3. Key Workflows

### 3.1 Onboarding a New Driver

1. **Driver signs up** (app or web) → status: *pending_verification*.
2. **Admin Console:** Verification queue shows new driver; documents (ID, license, etc.) appear.
3. **Agent:** Reviews docs, approves or rejects with reason. If approved → status: *active*; optional: assign to org.
4. **Optional:** Auto-assignment rules (e.g. by city) assign org; admin can override.
5. **Audit:** “Driver X approved by Admin Y at Z (UTC); documents: …”.

### 3.2 Handling a Disputed Ride

1. **User** opens dispute (amount, reason) → dispute created; linked to trip and payment.
2. **Admin Console:** Dispute appears in queue; admin sees trip details, payment, and conversation.
3. **Agent:** Assigns to self, adds internal note, decides: full refund / partial / reject.
4. **Action:** Refund (if any) is created; dispute status → *resolved*; user notified.
5. **Audit:** Dispute ID, resolver, decision, amount, timestamp. Optional: escalation path if refund above threshold (approval workflow).

### 3.3 Responding to System Alerts

1. **Monitoring** detects breach (e.g. error rate > 5%, or “no trips in region X for 15m”).
2. **Alert** fires → dashboard and (if configured) PagerDuty/email/Slack.
3. **On-call** opens Admin Console → Real-time dashboard + logs; identifies incident (e.g. payment gateway down).
4. **Actions:** Enable feature flag “use_backup_gateway”, or trigger status page, or disable surge in affected region.
5. **Post-incident:** Log incident, link to config changes and audit trail for postmortem.

### 3.4 Surge / Multiplier Management

1. **Demand** (or forecast) triggers need for surge in a zone.
2. **Admin Console:** Config → Surge; select zone and time window; set multiplier (e.g. 1.5x) and optional cap.
3. **Publish:** Set effective time (now or scheduled); change is versioned and logged.
4. **Monitor:** Live ops view shows active surge zones and trip count; can disable or adjust if needed.

### 3.5 Driver Reported (Safety)

1. **Report** created (in-app or support) → safety incident; linked to trip and driver.
2. **Admin Console:** Safety queue shows new incident; severity and type (e.g. “rider reported driver”).
3. **Agent:** Assigns, reviews trip and user history, may temporarily suspend driver (“under review”).
4. **Resolution:** Close with no action, or warn driver, or suspend, or escalate to compliance; user notified where appropriate.
5. **Audit:** Incident lifecycle, assignee, and resolution stored; compliance can run reports.

---

## 4. Dashboard / Home Screen Design

**What loads first:** A single **Overview** screen that answers: “Is the platform healthy and where do I need to act?”

### 4.1 Top Section: Live Snapshot (Real-Time)

- **Active now:** Count of active drivers, active trips (or “trips in last 15m” if easier).
- **System health:** Green / yellow / red; one-click to detailed health.
- **Alerts:** Count of open alerts; list of highest-priority (e.g. “Payment gateway errors – 3 regions”).

### 4.2 Second Section: Queues That Need Attention

- **Verification:** Number of drivers/documents pending review; oldest pending date.
- **Disputes:** Open count; count older than 24h or 72h.
- **Support:** Open tickets; SLA at risk or breached.
- **Refunds:** Pending approval count (if approval workflow exists).

Each row is clickable → goes to the relevant module list filtered to “needs action”.

### 4.3 Third Section: Today / This Week at a Glance

- **Business:** Completed trips, GMV (or equivalent), cancellations (vs previous period).
- **Financial:** Today’s payment volume; payout run status; unreconciled days.
- **Safety:** New incidents in 24h; open investigations.

### 4.4 Fourth Section: Quick Actions and Links

- Shortcuts: “Create admin”, “New config version”, “Run payout”, “Generate compliance report”.
- Recent activity: Last 5–10 material actions (config go-live, user suspended, dispute resolved) with link to detail.

**Personalization:** Role-based; e.g. support sees queues first, finance sees reconciliation and payouts first. Same layout, different default ordering or visibility of blocks.

---

## 5. User Management Hierarchy and Role Definitions

### 5.1 Platform Roles (Admin Console Only)

These are **separate** from in-app capabilities (e.g. `dispatch`, `fleet_management`). A user can have both (e.g. platform support + org dispatcher) or only platform role.

| Role | Scope | Typical use |
|------|--------|-------------|
| **Super Admin** | Global; all modules; can create/adjust other admins and bypass some approval flows | Platform owner, senior dev/ops |
| **Platform Admin** | Global or regional; all modules except “create super admin” and “assign super admin” | Ops lead, product |
| **Support Lead** | Global or org-set; users, disputes, tickets, safety; can escalate and override within policy | Support manager |
| **Support Agent** | Global or org-set; users (view + soft actions), disputes, tickets; resolve within policy | Agent |
| **Finance Admin** | Global or org-set; config (payment/payout), reconciliation, payouts, refund approval | Finance team |
| **Compliance Officer** | Global or regional; safety, compliance, verification, regulatory reports | Compliance / safety team |
| **Verification Agent** | Document queue; approve/reject; no payout or config | Verification team |
| **Viewer / Analyst** | Read-only dashboards, reports, config history; no actions | Analytics, exec view |

### 5.2 Scope Rules

- **Global:** Can see and act on all orgs (within role permissions).
- **Regional:** Can see and act only in assigned region(s) (e.g. city or country).
- **Org-scoped:** Can see and act only for selected org(s); used for “white-label” or enterprise support.

### 5.3 Hierarchy (Who Can Do What to Whom)

- Super Admin can create/edit/revoke any admin and assign any role.
- Platform Admin can create/edit/revoke Support, Finance, Compliance, Verification, Viewer; cannot create Super Admin.
- Support Lead can assign tickets and escalate; cannot change payment config or approve large refunds (unless also Finance).
- All role and scope changes are audited with “who, when, and (optional) reason”.

---

## 6. Critical Admin Actions and Approval Workflows

### 6.1 Actions That Should Require Approval or Reason

| Action | Policy suggestion | Audit |
|--------|-------------------|--------|
| Suspend driver (platform-level) | Log reason; optional: second admin approval for long suspension | Full |
| Large refund / override refund policy | Require Finance Approver or second admin | Full |
| Publish new pricing/surge config | Optional: approval workflow for production; emergency rollback without approval but with reason | Full |
| Create or demote Super Admin | Always second Super Admin approval | Full |
| Waive compliance (hours, document) | Mandatory reason; optional approval for repeat waivers | Full |
| Feature flag: disable critical path | Reason required; optional approval | Full |

### 6.2 Approval Workflow (Example: Large Refund)

1. Agent proposes refund above threshold → status: *pending_approval*.
2. Finance Approver (or second admin) sees queue; approves or rejects with comment.
3. On approve → refund executed; both proposer and approver logged.
4. On reject → dispute stays open; agent can propose different amount or close as “rejected”.

### 6.3 Emergency Bypass

- Super Admin (and optionally Platform Admin) can bypass approval for incidents (e.g. “payment gateway down – enable backup”).
- Bypass is logged with reason and optionally requires a post-incident note.

---

## 7. Reporting and Analytics Capabilities

### 7.1 Standard Reports (Built-In)

- **Operational:** Trips by day/org/region; cancellations; active drivers; utilization.
- **Financial:** GMV, take rate, payouts, refunds; reconciliation summary.
- **Safety:** Incidents by type/severity; resolution time; repeat offenders.
- **Support:** Ticket volume, resolution time, SLA breach; dispute resolution time.
- **Compliance:** Document expiry, hours violations, regulatory report readiness.

### 7.2 Self-Serve and Export

- **Filters:** Date range, org, region, user type, status.
- **Export:** CSV/Excel for offline analysis; scheduled email for recurring reports.
- **Saved views:** Per admin; shareable with team (optional).

### 7.3 Analytics Permissions

- **Viewer/Analyst:** Can run and export reports within data scope (global vs org) and PII policy (e.g. anonymized or aggregated only where required).
- **Sensitive reports** (e.g. full PII, financial detail): Restrict to Finance Admin / Super Admin and log access.

---

## 8. Security and Access Control Considerations

### 8.1 Authentication and Session

- **MFA required** for all admin roles (especially Super Admin and Finance).
- **SSO:** Optional SAMl/OIDC for enterprise; fallback email/password with MFA.
- **Session:** Short idle timeout (e.g. 15–30 min); re-auth for sensitive actions (e.g. create admin, bulk suspend).
- **IP allowlist:** Optional for high-security environments.

### 8.2 Authorization

- **RBAC:** Every action in the console checks “role + scope” before allowing; no hardcoded “if user_id = 1”.
- **Least privilege:** Default new admins to Viewer or Agent; promote only when needed.
- **Data scope:** Regional/org-scoped roles see only their data in lists, reports, and search.

### 8.3 Audit and Non-Repudiation

- **Audit log:** Immutable log of who did what, when, from which IP/session, and (where applicable) reason or approval.
- **Retention:** At least 1 year for disputes, financial, and safety; 7 years for compliance-related actions if required by regulation.
- **Export:** Super Admin can export audit log for specific actor, action type, or time range for investigations.

### 8.4 PII and Sensitive Data

- **Masking:** Sensitive fields (full card number, full ID number) masked in UI and exports unless “unmask” is allowed by role and logged.
- **Access to PII:** Only roles that need it (support, verification, compliance) see full PII; others see IDs and aggregated data.
- **Compliance:** Align with GDPR/local norms (access log, right to know who saw what).

### 8.5 Infrastructure

- **Admin console:** Prefer separate subdomain (e.g. `admin.<product>.com`) and separate auth pool if possible.
- **API:** Admin APIs use same Supabase (or backend) but with **service role or admin-scoped tokens**; never expose service role to the mobile app.
- **Secrets:** Config (e.g. feature flags, pricing) can live in DB with RLS so only service role or admin-backend can write; app reads via anon or scoped role.

---

## 9. Visual Design and Theme (Tesla-Inspired, Aligned with Pulse)

The admin console MUST use the same visual language as the pulse application: **Tesla-inspired**, with a **white, black, and red** palette. All colors and layout tokens MUST be derived from the single source of truth used in the mobile app so the brand and experience stay consistent across platforms.

### 9.1 Source of Truth (pulse)

- **Colors:** `constants/Theme.ts` — single source for all UI colors; no hardcoded hex in admin components.
- **Layout:** `constants/Layout.ts` — spacing, padding, touch targets (where applicable for web).
- **Header pattern:** `components/TeslaHeader.tsx` — clean top bar with title, optional subtitle, and right-side actions (e.g. org switcher, bell, avatar).

### 9.2 Canonical Palette for Admin Console (mirror Theme.ts)

| Token | Hex | Theme.ts key | Usage in admin |
|-------|-----|--------------|----------------|
| **White** | `#ffffff` | `screenBackground` | Page background, header background, card surfaces, modal backgrounds. |
| **Black / near-black** | `#0f172a`, `#1a1a1a` | `textPrimaryDark`, `darkSurface` | Primary headings, list titles, body text, table headers. |
| **Tesla red** | `#E82127` | `teslaRed` | Primary accent: active nav item, active filter pills, FAB/primary action buttons, tab underline, negative amounts (debit/loss), destructive actions, alert dot on bell, loading spinners, selected row highlight. |
| **Dark green** | `#15803D` | `darkGreen` / `positive` | Positive amounts (credit), success states, confirm actions. |
| **Surface grays** | `#F9F9F9`, `#F4F4F4`, `#f1f5f9` | `surfaceLight`, `surfaceGray`, `surfaceBorder` | Cards, sidebars, input backgrounds, borders. |
| **Text secondary** | `#94a3b8`, `#86868B` | `textSecondary`, `textMutedDemo` | Secondary labels, timestamps, placeholders, muted icons. |
| **Borders** | `#F0F0F0`, `#e2e8f0` | `borderLight`, `borderMedium` | Dividers, table borders, input borders. |

### 9.3 Where to Use White, Black, and Red

- **White:** Dominant background for the entire app (main content, header bar, tables, forms). Keeps the interface clean and consistent with mobile.
- **Black:** All primary text and key headings. Optional dark strip or sidebar background (`darkSurface` / `#1a1a1a`) for contrast (e.g. left nav or top bar) if the design uses a dark chrome variant.
- **Red:** Use sparingly for emphasis: active state in navigation, primary CTA (e.g. “Save”, “Approve”), negative financial values, errors/destructive actions, and notification indicators. Do not use red for large background areas; reserve it for accents and semantic highlights.

### 9.4 Admin Shell and Header

- Top bar MUST follow the TeslaHeader pattern: clear title (optionally uppercase, bold), optional subtitle, right-side actions (org switcher, search, notifications, user menu).
- Header background: white (`screenBackground`); bottom border: light gray (`borderLight`).
- Primary action in the header (e.g. “Create”, “Save”) MAY use a pill/button with Tesla red background and white text (`teslaRed`, `textOnPrimary`).
- Notification/alert indicator: small red dot (`teslaRed`) on the bell or alert icon.

### 9.5 Tables and Lists

- Row hover: subtle surface gray (`surfaceLight` or `surfaceGray`); selected/active row: thin left border or background tint in Tesla red.
- Negative amounts, debit, loss, overdue: text color `teslaRed` / `negative`.
- Positive amounts, credit: text color `darkGreen` / `positive`.

### 9.6 Forms and Buttons

- Primary button: Tesla red background (`teslaRed`), white text (`textOnPrimary`).
- Destructive button: Tesla red outline or fill; confirm step required.
- Secondary/ghost: black text on white or gray surface; border `borderLight`.

### 9.7 Accessibility and Consistency

- Ensure sufficient contrast (e.g. black text on white meets WCAG AA). Red is used for accent and semantics, not for long body text.
- Admin console SHOULD expose the same theme tokens (e.g. CSS variables or design tokens) mapped from `Theme.ts` so future changes in one place propagate to both mobile and web.

---

## 10. Alignment with Pulse and Pulse-Unified-Base

### 10.1 Where This Lives

- **Admin Console:** Separate application (e.g. Next.js or React SPA) that calls the same Supabase project and (where needed) backend services. It is **not** a tab inside the existing Pulse app.
- **Schema:** New tables in pulse-unified-base (e.g. `admin_users`, `admin_roles`, `admin_audit_log`, `platform_config`, `feature_flags`) and RLS so only service role or admin API can write; migrations stay in pulse-unified-base.
- **Mobile app:** Reads config (e.g. feature flags, pricing) via existing or new read-only APIs; no “admin UI” in the app except perhaps a small “debug/config version” for developers.

### 10.2 Capabilities vs Admin Roles

- **`lib/capabilities.ts`** in Pulse: Stays as **in-app** permissions (dispatch, fleet_management, finance_view, etc.) for the **organization** user.
- **Admin roles** in this spec: **Platform-level** only; stored and enforced in the admin console and its backend. Optionally, an admin user can also have an org account with capabilities for testing or support.

### 10.3 Services and Domains

- New **admin**-related services in pulse-unified-base (or in admin-backend): e.g. `adminUserService`, `platformConfigService`, `auditLogService`, `disputeService` (if not already domain-owned). In pulse, no new “admin” service is required unless the app ever gets a minimal “view config version” or “view my org’s admin-assigned settings” read-only screen.
- **One service per domain** rule: Keep admin-specific logic in admin services; reuse existing `tripsService`, `driversService`, `clientsService`, etc. for data that the admin console needs to display or act on (via server-side or service-role APIs).

---

## 11. Implementation Roadmap (Suggested Phases)

| Phase | Focus | Deliverables |
|-------|--------|--------------|
| **1 – Foundation** | Auth, roles, audit, dashboard shell | Admin app with login/MFA; role and scope model; audit logging; overview dashboard (mock or partial data) |
| **2 – User & verification** | User management, document queue | User list and filters; driver/passenger verification queue; approve/reject with reason; suspend/activate |
| **3 – Config** | Feature flags, pricing/surge | Config CRUD and versioning; feature flags with rollout; pricing/surge (if applicable) |
| **4 – Disputes & support** | Tickets, disputes | Ticket and dispute lists; assign, resolve, refund; basic SLA metrics |
| **5 – Finance & compliance** | Reconciliation, payouts, safety | Reconciliation view; payout runs; refund approval; safety incidents and compliance reports |
| **6 – Polish** | Reporting, alerts, approval workflows | Saved reports, scheduled exports; alerting; approval workflows for sensitive actions |

---

This spec gives you a single reference for what the admin console does, how it’s structured, and how it fits with Pulse mobile and pulse-unified-base. You can slice implementation by module (e.g. “Phase 1 + User management only”) and iterate toward the full god-level control panel over time.
