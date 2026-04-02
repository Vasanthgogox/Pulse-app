# Ops Agent — UI, Functionality, Logic, Capabilities & Implementation

This document describes the Ops Agent feature in Q Mobile: its files, UI behavior, business logic, capabilities, and how it is implemented end-to-end.

---

## 1. Overview

The **Ops Agent** is a conversational AI assistant for fleet and logistics operations. Users can:

- **Create entities** via natural language: clients, suppliers, vehicles, drivers, trips.
- **Ask about data**: revenue, cash flow, vehicle count, driver list, entity counts.
- **Request reports**: summary report with PDF download.
- **Attach images** (e.g. business cards, documents) for the AI to extract details (OCR-style flow).
- **Cancel** flows with phrases like "cancel" or "stop".

Creation flows use a **confirmation step**: the AI collects details in chat, then the app shows an **in-chat confirmation card** (no separate modal). The user can edit fields and tap **Create client** / **Add supplier** / etc. Only then is the backend API called.

---

## 2. Files and Roles

| File | Role |
|-----|------|
| **`services/opsAgentService.ts`** | Core logic: Gemini API, tool definitions, validation, guardrails, session state, execute-pending functions. No UI. |
| **`app/(tabs)/index.tsx`** | **Primary Ops Agent UI.** Home/default tab. Chat, confirmation cards, report card, PDF download, message editing, re-attempt, success toasts. Uses `processOpsMessage` and `executePendingCreate*`. |
| **`app/(tabs)/ops-agent.tsx`** | **Alternate/demo screen.** Same “Ops Autopilot” look (TeslaHeader, chat bubbles) but **does not** call the real service; it shows mock replies (“Mission sync complete”). Used when navigating to `ops-agent` route; tab bar maps **index** → “Ops Agent” tab. |
| **`app/(tabs)/_layout.tsx`** | Tab layout: 3 visible tabs (FISCAL, Ops Agent, TRIPS). `index` = Ops Agent tab; `ops-agent` has `href: null` (hidden from tab bar). |
| **`lib/capabilities.ts`** | Capability checks: `canAccessClients`, `canAccessSuppliers`, `canAccessVehicles`, `canAccessDrivers`, `canAccessTrips`. Used by the service before create/execute. |
| **`docs/AI_CHATBOT_STRUCTURE_PLAN.md`** | Plan for extensions: create trip, create transaction, report tools, OCR. |

**Data flow:** `index.tsx` → `processOpsMessage()` (opsAgentService) → Gemini with tools → Tool guard layer (validation, confirmation, rate limit) → UI shows confirmation card or reply → User confirms → `executePendingCreate*()` → DB → UI updates (created preview, toast).

---

## 3. Service Layer (`services/opsAgentService.ts`)

### 3.1 Flow (as in file header)

1. **UI** sends messages (+ optional image) to **`processOpsMessage()`**.
2. **LLM** (Gemini 2.0 Flash) receives history + system instruction + **tools** (create_*, get_*).
3. **Tool guard layer**: validate args (no placeholders, valid phone, etc.), apply **confirmation + expiry (5 min)**, **rate limit (5 creates/min per user)**, **cancel** handling, **payload locking** (session state).
4. **Action layer**: for create_* tools, do **not** write to DB yet; return `requiresUiConfirmation` and locked payload in `sessionState`. For get_* tools, return data from `opsContext`.
5. **LLM follow-up** (no tools) to produce a natural-language reply.
6. **UI** shows reply and, if `requiresUiConfirmation`, shows the in-chat confirmation card; on user “Create/Add”, UI calls **`executePendingCreateClient`** (or supplier/vehicle/driver/trip), which hits the real APIs.

### 3.2 Configuration and Guardrails

- **Model:** `gemini-2.0-flash`.
- **History:** Last `MAX_HISTORY_TURNS` (20) conversation turns.
- **Confirmation expiry:** `CONFIRM_EXPIRY_MS` = 5 minutes; after that, the pending confirmation is invalid and the user must start again.
- **Rate limit:** In-memory per `userId`: max 5 create_* executions per 1-minute window (any entity).
- **Idempotency (client):** `getClientByPhone` before create; duplicate phone returns error.
- **Audit:** `logOpsAgent()` in `__DEV__` for success/failure and key fields (e.g. phone).
- **API key:** From `Constants.expoConfig?.extra?.geminiApiKey` or `process.env.EXPO_PUBLIC_GEMINI_API_KEY`.

