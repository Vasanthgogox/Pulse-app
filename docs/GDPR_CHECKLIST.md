# GDPR checklist (fleet / HR data)

Use this when the app processes **personal data** of individuals in the EU/EEA (e.g. drivers, contacts, salary, trip history). Align with your DPA and legal advice.

## 1. Lawful basis and consent

| Check | Status | Notes |
|-------|--------|--------|
| Lawful basis documented (contract, consent, legitimate interest) | ⏳ | Document for each processing purpose (e.g. driver employment, trip execution). |
| Consent where required (e.g. marketing, non-essential data) | ⏳ | If you rely on consent, ensure it’s explicit, granular, and revocable. |
| Consent not bundled with terms; opt-in for non-essential | ⏳ | Separate consent for optional processing. |

## 2. Transparency and notices

| Check | Status | Notes |
|-------|--------|--------|
| Privacy notice / policy available to users | ⏳ | Explain what data you collect, why, how long, and rights. |
| Notice covers: identity of controller, purposes, legal basis, retention, rights, complaints | ⏳ | Standard GDPR Art. 13/14 elements. |
| In-app or sign-up flow points to policy | ⏳ | Link in sign-in, sign-up, or settings. |

## 3. Data subject rights

| Check | Status | Notes |
|-------|--------|--------|
| **Access (Art. 15):** User can request a copy of their data | ⏳ | Export or backend endpoint to return personal data for the requesting user. |
| **Rectification (Art. 16):** User can correct their data | ✅ | Profile and in-app edits where applicable. |
| **Erasure (Art. 17):** User can request deletion | ⏳ | Process and policy for delete requests; retain only where legally required. |
| **Portability (Art. 20):** Export in machine-readable form | ⏳ | Tied to access/export (e.g. JSON or CSV). |
| **Object / restrict (Art. 21, 18):** Process and document | ⏳ | How you handle objections and restriction requests. |
| Response within 1 month (extendable to 3 with justification) | ⏳ | Internal SLA for responding to requests. |

## 4. Data protection by design

| Check | Status | Notes |
|-------|--------|--------|
| Minimisation: only necessary data collected | ✅ | App and schema collect what’s needed for fleet/ops. |
| Access control (RLS, capabilities) | ✅ | Supabase RLS; capability-based UI. |
| Secure storage (session in SecureStore where available) | ✅ | See `lib/supabase.ts` and security checklist. |
| PII screens documented; screenshot policy | ✅ | `docs/PII_AND_SCREEN_POLICY.md`. |

## 5. Retention and deletion

| Check | Status | Notes |
|-------|--------|--------|
| Retention periods defined per data category | ⏳ | e.g. trip history 7 years for tax; logs 90 days. |
| Deletion process for user data on erasure request | ⏳ | Cascade or manual steps; document in runbook. |
| After deletion, no reuse; backups handled per policy | ⏳ | Define backup retention and anonymisation/deletion. |

## 6. Processors and transfers

| Check | Status | Notes |
|-------|--------|--------|
| Processors listed (e.g. Supabase, Google, Sentry) | ⏳ | Maintain a processor list and DPAs. |
| Transfers outside EEA: SCCs or adequacy | ⏳ | Supabase/Google may process in US; ensure SCCs in place. |

## 7. Incidents and DPO

| Check | Status | Notes |
|-------|--------|--------|
| Breach procedure (detect, assess, notify SA within 72h, notify data subjects if high risk) | ⏳ | Internal procedure. |
| DPO designated if required (Art. 37) | ⏳ | Required for certain processing; otherwise optional. |

---

**Summary:** Implement access/export and erasure flows, document lawful basis and retention, and keep processor list and DPAs up to date. Use this checklist alongside `docs/SECURITY_CHECKLIST.md` and your legal/compliance team.
