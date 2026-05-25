# Q Mobile — Comprehensive Product Requirements Document

**Version:** 1.0 | **Date:** 2026-04-20 | **Branch analyzed:** `vasanth`

---

# 1. Application Overview

## 1.1 Purpose

**Q Mobile** is a cross-platform (iOS, Android, Web) logistics operations management application built with React Native (Expo). It serves as the mobile companion to the `q-unified-base` web platform. The application enables freight logistics companies to manage their end-to-end supply chain operations — from creating load requirements (indents), to assigning and tracking trips, to reconciling finances across business partners.

## 1.2 Core Value Proposition

| Pillar | Description |
|---|---|
| **Unified Operations** | Single app to manage trips, fleet, drivers, clients, suppliers, and finances |
| **Multi-Party Collaboration** | Integrated partner ledger (Shared Ledger) syncs financial records between connected organizations |
| **Real-Time Visibility** | Live trip tracking, Supabase realtime subscriptions, driver location |
| **AI-Augmented Workflows** | OPS Agent chatbot, POD OCR extraction, AI health badges |
| **Multi-Language** | 20+ languages for pan-Asian/South-Asian market coverage |

## 1.3 Target Users

1. **Dispatcher / Fleet Manager** (`role: "user"`, `asset: true`) — manages own fleet vehicles and drivers
2. **Aggregator / Freight Broker** (`role: "user"`, `aggregated: true`) — brokers loads without owning fleet
3. **Hybrid Operator** (`role: "user"`, `asset: true`, `aggregated: true`) — owns fleet and also sub-contracts
4. **Driver** (`role: "driver"`) — operates trips, receives assignments, tracks earnings
5. **Supplier Organization** — external logistics partner accessed via network integration
6. **Client Organization** — customer generating freight demand

## 1.4 High-Level Architecture

```
┌─────────────────────────────────────────────┐
│            Expo Router (React Native)        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ (tabs)   │ │ (driver) │ │  (modals)    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│         Feature Modules (vertical slices)    │
│  auth · trips · finance · drivers · vehicles │
│  clients · suppliers · network · indents     │
│  invoicing · log-pods · pod-reconciliation   │
│  ops-agent · ratings · ai                   │
├─────────────────────────────────────────────┤
│  Shared: TanStack Query + React Context      │
│  i18n · capabilities · validation · format  │
├─────────────────────────────────────────────┤
│           Supabase (PostgreSQL + RLS)        │
│  Auth · Realtime · Storage · Edge Functions │
└─────────────────────────────────────────────┘
```

**Tech Stack:**

| Layer | Technology |
|---|---|
| Framework | React Native, Expo SDK 54 |
| Language | TypeScript |
| Routing | Expo Router (file-system routing) |
| State (Server) | TanStack Query (React Query) |
| State (App) | React Context |
| Backend | Supabase (PostgreSQL, RLS, Realtime, Storage, Edge Functions) |
| Auth | Supabase Auth + SecureStore / AsyncStorage |
| Maps | React Native Maps (native), Leaflet (web) |
| AI | Anthropic Claude, Google GenAI |
| Localization | Custom i18n, 20+ locales |
| PDF | React Native PDF generation |

---

# 2. Full Product Requirements Document (PRD)

## 2.1 Authentication & Session Management

### 2.1.1 Sign-Up

**Purpose:** Allow new users to register a logistics organization account.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| AUTH-01 | Collect email, password, full name, phone number, company name |
| AUTH-02 | Validate email (RFC 5322), phone (10–13 digit normalization), password (min 6 chars, mixed alpha/numeric/special), full name (2–50 chars) |
| AUTH-03 | Check company name uniqueness against existing organizations before submission |
| AUTH-04 | Check if phone number belongs to an existing user; if so, redirect to sign-in |
| AUTH-05 | Allow user to select operating model: ASSET_BASED, NON_ASSET, or HYBRID |
| AUTH-06 | On successful sign-up, a database trigger creates: organization row, organization_members row, drivers row (if driver role) |
| AUTH-07 | Post sign-up: redirect `role="driver"` to `/(driver)/`, redirect `role="user"` to last visited tab or `/(tabs)/trips` |

### 2.1.2 Sign-In

**Purpose:** Authenticate returning users and restore their session.

| ID | Requirement |
|---|---|
| AUTH-08 | Accept email + password |
| AUTH-09 | "Keep me signed in" checkbox; when unchecked, session clears on app background |
| AUTH-10 | On first install, clear stale Keychain/AsyncStorage artifacts |
| AUTH-11 | Auto-refresh session token on expiry; clear invalid sessions |
| AUTH-12 | Proactively refresh profile from server (avatar, name, status) on session restore |
| AUTH-13 | Restore last-visited tab index from AsyncStorage on cold start |

### 2.1.3 Session Lifecycle

| ID | Requirement |
|---|---|
| AUTH-14 | `getSession()` reads from local storage only (fast, no network hit) |
| AUTH-15 | `refreshSession()` makes a network call and updates the local profile |
| AUTH-16 | `onAuthStateChange()` fires on login, logout, and token refresh |
| AUTH-17 | On `sessionExpired = true`, redirect user to `/sign-in` with session expiry message |

### 2.1.4 Profile Management

| ID | Requirement |
|---|---|
| AUTH-18 | Edit full name, phone, company name, status text (WhatsApp-style) |
| AUTH-19 | Select preset 2D avatar OR upload custom avatar image |
| AUTH-20 | `avatar_seed` field provides deterministic avatar generation when no custom URL |
| AUTH-21 | Change password via email confirmation flow |

---

## 2.2 Organization & Capabilities

### 2.2.1 Organization Context

| ID | Requirement |
|---|---|
| ORG-01 | Each user belongs to one or more organizations |
| ORG-02 | `currentOrganization` is persisted and restored on cold start |
| ORG-03 | All data queries are scoped to `currentOrganization.id` |

### 2.2.2 Capability System

The application derives user capabilities from three profile flags: `role`, `asset`, `aggregated`.

| Capability | Who Has It | What It Unlocks |
|---|---|---|
| `fleet_management` | `asset: true` | Vehicles tab, Drivers tab, fleet assignment |
| `dispatch` | `aggregated: true` | Create indents, broker trips |
| `dispatch_for_own_fleet` | `asset: true` | Assign trips to own fleet only |
| `marketplace_post` | `aggregated: true` | Post indents to marketplace |
| `marketplace_bid` | `asset: true` | Bid on marketplace indents |
| `finance_view` | Both | View ledger, P&L |
| `finance_manage` | Both | Edit transactions |
| `team_manage` | Both | Invite team members |

| ID | Requirement |
|---|---|
| CAP-01 | Tabs and features are conditionally rendered based on resolved capabilities |
| CAP-02 | `canAccessTrips()` gates the Trips tab |
| CAP-03 | `canAccessFinance()` gates the Finance tab |
| CAP-04 | Users without `canAccess` see a localized "No access" message |

---

## 2.3 Trips Module

### 2.3.1 Trips Hub (Main Trips Screen)

**Purpose:** Central operations dashboard for managing freight trips across their lifecycle.

#### 2.3.1.1 Main Tabs

| Tab | Content |
|---|---|
| **Active** | Trips not in a completed/cancelled state |
| **History** | Trips with `status` in `{completed, delivered, done}` |

#### 2.3.1.2 Supply Sub-Tabs

| Sub-Tab ID | Label | Filter Logic |
|---|---|---|
| `all` | All | No supply filter |
| `asset` | Asset | `isAggregateTrip(t) === false` |
| `aggregated` | Aggregate | `isAggregateTrip(t) === true` |

#### 2.3.1.3 Active Trip Metric Tiles

Six tiles displayed above the active trip list, each selectable as a bucket filter:

| Metric ID | Label | Description |
|---|---|---|
| `unassigned` | Unassigned | Driver not yet assigned (`driver_id == null`) |
| `assigned` | Assigned | Driver assigned, not yet started |
| `loading` | Loading | Trip at loading stage |
| `in_transit` | In Transit | Trip actively moving |
| `unloading` | Unloading | Arrived at destination, unloading |
| `pod_pending` | POD Pending | Trip completed, POD document not yet uploaded |

Each tile shows: count (bold italic), title, hint text. Active tile highlighted with `Theme.primary` border and count color.

#### 2.3.1.4 List Layout Toggle

| Mode | Icon | Behavior |
|---|---|---|
| `cards` | `th-large` | Expandable trip cards in vertical scroll; 3-column grid on web ≥ 1024px |
| `table` | `list` | Horizontal-scrollable audit table with paginated scroll (15 rows/page) |

#### 2.3.1.5 Search

- Real-time text filter on: client name, shipper display name, pickup area, drop location, trip number, display trip ID
- Search input max 120 characters, 11px bold font, dark-theme field

#### 2.3.1.6 Sort & Filter Modal

Triggered by sort icon button. A floating dark card (anchored below the sort button) containing:

**Sort By section:**

| Option ID | Label |
|---|---|
| `date_desc` | Newest First |
| `date_asc` | Oldest First |
| `revenue_desc` | Revenue High → Low |
| `revenue_asc` | Revenue Low → High |
| `client_asc` | Client A → Z |
| `client_desc` | Client Z → A |

**Date Filter section (Quick Chips):**

| Option ID | Range |
|---|---|
| `all` | No filter |
| `today` | Current calendar day |
| `tomorrow` | Next calendar day |
| `this_week` | Sunday of current week → now |
| `this_month` | 1st of current month → now |
| `custom` | User-selected from/to range (via DateRangePickerModal) |

**Payment Status section:**

| Filter | Matches |
|---|---|
| `all` | No filter |
| `pending` | `payment_status = "pending"` |
| `partial` | `payment_status = "partial"` |
| `paid` | `payment_status = "paid"` or `"fully_paid"` |

**Load Type section:** Dynamic chips from distinct `load_type` values in the current trip set. Shows only when load types are present.

An **Apply Filters** button closes the modal.

#### 2.3.1.7 Date Range Chips Row (Body)

Horizontal scrollable row of quick-select date chips below the metric tiles:

- All | Today | Yesterday | This Week | This Month
- Custom date range chip (red, with clear button) when active
- Calendar icon button opens `DateRangePickerModal`

#### 2.3.1.8 Trip Card (Cards Layout)

Each card renders `TripsHubTripCard` with:

- Client name (or shipper display name for supplier-org viewing)
- Supplier name (resolved from: `trip.supplier_name` → supplier entity → ledger entries)
- Client avatar + supplier avatar (resolved from entity rows, linked-org profile, or fallback seed)
- Route: pickup area → drop location (animated right-arrow)
- Stage pill (UNASSIGNED, ASSIGNED, IN_PROGRESS, etc.)
- Trip date (pickup_date → started_at → completed_at → created_at, in priority order)
- Ledger summary: received total, transaction count, last ledger date
- Asset/Aggregate type pill
- On press: navigate to `/trip/[id]`

#### 2.3.1.9 Trip Table Row (Table Layout)

`TripsHubTableView` renders a sortable, paginated table (15 rows/page via `usePaginatedScroll`).

Columns:

- Trip reference (`display_trip_id`)
- Date
- Client / shipper name
- Supplier name
- Route (pickup → drop)
- Revenue (`client_price` or `supplier_rate` depending on org role)
- Payment status
- Stage label

#### 2.3.1.10 Real-Time Updates

| Hook | Behavior |
|---|---|
| `useRealtimeTripsInvalidation(orgId)` | Subscribes to `trips` table changes; invalidates `['trips', orgId]` cache |
| `useRealtimeTransactionsInvalidation(orgId)` | Subscribes to `transactions` table; invalidates `['transactions', orgId]` |

Pull-to-refresh triggers parallel refetch of trips, transactions, assignment audit, and document-trip associations.

#### 2.3.1.11 FAB (Floating Action Button)

- "Add Trip" FAB (`road` icon) positioned bottom-right
- Navigates to `/add-trip` modal route
- Only rendered when `canAccess = true`
- Position: `Layout.demoTabBarScrollBottomInset + insets.bottom + Layout.tabBarBottomPaddingMin`

### 2.3.2 Trip Data Model

```
TripRow {
  id: UUID
  organization_id: UUID
  trip_number: string          // Raw sequence number
  display_trip_id: string      // "TRP001" human-readable
  indent_id?: UUID | null
  source: string               // "manual" | "marketplace" | "direct_quote"
  pickup_area: string
  drop_location: string
  pickup_lat?, pickup_lon?     // Coordinates
  drop_lat?, drop_lon?         // Coordinates
  distance: string | number    // km
  estimated_duration: string
  client_id: UUID | null
  client_name: string
  supplier_id?: UUID | null
  supplier_name?: string
  driver_id?: UUID | null
  driver_display_name?: string
  vehicle_id?: UUID | null
  vehicle_display_number?: string
  client_price: number         // Revenue
  supplier_rate: number        // Cost
  margin: number               // client_price - supplier_rate
  platform_fee: number
  driver_commission: number
  is_guaranteed: boolean
  payment_status: string       // "pending" | "partial" | "paid" | "fully_paid"
  amount_paid: number
  status: string               // See Trip Status Reference
  pickup_date: string
  started_at?: string
  completed_at?: string
  load_type?: string
  notes?: string
  created_at, updated_at: string
  created_by?: UUID            // auth.uid
  owner_user_id?: UUID
  status_revision?: number
  status_updated_by?: UUID
  status_updated_role?: "driver" | "creator" | "system"
  indent_number?: string
}
```

### 2.3.3 Trip Status Reference

| Status | Display Stage | Tab |
|---|---|---|
| `unassigned` | UNASSIGNED | Active |
| `assigned` | ASSIGNED | Active |
| `in_progress` | IN_PROGRESS / IN TRANSIT | Active |
| `loading` | LOADING | Active |
| `in_transit` | IN TRANSIT | Active |
| `unloading` | UNLOADING | Active |
| `completed` | COMPLETED | History |
| `delivered` | DELIVERED | History |
| `done` | DONE | History |
| `cancelled` | (hidden) | Neither — filtered out |

### 2.3.4 Add Trip Flow

**Trigger:** FAB press → navigates to `/add-trip` modal.

