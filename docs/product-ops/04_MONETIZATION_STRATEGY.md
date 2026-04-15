# Q Mobile: First Monetization Strategy

*How to convert Q Mobile's transport data into a defensible moat and revenue stream.*

## 1. SaaS Pricing (The Baseline)
**Model:** Freemium with Usage-Based Tiers.

- **Free Tier:** 
  - Up to 20 trips/month.
  - Basic Indent and Trip tracking.
  - Manual expense logging.
  - *Goal: Hook the fleet owner, establish daily habit.*

- **Pro Tier (₹XXX / month or per-truck):** 
  - Unlimited trips.
  - Automated settlements and driver payout calculations.
  - Advanced Finance tab access (`app/(tabs)/finance.tsx`).
  - *Goal: Monetize the operational efficiency gained by mid-sized fleets.*

## 2. Embedded Finance (The Real Moat)
*Once Q Mobile tracks all cash flows, we become the source of truth for credit.*

### A. Working Capital Credit (Invoice Factoring)
- **Problem:** Customers take 30-60 days to pay invoices, but fleet owners must pay drivers and fuel today.
- **Solution:** Offer instant cash against verified Trips/Invoices inside the app.
- **Data Moat:** We know exactly which Customers pay on time because we track *Payment Delay Days*. We can risk-score invoices better than any bank.
- **Revenue:** Take a 1.5% - 3% fee on advanced invoices.

### B. Fleet Cards & Fuel Integration
- **Problem:** Cash advances to drivers are prone to leakage and fraud.
- **Solution:** Issue branded Prepaid Cards or partner with Fastag/Fuel providers.
- **Data Moat:** The app automatically restricts card usage to the specific route and timeframe of the active Trip.
- **Revenue:** Interchange fees + vendor kickbacks on fuel/toll spend.

### C. Driver Risk Scoring
- **Problem:** Fleet owners don't know if a new driver is reliable.
- **Solution:** A unified "Driver Trust Score" based on their history across the entire network (on-time deliveries, accurate expense reporting, no cash mismatches).
- **Revenue:** Charge fleet owners for premium background/risk checks before hiring.

## 3. Phase 1 Execution Plan
1. **Months 1-3:** Focus 100% on **Trust** (Zero cash mismatch, 100% settlement accuracy). Completely free to use.
2. **Months 4-6:** Introduce **SaaS Pricing** for fleets > 5 trucks.
3. **Months 7-12:** Launch pilot for **Invoice Factoring** with 10 high-usage, high-trust fleet owners.
