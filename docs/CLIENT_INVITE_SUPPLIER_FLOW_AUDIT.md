# Client → Invite → Supplier Flow Audit

> Generated: 2026-05-22  
> Critical bugs: 6 identified  
> Scope: Dispatcher adds client manually → client signs up → invite sent → accept → supplier display

---

## 1. HOW THE FLOW SHOULD WORK (Ideal)

```
DISPATCHER (User 1)                         CLIENT ORG (User 2)
──────────────────                          ──────────────────
1. Signs up → org created                  3. Signs up → org created
                                           
2. Adds client manually                    
   (phone: +91-XXXXX)                      
   → clients row: is_integrated=false      
     linked_organization_id=NULL           
                                           
         ─── system auto-detects same phone ───►  4. Phone matches → clients row
                                                    auto-updates:
                                                    linked_organization_id = User2.org_id
                                           
5. Dispatcher sees "client is now on         
   platform" prompt → sends invite           

         ─────── connection_request row ────────►  6. Invite appears IMMEDIATELY
                                                    (realtime push OR on login)
                                           
                                                 7. User 2 ACCEPTS
                                           
         ◄── trigger fires ────────────────────    8. Trigger updates:
                                                    - suppliers (User1.org): new row
                                                    - clients (User2.org): new row
                                                    - organization_relations: new row
                                           
9. Dispatcher refreshes → sees              10. User 2 → sees dispatcher as client
   User2.org as SUPPLIER ✓                      ✓
```

---

## 2. HOW IT WORKS RIGHT NOW (Actual / Broken)

```
DISPATCHER (User 1)                         CLIENT ORG (User 2)
──────────────────                          ──────────────────
[STEP 1] Sign up
  WRITE: auth.users
         organizations
         organization_members
  
[STEP 2] Add client manually (modal)
  WRITE: clients {
    organization_id: User1.org_id,
    phone: "+91XXXXX",               ← contact phone
    is_integrated: false,
    linked_organization_id: NULL     ← STAYS NULL forever unless manually linked
  }

                                     [STEP 3] Client signs up
                                       WRITE: auth.users (phone in metadata)
                                              organizations (new org)
                                              organization_members
                                     
                                     ╔══════════════════════════════╗
                                     ║ BUG #1: No auto-linkage      ║
                                     ║ clients.phone = "+91XXXXX"   ║
                                     ║ auth.users metadata phone    ║
                                     ║ also "+91XXXXX" but nobody   ║
                                     ║ runs the matching query.     ║
                                     ╚══════════════════════════════╝

[STEP 4a] Dispatcher looks up phone
  READ: RPC get_invitee_by_phone("+91XXXXX")
    → auth.users.raw_user_meta_data->>'phone'
    → organizations WHERE owner_id = found_user
    → returns: { organization_id, full_name, ... }
  ✓ This part works IF client already signed up

[STEP 4b] Dispatcher sends invite
  WRITE: connection_requests {
    from_organization_id: User1.org,
    to_organization_id: User2.org,
    request_shipper_client: true,
    status: 'pending'
  }

                                     [STEP 5] Invite display
                                       READ: RPC get_connection_requests_received_with_names(User2.org)
                                         WHERE to_organization_id = User2.org
                                         AND EXISTS (
                                           SELECT 1 FROM organization_members
                                           WHERE org = User2.org
                                           AND user_id = auth.uid()  ← !! RLS check
                                         )
                                     
                                     ╔══════════════════════════════╗
                                     ║ BUG #2: RLS timing issue     ║
                                     ║ If org_members row not yet   ║
                                     ║ synced when query runs →     ║
                                     ║ RPC returns EMPTY. Invite    ║
                                     ║ invisible until next login.  ║
                                     ╚══════════════════════════════╝
                                     
                                     ╔══════════════════════════════╗
                                     ║ BUG #3: No realtime for      ║
                                     ║ new connection_requests.     ║
                                     ║ Bootstrap is one-shot.       ║
                                     ║ If invite arrives AFTER      ║
                                     ║ bootstrap → invisible until  ║
                                     ║ manual refresh / re-login.   ║
                                     ╚══════════════════════════════╝
                                     
                                     [STEP 6] User 2 accepts
                                       WRITE: connection_requests.status = 'approved'
                                       
                                       TRIGGER fires:
                                         WRITE: suppliers (User1.org) {
                                           linked_organization_id: User2.org,
                                           supplier_type: 'integrated',
                                           name: match by phone OR name
                                         }
                                         WRITE: clients (User2.org) {
                                           phone: 'linked-{from_org_id}'  ← HACK
                                           linked_organization_id: User1.org
                                         }
                                         WRITE: organization_relations {
                                           relation_type: 'supplier_client'
                                         }

[STEP 7] Dispatcher checks suppliers
  READ: suppliers WHERE organization_id = User1.org
  
  ╔══════════════════════════════╗
  ║ BUG #4: No realtime for     ║
  ║ suppliers table. Trigger     ║
  ║ creates row but UI never     ║
  ║ gets notified. Dispatcher   ║
  ║ must logout + re-login to   ║
  ║ see new supplier.           ║
  ╚══════════════════════════════╝
  
  ╔══════════════════════════════╗
  ║ BUG #5: Name-match failure  ║
  ║ Trigger matches existing    ║
  ║ supplier by trim(lower(name)║
  ║ If names differ → creates   ║
  ║ DUPLICATE supplier row      ║
  ║ instead of updating the     ║
  ║ manually-added one.         ║
  ╚══════════════════════════════╝
```