**Form fields:** pickup area, drop location, client (from clients list), supplier (optional), load type, vehicle type, client price, supplier rate, pickup date, notes, distance.

**Behavior:** `createTrip(orgId, data)` → trip inserted with `status: "unassigned"` → query cache invalidated → modal dismissed → trip appears in Active tab.

### 2.3.5 Trip Assignment

**Trigger:** From trip detail screen, dispatcher selects driver and vehicle.

**Service call:** `assignTrip(tripId, driverId, vehicleId)` → updates `driver_id`, `vehicle_id`, `status: "assigned"` → creates `trip_assignment_audit` record with timestamp and assigning user.

### 2.3.6 Trip OTP Verification

**Purpose:** Cryptographically verify trip start/completion by driver.

**Service:** `services/tripOtp.service.ts` — generate OTP for trip, validate OTP submitted by driver.

### 2.3.7 Trip Adjustments

**Purpose:** Add charge/deduction/adjustment lines to a trip's financial record.

**Service:** `getTripAdjustments(tripId)`, `type TripAdjustment`.

Used in the Shared Ledger Command Center to surface adjustment line items against shared transactions.

### 2.3.8 POD Document Tracking

- `trip_documents` table queried per batch of active trip IDs (chunks of 200)
- Query key: `["q", "trips", "doc-trip-ids", orgId, activeOpsTripIdsSorted]`
- Stale time: 60 seconds
- `tripIdsWithDocuments: Set<string>` used to classify trips into `pod_pending` metric bucket

---

## 2.4 Finance Module

### 2.4.1 Overview

The Finance module is the most complex module in the application. It provides multi-dimensional financial visibility: ledger-level transactions, treasury summaries, vehicle/trip P&L, salary request workflows, and cross-organization shared ledger reconciliation.

### 2.4.2 Finance Sub-Tabs

| Sub-Tab | Purpose |
|---|---|
| **Ledger** | Chronological cash in/out entries, searchable, filterable by party |
| **Treasury** | Balance summary: receivable, payable, net by period |
| **Vehicles / Garrage** | P&L per vehicle with capacity utilization and profitability metrics |
| **Trips** | Trip-level margin analysis |
| **Salary Requests** | Driver compensation requests with approval workflow |
| **Shared Ledger** | Cross-organization reconciliation with integrated partners |

### 2.4.3 Ledger

**Purpose:** Full audit trail of all financial transactions.

| ID | Requirement |
|---|---|
| FIN-01 | Display all `ledger` rows for the organization, sorted by `transaction_date` descending |
| FIN-02 | Filter by party type: client, supplier, driver |
| FIN-03 | Filter by date range (same options as trips: today, this week, this month, custom) |
| FIN-04 | Search by party name, description, trip reference |
| FIN-05 | Show `amount_in` (receivable) in green, `amount_out` (payable) in red |
| FIN-06 | Click party name to open entity detail overlay |
| FIN-07 | Export to PDF/CSV |
| FIN-08 | Realtime subscription invalidates cache on INSERT/UPDATE/DELETE |

**LedgerRow data model:**

```
LedgerRow {
  id: UUID
  organization_id: UUID
  trip_id?: UUID
  trip_number?: string
  party_name: string
  description: string
  amount_in: number
  amount_out: number
  transaction_date: string
  created_at: string
  contact_id?: UUID
  contact_type?: "client" | "supplier" | "driver"
}
```

### 2.4.4 Treasury

**Purpose:** Period-based financial position summary.

| ID | Requirement |
|---|---|
| FIN-09 | Show total receivable, total payable, net balance for selected period |
| FIN-10 | Period selector: this week, this month, this quarter, custom |
| FIN-11 | Entity-level drill-down on tap |

### 2.4.5 Vehicle P&L (Garrage)

| ID | Requirement |
|---|---|
| FIN-12 | Calculate revenue, cost, margin per vehicle for the period |
| FIN-13 | Show capacity utilization metrics |
| FIN-14 | Profitability ranking across fleet |
| FIN-15 | Calculated by `accounting/accountingModel.ts` + `pnl/garragePnL.ts` |

### 2.4.6 Trip P&L

| ID | Requirement |
|---|---|
| FIN-16 | Show trip-level margin: `client_price - supplier_rate - platform_fee - driver_commission` |
| FIN-17 | Filter by date, client, vehicle, payment status |
| FIN-18 | Sort by revenue, margin, date |

### 2.4.7 Salary Requests

**Purpose:** Drivers submit salary disbursement requests; dispatchers approve/reject.

| Status | Description |
|---|---|
| `pending` | Submitted by driver, awaiting review |
| `approved` | Approved by dispatcher |
| `rejected` | Rejected by dispatcher with optional reason |
| `paid` | Disbursed |

| ID | Requirement |
|---|---|
| FIN-19 | List all salary requests for org with status badges |
| FIN-20 | Dispatcher can tap a request to approve/reject |
| FIN-21 | `updateSalaryRequestStatus(requestId, status)` updates DB row |
| FIN-22 | Driver sees updated status in their Wallet tab |

### 2.4.8 Shared Ledger (Compare & Verify)

**Purpose:** When two organizations are integrated as client/supplier on the platform, they share financial records. The Shared Ledger allows both parties to verify their versions match and surface discrepancies.

#### 2.4.8.1 Shared Ledger Command Center

The command-center UI (`SharedLedgerCommandCenter.tsx`) features a hero section, tabbed navigation, status filters, a mission/transaction grid, and forensic drill-downs.

**Main Tabs:**

| Tab | Content |
|---|---|
| `Trips` | Trip-level reconciliation view |
| `Cash Flow` | Monetary flow analysis |
| `Shared` | Shared transaction lines |

**Status Filter Keys:**

| Key | Meaning |
|---|---|
| `all` | Show all rows |
| `matched` | Both parties have matching amounts |
| `no_entry` | Partner has no entry for this trip |
| `pending` | Awaiting partner update |
| `conflict` | Amounts exist on both sides but do not match |

**`CommandTxnRow` type:**

```
CommandTxnRow {
  id: string
  status: "matched" | "no_entry" | "pending" | "conflict"
  tripRef: string
  date: string
  amountAbs: number
  partnerAmount?: number
  localAmount?: number
  displayDate?: string
  myRef?: string
  partnerRef?: string
  myMode?: string
  partnerMode?: string
  partnerSignedAmount?: number
  tripDbId?: UUID
  hasLocalTrip?: boolean      // false = "ghost" trip (partner only)
  lineKind?: SharedTxnLineKind  // charge | deduction | adjustment
}
```

| ID | Requirement |
|---|---|
| FIN-23 | Show shared ledger rows from `getSharedLedgerForClient()` or `getSharedLedgerForSupplier()` |
| FIN-24 | Filter by status: all/matched/no_entry/pending/conflict |
| FIN-25 | Trip-level drill-down shows trip detail + adjustment lines |
| FIN-26 | Cash flow tab shows monetary net by period |
| FIN-27 | Dispute flow submits reason to DB and marks entry as `disputed` |
| FIN-28 | Ghost trips (partner-only) can be merged/created locally |

### 2.4.9 Finance Aggregation

**Purpose:** Roll-up metrics per entity (customer, supplier, driver).

- `aggregateCustomers(clients, trips, ledger)` → per-client revenue, trip count, outstanding balance
- `aggregateDrivers(drivers, trips)` → per-driver trip count, earnings
- `aggregateSuppliers(suppliers, trips)` → per-supplier cost, trip count

These power the entity detail overlays accessible by clicking a party name in the ledger.

---

## 2.5 Network Module

### 2.5.1 Overview

The Network tab serves as both a marketplace load board and a partner integration hub.

### 2.5.2 Sub-Views

| View | Purpose |
|---|---|
| **Load Board** | Browse marketplace indents posted by other organizations |
| **My Direct Quotes** | Quotes sent/received on marketplace indents |
| **Indents** | Your organization's indents (draft and broadcast) |
| **Connections** | Platform integrations with partner organizations |

### 2.5.3 Load Board

| ID | Requirement |
|---|---|
| NET-01 | Display indents broadcast to marketplace by other orgs |
| NET-02 | Filter by vehicle type, load type, route/area |
| NET-03 | Show indent status, client price, origin, destination |
| NET-04 | Realtime updates via Supabase subscription |
| NET-05 | Tap indent to view details and submit a direct quote |

### 2.5.4 Direct Quotes

**Quote Statuses:** `awaiting`, `awarded`, `quoted`, `rejected`, `withdrawn`

| ID | Requirement |
|---|---|
| NET-06 | Asset-based orgs can submit quotes on marketplace indents |
| NET-07 | Aggregator orgs can view and award quotes from suppliers |
| NET-08 | Quote includes rate, proposed vehicle type, notes |
| NET-09 | Award creates a trip from the indent |

### 2.5.5 Connections

| ID | Requirement |
|---|---|
| NET-10 | List all integrated partners (orgs linked via `linked_organization_id`) |
| NET-11 | Show connection status (active, pending, disconnected) |
| NET-12 | Send integration request to another org by name/ID |
| NET-13 | Accept/reject incoming integration requests |
| NET-14 | Disconnect from a partner |

---

## 2.6 Indents Module

### 2.6.1 Overview

Indents represent a demand for freight capacity — a load requirement that may or may not have been fulfilled.

### 2.6.2 Indent Data Model

```
IndentRow {
  id: UUID
  organization_id: UUID
  indent_number: string
  display_indent_id: string      // "IND001"
  pickup_area: string
  drop_location: string
  client_name: string
  client_price: number
  supplier_target: number
  status: string                 // "draft" | "broadcast" | "completed"
  client_id?: UUID
  vehicle_type?: string
  load_type?: string
  pickup_date?: string
  circulation_target?: string    // "marketplace" | "integrated_supplier" | "offline" | "both"
  shared_at?: string
  weight?: number                // kg
  creator_organization_name?: string
}
```

### 2.6.3 Indent Status Workflow

```
[Draft] → shareIndent() → [Broadcast] → completeIndent() or createTrip() → [Completed]
```

| Status | Editable | Visible to Marketplace |
|---|---|---|
| `draft` | Yes | No |
| `broadcast` | No | Yes (if `circulation_target` includes marketplace) |
| `completed` | No | No |

### 2.6.4 Create Indent Requirements

| ID | Requirement |
|---|---|
| IND-01 | Form: pickup area, drop location, client, vehicle type, load type, client price, supplier target, weight, pickup date |
| IND-02 | Save as draft initially (`status: "draft"`) |
| IND-03 | `shareIndent(indentId)` broadcasts to selected circulation targets |
| IND-04 | Circulation target: marketplace, integrated supplier, offline, or both |

---

## 2.7 Clients Module

### 2.7.1 Client Data Model

```
ClientRow {
  id: UUID
  organization_id: UUID
  name: string
  company_name?: string
  phone?: string
  email?: string
  address?: string
  gstin?: string
  avatar_url?: string
  avatar_seed?: string
  linked_organization_id?: UUID    // Platform integration link
  total_trips?: number
  total_revenue?: number
  outstanding_balance?: number
}
```

### 2.7.2 Functional Requirements

| ID | Requirement |
|---|---|
| CLI-01 | List all clients with search, total trips count, outstanding balance |
| CLI-02 | Add client: name, phone, email, company, GSTIN, address |
| CLI-03 | Edit client details |
| CLI-04 | View client detail: trip history, ledger entries, linked org profile |
| CLI-05 | When `linked_organization_id` is set, name/contact/phone sync from linked org's owner profile |
| CLI-06 | Delete client (soft delete if linked transactions exist) |
| CLI-07 | Fetch linked org profile via `getLinkedOrgProfile(linkedOrgId)` |

---

## 2.8 Suppliers Module

### 2.8.1 Supplier Data Model

```
SupplierRow {
  id: UUID
  organization_id: UUID
  name: string
  company_name?: string
  contact_person?: string
  phone?: string
  email?: string
  supplier_type: "integrated" | "offline" | "marketplace"
  vehicle_types?: string[]
  operating_areas?: string[]
  linked_organization_id?: UUID
  avatar_url?: string
  avatar_seed?: string
}
```

### 2.8.2 Functional Requirements

| ID | Requirement |
|---|---|
| SUP-01 | List all suppliers with type badges (integrated/offline/marketplace) |
| SUP-02 | Filter by supplier type |
| SUP-03 | Add/edit/delete supplier |
| SUP-04 | Detail view: trip history, cost summary, linked org profile |
| SUP-05 | Integrated suppliers show live profile synced from platform |

---

## 2.9 Drivers Module

### 2.9.1 Driver Data Model

```
DriverRow {
  id: UUID
  organization_id: UUID
  user_id?: UUID                  // Links to profiles if driver has account
  name: string
  phone?: string
  email?: string
  status: "offline" | "online" | "on_trip"
  assigned_vehicle_id?: UUID
  left_at?: string                // Soft disconnect timestamp
  tracking_only?: boolean         // Temp driver for aggregate trip
  payable_amount?: number         // Fixed salary
  commission_percent?: number
  commission_per_km?: number
  avatar_url?: string
  avatar_seed?: string
}
```

### 2.9.2 Functional Requirements

| ID | Requirement |
|---|---|
| DRV-01 | List drivers with status indicator (offline/online/on_trip) |
| DRV-02 | Add driver: name, phone, email, compensation model |
| DRV-03 | Edit driver details and compensation |
| DRV-04 | View driver detail: assigned vehicle, trip history, earnings ledger |
| DRV-05 | Live map view when driver is on a trip |
| DRV-06 | Invite driver via phone (SMS link) — `inviteDriver()` |
| DRV-07 | Search existing drivers by phone — `searchExistingDriversByPhone()` |
| DRV-08 | Accept/reject driver invite — `acceptDriverInvite()` / `rejectDriverInvite()` |
| DRV-09 | Link offline driver to new platform user — `linkOfflineDriversToNewUsers()` / `manuallyLinkDriver()` |
| DRV-10 | Driver ledger: view all earnings entries via `getDriverLedgerByDriver()` |
| DRV-11 | `tracking_only` drivers excluded from standard driver list |
| DRV-12 | Soft delete: set `left_at` timestamp; driver hidden but data retained |