### 3.3 Tools

**Create tools (all require UI confirmation; no direct DB write in `processOpsMessage`):**

| Tool | Required fields | Optional |
|------|------------------|----------|
| `create_client` | contact_person, phone | organization_name |
| `create_supplier` | phone + (company_name or contact_person) | email |
| `create_vehicle` | vehicle_number | vehicle_brand, vehicle_body_type, vehicle_size, vehicle_axle |
| `create_driver` | name, phone, license_number | payable_amount, commission_percent, commission_per_km |
| `create_trip` | pickup_area, drop_location, client_name, client_price, supply_source (asset\|aggregate) | supplier_rate (required when supply_source=aggregate) |

**Read-only tools (no confirmation):**

| Tool | Purpose |
|------|---------|
| `get_revenue_summary` | Total in, out, net, transaction count (from `opsContext.revenueSummary`) |
| `get_vehicle_details` | Fleet list/summary (`opsContext.vehicleSummary`) |
| `get_driver_summary` | Driver count and names (`opsContext.driverSummary`) |
| `get_entity_counts` | Counts of clients, suppliers, drivers, vehicles |
| `get_report` | Full report: revenue, entity counts, fleet, drivers → structured `ChatReportData` for UI card + PDF |

### 3.4 Validation (Guard Layer)

- **Placeholders:** Rejects names/phones that look like test data (e.g. “John Doe”, “123-456-7890”) via `PLACEHOLDER_NAMES` and `PLACEHOLDER_PHONES`.
- **Client:** contact_person non-empty, phone 8–15 digits, no duplicate phone (DB check).
- **Supplier:** phone valid; at least one of company_name or contact_person.
- **Vehicle:** vehicle_number non-empty, not placeholder.
- **Driver:** name, phone, license_number; phone and name validation.
- **Trip:** pickup, drop, client_name, client_price ≥ 0, supply_source asset/aggregate; if aggregate, supplier_rate required and ≥ 0.

**Entity lists:** When creating a trip, the system instruction is augmented with `availableClientNames`, `availableSupplierNames`, `availableDriverNames`, `availableVehicleNumbers` from `opsContext`. The model must only use these names; if the user says a name not in the list, the model tells them to add that entity first.

### 3.5 Session State and Payload Locking

- **`OpsSessionState`** holds:
  - `confirmationRequestedAt`: timestamp for 5-min expiry.
  - `pendingCreateClientPayload`, `pendingCreateSupplierPayload`, … `pendingCreateTripPayload`: locked payloads for the confirmation card.
- The UI passes `sessionState` back into `processOpsMessage` on the next call so that expiry and locking are consistent. The confirmation card uses the locked payload; the user can only edit in the UI before tapping Create/Add.

### 3.6 Cancel Handling

- If the last user message matches `/\b(cancel|stop|abort|never mind|nevermind)\b/i`, the service returns immediately with reply “Operation cancelled.” and clears session state; no tool is run.

### 3.7 Image / OCR

- **`LastMessageImage`**: `{ mimeType, data }` (base64) for the last user message.
- **`buildContents()`** adds the image as an `inlineData` part to the last user turn so Gemini can “see” it. The system instruction tells the model to extract text from images (e.g. for add client/supplier/driver/vehicle) and to use only extracted or user-typed data, never invented values.

### 3.8 Exported Execute Functions (called by UI after user confirms)

- `executePendingCreateClient(organizationId, capabilities, payload, userId?)`
- `executePendingCreateSupplier(...)`
- `executePendingCreateVehicle(...)`
- `executePendingCreateDriver(...)`
- `executePendingCreateTrip(...)`

Each returns `{ success, message?, error?, entity? }`. `entity` is a `CreatedEntitySnapshot` (type, id, data) for the in-chat “created preview” card.

---

## 4. UI Layer (`app/(tabs)/index.tsx`)

### 4.1 Layout and Safe Area