---

## 3. DATA MODEL (Tables Involved)

```
auth.users
  id, email, raw_user_meta_data { phone, role, operating_model, company_name }

organizations
  id, owner_id → auth.users.id, name, operating_model

organization_members
  user_id → auth.users.id, organization_id → organizations.id, role

connection_requests
  id, from_organization_id, to_organization_id
  request_shipper_client (bool), request_carrier_supplier (bool)
  status: pending | approved | rejected
  created_at, responded_at

clients
  id, organization_id (owner org)
  name, contact_person, phone
  is_integrated (bool), linked_organization_id → organizations.id (nullable)
  created_by

suppliers
  id, organization_id (owner org)
  name, phone
  supplier_type: manual | integrated
  linked_organization_id → organizations.id (nullable)
  created_by

organization_relations
  from_organization_id, to_organization_id, relation_type
```

---

## 4. BUGS CATALOG

### BUG #1 — No Auto-Link When Client Signs Up
| | |
|---|---|
| **Severity** | High |
| **Where** | `features/clients/services/clients.service.ts` (createClient) |
| **What** | When client contact person signs up with the same phone that was manually entered in Step 2, `clients.linked_organization_id` stays NULL forever |
| **Impact** | Dispatcher must manually re-search and re-invite; no notification that "this contact is now on the platform" |
| **Fix** | On new org creation trigger OR in `signUp()`, query `clients WHERE phone = new_user_phone` across all orgs and update `linked_organization_id` |

---

### BUG #2 — Invite RLS Timing Race
| | |
|---|---|
| **Severity** | Critical |
| **Where** | `supabase/migrations/20250307120000_...sql` line ~196 |
| **What** | RPC `get_connection_requests_received_with_names()` checks `organization_members` for the calling user. If the org_members row is not yet committed when the RPC is called (cold start / new signup), the RPC returns empty |
| **Impact** | User opens app, invite is invisible. Shows only after logout + re-login or after some minutes |
| **Fix** | Add fallback: also check `organizations.owner_id = auth.uid()` as an OR condition in the SECURITY DEFINER RPC |

```sql
-- Current (broken):
WHERE EXISTS (
  SELECT 1 FROM organization_members om
  WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
)

-- Fixed:
WHERE (
  EXISTS (SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM organizations o
    WHERE o.id = p_org_id AND o.owner_id = auth.uid())
)
```

---

### BUG #3 — No Realtime for Incoming Invites
| | |
|---|---|
| **Severity** | High |
| **Where** | `lib/globalSync/useGlobalSyncStore.ts` `routeRealtimeEvent()` |
| **What** | `connection_requests` INSERT events are not routed to update local state. Bootstrap is one-shot at login. If invite arrives while user is active → invisible |
| **Impact** | User has to manually close and reopen app to see invite |
| **Fix** | Subscribe to `connection_requests` table realtime in useGlobalSyncStore and route INSERT events where `to_organization_id = currentOrg` |

---