**Compensation Models:**

| Model | Fields Used |
|---|---|
| Fixed Salary | `payable_amount` |
| Commission % | `commission_percent` |
| Commission / km | `commission_per_km` |
| Hybrid | Any combination of above |

**Driver Invite States:**

| State | Table | Description |
|---|---|---|
| `DriverInviteRow` | `driver_invites` | Received invite (driver sees) |
| `DriverInviteSentRow` | `driver_invites_sent` | Sent invite (org sees) |

---

## 2.10 Vehicles Module

### 2.10.1 Vehicle Data Model

```
VehicleRow {
  id: UUID
  organization_id: UUID
  registration_number: string
  vehicle_type: string
  make?: string
  model?: string
  year?: number
  capacity_tonnes?: number
  status: "available" | "on_trip" | "maintenance"
  assigned_driver_id?: UUID
  documents?: VehicleDocument[]
}
```

### 2.10.2 Functional Requirements

| ID | Requirement |
|---|---|
| VEH-01 | List vehicles with status badges and utilization indicators |
| VEH-02 | Add/edit/delete vehicle |
| VEH-03 | Vehicle detail: documents, assigned driver, trip history, P&L |
| VEH-04 | P&L calculation: revenue per km, maintenance cost, profitability |
| VEH-05 | Documents: insurance, fitness certificate, pollution certificate, registration |
| VEH-06 | Upload document image (compress → upload to Supabase Storage) |

---

## 2.11 Driver App (`/(driver)`)

### 2.11.1 Overview

A completely separate tab-bar experience for users with `role: "driver"`. Themed separately (supports dark mode). Drivers access a focused operational UI without full dispatch capabilities.

### 2.11.2 Driver Tabs

| Tab | Content |
|---|---|
| **Dashboard** | Active trip card, today's earnings, level progress ring |
| **Trip Control** | Accept/reject incoming trip assignments; start/complete active trip |
| **History** | Past trips with ratings received |
| **Wallet** | Transaction history, balance, salary request submission |
| **Profile** | Driver info, documents, level badges |
| **Passbook** | Per-organization earnings breakdown |
| **Settings** | Theme (light/dark), language, logout |

### 2.11.3 Driver-Specific Functional Requirements

| ID | Requirement |
|---|---|
| DAPP-01 | Accept trip: button → OTP verification → `status: "in_progress"` |
| DAPP-02 | Reject trip: button + optional reason → `rejectTrip(tripId, driverId, reason)` |
| DAPP-03 | Complete trip: button → OTP entry → `completeTrip(tripId)` → `status: "completed"` |
| DAPP-04 | Background location tracking while on trip |
| DAPP-05 | Level progression system: thresholds, badges, incentives from `constants/DriverLevels.ts` |
| DAPP-06 | Multi-org passbook: `getDriverLedgerByDriverIds()` aggregated per organization |
| DAPP-07 | Submit salary request from Wallet tab |
| DAPP-08 | Upload documents (license, vehicle papers) from Profile tab |
| DAPP-09 | Theme persisted via `DriverThemeContext` → AsyncStorage |

### 2.11.4 Driver Theme Context

| State | Values | Persistence |
|---|---|---|
| `theme` | `"light"` \| `"dark"` | AsyncStorage |
| `mapTheme` | `"light"` \| `"dark"` \| `"auto"` | AsyncStorage |

---

## 2.12 Invoicing Module

| ID | Requirement |
|---|---|
| INV-01 | `InvoicingExecuteScreen`: select date range, client/supplier, trips to include |
| INV-02 | Aggregate trip line items, apply GST if configured |
| INV-03 | Apply custom branding: organization logo, colors — `invoiceBranding.service.ts` |
| INV-04 | Render PDF via `InvoicePdfDocument.tsx` |
| INV-05 | Export to file system (`expo-file-system`) or share sheet |

---

## 2.13 Log PODs Module

| ID | Requirement |
|---|---|
| POD-01 | `LogIncomingPodsScreen`: select trip, capture/pick image |
| POD-02 | Compress image before upload (`PodAttachmentModal.tsx`) |
| POD-03 | Upload to Supabase Storage, create `trip_documents` row |
| POD-04 | Trigger async OCR extraction (Supabase Edge Function) |
| POD-05 | Uploaded PODs remove trip from `pod_pending` metric bucket |

---

## 2.14 POD Reconciliation Module

### 2.14.1 POD Extraction Type

```
PODExtraction {
  header?: {
    lr_number?: string
    dates?: string[]
    invoice_number?: string
  }
  parties?: {
    consignor?: string
    consignee?: string
    gst_numbers?: string[]
  }
  financials?: {
    charges?: number
    shortages?: number
    damage?: number
  }
  inspection?: {
    damage_count?: number
    shortage_count?: number
    reports?: string[]
  }
  line_items: LineItem[]
  validationError?: string
}

LineItem {
  description: string
  quantity: number
  units?: number
  cases?: number
  amount: number
  confidence: number    // 0–1 OCR confidence score
}
```

| ID | Requirement |
|---|---|
| PODR-01 | `PodReconciliationScreen`: list PODs with extraction status |
| PODR-02 | `PodValidationView`: highlight mismatches, low-confidence fields |
| PODR-03 | Approve/reject extracted data |
| PODR-04 | `validationError` set when total of line items ≠ declared total |
| PODR-05 | Supports both Google GenAI and Anthropic backends for extraction |

---

## 2.15 OPS Agent Module

| ID | Requirement |
|---|---|
| OPS-01 | `OpsAgentScreen`: full-screen chat UI |
| OPS-02 | `OpsAgentInputBar`: text input with send button |
| OPS-03 | `OpsAgentMessageRow`: distinct styles for user messages and bot responses |
| OPS-04 | `useOpsAgentChat` hook manages conversation state (messages array, loading, error) |
| OPS-05 | Capabilities: answer questions about trips/drivers/vehicles, suggest actions, provide analytics |
| OPS-06 | Suggested actions are tappable (e.g., "Assign trip TRP045 to driver Raju") |

---

## 2.16 Ratings Module

| ID | Requirement |
|---|---|
| RAT-01 | Drivers and clients can receive ratings after trip completion |
| RAT-02 | `TripRatingsBlock` renders star rating UI on trip detail screen |
| RAT-03 | `ratings.service.ts`: `submitRating()`, `getRatingsForTrip()` |
| RAT-04 | Ratings aggregated in driver profile (average, count) |

---

## 2.17 Public Profile Module

| ID | Requirement |
|---|---|
| PUB-01 | `PublicProfileScreen`: read-only profile page accessible via share link |
| PUB-02 | Shows: organization name, avatar, ratings, contact info, vehicle types served |
| PUB-03 | No authentication required to view |

---

## 2.18 AI Insights Module

| Component | Purpose |
|---|---|
| `AIBadge` | Generic AI insight badge with icon and label |
| `VehicleHealthBadge` | Vehicle condition risk assessment |
| `ClientRiskBadge` | Client credit/payment risk indicator |
| `TripAIBadges` | Route optimization warnings, margin alerts |

| ID | Requirement |
|---|---|
| AI-01 | Badges rendered inline on cards/detail screens |
| AI-02 | `ai.service.ts` calls AI model with entity context, returns insight label + severity |
| AI-03 | Severity levels: `info`, `warning`, `critical` mapped to badge colors |

---

## 2.19 Non-Functional Requirements

### 2.19.1 Performance

| ID | Requirement |
|---|---|
| NF-01 | TanStack Query cache-first fetching with configurable stale times |
| NF-02 | Paginated scroll: 15 trips per page, loads more on scroll-near-bottom |
| NF-03 | Trip document query chunked at 200 IDs per Supabase request |
| NF-04 | `FlashList` (Shopify) used for high-performance list rendering |
| NF-05 | Image compression before POD upload |
| NF-06 | Expo Router automatic code-splitting by route |
| NF-07 | `React.memo` for expensive components |

### 2.19.2 Security

| ID | Requirement |
|---|---|
| NF-08 | All database tables enforce Row Level Security (RLS) at Supabase level |
| NF-09 | Auth tokens stored in `expo-secure-store` (native) or `AsyncStorage` (web) |
| NF-10 | Fresh access token fetched via `getAccessToken()` before each API request |
| NF-11 | No hardcoded secrets; all credentials via `.env` / Expo Constants |
| NF-12 | Optional `expo-screen-capture` block on sensitive screens |

### 2.19.3 Offline Support

| ID | Requirement |
|---|---|
| NF-13 | Network status tracked via `@react-native-community/netinfo` |
| NF-14 | `useIsOnline()` hook guards API calls |
| NF-15 | Transactions cached locally for retry on reconnect |
| NF-16 | Auto-retry on reconnect for failed operations |

### 2.19.4 Localization

| ID | Requirement |
|---|---|
| NF-17 | 20+ languages: English, Hindi, Arabic, Tamil, Kannada, Telugu, Gujarati, Marathi, Bengali, Oriya, Punjabi, Malayalam, Nepali, Myanmar, Sinhala, Thai, Vietnamese, Indonesian, Filipino, Korean, Mandarin, Malay |
| NF-18 | Locale selection persisted in AsyncStorage |
| NF-19 | Fallback to device language, then English |
| NF-20 | `tGlobal()` utility for translations outside React components |

### 2.19.5 Platform Support

| Platform | Supported | Notes |
|---|---|---|
| iOS | Yes | Native maps, SecureStore |
| Android | Yes | Native maps, SecureStore |
| Web | Yes | Leaflet maps, `<input type="date">` fallback |

### 2.19.6 Accessibility

| ID | Requirement |
|---|---|
| NF-21 | `accessibilityRole` and `accessibilityLabel` on all interactive elements |
| NF-22 | `accessibilityState.selected` on tabs and toggle buttons |

---

# 3. User Roles & Personas

## 3.1 Role: Dispatcher / Aggregator (`role: "user"`, `aggregated: true`)

**Goals:**
- Create indents for incoming freight demand
- Post to marketplace for supplier quotes
- Award quotes, create trips
- Track payment status of trips
- Manage client relationships

**System Access:** Trips tab, Finance tab, Network tab, Clients module, Suppliers module

**Capabilities:** `dispatch`, `marketplace_post`, `finance_view`, `finance_manage`

---

## 3.2 Role: Fleet Manager (`role: "user"`, `asset: true`)

**Goals:**
- Assign owned vehicles and drivers to trips
- Monitor fleet utilization
- Track driver earnings and salary
- Bid on marketplace indents

**System Access:** Trips tab, Finance tab, Network tab (bidding), Vehicles module, Drivers module

**Capabilities:** `fleet_management`, `dispatch_for_own_fleet`, `marketplace_bid`, `finance_view`, `finance_manage`

---

## 3.3 Role: Hybrid Operator (`role: "user"`, `asset: true`, `aggregated: true`)

**Goals:** All of the above combined.

**Capabilities:** All capabilities enabled.

---

## 3.4 Role: Driver (`role: "driver"`)

**Goals:**
- Accept/reject trip assignments
- Navigate and execute trips
- Track earnings
- Submit salary requests
- Maintain documents

**System Access:** Driver app only `/(driver)/*`

**Permissions:** Own trips, own wallet, own profile. Cannot access dispatch functions, finance ledger, or fleet management.

---

## 3.5 Role: Partner Organization (Client or Supplier)

**Access Type:** Via Shared Ledger integration; their data appears in the current org's finance module when `linked_organization_id` is set.

---

# 4. Complete User Flows

## 4.1 Flow: New User Sign-Up and Onboarding

**Trigger:** User opens app for the first time, no session in storage.

**Preconditions:** Device has internet connectivity. App freshly installed (stale storage cleared on first launch).

```
1. App launches → index.tsx checks AuthContext
   → AuthContext.loading = true (reading storage)
   [Wait] AuthContext resolves session = null
   → Navigate to /sign-in

2. User on Sign-In screen
   → Taps "Create Account" / Sign Up link
   → Navigate to /sign-up

3. Sign-Up Screen:
   3a. User enters full name
       [VALIDATION] 2–50 chars, letters + spaces only
       [ERROR if invalid] → inline error message

   3b. User enters email
       [VALIDATION] RFC 5322 format
       [ERROR if invalid] → inline error message

   3c. User enters phone number
       [VALIDATION] 10–13 digits, normalized
       [SYSTEM CHECK] checkExistingUserByPhone(phone)
         → [IF EXISTS] toast: "Phone already registered, sign in instead"
         → [ELSE] proceed

   3d. User enters company name
       [VALIDATION] must not be empty
       [SYSTEM CHECK] checkOrganizationNameTaken(name)
         → [IF TAKEN] inline error: "Name already taken"
         → [ELSE] proceed

   3e. User selects operating model:
       ○ Asset-Based (owns fleet)
       ○ Non-Asset (aggregator)
       ○ Hybrid (both)

   3f. User enters password
       [VALIDATION] min 6 chars, mixed alpha/numeric/special
       [ERROR if invalid] → inline error

   3g. User taps "Create Account"
       → Button shows loading spinner
       [NETWORK CHECK] useIsOnline()
         → [OFFLINE] show error toast

       [SYSTEM] signUp({ email, password, fullName, phone, companyName, role:"user", operatingModel })
         → Supabase Auth creates user
         → DB trigger creates: organizations row, organization_members row
         → Profile row created

       [ON SUCCESS]
         → AuthContext.user and .profile populated
         → Navigate: role="driver" → /(driver)/, role="user" → /(tabs)/trips

       [ON ERROR]
         → Toast with error message
         → Form remains, button re-enabled

4. POSTCONDITION: User authenticated, organization in DB, on Trips screen
```

**Edge Cases:**
- Company name conflict → inline error, user must change name
- Email already registered → "sign in instead" message
- Phone already registered → redirect to sign-in
- Network failure → toast error, retry possible

---

## 4.2 Flow: Sign-In

**Trigger:** Returning user opens app with no valid session, or manually signed out.

**Preconditions:** User has an existing account.