- **TeslaHeader:** “Ops Agent”, “Autopilot Interface”; Network and Profile navigation.
- **KeyboardAvoidingView** + **ScrollView** for the message list; input area at bottom with `paddingBottom: 24 + insets.bottom`.
- **Success toast:** `insets.top + 40`; shows “Synced.” or custom message (e.g. “Successfully added…”).

### 4.2 Message Model

- **Message:** `role` (user | system), `content`, optional `attachment` (image | contact), optional `createdPreview` (post-create editable snapshot; `updated` when user has saved edits), optional `pendingConfirm` (in-chat confirmation card), optional `reportData` (for report card + PDF).
- **PendingConfirmType:** `"client" | "supplier" | "vehicle" | "driver" | "trip"`.
- **Initial message:** System message explaining capabilities (add entities, ask about revenue/vehicles, “Give me a report” for PDF).

### 4.3 Ops Context (Pre-fetched Data for AI)

- On `currentOrganization?.id` change, the screen fetches: transactions, vehicles, drivers, clients, suppliers.
- Builds **`opsContext`**: `revenueSummary`, `vehicleSummary`, `driverSummary`, `entityCounts`, `availableClientNames`, `availableSupplierNames`, `availableDriverNames`, `availableVehicleNumbers`.
- Passed into **`processOpsMessage({ opsContext })`** so the get_* tools and create_trip have access to real data and entity lists.

### 4.4 Sending a Message

- **handleSendMessage:** Appends user message (and optional `pendingAttachment`: image or contact mock). If attachment is image, builds `lastUserMessageImage` and passes to **runProcessMessages**.
- **runProcessMessages(nextMessages, sessionState, lastMessageImage):** Calls **`processOpsMessage`** with messages, org, capabilities, userId, sessionState, opsContext, lastUserMessageImage. On result:
  - If **requiresUiConfirmation** and not expired: append system message with **pendingConfirm** (type + data) for client/supplier/vehicle/driver/trip.
  - If expired: append “Request expired. Please start again.”
  - Else: append system message with optional **reportData**; if **executed** (read-only tool), trigger success toast.
- Reply text is normalized with **toNaturalLanguageReply()** (strips code blocks).

### 4.5 Confirmation Card (pendingConfirm)

- Rendered **inside** the system message bubble when `msg.pendingConfirm` is set.
- **Title:** “Create client?” / “Add supplier?” / “Add vehicle?” / “Create trip?” / “Add driver?”
- **Hint:** “Edit details below, then confirm.”
- **Entity-specific fields:** TextInputs bound to `msg.pendingConfirm.data` via **updatePendingConfirmData(messageIndex, data)**.
- **Actions:** **Cancel** → **handlePendingConfirmCancel** (clears pending, pushes “Client creation cancelled.” etc.; for client, can set **reattemptPayload** for “Re-attempt creation”). **Create client** / **Add supplier** / … → **handlePendingConfirmSubmit**.
- **handlePendingConfirmSubmit:** Validates required fields, then calls the appropriate **executePendingCreate***. On success: replace that message’s `pendingConfirm` with **createdPreview** (entity snapshot), clear session state, show success toast. On error: append system message with error.

### 4.6 Created Preview (Post-Create Editable Card)

- After a successful create, the same message shows **createdPreview** (type, id, data).
- **Not updated:** Editable fields (same as confirmation card) + “Edit details below, then confirm” + primary button that calls **handlePreviewUpdate** (calls **updateClient** / **updateSupplier** / **updateVehicle** / **updateDriver**; trip has no in-chat update).
- **Updated:** Collapsed “Added to history” summary with an **Edit** link that re-opens the editable form (editingPreviewIndex). Saving again sets **updated: true** and shows success toast.

### 4.7 Report Card and PDF

- When **reportData** is present on a system message, a **report card** is rendered: title, generatedAt, sections (title + body). **Download PDF** calls **handleDownloadReportPdf**: builds HTML from **reportToHtml(report)**, uses **expo-print**’s `printToFileAsync` to generate PDF, then **Share.share** to save or share.

### 4.8 Message Editing and Re-attempt

