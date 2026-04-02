# Ops Agent — Logic & Algorithm

How the Ops Agent works under the hood: data flow, algorithms, guardrails, and where each decision is made.

---

## 1. High-level algorithm

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UI (OpsAgentScreen)                                                        │
│  • User sends message (+ optional image)                                    │
│  • runProcessMessages(messages, sessionState?, lastMessageImage?)            │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  processOpsMessage() — services/opsAgentService.ts                          │
│  1. Cancel check: if last user message matches cancel keywords → return      │
│     "Operation cancelled.", clear sessionState                               │
│  2. buildContents(): trim to last MAX_HISTORY_TURNS*2 messages; attach       │
│     lastUserMessageImage to last user turn (for OCR)                         │
│  3. buildSystemInstructionWithEntityLists(): system prompt + available       │
│     client/supplier/driver/vehicle names from opsContext                     │
│  4. Gemini generateContent (with tools) → model may return text and/or       │
│     functionCall(s)                                                          │
│  5. Tool guard layer (see below): for each function call:                    │
│     • create_* → validate args → if OK: set sessionState + requiresUiConfirm │
│       (no DB write); if invalid: toolResult.error                            │
│     • get_*   → read from opsContext → toolResult.output                     │
│  6. Follow-up Gemini call (no tools): contents + model part +               │
│     functionResponse(toolResult) → final natural-language reply             │
│  7. Return { reply, executed, sessionState?, requiresUiConfirmation?,       │
│     reportData? }                                                            │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
┌─────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────┐
│ requiresUiConfirmation │   │ reportData present      │   │ plain reply          │
│ • UI appends system   │   │ • UI appends system     │   │ • UI appends system  │
│   message with        │   │   message with          │   │   message with      │
│   pendingConfirm      │   │   reportData → card +   │   │   content only       │
│   (type + data)       │   │   PDF download          │   │ • if executed →     │
│ • sessionState stored │   │                         │   │   triggerSuccess()   │
│ • 5 min expiry check  │   │                         │   │                     │
└──────────┬───────────┘   └─────────────────────────┘   └─────────────────────┘
           │
           │  User taps "Create client" / "Add supplier" / etc.
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  executePendingCreateClient / executePendingCreateSupplier / ...             │
│  • Same validation as in service (required fields)                           │
│  • handleCreateClient / handleCreateSupplier / ... → real API (createClient,  │
│    createSupplier, ...) → DB                                                 │
│  • recordRateLimit(userId)                                                   │
│  • Return { success, message?, error?, entity?: CreatedEntitySnapshot }      │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  UI on success                                                              │
│  • Replace message’s pendingConfirm with createdPreview (type, id, data)     │
│  • Clear sessionState; show success toast                                    │
│  • User can later edit createdPreview and call handlePreviewUpdate (PATCH)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data structures (logic-relevant)

| Concept | Where | Purpose |
|--------|-------|---------|
| **OpsMessage** | `opsAgentService` | `{ role: 'user' \| 'system', content: string }` — what gets sent to Gemini. |
| **OpsSessionState** | `opsAgentService` | Holds `confirmationRequestedAt` and locked payloads (`pendingCreateClientPayload`, etc.). Returned from `processOpsMessage` and passed back on next call so expiry and payload are consistent. |
| **OpsContext** | UI build, service consume | Pre-fetched summaries: `revenueSummary`, `vehicleSummary`, `driverSummary`, `entityCounts`, `availableClientNames`, `availableSupplierNames`, `availableDriverNames`, `availableVehicleNumbers`. Built in `OpsAgentScreen` when `currentOrganization?.id` changes; passed into `processOpsMessage`. |
| **Message** (UI) | `OpsAgentScreen` | Extends OpsMessage with `attachment?`, `pendingConfirm?`, `createdPreview?`, `reportData?`. Only `role` and `content` are sent to the service. |
| **CreatedEntitySnapshot** | service + UI | `{ type, id, data }` after a successful create; used for the in-chat “created” card and for `handlePreviewUpdate` (PATCH). |
| **ChatReportData** | service + UI | `{ title, generatedAt, sections: { title, body }[] }` for report card and PDF. |

---

## 3. Tool guard layer (algorithm)