```
1. App launches → AuthContext reads storage
   [IF valid session] → redirect to last tab
   [IF no session]    → Navigate to /sign-in

2. Sign-In Screen:
   2a. User enters email
   2b. User enters password
   2c. (Optional) Toggle "Keep me signed in"
       ON = session persists on background
       OFF = session cleared on background

   2d. Taps "Sign In"
       → Button shows loading spinner
       [NETWORK CHECK]
         → [OFFLINE] error toast

       [SYSTEM] signInWithPassword(email, password)
         → [AUTH ERROR] toast: "Incorrect email or password"
         → [ON SUCCESS]
             refreshSession() → fetches latest profile
             Store preference in AsyncStorage
             Navigate to: lastVisitedTab or /(tabs)/trips

3. POSTCONDITION: User on last visited tab, session active
```

---

## 4.3 Flow: Create a Trip

**Trigger:** User taps FAB (road icon) on Trips tab.

**Preconditions:** User authenticated, `canAccessTrips = true`, organization loaded.

```
1. Taps FAB "Add Trip"
   → Navigate to /add-trip modal overlay

2. Add Trip Modal (AddTripModal.tsx):
   2a. Pickup area (Google Places autocomplete)
   2b. Drop location (Google Places autocomplete)
   2c. Client: select from clients list (required)
       [IF no clients] → "Add a client first" prompt
   2d. Supplier: select from suppliers list (optional)
   2e. Load type: select or type
   2f. Vehicle type: select
   2g. Client price (revenue): numeric ≥ 0
   2h. Supplier rate (cost): numeric ≥ 0
   2i. Pickup date: date picker
   2j. Notes: free text
   2k. Distance (km): numeric (optional)

   2l. Taps "Create Trip"
       [VALIDATION]
         → client required
         → client_price ≥ 0
         → pickup_area non-empty
         → drop_location non-empty
       [ERROR] inline field errors, form stays open

       [IF VALID]
         → createTrip(orgId, formData)
         → Trip inserted with status: "unassigned"
         → Cache invalidated: ['trips', orgId]
         → Modal dismissed
         → Trip appears in Active → Unassigned tile

3. POSTCONDITION: Trip in DB with status="unassigned", visible in Trips Hub
```

**Edge Cases:**
- Supplier rate > client price → negative margin, no block
- Offline → disable submit, show offline toast

---

## 4.4 Flow: Assign a Trip

**Trigger:** User taps a trip card in Unassigned bucket → Trip Detail Screen → taps "Assign".

**Preconditions:** Trip `status: "unassigned"`, user has `fleet_management` or `dispatch_for_own_fleet`.

```
1. Taps trip card → /trip/[id]
   [LOADING] TripDetailScreen fetches: trip, assignment audit, adjustments, ratings

2. Trip Detail Screen renders:
   - Route, dates, client/supplier info
   - Finance breakdown (client_price, supplier_rate, margin)
   - Assignment section: "Assign Driver & Vehicle" (unassigned state)

3. Taps "Assign" button:
   3a. Driver selector: searchable list (status != left)
   3b. Vehicle selector: searchable list (status = "available")
   3c. Taps "Confirm Assignment"

   [SYSTEM] assignTrip(tripId, driverId, vehicleId)
     → Updates trip: driver_id, vehicle_id, status: "assigned"
     → Inserts trip_assignment_audit row (who, when)
     → Driver status updated to "on_trip" (async)

   → Success toast: "Trip assigned to [driver name]"
   → Trip detail refreshes
   → Metric bucket: "unassigned" → "assigned"
   → Driver app: assignment notification appears

4. POSTCONDITION: Trip status = "assigned", driver notified, visible in Assigned bucket
```

**Edge Cases:**
- Driver already on another trip → warning, dispatcher can force-assign
- No available vehicles → empty state in vehicle selector

---

## 4.5 Flow: Driver Accepts and Completes a Trip

**Trigger:** Driver app shows incoming assignment on Dashboard.

**Preconditions:** Trip `status: "assigned"`, driver's `user_id` matches `trip.driver_id`.

```
1. Driver opens driver app → Dashboard shows "New Assignment" card

2. Trip Control Screen:
   - Shows: client, pickup, drop, rate, pickup date
   - Buttons: "Accept Trip" | "Reject Trip"

3a. ACCEPT PATH:
   Taps "Accept Trip"
   → OTP verification prompt
   → Driver enters OTP (SMS or dispatcher-provided)
   [IF OTP valid]
     → status: "in_progress", started_at = now()
     → Map screen displayed
     → Background location tracking starts
   [IF OTP invalid]
     → Error: "Invalid OTP, try again"

3b. REJECT PATH:
   Taps "Reject Trip"
   → Rejection reason modal (optional text)
   → rejectTrip(tripId, driverId, reason)
   → Trip status reverts to "unassigned"
   → Dispatcher notified

4. During trip (in_progress):
   - Map shows current location
   - Driver updates status: assigned → loading → in_transit → unloading

5. Complete Trip:
   Taps "Complete Trip"
   → OTP entry required
   [IF OTP valid]
     → completeTrip(tripId) → status: "completed", completed_at = now()
     → Trip moves to History tab
     → Driver earnings calculated and added to wallet
     → Rating prompt appears for dispatcher

6. POSTCONDITION:
   - Trip status = "completed" in History
   - Driver salary/commission added to DriverLedger
   - Trip available for POD upload
```

---

## 4.6 Flow: Upload Proof of Delivery (POD)

**Trigger:** Trip completed; dispatcher/driver uploads POD document.

**Preconditions:** Trip `status: "completed"`.

```
1. Navigate to Log PODs screen (or from trip detail)

2. LogIncomingPodsScreen:
   2a. Select trip from list
   2b. Tap "Upload POD"

3. PodAttachmentModal:
   3a. Options: Camera | Gallery
   3b. Select/capture image

4. [SYSTEM]
   Compress image
   → Upload to Supabase Storage: pod-documents/{orgId}/{tripId}/{timestamp}.jpg
   → Create trip_documents row
   → Trigger Edge Function for OCR extraction (async)

5. Trip removed from "pod_pending" metric bucket (within 60s stale time)

6. POD Reconciliation (background async):
   → OCR extraction runs
   → PODExtraction object created
   → Available in Pod Reconciliation screen

7. POSTCONDITION:
   - trip_documents row exists
   - Trip no longer in pod_pending
   - POD extraction ready for review
```

**Edge Cases:**
- Upload fails → local retry queue
- OCR confidence < threshold → fields flagged for manual review
- Total mismatch → `validationError` set on extraction

---

## 4.7 Flow: Finance Ledger — View and Filter Transactions

**Trigger:** User taps Finance tab.

**Preconditions:** User has `finance_view` capability.

```
1. Finance tab loads:
   → getLedgerByOrganization(orgId)
   → Realtime subscription active

2. Ledger renders:
   - Entries sorted by transaction_date descending
   - amount_in (green) | amount_out (red)
   - Running balance

3. User applies filters:
   3a. Date range chips: today / this week / this month / custom
       [Custom] → DateRangePickerModal opens
       → Calendar grid tap-to-select from/to
       → Tap "Apply" → chip shows date range with close button

   3b. Party type: All | Client | Supplier | Driver
   3c. Search: filters party_name + description

4. User taps party name:
   → Entity detail overlay slides up
   → Total transactions, balance, linked trips
   → Back button closes

5. Pull-to-refresh:
   → refetchTrips() + refetchTransactions() in parallel

6. POSTCONDITION: Ledger reflects current filtered state
```

---

## 4.8 Flow: Shared Ledger Reconciliation

**Trigger:** Finance → Shared Ledger sub-tab, user selects an integrated partner.

**Preconditions:** At least one client or supplier has `linked_organization_id` set.

```
1. Shared Ledger tab:
   → Lists integrated partners
   → Each: partner name, avatar, matched count, conflict count

2. User taps a partner:
   → SharedLedgerCommandCenter opens

3. Hero Section:
   - Partner name, avatar, integration status
   - Summary: total matched, pending, conflict count

4. Main tab navigation:
   [Trips] → Trip-level reconciliation grid
   [Cash Flow] → Monetary flow by period
   [Shared] → All shared transaction lines

5. Status filter chips: All | Matched | No Entry | Pending | Conflict

6. Transaction row tap (forensic):
   - Your entry vs partner's entry side-by-side
   - Difference highlighted if conflict

7. Conflict resolution:
   7a. "No Entry" + hasLocalTrip=false (ghost trip):
       → Tap "Create Trip"
       → Pre-populated form from partner data
       → On confirm: createTrip() → merged

   7b. "Conflict" row:
       → Tap "Raise Dispute"
       → Dispute reason modal
       → disputeSharedLedgerEntry(entryId, reason)
       → Row → "disputed"
       → Partner notified via realtime

8. POSTCONDITION:
   - Resolved rows → "matched"
   - Disputed rows tracked
   - Both orgs see updated state
```

---

## 4.9 Flow: Create and Broadcast an Indent

**Trigger:** Network tab → Indents view → "Create Indent".

**Preconditions:** User has `dispatch` capability.

```
1. Navigate to /create-indent modal

2. Create Indent Form:
   2a. Pickup area
   2b. Drop location
   2c. Client (select from clients)
   2d. Vehicle type
   2e. Load type
   2f. Client price
   2g. Supplier target rate
   2h. Weight (kg)
   2i. Pickup date

3. Taps "Save Draft"
   → createIndent(orgId, input) → status: "draft"
   → Appears in Indents view: DRAFT badge

4. User taps "Share / Broadcast"
   4a. Circulation target:
       ○ Marketplace
       ○ Integrated suppliers only
       ○ Offline suppliers only
       ○ Both

   4b. Taps "Broadcast"
   → shareIndent(indentId) → status: "broadcast", shared_at = now()
   → Appears on load board for matching suppliers

5. Supplier submits quote:
   → Direct quote: rate, vehicle type, notes

6. Aggregator awards quote:
   → awardQuote(quoteId)
   → Trip created from indent + quote
   → Indent → "completed"

7. POSTCONDITION: Trip exists in both orgs, indent completed
```

---

## 4.10 Flow: Salary Request

**Trigger (Driver):** Driver taps "Request Payment" in Wallet tab.

```
DRIVER SIDE:
1. Wallet tab → balance, pending requests, history
2. Taps "Request Payment"
   → Form: amount, note (optional)
   → Submit → createSalaryRequest(driverId, amount, note) → status: "pending"
   → Success toast

DISPATCHER SIDE:
3. Finance → Salary Requests
   → New request: PENDING badge
   → Driver name, amount, date, note

4. Dispatcher taps request:
   4a. "Approve" → updateSalaryRequestStatus(requestId, "approved")
   4b. "Reject" + reason → updateSalaryRequestStatus(requestId, "rejected")

5. POSTCONDITION:
   - Driver sees updated status in Wallet
   - Ledger entry created on disbursement
```

---

## 4.11 Flow: Driver Invitation

**Trigger:** Dispatcher taps "Add Driver" → "Invite existing platform user".

```
1. Dispatcher: Drivers tab → Add Driver modal

2. AddDriverModal:
   → Input: phone number
   → Taps "Search"
   → searchExistingDriversByPhone(phone)

3a. Driver found (ExistingDriverMatch):
   → Show name, avatar, current org
   → Tap "Invite" → inviteDriver(orgId, driverId)
   → DriverInviteSentRow created

3b. Driver not found:
   → "Create new driver" form
   → Option to send SMS invite

4. DRIVER RECEIVES INVITE:
   → Profile tab shows "New Connection Request"
   → Accept: acceptDriverInvite(inviteId) → linked to org
   → Reject: rejectDriverInvite(inviteId) → invite deleted

5. POSTCONDITION: Driver linked, appears in dispatcher's driver list
```

---

## 4.12 Flow: Generate Invoice PDF

**Trigger:** User navigates to Invoicing screen.

```
1. InvoicingExecuteScreen:
   1a. Select: client or supplier
   1b. Select date range
   → Fetch matching trips

2. Trip selection:
   → Toggle to include/exclude individual trips

3. Taps "Generate Invoice"
   → InvoicePdfDocument.tsx renders:
     Header: org logo, name, address, GSTIN
     Bill to: client/supplier details
     Line items: trip reference, route, date, amount
     Totals: subtotal, GST, grand total
     Footer: payment terms, bank details

4. PDF preview displayed

5. Taps "Download" / "Share"
   → expo-file-system saves to device
   → expo-sharing opens share sheet

6. POSTCONDITION: PDF saved, shareable via any app
```

---

## 4.13 Flow: OPS Agent Chat

**Trigger:** User opens OPS Agent screen.

```
1. OpsAgentScreen loads:
   → New session started
   → Welcome message from agent

2. User types query:
   "How many trips completed this week?"
   "Which drivers are on a trip right now?"

3. User taps Send:
   → User message bubble appended
   → Loading indicator

4. [SYSTEM] useOpsAgentChat hook:
   → POST to Edge Function: ops-agent-chat
   → Payload: { messages, orgId }
   → Claude API processes with org data context
   → Response streamed back

5. Bot response displayed:
   → Text answer
   → Optional tappable suggested action cards

6. User taps suggested action:
   → Navigation to relevant screen or pre-filled form

7. POSTCONDITION: User has answers or has taken the suggested action
```

---

## 4.14 Flow: POD Reconciliation Review

**Trigger:** OCR extraction completes for an uploaded POD.

```
1. POD Reconciliation screen:
   → List of PODs with extraction status

2. User taps a POD:
   → PodValidationView opens

3. Extraction displayed:
   → Header: LR number, dates, invoice number
   → Parties: consignor, consignee, GST
   → Line items with confidence bars
   → Financials: charges, shortages, damage

4. Confidence indicators:
   → confidence < 0.7 → amber highlight
   → confidence < 0.4 → red highlight

5. [IF validationError set] → "Total mismatch" banner

6. User action:
   6a. "Approve" → extraction approved, linked to trip
   6b. "Reject" + reason → rejected, re-upload prompted

7. POSTCONDITION: POD reconciled, trip financials updated if approved
```

---

# 5. UI & Screen Inventory

## 5.1 Authentication Screens

### 5.1.1 Sign-In Screen (`/sign-in`)

