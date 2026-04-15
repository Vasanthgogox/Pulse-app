# Q Mobile: AI Testing Engine & Prompts

*Use these templates with your Claude CLI to automatically test and audit the Q Mobile app's logic.*

### How to use with Claude CLI
You can copy these prompts directly into the Claude CLI or save them as text files and pipe them in:
```bash
cat prompt.txt | claude --stdin
```

---

## 1. User Simulation Prompt (Fleet Owner / Dispatcher)
**Purpose:** Understand edge cases from the perspective of a unified dispatcher & fleet owner.

**Prompt:**
> "Act as an Indian transport fleet owner and dispatcher managing 20 trucks and 50 trips a month using the Q-unified-base platform. You handle Indents from Customers, assign Trips to Vehicles/Drivers, give Driver Advances, track Route Expenses, and manage Final Settlements. Simulate 3 major frustrations or edge cases you would face in finance tracking and driver payments when a trip gets delayed or canceled mid-route."

## 2. Workflow Stress Test
**Purpose:** Break the core app lifecycle.

**Prompt:**
> "Simulate the full Q Mobile lifecycle: 
> Customer Indent → Trip Creation → Driver Assignment → Driver Advance → En-route Expenses (Toll/Fuel) → Proof of Delivery → Customer Invoice → Driver Settlement.
> Identify exactly where the system is most likely to break regarding cash flow tracking or state mismatches. What happens if a driver records fuel expenses offline and syncs after the settlement is already generated?"

## 3. Fraud / Leakage Detector
**Purpose:** Find security and financial holes in the `services/` logic.

**Prompt:**
> "Analyze the Q-unified-base mobile logistics architecture. List 5 specific ways a driver, dispatcher, or supplier could exploit this system financially. Focus on:
> - Manipulating trip expenses
> - Double-counting advances
> - Modifying customer invoices
> - Falsifying Proof of Delivery
> How should our React Native app and Supabase backend defend against these?"

## 4. Product Critic (Brutally Honest)
**Purpose:** Prevent blind spots in product-market fit.

**Prompt:**
> "Why will a unified logistics and finance OS (Q Mobile) fail for SME transport businesses in India? Be brutally honest about the realities of cash transactions, driver tech literacy, offline areas, and trust issues. What are the top 3 fatal assumptions we might be making?"

## 5. Scale Simulation
**Purpose:** Technical and operational scaling limits.

**Prompt:**
> "What breaks in our React Native / Supabase architecture when we scale from 10 fleet owners to 1,000 fleet owners? Consider:
> - Offline data synchronization for Trips and Expenses
> - Supabase Realtime limits on the Finance tab
> - App performance with thousands of historical trips on the `app/(tabs)/trips.tsx` list
> Give me a 3-step technical mitigation plan."

## 6. Weekly Consolidation (Run on Saturdays)
**Purpose:** Decide what to build next week.

**Prompt:**
> "Here are the bugs and user feedback from this week:
> [PASTE BUGS/FEEDBACK HERE]
> Based on these, if my non-negotiable is 'Cash in/out tracking accuracy and Trip-finance linkage', what should be my single highest engineering priority for next week?"