For each **function call** returned by Gemini:

1. **create_client**
   - `validateCreateClientArgs(args)`: contact_person non-empty, phone 8–15 digits, no placeholder names/phones.
   - **Idempotency:** `getClientByPhone(organizationId, phone)`; if existing → `toolResult.error`.
   - **Permission:** `canAccessClients(capabilities)`; if false → error.
   - If all pass: **do not call** `createClient`. Set `resultSessionState.pendingCreateClientPayload`, `requiresUiConfirmation = true`, `toolResult.output = { requires_ui_confirmation: true, message }`.

2. **create_supplier / create_vehicle / create_driver**
   - Same pattern: validate → permission check → set session payload + `requiresUiConfirmation`; no DB write.

3. **create_trip**
   - Validate: pickup, drop, client_name, client_price ≥ 0, supply_source (asset | aggregate); if aggregate, supplier_rate required and ≥ 0.
   - Client/supplier/driver/vehicle names are **not** re-validated against DB here; the system instruction is augmented with `availableClientNames` etc., so the model is instructed to use only those names. If the user says a name not in the list, the model should reply that they must add that entity first.

4. **get_revenue_summary / get_vehicle_details / get_driver_summary / get_entity_counts**
   - No validation. `toolResult.output = { summary: opsContext?.revenueSummary }` (or the corresponding field). No DB call; data comes from pre-fetched `opsContext`.

5. **get_report**
   - Build `reportDataForUi` from `opsContext` (revenue, entityCounts, vehicleSummary, driverSummary). Return same in `toolResult.output` and set `reportData` on the final result for the UI.

After computing `toolResult`, the service appends a **function response** part to the conversation and calls Gemini again with **no tools** (`configTextOnly`) so the model produces a short natural-language reply. The final `reply` is that text.

---

## 4. Validation rules (concise)

- **Placeholders:** Names/phones matching `PLACEHOLDER_NAMES`, `PLACEHOLDER_PHONES`, or `PLACEHOLDER_VEHICLE_NUMBERS` are rejected (e.g. "John Doe", "123-456-7890", "test").
- **Client:** contact_person required, phone 8–15 digits, duplicate phone → error.
- **Supplier:** phone required and valid; at least one of company_name or contact_person.
- **Vehicle:** vehicle_number required, not placeholder.
- **Driver:** name, phone, license_number required; phone valid; license length ≥ 5.
- **Trip:** pickup_area, drop_location, client_name, client_price ≥ 0, supply_source; if aggregate, supplier_rate ≥ 0 required.

All create_* tools also check: `organizationId` present, and the corresponding `canAccess*` capability.

---

## 5. Rate limit and expiry

- **Rate limit:** In-memory `Map<userId, number[]>` of timestamps. Before any **execute** (not in processOpsMessage): `pruneRateLimit` keeps only timestamps within last 60s; if count ≥ 5, reject (service doesn’t reject in processOpsMessage; it’s applied when UI calls `executePendingCreate*`). After a successful execute, `recordRateLimit(userId)` appends `Date.now()`.
- **Confirmation expiry:** `confirmationRequestedAt` is set when a create_* tool returns requiresUiConfirmation. UI checks `Date.now() - requestedAt > CONFIRM_EXPIRY_MS` (5 min). If expired, UI shows “Request expired. Please start again.” and clears sessionState.

---

## 6. Cancel handling

If the **last user message** matches `/\b(cancel|stop|abort|never mind|nevermind)\b/i`, `processOpsMessage` returns immediately with `reply: 'Operation cancelled.'`, `sessionState: undefined`. No tools are called, no Gemini request for that turn.

---

## 7. Ops context build (UI)

When `currentOrganization?.id` is set:

1. `Promise.all([ getTransactionsByOrganization, getVehiclesByOrganization, getDriversByOrganization, getClientsByOrganization, getSuppliersByOrganization ])`.
2. From results: compute `totalIn`, `totalOut`, `net`, format strings for revenue; build vehicle/driver lists; client/supplier/driver/vehicle **names or numbers** for entity lists.
3. `setOpsContext({ revenueSummary, vehicleSummary, driverSummary, entityCounts, availableClientNames, availableSupplierNames, availableDriverNames, availableVehicleNumbers })`.