| Attribute | Detail |
|---|---|
| **Purpose** | Authenticate returning users |
| **Inputs** | Email (keyboard=email), Password (secureTextEntry) |
| **Actions** | Sign In button, "Keep me signed in" toggle, Sign-Up link |
| **Validation** | Both fields required before submit |
| **States** | Default, loading (spinner), error (toast) |
| **Post-Success** | Navigate to last tab or `/(tabs)/trips` |

### 5.1.2 Sign-Up Screen (`/sign-up`)

| Attribute | Detail |
|---|---|
| **Purpose** | Register new user and organization |
| **Inputs** | Full Name, Email, Phone, Company Name, Password, Operating Model (3-option radio) |
| **Validation** | Per-field inline errors + async uniqueness checks |
| **States** | Default, field-error, loading, success (redirect) |

---

## 5.2 Main Tab Screens

### 5.2.1 Trips Screen (`/(tabs)/trips`)

| Attribute | Detail |
|---|---|
| **Purpose** | Central trip operations dashboard |
| **Header** | Dark background; main tabs (Active/History); sub-tabs (All/Asset/Aggregated); toolbar: layout toggle + search + sort button |
| **Body** | Metric tiles grid (Active only) + date chips row + trip list or table |
| **List States** | Loading (`CenteredLoadingView`), Empty (localized message), Populated |
| **Modals** | Sort/Filter modal (dark floating card), `DateRangePickerModal` |
| **FAB** | "Add Trip" bottom-right, icon=`road` |
| **Responsive** | 3-column grid on web ≥ 1024px; single column on mobile |
| **Pagination** | Table mode: 15 rows/page via `usePaginatedScroll` |
| **Refresh** | Pull-to-refresh (`RefreshControl`, red tint) |
| **Accessibility** | `accessibilityRole="tab"` on layout toggle, `accessibilityLabel` on FAB |

### 5.2.2 Finance Screen (`/(tabs)/finance`)

| Attribute | Detail |
|---|---|
| **Purpose** | Financial management hub |
| **Sub-Tabs** | Ledger, Treasury, Vehicles/Garrage, Trips, Salary Requests, Shared Ledger |
| **Realtime** | Supabase subscription auto-invalidates on transaction changes |
| **Export** | PDF/CSV export available |
| **States** | Loading, empty per sub-tab, entity detail overlay |

### 5.2.3 Network Screen (`/(tabs)/network`)

| Attribute | Detail |
|---|---|
| **Purpose** | Marketplace and partner integration hub |
| **Views** | Load Board, Direct Quotes, Indents, Connections |
| **Realtime** | Live indent updates |

### 5.2.4 Profile Screen (`/(tabs)/profile`)

| Attribute | Detail |
|---|---|
| **Purpose** | User settings and profile management |
| **Sections** | Avatar, name, phone, status text, org details, capabilities, language, logout |
| **Actions** | Edit profile (modal), change password, language select, logout |

---

## 5.3 Modals

### 5.3.1 Add Trip Modal (`/add-trip`)

| Attribute | Detail |
|---|---|
| **Type** | Full-screen modal overlay (Expo Router modal route) |
| **Fields** | Pickup, drop, client, supplier, load type, vehicle type, client price, supplier rate, date, notes, distance |
| **Validation** | Inline per-field errors |
| **States** | Default, validating, submitting (spinner), error, success (dismiss) |

### 5.3.2 DateRangePickerModal

| Attribute | Detail |
|---|---|
| **Type** | Bottom-sheet style Modal |
| **Native** | `@react-native-community/datetimepicker` |
| **Web** | `<input type="date">` fallback |
| **Layout** | Month calendar grid (42 cells), prev/next month navigation |
| **Inputs** | From date, To date (tap-to-select) |
| **Actions** | Apply, Clear |
| **States** | Default, from-selected, range-selected, applied |

### 5.3.3 Sort/Filter Modal (Trips)

| Attribute | Detail |
|---|---|
| **Type** | Floating dark card, absolute positioned, anchored below sort button |
| **Sections** | Sort By, Date Filter, Payment Status, Load Type (dynamic) |
| **Actions** | Chip selection (immediate), Apply Filters (close) |
| **States** | Open (scrollable), closed |

### 5.3.4 Edit Profile Modal

| Attribute | Detail |
|---|---|
| **Type** | Slide-up modal |
| **Fields** | Full name, phone, status text, avatar selection |
| **Avatar** | Grid of 2D preset avatars + "Upload custom" |
| **Actions** | Save, Cancel |

### 5.3.5 Add Driver Modal

| Attribute | Detail |
|---|---|
| **Fields** | Name, phone, email, compensation model (fixed/commission%/per km) |
| **Search** | Phone number lookup for existing platform users |
| **Actions** | Save / Invite |

### 5.3.6 Add Client / Supplier Modals

| Attribute | Detail |
|---|---|
| **Fields** | Name, phone, email, company, GSTIN, address |
| **Validation** | Name required; phone format check |
| **Integration** | Toggle "Platform-integrated partner" → link by org ID |

---

## 5.4 Driver App Screens

### 5.4.1 Driver Dashboard (`/(driver)/dashboard`)

| Attribute | Detail |
|---|---|
| **Hero** | Active trip card (if on trip) |
| **Metrics** | Today's earnings, trip count, level progress ring |
| **States** | Idle, Active trip, Loading |

### 5.4.2 Trip Control (`/(driver)/trip-control`)

| Attribute | Detail |
|---|---|
| **States** | No assignment (empty), Pending acceptance, Active trip |
| **Actions** | Accept Trip, Reject Trip, Start Loading, In Transit, Unloading, Complete Trip |
| **OTP Flow** | Modal for entering OTP |

### 5.4.3 Driver Wallet (`/(driver)/wallet`)

| Attribute | Detail |
|---|---|
| **Sections** | Balance card, Transaction history, Request Payment button |
| **States** | Loading, empty, populated |

### 5.4.4 Driver Passbook (`/(driver)/passbook`)

| Attribute | Detail |
|---|---|
| **Purpose** | Per-organization earnings breakdown |
| **Layout** | Organization tabs + ledger rows per org |

---

## 5.5 Detail Screens

### 5.5.1 Trip Detail Screen (`/trip/[id]`)

| Attribute | Detail |
|---|---|
| **Sections** | Route header, finance breakdown, assignment section, audit trail, documents, ratings |
| **Actions** | Assign (unassigned), update status, add ledger entry, upload POD, rate driver |
| **States** | Loading, fully loaded, error |

### 5.5.2 Client Detail Screen (`/client/[id]`)

| Attribute | Detail |
|---|---|
| **Sections** | Contact info, outstanding balance, trip history, ledger |
| **Actions** | Edit, delete, view linked org profile |

### 5.5.3 Driver Detail Screen (`/driver/[id]`)

| Attribute | Detail |
|---|---|
| **Sections** | Contact info, compensation, status, current vehicle, trip history, earnings |
| **Actions** | Edit, disconnect, view location (on trip) |

---

# 6. Methods & System Actions

## 6.1 Authentication

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `signInWithPassword(email, password)` | Sign-In button | email, password | `{ user, session }` | AuthContext.user populated |
| `signUp(data)` | Create Account button | email, password, fullName, phone, companyName, role, operatingModel | `{ user }` | AuthContext.user populated; DB rows created |
| `signOut()` | Logout tap | — | void | AuthContext cleared; navigate to /sign-in |
| `refreshSession()` | App foreground, token near-expiry | — | updated profile | AuthContext.profile updated |
| `updateProfile(patch)` | Save in Edit Profile modal | name, phone, avatar_url, avatar_seed, status_text | `{ profile }` | AuthContext.profile updated |
| `checkOrganizationNameTaken(name)` | Company name field blur | name string | boolean | Inline error if true |
| `checkExistingUserByPhone(phone)` | Phone field blur | phone string | `{ exists, uid }` | Redirect prompt if exists |

## 6.2 Trips

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `getTripsByOrganization(orgId)` | Trips tab mount | orgId | `TripRow[]` | Cache: `['trips', orgId]` |
| `createTrip(orgId, data)` | Add Trip submit | orgId, trip form data | `TripRow` | Invalidates trips cache |
| `updateTrip(tripId, patch)` | Edit trip detail | tripId, partial TripRow | `TripRow` | Updates cache entry |
| `assignTrip(tripId, driverId, vehicleId)` | Assign confirm | tripId, driverId, vehicleId | `TripRow` | status → "assigned", audit row created |
| `rejectTrip(tripId, driverId, reason?)` | Driver rejects | tripId, driverId, reason | void | status → "unassigned" |
| `completeTrip(tripId)` | Driver completes (OTP valid) | tripId | `TripRow` | status → "completed", completed_at set |
| `getTripAdjustments(tripId)` | Trip detail / Shared Ledger | tripId | `TripAdjustment[]` | Local state |

## 6.3 Finance

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `getLedgerByOrganization(orgId, period?)` | Finance tab mount | orgId, optional period | `LedgerRow[]` | Cache: `['transactions', orgId]` |
| `createTransaction(orgId, data)` | Add ledger entry | orgId, transaction data | `LedgerRow` | Invalidates transactions cache |
| `updateLedgerEntry(entryId, patch)` | Edit transaction | entryId, patch | `LedgerRow` | Updates cache |
| `deleteLedgerEntry(entryId)` | Delete transaction | entryId | void | Removes from cache |
| `getSalaryRequests(orgId)` | Salary Requests tab | orgId | `SalaryRequest[]` | Local state |
| `updateSalaryRequestStatus(requestId, status)` | Approve/Reject tap | requestId, status | void | Cache invalidated |
| `getSharedLedgerForClient(clientId)` | Shared Ledger tab | clientId | `ReconciledRow[]` | Local state |
| `disputeSharedLedgerEntry(entryId, reason)` | Raise Dispute tap | entryId, reason | void | Row status → "disputed" |

## 6.4 Drivers

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `getDriversByOrganization(orgId)` | Drivers tab mount | orgId | `DriverRow[]` | Cache: `['drivers', orgId]` |
| `createDriver(orgId, data)` | Save in Add Driver modal | orgId, driver data | `DriverRow` | Invalidates drivers cache |
| `updateDriver(orgId, driverId, patch)` | Edit driver | orgId, driverId, patch | `DriverRow` | Updates cache |
| `inviteDriver(orgId, driverId)` | Invite button | orgId, driverId | `DriverInviteSentRow` | Invite row created |
| `acceptDriverInvite(inviteId)` | Driver taps Accept | inviteId | void | Driver linked to org |
| `rejectDriverInvite(inviteId)` | Driver taps Reject | inviteId | void | Invite deleted |
| `getDriverLedgerByDriver(driverId)` | Passbook / Wallet | driverId | `DriverLedgerRow[]` | Local state |

## 6.5 Realtime Subscriptions

| Hook | Table Watched | Cache Invalidated |
|---|---|---|
| `useRealtimeTripsInvalidation(orgId)` | `trips` | `['trips', orgId]` |
| `useRealtimeTransactionsInvalidation(orgId)` | `transactions` | `['transactions', orgId]` |
| Supabase channel (inline query) | `trip_documents` | `['q','trips','doc-trip-ids',...]` |

## 6.6 POD

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| Upload image | "Upload POD" confirm | image blob, tripId | storage URL | `trip_documents` row created |
| OCR extraction (Edge Function) | Auto after upload | storage URL | `PODExtraction` | `pod_reconciliation` row |
| Approve extraction | "Approve" tap | extractionId | void | Row status → "approved" |
| Reject extraction | "Reject" tap | extractionId, reason | void | Row status → "rejected" |

---

# 7. Status & State Reference

## 7.1 Trip Statuses

| Status Value | Display | Tab | Meaning |
|---|---|---|---|
| `unassigned` | UNASSIGNED | Active | No driver assigned |
| `assigned` | ASSIGNED | Active | Driver assigned, not started |
| `loading` | LOADING | Active | At pickup, loading cargo |
| `in_progress` / `in transit` | IN PROGRESS | Active | Actively moving |
| `in_transit` | IN TRANSIT | Active | Actively moving |
| `unloading` | UNLOADING | Active | At destination, unloading |
| `completed` | COMPLETED | History | Trip finished |
| `delivered` | DELIVERED | History | Delivery confirmed |
| `done` | DONE | History | Closed |
| `cancelled` | (hidden) | Neither | Filtered by `isTripCancelledForHub()` |

## 7.2 Trip Metric Buckets (Active Tab)

| Metric ID | Classification Logic | Hint |
|---|---|---|
| `unassigned` | `driver_id == null` | No driver yet |
| `assigned` | `driver_id != null`, status = "assigned" | Loading in progress |
| `loading` | status = "loading" | At pickup |
| `in_transit` | status = "in_progress" / "in_transit" | Moving |
| `unloading` | status = "unloading" | At destination |
| `pod_pending` | Completed + not in `tripIdsWithDocuments` | POD not uploaded |

## 7.3 Payment Statuses

| Status | Display | Meaning |
|---|---|---|
| `pending` | PENDING | No payment received |
| `partial` | PARTIAL | Some payment received |
| `paid` / `fully_paid` | PAID | Fully settled |

## 7.4 Indent Statuses

| Status | Editable | Visible to Marketplace |
|---|---|---|
| `draft` | Yes | No |
| `broadcast` | No | Yes |
| `completed` | No | No |

## 7.5 Shared Ledger Row Statuses

| Status | Meaning | UI Indicator |
|---|---|---|
| `matched` | Both parties agree | Green checkmark |
| `no_entry` | Partner has entry; you don't | Amber inbox icon |
| `pending` | Awaiting partner update | Clock icon |
| `conflict` | Both entries exist but amounts differ | Red alert icon |
| `disputed` | Dispute raised | Red flag |

## 7.6 Salary Request Statuses

| Status | Who Changes It | Display |
|---|---|---|
| `pending` | Auto (on submit) | Yellow badge |
| `approved` | Dispatcher | Green badge |
| `rejected` | Dispatcher | Red badge |
| `paid` | System/Dispatcher | Blue badge |

## 7.7 Driver Statuses

