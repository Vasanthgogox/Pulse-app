---                                                                                                                            
  Fleet Management & Trip Operations System                                                                                      
                                                                                                                                 
  Application Usage Flow Document — v1.0                                                                                         
                                                                                                                                 
  Audience: Product, UX, Onboarding team
  Applies to: Q Mobile / Q Fleet (React Native + Web)                                                                            
                                                                                                                                 
  ---
  1. High-Level Flow (Plain English)                                                                                             
                                                                                                                                 
  A new user signs up, describes their business model (own trucks / aggregator / both), and lands on an empty dashboard. Before
  they can run their first trip, they need four things in the system: a customer who pays, a transporter who carries, a truck    
  that moves the load, and a driver who drives it.
                                                                                                                                 
  Once those exist, the operator creates an Order (called an Indent internally), assigns it to a transporter, locks in the truck 
  and driver, and the trip starts. The driver progresses through pickup → in-transit → delivery. After delivery, a POD (Proof of
  Delivery) is submitted, which unlocks the customer invoice. The invoice triggers the settlement — what the supplier gets paid, 
  what the driver earns, and what margin the operator keeps.

  The entire system revolves around one rule: you cannot skip ahead. No trip without a route and client. No driver assignment    
  without a driver in the system. No invoice without a POD. Every gate exists to protect cash accuracy.
                                                                                                                                 
  ---             
  2. Step-by-Step User Journey
                              
  ---
  Phase 1: Authentication                                                                                                        
   
  Sign Up                                                                                                                        
                  
  Fields required:
  - Full name (owner/admin)
  - Company name (unique across platform — system checks in real time)                                                           
  - Phone (10-digit, unique — system checks in real time)             
  - Email + Password                                                                                                             
                                                                                                                                 
  Operating Model selection — shown as a single required choice during signup:                                                   
                                                                                                                                 
  ┌─────────────────────────────┬─────────────────────────────────────┐                                                          
  │           Option            │            Who it's for             │                                                          
  ├─────────────────────────────┼─────────────────────────────────────┤                                                          
  │ Own Fleet (ASSET_BASED)     │ I own trucks, hire drivers          │
  ├─────────────────────────────┼─────────────────────────────────────┤
  │ Load Aggregator (NON_ASSET) │ I book loads, don't own trucks      │                                                          
  ├─────────────────────────────┼─────────────────────────────────────┤
  │ Both (HYBRID)               │ Mix of own fleet + outsourced loads │                                                          
  └─────────────────────────────┴─────────────────────────────────────┘                                                          
   
  ▎ UX note: This choice determines which tabs/features are visible post-login. HYBRID is the default and shows everything. Don't
  ▎  hide this or make it a settings page — it shapes the entire first session.
                                                                                                                                 
  Post-signup: System creates the organization, assigns the user as Admin, and lands them on an empty dashboard with a guided    
  setup prompt.
                                                                                                                                 
  Login / Forgot Password

  Standard Supabase Auth. Session persists via SecureStore (native) / AsyncStorage (web). No action needed here beyond standard  
  implementation.
                                                                                                                                 
  ---             
  Phase 2: Organization Setup
                                                                                                                                 
  What's needed before first trip:
  - Company profile is auto-created at signup (company name, phone, email, operating model)                                      
  - No additional branch/location setup is required to start operating                                                           
  - Branding (logo, colors) is optional and can be done later         
                                                                                                                                 
  ▎ UX rule: Do not force branding setup during onboarding. It adds friction with zero operational value for the first trip.     
                                                                                                                                 
  ---                                                                                                                            
  Phase 3: Master Data Setup (Critical — Order Matters)                                                                          
                                                                                                                                 
  This is the most common point of failure for new users. They want to create a trip immediately but hit walls because the
  required entities don't exist yet. A guided checklist shown on first login solves this.                                        
                  
  Correct Setup Order and Why                                                                                                    
                  
  1. Client  →  2. Supplier  →  3. Vehicle  →  4. Driver
                                                                                                                                 
  Why this exact order:                                                                                                          
                                                                                                                                 
  ┌──────┬──────────┬───────────────────┬────────────────────────────────────────────────────────────────────────────────────┐   
  │ Step │  Entity  │    Depends on     │                                     Why first                                      │
  ├──────┼──────────┼───────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ 1    │ Client   │ Nothing           │ A trip must have a paying party. Client name/price is required at trip creation.   │
  ├──────┼──────────┼───────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ 2    │ Supplier │ Nothing (can be   │ Trips need a transporter. Supplier rate is set at trip level, but the supplier     │   
  │      │          │ same org)         │ must exist to be linked.                                                           │   
  ├──────┼──────────┼───────────────────┼────────────────────────────────────────────────────────────────────────────────────┤   
  │ 3    │ Vehicle  │ Supplier (if not  │ A vehicle belongs to a fleet. For own-fleet operators, vehicles belong to their    │   
  │      │          │ own fleet)        │ org. For aggregators, the supplier must exist first.                               │
  ├──────┼──────────┼───────────────────┼────────────────────────────────────────────────────────────────────────────────────┤   
  │      │          │ Vehicle (for      │ Driver is assigned to a trip that already has a vehicle. Compensation rates (per   │
  │ 4    │ Driver   │ assignment)       │ trip, per km, or %) are set at driver creation — they feed directly into           │   
  │      │          │                   │ settlement calculations.                                                           │
  └──────┴──────────┴───────────────────┴────────────────────────────────────────────────────────────────────────────────────┘   
                  
  ▎ Critical note: Driver compensation rates (payable_amount, commission_percent, commission_per_km) are set at driver creation  
  ▎ but are not snapshotted at trip assignment time. If rates change after assignment, settlement uses the new rates. Warn 
  ▎ operators of this explicitly in the driver edit screen.                                                                      
                  
  ---
  3A. Add Client (Shipper / Customer)
                                                                                                                                 
  What the system calls it: Client
  What to call it in UI: Customer                                                                                                
                                                                                                                                 
  Required fields:                                                                                                               
  - Contact name                                                                                                                 
  - Phone number (unique per org)
                                 
  Optional but recommended:
  - Company name                                                                                                                 
  - Email       
  - GST number / PAN (needed later for invoice generation)                                                                       
                  
  Smart features available:                                                                                                      
  - If the customer is also on the Q platform, search by phone and send a Connection Request instead of creating a new record —
  this enables shared ledger and live payment visibility between both parties.                                                   
  - System auto-derives display name: Company name → Contact name → "Client"  
                                                                                                                                 
  ---                                                                                                                            
  3B. Add Supplier (Transporter / Fleet Owner)
                                                                                                                                 
  What the system calls it: Supplier
  What to call it in UI: Transporter                                                                                             
                  
  Required fields:
  - Phone number

  Optional but recommended:
  - Company name / Contact person
  - Supplier type: Integrated (on platform), Offline (not on platform), Marketplace                                              
                                                                                   
  Same connection flow as Client: If the transporter is on Q, search and connect — their vehicles and drivers become visible to  
  you for assignment.                                                                                                            
                                                                                                                                 
  ---                                                                                                                            
  3C. Add Vehicle (Truck)
                                                                                                                                 
  What the system calls it: Vehicle
  What to call it in UI: Truck / Vehicle                                                                                         
                  
  Required fields:
  - Registration number (unique per org)
                                        
  Optional but recommended:
  - Vehicle type (Truck / HCV / LCV / Mini Truck)                                                                                
  - Capacity (tons)                              
  - Brand, model, body type                                                                                                      
                                                                                                                                 
  Vehicle source:
  - Own Fleet → type = owned (your org's asset)                                                                                  
  - Partner Vehicle → type = adhoc (borrowed/hired, tracked separately)                                                          
                                                                       
  Documents (RC, Insurance, Permit, Fitness) can be uploaded at any time — don't block setup on this.                            
                                                                                                                                 
  ---                                                                                                                            
  3D. Add Driver                                                                                                                 
                  
  What the system calls it: Driver
  What to call it in UI: Driver

  Required fields:
  - Name
  - Phone number

  Optional but critical for finance:                                                                                             
  - Compensation model — choose ONE:
    - Fixed per trip (payable_amount)                                                                                            
    - Commission % of trip value (commission_percent)
    - Per-km rate (commission_per_km)                                                                                            
   
  Invite flow:                                                                                                                   
  - If driver has the Q Driver app: system sends an in-app invite — driver accepts and is linked
  - If not: driver row is created without app link; can be linked later when they download the app                               
                                                                                                  
  ▎ UX rule: Show compensation setup as a separate, clearly labelled section ("How do you pay this driver?"). Most operators skip
  ▎  it on first add — remind them it affects settlement accuracy.                                                               
                                                                                                                                 
  ---                                                                                                                            
  Phase 4: Operations — Create & Assign
                                                                                                                                 
  4A. Create an Order (Indent)
                                                                                                                                 
  What the system calls it: Indent
  What to call it in UI: Order / Load Order

  Required fields:
  - Pickup location
  - Drop location                                                                                                                
  - Customer (client) name
  - Customer rate (what customer pays you)                                                                                       
  - Supplier target (what you plan to pay the transporter)
                                                                                                                                 
  Optional (required only to share to marketplace):                                                                              
  - Vehicle type required                                                                                                        
  - Load type required                                                                                                           
  - Weight required (0.01–1,000 tons)                                                                                            
  - Pickup date                                                                                                                  
                                                                                                                                 
  Two save modes:                                                                                                                
  - Save as Draft — editable, not visible to anyone                                                                              
  - Share / Broadcast — locked for editing, visible to suppliers/marketplace                                                     
                                                                            
  Circulation options (who sees the order):                                                                                      
  - Integrated Suppliers — only your connected transporters (default)                                                            
  - Marketplace — all Q marketplace participants                                                                                 
  - Offline — for your records only                                                                                              
  - Both — integrated + marketplace                                                                                              
                                                                                                                                 
  ▎ UX rule: Default to "Integrated Suppliers" — most first-time users don't intend to post publicly. Make "Marketplace" a 
  ▎ deliberate opt-in with a one-line explanation of what it means.                                                              
                  
  ---                                                                                                                            
  4B. Create a Trip (from an Order or directly)
                                                                                                                                 
  A Trip is the operational record of a load movement. It can be created:
  - From an accepted indent/order (links trip.indent_id)                                                                         
  - Directly (standalone trip)                                                                                                   
                                                                                                                                 
  Required fields:                                                                                                               
  - Pickup location
  - Drop location  
  - Customer name
  - Customer rate (client_price)
  - Supplier rate (supplier_rate)                                                                                                
                                 
  Assignment fields (can be set now or later):                                                                                   
  - Supplier                                                                                                                     
  - Vehicle (truck)
  - Driver                                                                                                                       
                                                                                                                                 
  Auto-calculated:
  - Margin = Customer rate − Supplier rate                                                                                       
  - Platform fee, Driver commission (from driver's compensation model)                                                           
   
  Trip statuses in order:                                                                                                        
                  
  assigned → in_progress → at_drop → completed                                                                                   
                                                                                                                                 
  ┌─────────────┬──────────────────────────────────────┬───────────────────────────────────┐
  │   Status    │            Plain English             │           Who triggers            │                                     
  ├─────────────┼──────────────────────────────────────┼───────────────────────────────────┤
  │ assigned    │ Driver has been told about this trip │ Operator (at creation or after)   │
  ├─────────────┼──────────────────────────────────────┼───────────────────────────────────┤
  │ in_progress │ Truck has left the pickup point      │ Driver (app) or Operator (manual) │                                     
  ├─────────────┼──────────────────────────────────────┼───────────────────────────────────┤                                     
  │ at_drop     │ Truck has arrived at delivery        │ Driver (app) or Operator (manual) │                                     
  ├─────────────┼──────────────────────────────────────┼───────────────────────────────────┤                                     
  │ completed   │ Delivery confirmed                   │ Driver (app) or Operator (manual) │
  └─────────────┴──────────────────────────────────────┴───────────────────────────────────┘                                     
                  
  ---                                                                                                                            
  4C. Assign Supplier, Vehicle, Driver
                                                                                                                                 
  All three can be assigned at trip creation or updated later. The system allows partial assignment — you can create a trip with
  just the customer and route, then assign the truck and driver when confirmed.                                                  
   
  ▎ UX rule: Show assignment fields as a collapsible "Assign Transport" section below the required fields. Don't block trip      
  ▎ creation on it — operators often finalize transport after confirming the order with the customer.
                                                                                                                                 
  ---             
  Phase 5: Trip Execution
                         
  Driver Flow (Driver App)
                                                                                                                                 
  ┌──────────────────────────────────────────────┬────────────────────────────────────────────────────┐                          
  │                Driver Action                 │                System State Change                 │                          
  ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                          
  │ Opens trip in app                            │ Views assigned trip details                        │
  ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ Taps "Start Trip" at pickup                  │ in_progress; started_at timestamp set              │
  ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                          
  │ Taps "Arrived at Drop"                       │ at_drop                                            │
  ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                          
  │ Uploads POD photo + taps "Complete Delivery" │ completed; completed_at set; pod_status → received │
  └──────────────────────────────────────────────┴────────────────────────────────────────────────────┘                          
   
  Operator Override (Web / Admin)                                                                                                
                  
  Operators can manually advance any trip status through manualAdvanceTrip. This is the fallback when the driver doesn't have the
   app or connectivity fails.
                                                                                                                                 
  ▎ Critical UX gap: There is no offline queue for driver-submitted expenses (fuel, toll). If a driver records an expense        
  ▎ offline, it is lost — there is no local buffer that syncs on reconnect. Until this is fixed, the operator screen should show 
  ▎ a banner: "Driver expense entries require internet connection."                                                              
                  
  ---
  Phase 6: Financials

  6A. Cash Flow Entries

  Every payment in or out is a ledger entry. The system uses a logical double-entry model but presents it as simple cash in /    
  cash out.
                                                                                                                                 
  Entry types:    

  ┌──────────────────────┬──────────────────────────┬───────────────────────────────┐                                            
  │    What happened     │         UI label         │           Direction           │
  ├──────────────────────┼──────────────────────────┼───────────────────────────────┤                                            
  │ Customer paid you    │ "Received from Customer" │ Cash IN (amount_in)           │
  ├──────────────────────┼──────────────────────────┼───────────────────────────────┤
  │ You paid transporter │ "Paid to Transporter"    │ Cash OUT (amount_out)         │                                            
  ├──────────────────────┼──────────────────────────┼───────────────────────────────┤                                            
  │ Driver advance       │ "Driver Advance"         │ Cash OUT, contact_type=driver │                                            
  ├──────────────────────┼──────────────────────────┼───────────────────────────────┤                                            
  │ Fuel expense         │ "Fuel"                   │ Cash OUT, vehicle_expense     │
  ├──────────────────────┼──────────────────────────┼───────────────────────────────┤                                            
  │ Toll expense         │ "Toll"                   │ Cash OUT, vehicle_expense     │
  └──────────────────────┴──────────────────────────┴───────────────────────────────┘                                            
                  
  Linking entries to trips: Every entry should have a trip_id. Without it, the expense is recorded at the organization level and 
  never deducted from any trip's P&L. System should make trip linkage the default, not optional.
                                                                                                                                 
  6B. Revenue & Expense Tracking

  - Revenue = sum of amount_in entries linked to this trip                                                                       
  - Expense = sum of amount_out entries linked to this trip
  - Profit = Revenue − Expense                                                                                                   
  - Margin % = (Profit / Revenue) × 100
                                                                                                                                 
  This is computed dynamically — no stored balance. Changing or deleting an entry immediately updates all dashboards.            
                                                                                                                                 
  6C. Proof of Delivery (POD)                                                                                                    
                  
  What it unlocks: POD received (pod_status = received) is the gate for invoice generation. No POD = no invoice.                 
   
  POD submission flow:                                                                                                           
  1. Driver submits photos via app on trip completion
  2. Operator marks POD received in reconciliation screen                                                                        
  3. Trip moves to pod_status = received + invoice_status_1 = pending
  4. Trip appears in "Ready for Invoice" tab                                                                                     
                                                                                                                                 
  6D. Customer Invoice                                                                                                           
                                                                                                                                 
  Triggered when: 
  - pod_status = received                                                                                                        
  - invoice_status_1 = pending or data shared (not yet raised)                                                                   
  - No invoice_no set yet
                                                                                                                                 
  Invoice includes:
  - Trip details (route, date, amount)                                                                                           
  - Optional GST                                                                                                                 
  - Optional fuel surcharge
  - Custom additional charges                                                                                                    
                             
  After invoice generated: invoice_no set (format: #INV-YYYY-MM##), invoice_status_1 = Raised                                    
                                                                                                                                 
  ▎ Known limitation: Invoice is a point-in-time generation — it updates trips.invoice_no and logs to activity_logs, but does NOT
  ▎  lock the trip's amount fields. If a trip's client_price is edited after invoice, the invoice and the ledger diverge. Add a  
  ▎ UI warning/lock on amount fields once a trip is invoiced.                                                                    
                  
  6E. Driver Settlement                                                                                                          
   
  Settlement is a driver_ledger entry of type settlement. It represents what the driver earned for a completed trip.             
                  
  Correct settlement calculation should be:                                                                                      
  Settlement = driver_commission (from trip) − advances already deducted
                                                                                                                                 
  ▎ Current gap: Fuel/toll expenses recorded in the expenses table are NOT automatically deducted from driver settlement. The    
  ▎ settlement reads driver_ledger only, not expenses. Operators must manually create a type=reimbursement adjustment entry. This
  ▎  must be surfaced clearly in the settlement screen — show a line: "Unreconciled expenses: ₹500 (Fuel) — add to settlement?"  
                                                                                                                                 
  ---             
  3. Entity Relationship Logic
                                                                                                                                 
  Organization
      │                                                                                                                          
      ├── Clients (Customers who give you loads)
      │       └── pays → Trip (client_price)                                                                                     
      │
      ├── Suppliers (Transporters who carry your loads)                                                                          
      │       └── assigned to → Trip (supplier_rate)                                                                             
      │
      ├── Vehicles (Trucks, owned or adhoc)                                                                                      
      │       └── assigned to → Trip (vehicle_id)                                                                                
      │
      ├── Drivers (People who drive trucks)                                                                                      
      │       ├── assigned to → Trip (driver_id)                                                                                 
      │       └── earns → Driver Ledger (settlement entries)
      │                                                                                                                          
      ├── Orders/Indents (Load requests you broadcast)
      │       └── converts to → Trip (indent_id)                                                                                 
      │           
      ├── Trips (The operational unit — every shipment)                                                                          
      │       ├── generates → Ledger Entries (revenue, expenses)                                                                 
      │       ├── produces → POD (proof of delivery)
      │       └── triggers → Invoice (to client)                                                                                 
      │           
      └── Ledger (Every rupee in/out, linked to trips)                                                                           
                                                                                                                                 
  In plain English:                                                                                                              
  - A Customer gives you a load order and agrees on a rate                                                                       
  - A Transporter carries that load at a lower rate — your margin is the difference                                              
  - A Truck (Vehicle) is assigned to the trip — tracked for health, docs, and P&L per vehicle
  - A Driver drives that truck — their advance, fuel costs, and commission are all tracked                                       
  - An Order is your pre-trip negotiation record — it becomes a Trip once confirmed                                              
  - A Trip is where money moves: the customer owes you, you owe the transporter, and you owe the driver                          
  - The Ledger records every payment — who paid, how much, for which trip                                                        
                                                                                                                                 
  ---                                                                                                                            
  4. UX Rules                                                                                                                    
                                                                                                                                 
  What Must Be Present Before Each Step
                                                                                                                                 
  ┌─────────────────────────┬──────────────────────────────────────────────────────┬────────────────────────────────────────┐    
  │         Action          │                  Hard requirements                   │ Soft requirements (warn, don't block)  │  
  ├─────────────────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────┤    
  │ Create Trip             │ Pickup location, Drop location, Customer name,       │ Supplier, Vehicle, Driver (assignable  │  
  │                         │ Customer rate                                        │ later)                                 │  
  ├─────────────────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────┤    
  │ Share Order to          │ All above + Vehicle type, Load type, Weight          │ Pickup date                            │    
  │ Marketplace             │                                                      │                                        │    
  ├─────────────────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────┤    
  │ Assign Driver           │ Driver must exist in system                          │ Driver must have compensation set      │
  ├─────────────────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────┤    
  │ Generate Invoice        │ POD received, Trip completed                         │ GST number on client record            │
  ├─────────────────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────┤    
  │ Create Ledger Entry     │ Trip should exist (link it)                          │ Description, category                  │
  └─────────────────────────┴──────────────────────────────────────────────────────┴────────────────────────────────────────┘    
                  
  What Should Be Locked / Disabled                                                                                               
                  
  ┌─────────────────────────┬────────────────────────┬──────────────────────────────────────────────────────────────────────┐    
  │         Element         │     Lock condition     │                           Message to show                            │ 
  ├─────────────────────────┼────────────────────────┼──────────────────────────────────────────────────────────────────────┤    
  │ Order / Indent fields   │ After status =         │ "This order has been shared and cannot be edited"                    │ 
  │                         │ broadcast              │                                                                      │ 
  ├─────────────────────────┼────────────────────────┼──────────────────────────────────────────────────────────────────────┤    
  │ Trip amount fields      │ After invoice_no is    │ "Invoice has been raised — contact admin to edit amount"             │    
  │                         │ set                    │                                                                      │    
  ├─────────────────────────┼────────────────────────┼──────────────────────────────────────────────────────────────────────┤    
  │ Driver rate fields      │ During an active trip  │ "Driver is currently on a trip — rate changes will apply to the next │ 
  │                         │                        │  trip"                                                               │    
  ├─────────────────────────┼────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Invoice generation      │ pod_status ≠ received  │ "POD must be received before raising invoice"                        │    
  │ button                  │                        │                                                                      │
  └─────────────────────────┴────────────────────────┴──────────────────────────────────────────────────────────────────────┘    
                  
  Smart Defaults & Auto-fill

  ┌──────────────────────────────┬─────────────────────────────────────────────────────────┬────────────────────────────────┐    
  │            Field             │                      Smart default                      │             Source             │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤    
  │ Trip supplier_rate           │ Pre-fill from linked Order's supplier_target            │ Indent → Trip copy             │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
  │ Trip client_price            │ Pre-fill from linked Order's client_price               │ Indent → Trip copy             │    
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
  │ Ledger entry                 │ Today                                                   │ System                         │    
  │ transaction_date             │                                                         │                                │    
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
  │ Ledger entry party_name      │ Auto-fill from linked trip's client/supplier            │ Trip context                   │    
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
  │ Driver settlement amount     │ Pre-calculate from driver_commission − recorded         │ Derived                        │    
  │                              │ advances                                                │                                │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤    
  │ Invoice #INV number          │ Auto-generate                                           │ #INV-YYYY-MM + 2-digit         │
  │                              │                                                         │ sequence                       │    
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
  │ New Driver commissionPercent │ Show org's typical rate as placeholder                  │ Org settings (future)          │
  └──────────────────────────────┴─────────────────────────────────────────────────────────┴────────────────────────────────┘    
   
  Error Prevention                                                                                                               
                  
  - Duplicate vehicle check: On vehicle number entry, check uniqueness live (debounced) — show inline error, not form submission 
  failure         
  - Duplicate phone check: Same for client and driver phone — real-time inline validation                                        
  - Negative margin warning: If supplier_rate > client_price at trip creation, show a yellow banner: "This trip will run at a    
  loss (−₹X)" — don't block, just warn                                                                                           
  - Unsaved advance alert: When generating settlement, check if any driver_advances have no trip_id — show: "₹X in advances are  
  not linked to any trip and will not be deducted automatically"                                                                 
  - Offline expense alert: Show a persistent banner on the expense entry screen when isConnected = false: "You're offline. 
  Expense entries will not be saved until you reconnect."                                                                        
                  
  ---                                                                                                                            
  5. First-Time User Golden Path
                                
  Goal: Complete the first successful trip in the minimum number of steps.
                                                                                                                                 
  Step 1  ─  Sign Up
             • Full name, Company name, Phone, Email, Password                                                                   
             • Operating model: select "Both" (HYBRID) to see all features                                                       
             ↓                                                                                                                   
  Step 2  ─  Add one Customer                                                                                                    
             • Contact name + Phone (2 fields)                                                                                   
             ↓    
  Step 3  ─  Add one Transporter (or use own org)                                                                                
             • Contact name + Phone (2 fields)                                                                                   
             ↓
  Step 4  ─  Add one Truck                                                                                                       
             • Registration number (1 field)                                                                                     
             ↓
  Step 5  ─  Add one Driver                                                                                                      
             • Name + Phone + set compensation (3 fields minimum)
             ↓                                                                                                                   
  Step 6  ─  Create a Trip
             • Pickup + Drop + Customer (pre-filled) + Rates                                                                     
             • Assign Truck + Driver in same form
             ↓                                                                                                                   
  Step 7  ─  Advance the Trip Status
             • Mark "In Transit" → "At Drop" → "Completed"                                                                       
             ↓                                                                                                                   
  Step 8  ─  Submit POD                                                                                                          
             • Upload delivery proof or mark received manually                                                                   
             ↓                                                                                                                   
  Step 9  ─  Generate Invoice
             • Select trip → Generate Invoice → Download PDF                                                                     
             ↓                                                                                                                   
  Step 10 ─  Record Payment Received
             • Add ledger entry: Cash IN, link to trip                                                                           
             ↓                                                                                                                   
           ✓  First trip complete. P&L visible on dashboard.
                                                                                                                                 
  Minimum entities created: 1 Customer + 1 Transporter + 1 Truck + 1 Driver                                                      
  Minimum screens touched: 6                                                                                                     
  Minimum time (ideal): ~8 minutes for a non-technical user with guidance                                                        
                                                                                                                                 
  ---                                                                                                                            
  6. Common Mistakes & UX Fixes                                                                                                  
                                                                                                                                 
  ┌─────────────────────────────┬────────────────────────────┬──────────────────────────────────────────────────────────────┐ 
  │           Mistake           │         Root cause         │                             Fix                              │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤ 
  │ User creates a trip but     │ Driver doesn't exist yet   │ On the driver assignment dropdown, show "+ Add New Driver"   │ 
  │ can't assign a driver       │                            │ inline — don't send them to another screen                   │ 
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤    
  │ Driver advance not linked   │ trip_id is optional in the │ Default the trip picker to the driver's current active trip; │ 
  │ to any trip                 │  form                      │  make it required if driver has one active trip              │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤ 
  │ Expense recorded but never  │ Expense entry has no       │ Make trip linkage the first field, not the last — pre-fill   │    
  │ shows in trip P&L           │ trip_id                    │ from context when accessed from trip detail                  │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤ 
  │ Invoice generated before    │ System blocks it, but user │ Add a tooltip on the greyed-out "Generate Invoice" button    │    
  │ POD                         │  doesn't know why          │ explaining exactly what's missing                            │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤ 
  │ Settlement doesn't match    │ Fuel/toll expenses not     │ Show "Expenses not in settlement" reconciliation prompt      │    
  │ driver expectation          │ deducted                   │ before confirming settlement                                 │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤ 
  │ User tries to edit a        │ Fields are disabled but no │ Show a persistent banner: "This order has been shared.       │    
  │ broadcast order             │  explanation               │ Create a new order to make changes."                         │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Two users create duplicate  │ No org-wide duplicate      │ On phone number entry, fuzzy-check existing clients and      │    
  │ clients                     │ warning                    │ show: "Did you mean [X]?"                                    │    
  ├─────────────────────────────┼────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ User doesn't understand     │ Logistics jargon           │ Replace with "Your Profit" and show it as a green/red number │    
  │ "margin"                    │                            │  inline as rates are typed                                   │    
  └─────────────────────────────┴────────────────────────────┴──────────────────────────────────────────────────────────────┘
                                                                                                                                 
  ---             
  7. Terminology Improvements
                             
  ┌────────────────────┬────────────────────┬─────────────────────────────┬─────────────────────────────────────────────────┐
  │ System / Internal  │     Current UI     │     Recommended UI Term     │                       Why                       │    
  │        Term        │                    │                             │                                                 │
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤    
  │ Indent             │ Indent             │ Order or Load Order         │ "Indent" is industry jargon; "Order" is         │
  │                    │                    │                             │ universally understood                          │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Client             │ Client             │ Customer                    │ More natural for small fleet operators          │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤    
  │ Supplier           │ Supplier           │ Transporter                 │ Operators say "transporter" or "truck owner",   │
  │                    │                    │                             │ not "supplier"                                  │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Vehicle            │ Vehicle            │ Truck (primary) / Vehicle   │ Operators say "truck" — use "Vehicle" only in   │    
  │                    │                    │ (secondary)                 │ forms that need to cover LCV/mini-truck         │
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤    
  │ Driver Payable     │ Driver Payable     │ Driver's Earning            │ "Payable" is accounting term; operators ask     │
  │                    │                    │                             │ "what does the driver get?"                     │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Amount In / Amount │ Amount In / Amount │ Money Received / Money Paid │ Finance jargon; plain language reduces data     │    
  │  Out               │  Out               │                             │ entry errors                                    │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ POD                │ POD                │ Delivery Proof (+ tooltip:  │ POD is understood in logistics but not by all   │    
  │                    │                    │ "Proof of Delivery")        │ operators                                       │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Consignor /        │ (not shown in UI   │ Pickup Party / Delivery     │ If these fields are ever surfaced, avoid        │    
  │ Consignee          │ currently)         │ Party                       │ consignment terminology                         │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Broadcast          │ Broadcast          │ Share to Transporters       │ Action-oriented, explains what happens          │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤    
  │ Settlement         │ Settlement         │ Pay Driver                  │ Direct and action-oriented for the trigger      │
  │                    │                    │                             │ action                                          │    
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤
  │ Circulation Target │ Circulation Target │ Who can see this order?     │ The current label is completely opaque to       │    
  │                    │                    │                             │ operators                                       │
  ├────────────────────┼────────────────────┼─────────────────────────────┼─────────────────────────────────────────────────┤    
  │ operating_model    │ Operating Model    │ How do you run your         │ The form question should be a question, not a   │
  │                    │                    │ business?                   │ field label                                     │    
  └────────────────────┴────────────────────┴─────────────────────────────┴─────────────────────────────────────────────────┘
                                                                                                                                 
  ---             
  Document version: 1.0 — grounded in Q Mobile codebase (Expo SDK 54, Supabase). All entity fields, statuses, and flows validated
   against live service files.  