- **User message edit:** “Edit” on a user message sets **editingMessageIndex**; inline TextInput + “Cancel” / “Run again”. **submitEditedMessage** replaces messages up to that index and calls **runProcessMessages** with cleared session state.
- **Client cancel re-attempt:** After cancelling client confirmation, if **reattemptCount < 2**, **reattemptPayload** is set. A “Re-attempt creation” control can push a new system message with **pendingConfirm** type client and that payload so the user can try again without re-typing.

### 4.9 Attachments (UI)

- **pendingAttachment:** Can be **image** (data base64, mimeType) or **contact** (mock: “Raj Kumar”, “Prime Pilot”, “+91 98765 43210”). Contact is set by a button; image attachment UI exists (e.g. “Image Ready” strip) but the actual image picker (e.g. expo-image-picker) is not wired in the searched code; attachment strip and remove are implemented.
- When the user sends with an image attachment, **lastUserMessageImage** is passed to **processOpsMessage** and the model can use vision to extract details.

### 4.10 Theming

- **QU_AGENT** constants: bodyBackground, primary, primaryLight, emerald, userBubble, botBubble, botBorder, inputWrapBg, etc., derived from **Theme** (e.g. Theme.primary, Theme.screenBackground). All UI uses these or Theme so colors stay consistent.

---

## 5. Capabilities and Permissions

- **Source:** **getCapabilitiesFromProfile(profile)** from `lib/capabilities.ts` (role, aggregated, asset).
- **Used in:** **processOpsMessage** and **executePendingCreate***:
  - **create_client** → **canAccessClients(capabilities)**
  - **create_supplier** → **canAccessSuppliers(capabilities)**
  - **create_vehicle** → **canAccessVehicles(capabilities)**
  - **create_driver** → **canAccessDrivers(capabilities)**
  - **create_trip** → **canAccessTrips(capabilities)**
- If the user lacks permission, the service returns an error (e.g. “You don’t have permission to add clients.”) and the UI does not call execute.

---

## 6. Alternate Screen: `app/(tabs)/ops-agent.tsx`

- **Purpose:** Alternate/demo Ops Autopilot screen (e.g. “Ops Autopilot”, “Neural Mission Control”).
- **Behavior:** Same visual style (TeslaHeader, chat bubbles, “ENTER COMMAND…”, Send), but **no** call to **processOpsMessage**. On send, after a short delay it pushes a **mock** system message: “Autopilot response: Mission sync complete.” and shows a “SYNC COMPLETE” toast.
- **Navigation:** Available when navigating to `ops-agent` (e.g. from docs or deep link); tab bar does not show it (href: null). The **default** Ops Agent experience is **index** (Home).

---

## 7. Summary Table

| Aspect | Implementation |
|--------|----------------|
| **Entry screen** | `app/(tabs)/index.tsx` (Home tab) |
| **Alternate screen** | `app/(tabs)/ops-agent.tsx` (mock only) |
| **LLM** | Gemini 2.0 Flash via `@google/genai` |
| **Create flow** | Tool → validation → session state + requiresUiConfirmation → in-chat card → executePendingCreate* → DB |
| **Confirmation** | In-chat card; 5-min expiry; payload locked in OpsSessionState |
| **Rate limit** | 5 create_* per user per minute |
| **Permissions** | capability-based (canAccessClients, etc.) |
| **Reports** | get_report tool → ChatReportData → report card + expo-print PDF + Share |
| **Image/OCR** | lastUserMessageImage → Gemini inlineData; system instruction for extraction |
| **Cancel** | Keyword match → “Operation cancelled.”, session cleared |
| **Entity lists for trips** | opsContext.availableClientNames etc. injected into system instruction |

---

## 8. References

- **PRD:** `docs/PRD.md` (US-010, US-011, US-012).
- **Tesla / demo:** `docs/TESLA_OS_INTEGRATION_PLAN.md`.
- **Future extensions:** `docs/AI_CHATBOT_STRUCTURE_PLAN.md` (create trip, create transaction, report tools, OCR module).
- **Theme:** `@/constants/Theme`; **Layout:** `@/constants/Layout` (e.g. safe area, FAB).
- **Standards:** `.cursor/rules/q-mobile-standards.mdc`, `docs/RESPONSIVE_AND_SAFE_AREA.md`.
