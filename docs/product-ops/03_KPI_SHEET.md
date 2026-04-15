# Q Mobile: Core KPI Dashboard

*Metrics to track the health of the Q Mobile transport finance OS.*

## 1. Financial Trust Metrics (Non-Negotiables)
*If these fail, the product dies.*

| Metric | Target | Description |
|--------|--------|-------------|
| **Cash Mismatch Rate** | < 0.1% | % of trips where (Advances + Expenses + Final Payment) != Expected Total |
| **Complete Settlement %** | > 95% | % of trips fully settled within 48 hours of Proof of Delivery (POD) |
| **Payment Delay Days** | < 3 days | Average time from Invoice generation to Customer Payment receipt |
| **Leakage Incidents** | 0 | Count of unauthorized expense modifications post-settlement |

## 2. Usage & Habit Metrics (Stickiness)
*Do they actually use it daily?*

| Metric | Target | Description |
|--------|--------|-------------|
| **DAU/MAU (Dispatchers)**| > 70% | Daily active unified dispatchers / fleet owners |
| **Trips Logged per User** | > 15/wk | Average trips created and managed per active fleet owner |
| **Finance Tab Views** | > 5/day | How often users check `app/(tabs)/finance.tsx` per day |
| **Driver App Interactions**| > 4/trip | Driver logging advances, fuel, tolls, and POD per trip |

## 3. Network & Scale Metrics (Growth)
*Is the ecosystem expanding?*

| Metric | Target | Description |
|--------|--------|-------------|
| **Active Customers (Demand)** | +10%/mo | Number of distinct customers placing Indents |
| **Active Suppliers (Supply)** | +10%/mo | Number of distinct suppliers providing external vehicles |
| **Network Density** | > 2.5 | Avg number of customers/suppliers connected per fleet owner |
| **GMV Tracked** | +20%/mo | Total monetary value of trips passing through the platform |

---
**Review Cadence:** Check these metrics every Monday during the *Reality Review*.