### BUG #4 — No Realtime for Suppliers After Accept
| | |
|---|---|
| **Severity** | High |
| **Where** | `lib/globalSync/useGlobalSyncStore.ts` `routeRealtimeEvent()` |
| **What** | When approval trigger creates/updates the `suppliers` row, there is no realtime route for `table === 'suppliers'`. UI state is stale until next bootstrap |
| **Impact** | Dispatcher accepts invite from client, but supplier never appears in their list without re-login |
| **Fix** | Add realtime routing for suppliers: |

```typescript
// In routeRealtimeEvent():
case 'suppliers':
  if (row.organization_id === currentOrgId) {
    set((s) => ({ suppliers: upsertById(s.suppliers, row) }));
  }
  break;
```

---

### BUG #5 — Name-Match Failure Creates Duplicate Suppliers
| | |
|---|---|
| **Severity** | Medium |
| **Where** | `supabase/migrations/20250310140000_connection_approval_...sql` lines ~64-83 |
| **What** | Trigger matches existing manually-added supplier by `trim(lower(name))`. If names differ even slightly (casing, punctuation, abbreviation) → new row is created. Dispatcher now has TWO supplier entries for same org |
| **Impact** | Duplicate suppliers in list; one linked (integrated), one manual |
| **Fix** | Add phone match as primary key; only fall through to name match if phone is NULL. Add UNIQUE constraint on `(organization_id, linked_organization_id)` to prevent duplicates |

---

### BUG #6 — Placeholder Phone in Linked Client Row
| | |
|---|---|
| **Severity** | Low |
| **Where** | `supabase/migrations/20250310140000_...sql` line ~122 |
| **What** | When trigger creates the client row for the accepting org, it writes `phone = 'linked-{uuid}'` as placeholder because `clients.phone` is NOT NULL |
| **Impact** | Phone lookup on clients table returns garbage; SMS/contact features break for linked clients |
| **Fix** | Fetch actual phone from `profiles WHERE id = (SELECT owner_id FROM organizations WHERE id = from_organization_id)` and use that. Make `clients.phone` NULLABLE as a safety net |

---

## 5. FIX PRIORITY ORDER

```
Priority 1 (Blocking UX):
  BUG #2 — Invite RLS timing race           → SQL migration fix only
  BUG #3 — No realtime for invites          → JS: add realtime subscription
  BUG #4 — No realtime for suppliers        → JS: add routeRealtimeEvent case

Priority 2 (Data Integrity):
  BUG #5 — Duplicate supplier rows          → SQL: add UNIQUE constraint + fix trigger
  BUG #6 — Placeholder phone                → SQL migration fix

Priority 3 (UX Enhancement):
  BUG #1 — No auto-link on client signup    → Trigger or Edge Function
```

---

## 6. AFFECTED FILES

| File | Bug(s) | Change Type |
|------|--------|-------------|
| `supabase/migrations/20250307120000_*.sql` | #2 | SQL: fix RPC WHERE clause |
| `supabase/migrations/20250310140000_*.sql` | #5, #6 | SQL: fix trigger matching + phone |
| `lib/globalSync/useGlobalSyncStore.ts` | #3, #4 | JS: add realtime routes |
| `features/auth/services/auth.service.ts` | #1 | JS: post-signup client linkage |
| New migration | #5 | SQL: UNIQUE(org_id, linked_org_id) on suppliers |

---

## 7. QUICK VALIDATION QUERIES

Run these against Supabase to confirm bug presence:

```sql
-- Check orphaned manual clients (should be 0 if auto-link worked):
SELECT c.id, c.phone, c.organization_id, c.linked_organization_id
FROM clients c
JOIN profiles p ON p.phone = c.phone
WHERE c.linked_organization_id IS NULL AND c.is_integrated = false;

-- Check duplicate supplier rows per org-pair:
SELECT organization_id, linked_organization_id, count(*)
FROM suppliers
WHERE linked_organization_id IS NOT NULL
GROUP BY 1, 2
HAVING count(*) > 1;

-- Check placeholder phones:
SELECT id, organization_id, phone FROM clients
WHERE phone LIKE 'linked-%';

-- Check pending invites vs org membership:
SELECT cr.id, cr.to_organization_id, cr.status,
       (SELECT count(*) FROM organization_members om 
        WHERE om.organization_id = cr.to_organization_id) as member_count
FROM connection_requests cr
WHERE cr.status = 'pending';
```