| Status | Meaning |
|---|---|
| `offline` | Not active, no trip |
| `online` | Available, no current trip |
| `on_trip` | Currently executing a trip |

## 7.8 Supplier Types

| Type | Description |
|---|---|
| `integrated` | Platform-connected supplier org |
| `offline` | External/manual supplier (no platform account) |
| `marketplace` | Found via marketplace bidding |

## 7.9 POD Extraction Statuses

| Status | Meaning |
|---|---|
| `processing` | OCR extraction in progress |
| `ready_for_review` | Extraction complete, awaiting review |
| `approved` | Accepted and linked to trip |
| `rejected` | Rejected, re-upload required |

## 7.10 Auth / Session States

| State | Source | Meaning |
|---|---|---|
| `loading: true` | AuthContext | Reading storage / network pending |
| `user: null` | AuthContext | Not authenticated → redirect /sign-in |
| `user: {...}` | AuthContext | Authenticated |
| `sessionExpired: true` | AuthContext | Token invalid → force re-auth |
| `keepSignedIn: false` | AsyncStorage | Clear session on app background |

## 7.11 Supply Filter States (Trips)

| Filter | Meaning |
|---|---|
| `all` | Show all trips |
| `asset` | Own fleet trips (`!isAggregateTrip`) |
| `aggregated` | Sub-contracted trips (`isAggregateTrip`) |

## 7.12 Date Filter States (Trips)

| Filter | Range Computed |
|---|---|
| `all` | No filter |
| `today` | `[startOfDay, endOfDay)` |
| `yesterday` | `[startOfDay-24h, startOfDay)` |
| `tomorrow` | `[endOfDay, endOfDay+24h)` |
| `this_week` | `[startOfWeek, now]` |
| `this_month` | `[firstOfMonth, now]` |
| `custom` | `[customDateFrom 00:00, customDateTo+1day 00:00)` |

---

# 8. Scope Boundaries

## 8.1 In Scope (Fully Implemented)

| Module | Status |
|---|---|
| Authentication (sign-in, sign-up, session, profile) | Complete |
| Trips Hub (list, filter, sort, cards, table, metric tiles) | Complete |
| Add Trip, Assign Trip, Trip OTP | Complete |
| Finance Ledger, Treasury, Salary Requests | Complete |
| Shared Ledger Command Center | Complete (recent changes on current branch) |
| Indents (create, draft, broadcast, complete) | Complete |
| Direct Quotes (submit, award) | Complete |
| Network Connections (integration requests) | Complete |
| Clients (CRUD, integration link) | Complete |
| Suppliers (CRUD, integration link) | Complete |
| Drivers (CRUD, invite, link, compensation) | Complete |
| Vehicles (CRUD, documents, P&L) | Complete |
| Driver App (dashboard, trip control, wallet, passbook, profile) | Complete |
| Invoicing (PDF generation, branding) | Complete |
| Log PODs (capture, compress, upload) | Complete |
| POD Reconciliation (OCR, review, approve/reject) | Complete |
| OPS Agent (chat, Claude-powered) | Complete |
| Ratings (submit, view) | Complete |
| AI Insights Badges | Complete |
| Localization (20+ languages) | Complete |
| Offline detection and guards | Complete |
| Real-time subscriptions (trips, transactions) | Complete |

## 8.2 Known Technical Debt

| Issue | Impact |
|---|---|
| 5 feature modules lack `index.ts` barrel (`invoicing`, `log-pods`, `network`, `ops-agent`, `pod-reconciliation`) | Import paths inconsistent |
| Flat `/components/` directory (41 files, no sub-categorization) | Harder to discover components |
| Flat `/lib/` directory (33+ files, no domain grouping) | Should be organized by domain |
| `/services/` re-export layer for `clients`, `drivers`, `trips` | Redundant; marked for removal |
| Some feature screens not in `components/` subfolder | Minor organization issue |

## 8.3 Partially Implemented

| Feature | Status | Detail |
|---|---|---|
| **WalletContext** | Stub | `balance` state exists but not wired to a live wallet API (TODO comment in code) |
| **Push Notifications** | Partially wired | Driver assignment notification flow exists; push delivery mechanism not fully confirmed in reviewed files |
| **Public Profile deep links** | Structure exists | `PublicProfileScreen` exists; deep-link routing spec not confirmed in reviewed files |

## 8.4 Explicitly Out of Scope

The following were **not found** in the codebase and are out of scope for this application:

- Web-only admin portal (separate `q-unified-base` project)
- Payment gateway integration (payments tracked in ledger; no direct payment API found)
- Automated route optimization algorithm (distance/duration shown; no client-side optimization engine)
- Customer-facing booking portal (ops/logistics tool only; no customer self-service)
- IoT vehicle telemetry (location tracking via driver GPS, not vehicle IoT sensors)

---

---

# 9. Previously Undocumented Features (Gap Analysis Addition)

The following features were found in the codebase during a second-pass audit and were absent from the original PRD. All are fully implemented unless noted.

---

## 9.1 Client Feed — Distributed Bookkeeping Feed (`/from-clients`)

**Route:** `app/from-clients.tsx`
**Feature module:** `features/client-feed/`

### 9.1.1 Purpose

When an organization is integrated as a **supplier** with a client on the platform, the client's dispatchers record ledger entries (e.g. payments made, invoices) on their side. The Client Feed surfaces those entries to the supplier, allowing them to classify and action each one without manually cross-referencing. It is a distributed bookkeeping surface — essentially the supplier's inbox for their client's financial activity.

### 9.1.2 Entry Classification

The service (`clientFeedService.ts`) automatically classifies each shared entry received from a client:

| Class | Criteria | Meaning |
|---|---|---|
| `NEW` | No matching local entry found | Supplier should add this to their own ledger |
| `DUPLICATE` | Same trip + same amount found locally within 7-day window | Already recorded; auto-linkable |
| `MISMATCH` | Same trip found locally but amount differs | Amount disagreement; needs review |
| `ACTIONED` | User has already processed this entry (status persisted in AsyncStorage) | Done |

### 9.1.3 Functional Requirements

| ID | Requirement |
|---|---|
| CF-01 | Pull all shared-ledger entries from integrated clients via `clientFeedService` |
| CF-02 | Match entries against local ledger by `trip_id` + `amount` within a 7-day window |
| CF-03 | Classify each entry: `NEW`, `DUPLICATE`, `MISMATCH`, or `ACTIONED` |
| CF-04 | Filter tabs: All, New, Similar (Duplicate), Mismatch, Actioned |
| CF-05 | One-tap "Add to My Book" for NEW entries → creates local ledger entry |
| CF-06 | One-tap "Link" for DUPLICATE entries → links client's entry to existing local record |
| CF-07 | One-tap "Raise Dispute" for MISMATCH entries → `createDispute()` flow |
| CF-08 | Actioned status persisted in AsyncStorage (key `client_feed_actioned_v1`) |
| CF-09 | Unread count badge shown on Resources/Finance tab |

### 9.1.4 Screen State

| State | Condition |
|---|---|
| Loading | Fetching from service |
| Empty (All) | No integrated clients with shared entries |
| Empty (filtered) | No entries match selected classification tab |
| Populated | Classification cards rendered per entry |

---

## 9.2 Driver Level Progression System (`/(driver)/level-progression`)

**Route:** `app/(driver)/level-progression.tsx`
**Constants:** `constants/DriverLevels.ts`

### 9.2.1 Purpose

A gamified milestone system that rewards drivers as they complete more trips. Drivers progress through 8 levels across tiered ranks, unlocking rewards and recognition badges.

### 9.2.2 Level Configuration (`LEVELS_CONFIG`)

| Level | Name | Type | Target | Tier |
|---|---|---|---|---|
| 1 | Initiate | signup | 0 | Silver |
| 2 | Novice | trips | 2 | Silver |
| 3 | Verified | verification | — | Silver |
| 4 | Trusted | trips | 6 | Gold |
| 5 | Navigator | trips | 12 | Gold |
| 6 | Veteran | trips | 20 | Gold |
| 7 | Elite | ratings | — | Platinum |
| 8 | Gold | trips | 50 | Titanium |

### 9.2.3 Level Calculation

```
currentLevel = min(1 + floor(completedTrips / 2), 8)
```

- `getLinkedDriversForCurrentUser(uid)` fetches all driver rows for the current user
- `getTripsByDriverIds(driverIds)` fetches trips; counts `status = completed/delivered/done`
- Progress percentage towards next trip-based level = `min(completedTrips / nextTarget * 100, 100)`

### 9.2.4 Screen Sections

1. **Elite Evolution Hero Card** (dark background `#0f0f0f`): current level name, tier badge, progress bar, "ROAD TO LEVEL X" label
2. **2×2 Stats Grid**: Safety score, Reliability score, Trips Logged, XP Level
3. **Next Mile Objectives**: list of upcoming milestones with icons (truck/star/id-card/user), verified badges, progress bars, and reward text
4. **Link to Milestone Map** (`/milestone`) for full tier roadmap

### 9.2.5 Functional Requirements

| ID | Requirement |
|---|---|
| LEVEL-01 | Fetch linked drivers for current user (excludes `left_at` set) |
| LEVEL-02 | Count completed trips across all linked driver IDs |
| LEVEL-03 | Derive `currentLevel` and `nextLevelConfig` from `LEVELS_CONFIG` |
| LEVEL-04 | Show progress percentage bar on hero card |
| LEVEL-05 | Render objective list with completion state per milestone type |
| LEVEL-06 | Navigate to `/milestone` for full gold/platinum/titanium tier roadmap |

---

## 9.3 Milestone Map (`/milestone`)

**Route:** `app/milestone.tsx`

### 9.3.1 Purpose

A standalone full-screen roadmap showing all level tiers (Silver → Gold → Platinum → Titanium), with segment-based visual progress bars and reward unlocks for levels 11–20.

### 9.3.2 Visual Structure

- **Tier sections**: Silver, Gold, Platinum, Titanium
- **Segment bars** (levels 11–20): Each segment fills as the driver completes the required trips
- **Upgrade Distance**: XP remaining to reach next level displayed prominently
- **Gold Path Progress**: 5-segment visual bar specifically for Gold tier transitions
- **Tier tooltips**: Tap a tier to see what it unlocks (e.g., "Verified badge", "Priority dispatch")

### 9.3.3 Functional Requirements

| ID | Requirement |
|---|---|
| MILE-01 | Display all tier sections in vertical scroll |
| MILE-02 | Segment progress derived from completed trip count |
| MILE-03 | Tier transitions: Silver (1–3) → Gold (4–6) → Platinum (7) → Titanium (8) |
| MILE-04 | Tooltip on tier tap shows reward details |

---

## 9.4 Report Screen (`/(tabs)/report`)

**Route:** `app/(tabs)/report.tsx`

### 9.4.1 Purpose

A standalone reporting screen for generating and downloading financial transaction reports in PDF or Excel format, filtered by date range and direction.

### 9.4.2 Date Presets

| Preset | Range |
|---|---|
| Today | Current date |
| Last 7 days | Today − 6 days |
| Last 30 days | Today − 29 days |

Custom start/end date can also be set via inline date picker modals.

### 9.4.3 Filter Options

| Filter | Meaning |
|---|---|
| `All` | All transactions |
| `You gave` | `amount_out` entries (payables) |
| `You got` | `amount_in` entries (receivables) |

### 9.4.4 Download Mechanism

| Platform | Method |
|---|---|
| Web | `URL.createObjectURL(blob)` → anchor click download |
| Native | `expo-print` → `expo-sharing` share sheet |

### 9.4.5 Functional Requirements

| ID | Requirement |
|---|---|
| RPT-01 | Display transaction list filtered by selected date range and direction |
| RPT-02 | Date preset chips: Today, Last 7 days, Last 30 days |
| RPT-03 | Custom start/end date selection via inline date modal |
| RPT-04 | Direction filter: All / You gave / You got |
| RPT-05 | Search by transaction party name |
| RPT-06 | "Download Report" triggers PDF generation via `expo-print` |
| RPT-07 | On web: programmatic anchor-click download to `.pdf` file |
| RPT-08 | Report header includes date range formatted as `D Mon YY → D Mon YY` |
| RPT-09 | Download modal shows format options before generating |

---

## 9.5 Ledger Sync — Advanced Ledger Entry Editor (`/(modals)/ledger-sync`)

**Route:** `app/(modals)/ledger-sync.tsx` (~850 lines)

### 9.5.1 Purpose

A full-page modal for creating or editing double-entry ledger records with deep contextual awareness — pre-filling party, amount, and trip details based on the calling context (trip detail, entity detail, finance screen).

### 9.5.2 Context-Aware Behavior

The modal is launched with a context payload that can pre-populate:

| Context | Pre-fill Source |
|---|---|
| From trip detail | `trip_id`, `client_name`, `supplier_rate` or `client_price`, `driver_commission` |
| From entity detail | `contact_id`, `contact_type`, `party_name` |
| From finance screen | Empty (manual entry) |

### 9.5.3 Form Fields

| Field | Type | Notes |
|---|---|---|
| Party / Contact | Searchable select | Client / Supplier / Driver / Vehicle |
| Trip | Searchable select | Filtered to trips for selected party |
| Amount | Numeric input | Auto-populated from trip data |
| Direction | Toggle | Cash In (receivable) / Cash Out (payable) |
| Payment mode | Select | `CASH`, `UPI`, `BANK`, `CHEQUE` |
| Reference number | Text | Cheque number, UTR, UPI ref |
| Transaction date | Date picker | Defaults to today |
| Notes | Text | Free text |
| Driver payment type | Select (drivers only) | `advance`, `settlement`, `salary`, `bonus`, `deduction`, `reimbursement`, `adjustment` |
| Mark as salary paid | Toggle | Links entry to pending salary request |

### 9.5.4 Trip-Locked Entries

When a trip is selected:
- `client_price` → auto-fills as `amount_in` for client entries
- `supplier_rate` → auto-fills as `amount_out` for supplier entries
- `driver_commission` → auto-fills for driver entries
- Residual due amount calculated from existing ledger entries on that trip

### 9.5.5 Integrated Trip Auto-Linking

