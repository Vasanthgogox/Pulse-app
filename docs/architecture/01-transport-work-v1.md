# Transport Work Architecture

**Version:** 1.0
**Status:** Frozen
**Owner:** Pulse Core Architecture
**Last Updated:** 2026-07-07
**Supersedes:** None

This document defines the business architecture for the operations domain. Changes require a new version rather than in-place modification. Implementation may lag behind this specification and should be tracked through separate mapping and roadmap documents (`02-transport-work-mapping.md`, `03-transport-work-gap-analysis.md`, `04-transport-work-roadmap.md`, `05-transport-work-decisions.md`).

## Non-Goals

This specification does not define:

- Database schema
- API design
- UI/UX implementation
- Navigation structure
- Permissions or RLS
- Event architecture
- Background workers
- Migration strategy

These belong to subsequent implementation specifications.

## Context Diagram

```
Customer
     │
     ▼
Transport Work
     │
     ├───────────────┐
     │               │
Capacity Strategy    Planning
     │
     ▼
Dispatch
     │
     ▼
Trip(s)
     │
     ▼
Delivery (POD)
     │
     ▼
Settlement
     ├── Invoice
     ├── Supplier Bill
     └── Transactions
```

## 1. Business Language

- **Transport Work** — The canonical operational record representing a transportation requirement from initial demand through operational execution and financial settlement. The aggregate root for planning, capacity sourcing, dispatch, execution, delivery, and settlement.
- **Trip** — The operational execution instance of a Transport Work. A Transport Work may materialize one or more Trips depending on the execution strategy (single-leg, relay, split shipment, multi-drop, cross-docking, etc.).
- **Customer** — The party requesting freight movement.
- **Supplier** — A party who can be assigned or awarded capacity to execute movement.
- **Driver** — The individual operating a vehicle.
- **Vehicle** — The physical asset moving goods.
- **Invoice** — The receivable document owed by a Customer.
- **Supplier Bill** — The payable document owed to a Supplier.
- **Transaction** — A ledger entry recording actual money movement.

**Aggregate Root:** Transport Work owns the lifecycle of every operational artifact created during execution. Trips, invoices, supplier bills, and transactions cannot exist independently of a Transport Work in the target architecture.

## 2. Lifecycle

| Stage | Purpose | Entry criteria | Exit criteria | Owner |
|---|---|---|---|---|
| **REQUEST** | Capture that freight needs to move | A customer need exists | Pickup, delivery, material, and customer are known | Operations |
| **PLANNING** | Define how the shipment should move | Request complete | Shipment details (weight, vehicle type, schedule, priority, SLA) are set | Operations |
| **CAPACITY** | Secure who will move it | Planning complete | A capacity strategy has resolved a Supplier (or been explicitly skipped for Manual) | Operations / Procurement |
| **DISPATCH** | Commit execution resources | Capacity secured | Driver and Vehicle are assigned | Operations |
| **EXECUTION** | Move the freight | Execution committed | Movement reaches its destination | Operations |
| **DELIVERY** | Confirm the shipment arrived | Execution complete | POD captured | Operations |
| **SETTLEMENT** | Close the financial obligations | Delivery confirmed | Invoice and/or Supplier Bill reach a paid state | Finance |

## 3. Capacity Strategy

Capacity is the only stage that branches. Every other stage is identical regardless of strategy.

```
Transport Work
 └ Capacity Strategy
      Manual
      Direct Supplier
      Marketplace
      API        (future)
      ERP        (future)
      AI         (future)
```

Indent and Marketplace are capacity strategies for acquiring capacity, not products.

## 4. Ownership Matrix

| Object | Team |
|---|---|
| Customer | Sales |
| Supplier | Procurement |
| Driver | Fleet |
| Vehicle | Fleet |
| Transport Work | Operations |
| Trip | Operations |
| Invoice | Finance |
| Supplier Bill | Finance |
| Transaction | Finance |

## 5. Source of Truth Matrix

| Data | Source |
|---|---|
| Customer Name | Customer |
| Supplier Identity | Supplier |
| Driver Identity | Driver |
| Vehicle Number | Vehicle |
| GPS Position | Trip |
| Operational Status | Transport Work |
| Financial Status | Invoice + Supplier Bill + Transaction |

## 6. Architectural Principles

1. Every transport requirement is represented by exactly one Transport Work.
2. Capacity acquisition is a strategy, not a business object.
3. Trips execute work. They do not own work.
4. Master data never stores operational state. Operational state belongs to Transport Work and Trip.
5. Financial records never modify operational history. Settlement records execution — it does not define execution.
6. Every stage has one owner (Operations, Fleet, Finance, Sales, or Procurement). No stage has multiple system owners.
7. Every screen answers one business question — what needs moving, who will move it, which resources are committed, is it moving, was it delivered, has everyone been paid. This keeps UX aligned with the business lifecycle rather than the underlying database.

## 7. Design Principles

Distinct from the Architectural Principles above — these guide future product decisions beyond the current implementation, rather than describing the current model's structure.

1. Every workflow follows the same lifecycle.
2. Every lifecycle stage answers one business question.
3. Every business object has one owner.
4. Master data is immutable during execution.
5. Operational records are append-oriented.
6. Financial records never redefine operational history.
7. Execution can be replayed from events.

## 8. System Invariants

Principles above describe *should*. Invariants describe *never allowed to be violated*. These are guardrails for every future engineer touching this domain.

1. Every Trip belongs to exactly one Transport Work.
2. A Driver cannot execute more than one active Trip simultaneously.
3. A Vehicle cannot execute more than one active Trip simultaneously.
4. A Transport Work has exactly one active lifecycle stage.
5. Settlement cannot begin before Delivery completes.
6. Operational history is immutable after Settlement.

## 9. Event Timeline

This enumerates business-meaningful moments in the lifecycle — not event architecture (delivery guarantees, schemas, subscribers), which remains out of scope per Non-Goals. Notification, automation, analytics, integrations, audit logging, and AI are all expected to eventually subscribe to these moments, but how they do so is a separate specification.

```
Transport Work Created
        ↓
Planning Completed
        ↓
Capacity Secured
        ↓
Driver Assigned
        ↓
Vehicle Assigned
        ↓
Trip Started
        ↓
POD Uploaded
        ↓
Invoice Generated
        ↓
Supplier Bill Approved
        ↓
Settlement Completed
```