This context is passed into every `processOpsMessage` call so get_* tools and create_trip have up-to-date data and entity lists.

---

## 8. Message flow (UI → service → UI)

1. **Send:** User types (and optionally attaches image). `handleSendMessage` appends user message, optionally builds `lastMessageImage` from attachment, calls `runProcessMessages(nextMessages, opsSessionState, lastMessageImage)`.
2. **runProcessMessages:** Calls `processOpsMessage({ messages, organizationId, capabilities, userId, sessionState, opsContext, lastUserMessageImage })`. On resolve:
   - Store `result.sessionState` in `opsSessionState`.
   - If `requiresUiConfirmation` and not expired: append **one** system message with `pendingConfirm: { type, data }` (data from sessionState). No other system message for that turn.
   - If expired and had requiresUiConfirmation: append reply + “Request expired. Please start again.” and clear sessionState.
   - Else: append system message with `content: result.reply` and, if present, `reportData: result.reportData`. If `result.executed` then `triggerSuccess()`.
3. **Confirm:** User edits card if needed and taps Create/Add. `handlePendingConfirmSubmit` validates required fields, then calls the right `executePendingCreate*` with payload from `pending.data`. On success: replace that message’s `pendingConfirm` with `createdPreview`, clear sessionState, toast. On error: append system message with error text.
4. **Re-attempt (client only):** On cancel, if `reattemptCount < 2`, UI can show “Re-attempt creation” with stored payload; choosing it pushes a new system message with `pendingConfirm` so the user can fix and confirm without re-typing.

---

## 9. Where each piece lives

| Logic | File | Function / area |
|-------|------|------------------|
| Cancel detection | `opsAgentService.ts` | `processOpsMessage` (top) |
| History trimming, contents + image | `opsAgentService.ts` | `buildContents` |
| System instruction + entity lists | `opsAgentService.ts` | `buildSystemInstructionWithEntityLists` |
| Tool schemas and declarations | `opsAgentService.ts` | `CREATE_*_SCHEMA`, `CREATE_CLIENT_TOOL`, `GET_DATA_TOOLS` |
| create_* validation | `opsAgentService.ts` | `validateCreateClientArgs`, etc. |
| create_* guard (no DB, set session) | `opsAgentService.ts` | inside `processOpsMessage` (if name === 'create_client', etc.) |
| get_* implementation | `opsAgentService.ts` | same block (read from opsContext) |
| Follow-up LLM call (no tools) | `opsAgentService.ts` | second `generateContent` with `configTextOnly` |
| Actual DB create (after UI confirm) | `opsAgentService.ts` | `handleCreateClient`, etc., and `executePendingCreate*` |
| Rate limit | `opsAgentService.ts` | `rateLimitMap`, `pruneRateLimit`, `checkRateLimit`, `recordRateLimit` (record in execute*) |
| Ops context build | `OpsAgentScreen.tsx` | `useEffect` on `currentOrganization?.id` |
| runProcessMessages | `OpsAgentScreen.tsx` | `runProcessMessages` |
| Expiry check | `OpsAgentScreen.tsx` | inside `runProcessMessages` `.then()` |
| Pending confirm → execute | `OpsAgentScreen.tsx` | `handlePendingConfirmSubmit` |
| Created preview → PATCH | `OpsAgentScreen.tsx` | `handlePreviewUpdate` |
| Capabilities | `lib/capabilities.ts` | `canAccessClients`, etc. |

---

## 10. Summary

- **Two-phase create:** Model calls create_* → service validates and locks payload in sessionState, returns requiresUiConfirmation → **no DB write**. User confirms in UI → UI calls `executePendingCreate*` → **then** DB write and rate limit.
- **Read-only tools** use only `opsContext` (pre-fetched in UI); no extra API calls inside `processOpsMessage`.
- **Entity lists** for trips are injected into the system instruction so the model only suggests existing client/supplier/driver/vehicle names; validation of “name exists” is by instruction, not by a separate lookup in the tool.
- **Single source of truth for “what to confirm”:** sessionState from the service. UI never invents payloads; it only displays and optionally edits the payload from sessionState before calling execute.
