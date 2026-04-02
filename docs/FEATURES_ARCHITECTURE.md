# Features architecture — layout and refactor guide

**Status:** Team architectural standard. This is the target domain-driven structure for the app, not a one-off refactor note.

This doc defines the **features/** layout and a **step-by-step refactor** for one domain (clients). Use the same steps for drivers, suppliers, trips, finance, and vehicles.

---

## Why we're doing this

- **Scalability** — Code grows by domain instead of by layer; adding a new entity doesn’t scatter files across `services/`, `components/`, and `app/`.
- **Reduced coupling** — Features depend on each other only through public APIs (`index.ts`), not internal paths.
- **Easier onboarding** — New contributors can work in one feature folder and understand ownership quickly.
- **Clear mental model** — “Where does client logic live?” → `features/clients`. No hunting.
- **Future-ready** — Enables domain-oriented ownership and, later, domain teams or micro-frontends if the product grows.

This is **domain-driven structure**, not just file cleanup. It’s how systems stay maintainable past tens of thousands of lines of code.

---

## 1. Target layout (template)

Each domain gets a **feature folder** that owns its UI, data access, and types. App stays routing-only and imports from features.

```
features/
  clients/                    # one domain = one folder
    components/               # domain-specific UI (modals, list items, etc.)
      AddClientModal.tsx
    services/
      clientsService.ts       # Supabase / API for this domain only
    hooks/                    # optional: useClients, useClientDetail
      useClients.ts
    types.ts                  # optional: shared types if not only in service
    index.ts                  # public API: what other features/app can import
  drivers/
    components/
      AddDriverModal.tsx
    services/
      driversService.ts
    index.ts
  suppliers/
    ...
  trips/
    ...
  finance/
    components/
      LedgerTab.tsx
      CustomersTab.tsx
      ...
    services/
      financeService.ts
    index.ts
  vehicles/
    ...
```

**Rules**

- **`app/`** — Routing only. Screens import from `@/features/<domain>` or `@/components` (shared). No business logic.
- **`features/<domain>/`** — Everything that belongs to that domain: components, service, hooks, types. Expose only what’s needed via `index.ts`.
- **`components/`** — Shared, domain-agnostic UI only (see [Shared components structure](#shared-components-structure) below). No domain-specific modals or forms.
- **`services/`** (root) — Either remove and move into features, or keep only for **cross-domain / global** APIs (e.g. auth, analytics). For a clean features layout, prefer one service per feature inside `features/<domain>/services/`.
- **Cross-domain** — Feature A can import from Feature B only via B’s public API: `import { ... } from '@/features/clients'`.

---

### Feature ownership rule

**A feature folder must not be imported from by another feature (or app) using internal paths. Only the feature’s public API (`index.ts`) may be used.**

| ❌ Wrong | ✅ Correct |
|----------|------------|
| `import { something } from '@/features/clients/services/clientsService'` | `import { something } from '@/features/clients'` |
| `import { AddClientModal } from '@/features/clients/components/AddClientModal'` | `import { AddClientModal } from '@/features/clients'` |

That single rule prevents architectural drift and keeps boundaries enforceable.

---

### Feature folder classification

Inside `features/<domain>/`, each folder has a strict role:

| Folder | Contains |
|--------|----------|
| **components/** | UI tied **only** to that domain (modals, list items, forms). |
| **services/** | API calls and server/backend logic for this domain. |
| **hooks/** | Domain data orchestration (e.g. `useClients`, `useClientDetail`). |
| **types.ts** | Domain models and DTOs used across the feature (if not only in service). |
| **index.ts** | **Public boundary** — the only entry point other features and `app/` may import from. |

Nothing else. No ad-hoc files at the root of the feature except `index.ts` and optional `types.ts`.

---

### Shared components structure

Keep `components/` at the project root for **domain-agnostic** UI only. To avoid it becoming a dumping ground, classify as:

| Folder | Use for |
|--------|---------|
| **components/shared/** | Buttons, inputs, cards, icons — reusable primitives. |
| **components/layout/** | Screenshells, headers, list layouts (e.g. `DetailPageLayout`, `ListScreenLayout`, `TeslaHeader`). |
| **components/ui/** | Composed shared pieces (e.g. `EntityRow`, `SummaryCard`, `FAB`) that don’t belong to a single domain. |

Domain-specific UI (e.g. `AddClientModal`, `CustomersTab`) lives in **features**, not here.

---

## 2. Clients domain — current vs target

**Current (scattered)**

| Current path | Purpose |
|-------------|---------|
| `services/clientsService.ts` | API + `ClientRow` type |
| `components/AddClientModal.tsx` | Add-client form modal |
| `app/client/_layout.tsx` | Stack layout for client routes |
| `app/client/[id].tsx` | Client detail screen |
| `app/(modals)/add-client.tsx` | Modal route that uses AddClientModal + service |

**Other references**

- `components/add-trip/ClientDropdown.tsx`, `ClientSearchField.tsx`, `useClientsForTrip.ts` — need client list for trip form → will import from `@/features/clients`.
- `components/finance/CustomersTab.tsx` — uses `clientsService` → will import from `@/features/clients`.

**Target (clients feature)**

```
features/clients/
  components/
    AddClientModal.tsx
  services/
    clientsService.ts
  index.ts
```

**App stays thin**

- `app/client/_layout.tsx` — unchanged (Stack).
- `app/client/[id].tsx` — imports `clientsService`, types, and shared components from `@/features/clients` and `@/components`.
- `app/(modals)/add-client.tsx` — imports `AddClientModal` and `clientsService` from `@/features/clients`.

---

## 3. Step-by-step refactor: clients

Do these in order so imports stay fixable at each step.

### Step 1 — Create the feature folder and public API

1. Create directories:
   - `features/clients/components/`
   - `features/clients/services/`
2. Create `features/clients/index.ts` and define the **public API** (only what other features or app should use):

```ts
// features/clients/index.ts
export { AddClientModal, type AddClientFormData } from './components/AddClientModal';
export {
  getClientsByOrganization,
  getClientById,
  createClient,
  updateClient,
  type ClientRow,
} from './services/clientsService';
```

Do not export internal helpers unless another feature needs them.

---

### Step 2 — Move the service

1. Move `services/clientsService.ts` → `features/clients/services/clientsService.ts`.
2. Inside the file, fix imports if any (e.g. `@/lib/supabase` stays as-is).
3. Add a **barrel** if you like (optional): `features/clients/services/index.ts` that re-exports from `clientsService.ts`, and in `features/clients/index.ts` import from `./services` or directly from `./services/clientsService`.

---

### Step 3 — Move the modal component

1. Move `components/AddClientModal.tsx` → `features/clients/components/AddClientModal.tsx`.
2. In the modal, fix imports: `@/constants/Theme`, `react-native`, etc. stay the same; no need for `@/features/clients` inside the modal.
3. Ensure `features/clients/index.ts` exports `AddClientModal` and `AddClientFormData` as in Step 1.

---

### Step 4 — Point app and other features to the feature

Update every file that currently imports from `@/services/clientsService` or `@/components/AddClientModal` to use `@/features/clients` (or the path you use for features).

1. **`app/(modals)/add-client.tsx`**
   - Replace:
     - `import { AddClientModal, type AddClientFormData } from '@/components/AddClientModal';`
     - `import * as clientsService from '@/services/clientsService';`
   - With:
     - `import { AddClientModal, type AddClientFormData, createClient } from '@/features/clients';` (or `from '@/features/clients'` and use named `createClient`).
   - Use `createClient` from the feature in `handleComplete`.

2. **`app/client/[id].tsx`**
   - Replace:
     - `import * as clientsService from '@/services/clientsService';`
   - With:
     - `import { getClientById, type ClientRow } from '@/features/clients';` (and `getTripsByOrganization` or similar from trips feature or `@/services/tripsService` as you prefer).
   - Use `ClientRow` from `@/features/clients` for state typing.

3. **`components/finance/CustomersTab.tsx`**
   - Replace:
     - `import * as clientsService from '@/services/clientsService';`
   - With:
     - `import { getClientsByOrganization, type ClientRow } from '@/features/clients';`

4. **Add-trip (client dropdown/search)**
   - In `components/add-trip/ClientDropdown.tsx`, `ClientSearchField.tsx`, `useClientsForTrip.ts` (or wherever client list is fetched):
   - Replace any `import * as clientsService from '@/services/clientsService'` with:
     - `import { getClientsByOrganization, type ClientRow } from '@/features/clients';`

5. **Any other references**
   - Search the repo for `clientsService` and `AddClientModal`; update to `@/features/clients` and remove leftover imports from `@/services/clientsService` or `@/components/AddClientModal`.

---

### Step 5 — Remove old locations and verify

1. Delete `services/clientsService.ts` (moved).
2. Delete `components/AddClientModal.tsx` (moved).
3. Ensure **path alias**: in `tsconfig.json` (or `babel.config.js` / `app.json` for Expo) you have something like `"@/features/*": ["features/*"]` so `@/features/clients` resolves. If you use `@/` as root, then `@/features/clients` = `features/clients` under project root.
4. Run build and tests; fix any remaining imports or type errors.

---

## 4. Repeating for other domains

Use the same pattern for each domain.

| Domain   | Move from (current) | Move to (feature) | Key consumers to update |
|----------|---------------------|-------------------|--------------------------|
| **drivers**  | `services/driversService.ts`, `components/AddDriverModal.tsx` | `features/drivers/` | `app/(modals)/add-driver.tsx`, `app/driver/[id].tsx`, finance `DriversTab` |
| **suppliers**| `services/suppliersService.ts`, `components/AddSupplierModal.tsx` | `features/suppliers/` | `app/(modals)/add-supplier.tsx`, `app/supplier/[id].tsx`, finance `SuppliersTab` |
| **vehicles** | `services/vehiclesService.ts`, `components/AddVehicleModal.tsx` | `features/vehicles/` | `app/(modals)/add-vehicle.tsx`, `app/vehicle/[id].tsx`, finance `GarrageTab` |
| **trips**    | `services/tripsService.ts`, `components/add-trip/*` (AddTripModal, form, hooks) | `features/trips/` | `app/(modals)/add-trip.tsx`, `app/trip/[id].tsx`, `app/(tabs)/trips.tsx`, finance (ledger/trips) |
| **finance**  | `services/financeService.ts`, `components/finance/*` | `features/finance/` | `app/(tabs)/finance.tsx` |

**Order suggestion**

1. **Clients** (smallest, clear boundary).
2. **Drivers** then **Suppliers** then **Vehicles** (same pattern as clients).
3. **Trips** (more files and cross-links).
4. **Finance** (most tabs and components; do after others so it can depend on clients/drivers/suppliers/vehicles/trips features).

---

## 5. Optional: path alias for features

In `tsconfig.json` (or your Expo config):

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/features/*": ["features/*"]
    }
  }
}
```

If `@/*` already maps to project root, `@/features/clients` works as `features/clients`. No extra alias needed unless you want an explicit `@/features/*` entry.

---

## 6. Summary checklist (one domain)

- [ ] Create `features/<domain>/components/`, `services/`, and `index.ts`.
- [ ] Move service file into `features/<domain>/services/`.
- [ ] Move domain modal (and any other domain-only components) into `features/<domain>/components/`.
- [ ] Export only public API in `features/<domain>/index.ts`.
- [ ] Update all imports in `app/` and in other features to use **only** `@/features/<domain>` (never `@/features/<domain>/services/...` or `.../components/...`).
- [ ] Delete original files from `services/` and `components/`.
- [ ] Run build and fix remaining references.

After clients are done, repeat the checklist for drivers, suppliers, vehicles, trips, and finance. Each refactor is independent; you can stop after one domain and keep the rest of the app as-is until you’re ready to migrate the next.

---

## 7. Future evolution (don’t jump yet)

Once feature isolation is solid and the team is comfortable, a next-level shape can be:

```
features/<domain>/
  api/        # HTTP / Supabase client layer
  model/      # Domain types and validation
  ui/         # Components and screenshells
  state/      # Hooks, context, or store for the domain
```

**Do not adopt this until:** every domain has been migrated into `features/<domain>/` with the current structure (components, services, hooks, types, index). Finish feature boundaries first; then consider splitting api / model / ui / state if the domain grows large enough to justify it.