When the contact has a `linked_organization_id`, the entry is flagged for cross-org visibility in the Shared Ledger. The entry will appear on the partner's Shared Ledger feed automatically.

### 9.5.6 Functional Requirements

| ID | Requirement |
|---|---|
| LS-01 | Context payload pre-fills party, amount, trip from calling screen |
| LS-02 | Trip selector filtered to trips associated with selected contact |
| LS-03 | Auto-compute due amount from existing entries on selected trip |
| LS-04 | Payment mode selection: CASH / UPI / BANK / CHEQUE |
| LS-05 | Reference field shown for non-cash payment modes |
| LS-06 | Driver entry type selector when contact_type = "driver" |
| LS-07 | "Mark salary request as paid" toggle links to pending `salary_request` row |
| LS-08 | Integrated contact entries flagged for shared-ledger cross-org sync |
| LS-09 | On save: `createLedgerEntry()` → cache invalidated → modal dismissed |
| LS-10 | Draft persistence not required; form ephemeral |

---

## 9.6 Payment Detail Screen (`/(tabs)/payment-detail`)

**Route:** `app/(tabs)/payment-detail.tsx`

### 9.6.1 Purpose

A secured, contact-level payment view showing all transactions with a specific party — client, supplier, or driver. Prevents screen capture to protect sensitive financial data.

### 9.6.2 Security

- Uses `usePreventScreenCapture()` from `expo-screen-capture`
- Screen recording and screenshots are blocked on iOS and Android while this screen is active

### 9.6.3 Layout Sections

1. **Balance Card**: "You will give / You will get" — net position with this contact
2. **Direction Filter**: toggle between `You gave` (cash out) and `You got` (cash in)
3. **Transaction List** (`TransactionRow` component): date-time, amount, color-coded (green = received, red = paid)
4. **Action Bar**: Reminders, SMS, Report, Call, Settings buttons

### 9.6.4 Actions

| Action | Behavior |
|---|---|
| Reminders | Opens reminder/notification setup for this contact |
| SMS | `expo-sms` sends pre-composed message with balance |
| Report | Opens `ReportScreen` modal filtered to this contact |
| Call | `Linking.openURL("tel:${phone}")` |
| Settings | Contact settings (payment terms, credit limit) |

### 9.6.5 Functional Requirements

| ID | Requirement |
|---|---|
| PAY-01 | Screen capture blocked via `usePreventScreenCapture()` |
| PAY-02 | Net balance card: `amount_in - amount_out` for this contact |
| PAY-03 | Toggle filter: all / you gave / you got |
| PAY-04 | Running balance per transaction (descending order) |
| PAY-05 | SMS action sends balance statement to contact phone |
| PAY-06 | Report action opens date-filtered report for this contact |
| PAY-07 | Call action dials contact phone number |

---

## 9.7 Network User Detail Screen (`/network-user`)

**Route:** `app/network-user.tsx`

### 9.7.1 Purpose

A network-discovery profile view for viewing the public profile of another organization found via the Network tab (load board, connections, or search). Shows avatar, tier badge, safety score, trip count, and neural (integration) status.

### 9.7.2 Route Parameters

| Param | Type | Description |
|---|---|---|
| `id` | string | Organization or user ID |
| `name` | string | Display name |
| `type` | string | Entity type (`client`, `supplier`, `driver`) |

### 9.7.3 Display Sections

- Avatar + organization name + tier badge
- Safety score indicator
- Total trips count
- Neural status (integration state with current org)
- "Establish Link" CTA → triggers connection request

### 9.7.4 Functional Requirements

| ID | Requirement |
|---|---|
| NUD-01 | Accept route params: id, name, type |
| NUD-02 | Fetch public profile data for the given ID |
| NUD-03 | Display safety score, tier, trip count |
| NUD-04 | "Establish Link" → `createConnectionRequest(orgId, targetId)` |
| NUD-05 | Show "Already Connected" state if integration exists |

---

## 9.8 Public Profile — Unified Entity Profile UI

**Feature module:** `features/public-profile/`

### 9.8.1 Purpose

A unified read-only profile component used in both the Network discovery context and as a shareable public page. It maps client, supplier, and driver entities to a standardized display format.

### 9.8.2 Data Types

```
PublicProfileEntity {
  id: string
  name: string
  avatar_url?: string
  avatar_seed?: string
  type: "client" | "supplier" | "driver"
}

PublicProfileMetric {
  label: string
  value: string
  icon: "industry" | "location" | "phone" | "email" | "calendar" | "id" | "briefcase" | "truck"
}

PublicProfileFact {
  label: string
  value: string
  masked?: boolean   // e.g. phone shown as "+91 ****1234"
}
```

### 9.8.3 Display Sections

1. **Metrics row**: Trust Tier/Status, Tenure/Experience, Sync State/Commission — 3 metric tiles
2. **Facts list**: GSTIN/Company, masked contact channel, joined date, operating areas
3. **Synergy / Integration status** card
4. **CTAs**: "Enter Shared Hub" → navigate to shared ledger for this entity; "Invite to Shared Ledger" → send invite

### 9.8.4 Entity-to-Profile Mappers

| Entity Type | Trust Metric | Tenure Metric | Sync Metric |
|---|---|---|---|
| Client | Credit status | Relationship tenure | Ledger sync state |
| Supplier | Reliability tier | Fleet experience | Integration status |
| Driver | Safety score | Trip count | Commission model |

---

## 9.9 Driver Connection Requests & Passbook (`/(driver)/requests`)

**Route:** `app/(driver)/requests.tsx`

### 9.9.1 Purpose

A driver-side screen showing:
1. **Pending invites** from dispatchers — accept or decline fleet connection requests
2. **Connected fleet passbooks** — per-organization earning summaries

### 9.9.2 `ConnectionPassbook` Type

```
ConnectionPassbook {
  driverId: UUID
  orgId: UUID
  orgName: string
  tripsCount: number
  completedCount: number
  totalEarned: number
  totalReceived: number
  pendingAmount: number
}
```

### 9.9.3 Screen Layout

**Pending Invites section:**
- Card per pending invite: org name, avatar, "Accept" / "Decline" buttons
- Accept → `acceptDriverInvite(inviteId)` → driver connected to org
- Decline → `rejectDriverInvite(inviteId)` → invite dismissed

**Connected Fleets section:**
- Card per connected org: org name, trip count, earned vs received vs pending
- Tap card → navigate to per-org passbook detail

**Payment Update tab:**
- Quick-filter showing only orgs with pending payment balance

### 9.9.4 Functional Requirements

| ID | Requirement |
|---|---|
| DREQ-01 | Fetch pending driver invites: `getDriverInvitesReceived(driverId)` |
| DREQ-02 | Accept invite: `acceptDriverInvite(inviteId)` |
| DREQ-03 | Decline invite: `rejectDriverInvite(inviteId)` |
| DREQ-04 | Fetch passbook per org: `getDriverLedgerByDriverIds([driverId])` grouped by org |
| DREQ-05 | Show per-org: total earned, total received, pending amount |
| DREQ-06 | Tab toggle: All Connected Fleets / Payment Update (pending > 0) |

---

## 9.10 Driver Salary Request Screen (`/(driver)/salary-request`)

**Route:** `app/(driver)/salary-request.tsx`

### 9.10.1 Purpose

A full-page salary/payment request flow for drivers. More comprehensive than the wallet quick-request: supports multiple request types, fleet selection, period selection, custom amount via numpad, and draft persistence.

### 9.10.2 Request Types

| Type | Description |
|---|---|
| `monthly` | Fixed monthly salary request for a specific month/year |
| `trip_based` | Commission claim based on completed trips in a period |
| `advance` | Advance payment request against future earnings |

### 9.10.3 Form Sections

1. **Balance Card**: shows current balance and avatar from `DriverAvatarContext`
2. **Fleet Selector**: pick from connected organizations (if driver is in multiple fleets)
3. **Request Type**: radio selection of `monthly` / `trip_based` / `advance`
4. **Period Selector** (monthly/trip_based): `NeededByCalendar` component — month+year picker
5. **Needed By** (advance): specific date picker using `DateTimePickerAndroid`
6. **Amount Numpad**: custom 12-key numpad (0–9, `.`, delete) with live rupee formatting (en-IN locale, no paise)
7. **Notes**: free text input
8. **Trip Breakdown** (trip_based type): list of completed trips with individual earnings, selected period's totals

### 9.10.4 Draft Persistence

- Draft saved to AsyncStorage key `driver_salary_request_draft_v1`
- Restored on screen focus via `useFocusEffect`
- Cleared on successful submission

### 9.10.5 Success State

Full-screen success confirmation with:
- Checkmark animation
- Request summary (type, amount, fleet, period)
- "Back to Wallet" button

### 9.10.6 Functional Requirements

| ID | Requirement |
|---|---|
| SAL-01 | Fleet selector populated from `getLinkedDriversForCurrentUser(uid)` |
| SAL-02 | Request type radio: monthly / trip_based / advance |
| SAL-03 | `NeededByCalendar` component for month+year period selection |
| SAL-04 | `DateTimePickerAndroid` for needed-by date (advance type) |
| SAL-05 | Custom 12-key numpad; amount stored as integer rupees |
| SAL-06 | Live rupee formatting: `toLocaleString('en-IN')` |
| SAL-07 | Validate: fleet selected, amount > 0, period set (type-dependent) |
| SAL-08 | Trip breakdown shown for `trip_based` type with per-trip earnings |
| SAL-09 | `tripEarningsForDriver(trip)` utility computes driver share per trip |
| SAL-10 | Draft auto-saved to AsyncStorage on each field change |
| SAL-11 | Draft restored on screen focus |
| SAL-12 | Draft cleared on successful submission |
| SAL-13 | On submit: `createSalaryRequest(driverId, orgId, type, amount, period, neededBy, note)` |
| SAL-14 | Success state replaces form content (no navigation pop) |

---

## 9.11 Driver Documents Screen (`/(driver)/documents`)

**Route:** `app/(driver)/documents.tsx`

### 9.11.1 Purpose

A profile screen for drivers to upload and track the status of their KYC and operational documents.

### 9.11.2 Document Types

| Document | Required For |
|---|---|
| Aadhaar Card | KYC identity verification |
| PAN Card | Tax identity |
| Driving License | Legal driver authorization |

### 9.11.3 Document Status

| Status | Display |
|---|---|
| Not added | Grey chip, "Upload" button |
| Verified | Green verified badge |
| Expired | Red expired badge |

### 9.11.4 Current Implementation State

**Partially implemented.** Tap actions currently show alerts (`showAppAlert`) rather than triggering actual upload flows. Upload logic is a placeholder; document status tracking UI is complete.

### 9.11.5 Functional Requirements

| ID | Requirement |
|---|---|
| DOC-01 | List Aadhaar, PAN, Driving License with status per document |
| DOC-02 | Status: Not added / Verified / Expired |
| DOC-03 | Tap → upload image (currently stub; shows alert) |
| DOC-04 | Verified badge shown when document is confirmed |
| DOC-05 | Expired badge shown with renewal prompt |

---

## 9.12 SMS OTP Parsing Screen (`/(modals)/sms-otp-parsing`)

**Route:** `app/(modals)/sms-otp-parsing.tsx`

### 9.12.1 Purpose

An Android-only developer/settings utility that displays the last SMS-based OTP received by the device. Used to debug or manually relay OTPs during trip acceptance/completion when the automatic OTP fill is not functioning.

### 9.12.2 Platform Behavior

| Platform | Behavior |
|---|---|
| Android | Registers `BroadcastReceiver` for `android.provider.Telephony.SMS_RECEIVED`; decodes PDU, extracts 4–8 digit OTP pattern |
| iOS | Shows "Not available on iOS" message |

### 9.12.3 Display

- Last OTP value (large, monospace)
- Sender phone number
- Received timestamp
- Full message body (truncated)
- Requires `RECEIVE_SMS` Android permission

### 9.12.4 Functional Requirements

| ID | Requirement |
|---|---|
| SMS-01 | Android-only: register SMS BroadcastReceiver on mount |
| SMS-02 | Decode incoming SMS PDU and extract OTP (4–8 digits) |
| SMS-03 | Display last received OTP, sender, and timestamp |
| SMS-04 | iOS: render "Not available" placeholder |
| SMS-05 | Unregister receiver on unmount |

---

## 9.13 Trip Partner Card (Aggregate Trip Supplier Tracking)

**Component:** `features/trips/components/TripPartnerCard.tsx`

### 9.13.1 Purpose

An inline card rendered within the Trip Detail screen when a trip is subcontracted (aggregate) — i.e., `supplier_id` is set and `isAggregateTrip(trip) === true`. Shows the financial relationship with the subcontracted supplier.

### 9.13.2 Display Fields

| Field | Source |
|---|---|
| Associated Partner name | `trip.supplier_name` or resolved from `supplierRow` |
| Partner Rate | `trip.supplier_rate` |
| Advance Paid | Sum of `amount_out` ledger entries for supplier on this trip |
| Balance Payable | `supplier_rate - advance_paid` |

### 9.13.3 Functional Requirements

| ID | Requirement |
|---|---|
| TPC-01 | Shown only when `isAggregateTrip(trip) === true` |
| TPC-02 | Supplier name resolved: trip field → supplier entity → ledger entries |
| TPC-03 | Advance paid computed from existing ledger entries for this trip + supplier |
| TPC-04 | Balance payable = `supplier_rate - advance_paid` (highlighted red if > 0) |
| TPC-05 | Tap card → opens Ledger Sync modal pre-filled with this supplier + trip |

---

## 9.14 AI Decision Layer — Extended Capabilities

**Feature module:** `features/ai/`

The PRD previously documented AI badges at a surface level. The full AI decision layer is more extensive:

### 9.14.1 Data Models (Supabase Tables)

| Table | Purpose |
|---|---|
| `client_risk_scores` | Per-client credit/payment risk assessment |
| `trip_predictions` | Per-trip profit/cost prediction with confidence + risk flags |
| `vehicle_health_scores` | Vehicle condition score + maintenance prediction + breakdown probability |
| `cashflow_forecast` | 30-day forward cash flow projection with confidence intervals |
| `ai_settings` | Per-org AI behavior configuration flags |

### 9.14.2 `ai_settings` Configuration Flags

| Flag | Meaning |
|---|---|
| `auto_ocr` | Automatically trigger OCR on new POD uploads |
| `auto_flag_risk` | Automatically apply risk badge when score exceeds threshold |
| `auto_credit_enforcement` | Block new trips for clients exceeding credit limit |
| `auto_vehicle_assignment` | Suggest best available vehicle for new trip (based on health score + proximity) |

### 9.14.3 Extended Components

| Component | What It Shows |
|---|---|
| `AIInsightsPanel` | Full panel with all insights for an entity (trip/client/vehicle) |
| `VehicleHealthBadge` | Breakdown probability, maintenance due date |
| `ClientRiskBadge` | Payment delay probability, credit utilization |
| `TripAIBadges` | Profit margin warning, route anomaly flag |

### 9.14.4 Cashflow Forecast

- 30-day forward projection of receivables vs payables
- Confidence interval (e.g. "85% confidence")
- Displayed as a mini chart in Finance → Treasury sub-tab
- Updated by Supabase Edge Function on ledger change

### 9.14.5 Functional Requirements (Additions to Section 2.18)

| ID | Requirement |
|---|---|
| AI-04 | `cashflow_forecast` queried from `ai_settings`-enabled orgs; shown in Treasury |
| AI-05 | `vehicle_health_scores` power `VehicleHealthBadge` on vehicle list and detail |
| AI-06 | `client_risk_scores` power `ClientRiskBadge` on client list and detail |
| AI-07 | `trip_predictions` power `TripAIBadges` on trip cards and detail |
| AI-08 | `auto_vehicle_assignment` flag → AI suggests vehicle on Add Trip form |
| AI-09 | `auto_credit_enforcement` flag → blocks trip creation if client credit exceeded |
| AI-10 | `AIInsightsPanel` renders all available insights for a given entity |

---

## 9.15 Shared Ledger — Dispute & Resolution Service (Extended)

**Service:** `services/sharedLedgerService.ts`

The Shared Ledger service contains a richer set of operations than initially documented:

### 9.15.1 Additional Service Methods

| Method | Trigger | Behavior |
|---|---|---|
| `createDispute(entry, reason)` | "Raise Dispute" tap | Creates `disputes` DB row; notifies partner |
| `resolveDispute(disputeId, resolution)` | Partner accepts resolution | Marks dispute `resolved`; both ledgers updated |
| `resolveDisputeTableOnly(disputeId)` | Dispatcher clears locally | Marks resolved in local view only |
| `getDisputesForPartner(partnerId)` | Shared Ledger load | Fetches all disputes for a specific partner |
| `getDisputesReceived(orgId)` | Disputes inbox | Fetches disputes raised against your org |
| `acceptPartnerView(entryId)` | "Accept" on partner entry | Marks your local record as accepted; status → `matched` |
| `getSharedLedgerConnections(orgId)` | Shared Ledger tab | Lists all integrated partners with `ReconStatus` |
| `getSharedLedgerTripSummary(tripId, partnerId)` | Trip drill-down | Fetches both orgs' entries for a single trip |
| `getConnectionInviteeByPhone(phone)` | Connection search | Look up if a phone number belongs to a platform org |
| `createConnectionRequest(orgId, targetId)` | "Establish Link" | Sends integration request |

### 9.15.2 `DisputeRow` Type

```
DisputeRow {
  id: UUID
  trip_id: UUID
  raised_by_org: UUID
  partner_org: UUID
  entry_id: UUID
  reason: string
  status: "open" | "resolved" | "declined"
  created_at: string
  resolved_at?: string
  resolution?: string
}
```

### 9.15.3 `ReconStatus` Type

```
ReconStatus {
  matched: number
  no_entry: number
  pending: number
  conflict: number
  disputed: number
}
```

---

# 10. Addendum: Updated Screen Inventory

## 10.1 New Screens (Gap Analysis)

### 10.1.1 Client Feed Screen (`/from-clients`)

| Attribute | Detail |
|---|---|
| **Purpose** | Supplier's inbox for client-shared ledger entries |
| **Tabs** | All, New, Similar, Mismatch, Actioned |
| **Card Actions** | Add to My Book, Link (duplicate), Raise Dispute (mismatch) |
| **Badge** | Unread count shown on parent tab |
| **States** | Loading, empty (all), empty (filtered), populated |

### 10.1.2 Level Progression Screen (`/(driver)/level-progression`)

| Attribute | Detail |
|---|---|
| **Purpose** | Driver milestone progression view |
| **Hero** | Dark card with current level, tier, progress bar |
| **Stats Grid** | 2×2: Safety, Reliability, Trips, XP |
| **Objectives** | List with icon + progress bar per milestone |
| **States** | Loading, populated |

### 10.1.3 Milestone Map Screen (`/milestone`)

| Attribute | Detail |
|---|---|
| **Purpose** | Full tier roadmap (Silver → Titanium) |
| **Layout** | Vertical scroll, tier sections with segment bars |
| **States** | Static (no loading state; uses data from level-progression) |

### 10.1.4 Report Screen (`/(tabs)/report`)

| Attribute | Detail |
|---|---|
| **Purpose** | Financial report generation and download |
| **Inputs** | Date range (presets + custom), direction filter, search |
| **Actions** | Download Report (PDF), filter modal, date modal |
| **States** | Default, filter-open, date-open, download-open, generating |

### 10.1.5 Ledger Sync Modal (`/(modals)/ledger-sync`)

| Attribute | Detail |
|---|---|
| **Purpose** | Create or edit double-entry ledger record |
| **Fields** | Party, trip, amount, direction, payment mode, reference, date, notes, driver type, salary-paid toggle |
| **Context** | Pre-fills from trip detail / entity detail / finance screen |
| **States** | Default (empty), context-pre-filled, validating, submitting, success |

### 10.1.6 Payment Detail Screen (`/(tabs)/payment-detail`)

| Attribute | Detail |
|---|---|
| **Purpose** | Secured contact-level payment view |
| **Security** | `usePreventScreenCapture()` active |
| **Sections** | Balance card, direction filter, transaction list, action bar |
| **Actions** | SMS, Report, Call, Reminders, Settings |
| **States** | Loading, populated |

### 10.1.7 Driver Salary Request Screen (`/(driver)/salary-request`)

| Attribute | Detail |
|---|---|
| **Purpose** | Full-page salary/advance request form |
| **Inputs** | Fleet, request type, period (calendar), amount (numpad), note |
| **Persistence** | Draft saved to AsyncStorage |
| **States** | Default, type-selected, period-selected, amount-entered, submitting, success |

### 10.1.8 Driver Connection Requests Screen (`/(driver)/requests`)

| Attribute | Detail |
|---|---|
| **Purpose** | Pending invites + per-fleet passbook summary |
| **Sections** | Pending invites, connected fleets, payment update tab |
| **Actions** | Accept invite, Decline invite, tap fleet → passbook detail |
| **States** | Loading, empty (no connections), populated |

### 10.1.9 Driver Documents Screen (`/(driver)/documents`)

| Attribute | Detail |
|---|---|
| **Purpose** | KYC document status tracking |
| **Documents** | Aadhaar, PAN, Driving License |
| **Status** | Not added / Verified / Expired |
| **Actions** | Tap to upload (currently stub) |
| **States** | Static display, alert on tap |

### 10.1.10 Network User Detail Screen (`/network-user`)

| Attribute | Detail |
|---|---|
| **Purpose** | Discovery profile for another org/user |
| **Params** | `id`, `name`, `type` (via route query) |
| **Sections** | Avatar, tier badge, safety score, trip count, neural status |
| **Actions** | "Establish Link" → connection request |
| **States** | Loading, populated, already-connected |

### 10.1.11 SMS OTP Parsing Screen (`/(modals)/sms-otp-parsing`)

| Attribute | Detail |
|---|---|
| **Purpose** | Debug/settings screen for Android SMS OTP interception |
| **Platform** | Android only (iOS shows unavailable message) |
| **Display** | Last OTP value, sender, timestamp, message body |
| **States** | Waiting (no SMS yet), received |

---

# 11. Addendum: Updated Methods & System Actions

## 11.1 Shared Ledger Service (Extended)

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `createDispute(entry, reason)` | Raise Dispute tap | entry object, reason string | `DisputeRow` | Entry → "disputed"; partner notified |
| `resolveDispute(disputeId, resolution)` | Accept resolution tap | disputeId, resolution string | void | Dispute → "resolved"; both ledgers updated |
| `resolveDisputeTableOnly(disputeId)` | Dismiss locally | disputeId | void | Local view cleared only |
| `getDisputesForPartner(partnerId)` | Shared Ledger load | partnerId | `DisputeRow[]` | Local state |
| `getDisputesReceived(orgId)` | Disputes inbox | orgId | `DisputeRow[]` | Local state |
| `acceptPartnerView(entryId)` | "Accept" button | entryId | void | Entry → "matched" |
| `getSharedLedgerConnections(orgId)` | Shared Ledger tab | orgId | partners + `ReconStatus` | Local state |
| `getSharedLedgerTripSummary(tripId, partnerId)` | Trip drill-down | tripId, partnerId | both-org entries | Local state |
| `getConnectionInviteeByPhone(phone)` | Connection search | phone | `ConnectionInviteeByPhone` | Local state |
| `createConnectionRequest(orgId, targetId)` | Establish Link | orgId, targetId | void | `connection_requests` row created |

## 11.2 Client Feed Service

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `getClientFeedEntries(orgId)` | Client Feed screen mount | orgId | classified `ClientFeedEntry[]` | Local state |
| `markEntryActioned(entryId)` | Any action button | entryId | void | AsyncStorage updated; entry → "ACTIONED" |
| `addEntryToLocalLedger(entry)` | "Add to My Book" tap | entry | `LedgerRow` | Local ledger entry created |
| `linkEntryToDuplicate(entryId, localEntryId)` | "Link" tap (DUPLICATE) | entryId, localEntryId | void | Entries cross-referenced |

## 11.3 Driver Salary Request Service

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `createSalaryRequest(driverId, orgId, type, amount, period, neededBy, note)` | Submit tap | all form fields | `SalaryRequestRow` | Request created; status = "pending" |
| `tripEarningsForDriver(trip)` | Trip breakdown render | `TripRow` | number | Local computation only |
| `getLinkedDriversForCurrentUser(uid)` | Fleet selector load | user uid | `DriverRow[]` | Local state |

## 11.4 Level Progression

| Method | Trigger | Inputs | Returns | State Change |
|---|---|---|---|---|
| `getLinkedDriversForCurrentUser(uid)` | Level screen mount | uid | `DriverRow[]` | Local state |
| `getTripsByDriverIds(driverIds)` | After drivers fetched | `driverIds[]` | `TripRow[]` | Local state (filtered to completed) |

---

# 12. Addendum: Updated Status & State Reference

## 12.1 Client Feed Entry Classifications

| Classification | Criteria | User Action |
|---|---|---|
| `NEW` | No matching local entry found | Add to My Book |
| `DUPLICATE` | Same trip + same amount within 7-day window | Link to existing |
| `MISMATCH` | Same trip, different amount | Raise Dispute |
| `ACTIONED` | Already processed (AsyncStorage flag set) | (none, archive) |

## 12.2 Dispute Statuses (Shared Ledger)

| Status | Who Sets It | Meaning |
|---|---|---|
| `open` | Auto on `createDispute()` | Dispute raised, awaiting partner response |
| `resolved` | Either party via `resolveDispute()` | Both parties agreed on resolution |
| `declined` | Partner declines | Partner disputes the dispute; escalation required |

## 12.3 Salary Request Types

| Type | Description | Period Required |
|---|---|---|
| `monthly` | Fixed monthly salary claim | Month + year |
| `trip_based` | Commission based on completed trips | Month + year |
| `advance` | Advance against future earnings | Needed-by date |

## 12.4 Driver Level Tiers

| Tier | Levels | Color |
|---|---|---|
| Silver | 1–3 | Silver |
| Gold | 4–6 | Gold |
| Platinum | 7 | Platinum |
| Titanium | 8 | Titanium |

## 12.5 Document Statuses (Driver KYC)

| Status | Display | Meaning |
|---|---|---|
| (none) | Grey — "Not added" | Document not uploaded |
| `verified` | Green badge | Uploaded and confirmed |
| `expired` | Red badge | Previously verified; now expired |

---

# 13. Addendum: Updated Scope Boundaries

## 13.1 Additions to In-Scope

The following were found during gap analysis and are confirmed as fully or partially implemented:

| Module | Status |
|---|---|
| Client Feed (distributed bookkeeping inbox) | Complete |
| Driver Level Progression (8-level system) | Complete |
| Milestone Map (tier roadmap) | Complete |
| Report Screen (PDF download, date filters) | Complete |
| Ledger Sync Modal (advanced entry editor) | Complete |
| Payment Detail Screen (screen-capture-protected) | Complete |
| Driver Salary Request Screen (multi-type, numpad, draft) | Complete |
| Driver Connection Requests & Fleet Passbook | Complete |
| Network User Detail Screen | Complete |
| SMS OTP Parsing (Android dev utility) | Complete |
| Trip Partner Card (aggregate trip supplier tracking) | Complete |
| AI Decision Layer — extended (cashflow forecast, settings flags, full panel) | Complete |
| Shared Ledger Service — extended (dispute CRUD, resolution, connection search) | Complete |
| Public Profile — unified entity mapper (client/supplier/driver) | Complete |

## 13.2 Corrections to Section 8.3 (Partially Implemented)

| Feature | Updated Status |
|---|---|
| **Driver Documents** | Partially implemented — UI complete, upload action is a stub (`showAppAlert`) |
| **SMS OTP Parsing** | Fully implemented for Android; iOS shows unavailable placeholder |
| **Public Profile deep links** | Route exists at `/network-user`; used in network discovery context |

---

*Gap analysis performed 2026-04-20. All additions traceable to source files in `/Users/ggx/Desktop/q-web` on branch `vasanth`. Original document sections 1–8 remain unchanged.*
