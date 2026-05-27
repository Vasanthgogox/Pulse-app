# SmartInput Migration Guide

How to migrate existing `TextInput` financial fields to the `SmartInput` platform primitive.

---

## When to use SmartInput

### FULLSCREEN REQUIRED

Any field where the user enters an amount that affects money, settlement, or a DB financial record:

| Field | Type | Notes |
|-------|------|-------|
| Client sale price | `currency` | Mutation triggers invoice downstream |
| Supplier rate | `currency` | Mutation triggers ledger debit |
| Advance paid | `currency` | Partial settlement |
| Driver salary / payout | `currency` | Payroll mutation |
| Bid amount | `currency` | Marketplace commitment |
| Expense amount | `currency` | Ledger entry |
| Penalty / deduction | `currency` | Negative settlement |
| Subcontract rate | `currency` | Cross-org supplier cost |
| Adjustment amount | `currency` | Trip amendment |
| Contract rate | `currency` | Rate card value |
| Commission % | `percentage` | Driver earnings |
| Platform fee | `percentage` | Margin field |
| Load tonnage | `weight` | Trip capacity |
| Trip distance | `distance` | Distance field |

### OPTIONAL (use SmartInput for UX consistency)

Fields where mistakes are annoying but not financially damaging:

- Item quantities (bag count, unit count)
- Search filter amounts (min/max range sliders are often better)
- Non-financial numeric settings

### INLINE ONLY — never SmartInput

- OTP / verification codes (native keyboard required)
- Phone numbers (native keyboard required, formatting is different)
- Free-text fields with occasional numbers (use `TextInput`)
- Search boxes
- Chat input

---

## Migration steps

### 1. Remove the old block

A typical old pattern:

```tsx
// BEFORE
<View style={styles.amountRow}>
  <Text style={styles.label}>Supplier Cost</Text>
  <View style={styles.inputWrapper}>
    <Text style={styles.currencySymbol}>₹</Text>
    <TextInput
      style={styles.input}
      value={supplierCost}
      onChangeText={setSupplierCost}
      keyboardType="decimal-pad"
      placeholder="0.00"
    />
  </View>
</View>
```

Remove: the label `Text`, the wrapper `View`, the ₹ symbol `Text`, and the `TextInput`. Keep any surrounding layout `View` if it owns spacing — but often that can go too.

### 2. Add SmartInput

```tsx
// AFTER
import { SmartInput } from '@/components/mobile-input';

<SmartInput
  type="currency"
  label="Supplier Cost"
  value={supplierCost}
  onChange={(raw) => setSupplierCost(raw)}
/>
```

### 3. Wire the value correctly

`value` accepts `number | string | undefined`. Pass the raw state directly:

```tsx
// Number state
const [amount, setAmount] = useState<number>(0);
<SmartInput value={amount} onChange={(raw, numeric) => setAmount(numeric)} />

// String state (preferred for forms — no float precision risk)
const [amountStr, setAmountStr] = useState('');
<SmartInput value={amountStr} onChange={(raw) => setAmountStr(raw)} />
```

**DB writes:** always use `raw`, not `numeric`:

```tsx
onChange={(raw, numeric) => {
  setAmount(raw);            // store raw for mutation
  setDisplayValue(numeric);  // use numeric only for UI math
}}
```

### 4. Set the variant

| Use case | `variant` |
|----------|-----------|
| Inside a form card, stacked with other fields | `'field'` (default look) |
| In a list row (e.g. a settings list) | `'row'` |

```tsx
<SmartInput variant="field" ... />
```

### 5. Add validation

Use `required`, `validation`, or both:

```tsx
// Basic required
<SmartInput required ... />

// With bounds
<SmartInput
  validation={{ min: 1, max: 50_000 }}
  ...
/>

// Integer-only (no decimals)
<SmartInput allowDecimal={false} ... />

// Custom rule
<SmartInput
  validation={{
    custom: (raw, n) => n > clientPrice ? 'Cannot exceed client price' : undefined,
  }}
  ...
/>
```

Validation fires before `onChange`. The entry screen shows the error inline — the parent never receives an invalid value.

### 6. Pass context lines

Give the user orientation while they're entering a full-screen amount:

```tsx
<SmartInput
  label="Supplier Cost"
  context={`Trip: ${trip.displayTripId} · ${trip.supplierName}`}
  ...
/>
```

For two-line context:

```tsx
context={{ primary: 'Trip: BLR → CHN', secondary: 'Supplier: XYZ Transport' }}
```

### 7. Add a party preview (optional)

Shows an avatar + name row above the amount entry — great for payment flows:

```tsx
<SmartInput
  label="Driver Payout"
  partyPreview={{
    name: driver.name,
    subtitle: driver.phone,
    entityType: 'driver',
    avatarSeed: driver.avatarSeed,
  }}
  ...
/>
```

---

## Common patterns

### Zero-as-empty

The component maps `0`, `0.0`, `0.00` → empty state (shows placeholder). If your form state uses `0` as "nothing entered", no action needed — it just works.

To suppress the empty state and show the actual zero:

```tsx
// Don't do this — just let SmartInput handle zero naturally
value={amount === 0 ? '' : amount}  // unnecessary
```

### Conditional disabled

```tsx
<SmartInput
  disabled={isSubmitting || hasBeenPaid}
  ...
/>
```

### Colour the trigger value

```tsx
// Auto: green if positive, red if negative
<SmartInput valueColor="auto" ... />

// Fixed positive (e.g. income always shown green)
<SmartInput valueColor="positive" ... />
```

### External form error

Some forms validate on submit rather than per-field. Pass the error from your form layer:

```tsx
<SmartInput
  errorMessage={formErrors.supplierCost}
  ...
/>
```

Note: `errorMessage` is for external errors; `validation` is for live entry validation. Use both when appropriate.

---

## Anti-patterns

**Don't parse to float for state:**

```tsx
// BAD — float precision errors on ₹1,23,456.78
onChange={(raw) => setAmount(parseFloat(raw))}

// GOOD — store raw string; parse only when needed for display math
onChange={(raw) => setAmount(raw)}
```

**Don't override prefix/suffix without reason:**

```tsx
// WRONG — SmartInput already knows ₹ is the currency prefix
<SmartInput type="currency" prefix="Rs." ... />

// RIGHT — only override when the domain genuinely differs
<SmartInput type="currency" prefix="$" ... />  // USD context
<SmartInput type="currency" prefix="" ... />   // suppress prefix
```

**Don't use SmartInput for text that contains numbers:**

```tsx
// WRONG
<SmartInput type="numeric" label="Vehicle Number" ... />

// RIGHT — MH12AB1234 is a string, not a number
<TextInput placeholder="Vehicle number" ... />
```

**Don't wire `numeric` to DB mutations:**

```tsx
// BAD — float representation may not match what user typed
onSubmit({ amount: numeric })

// GOOD — always write the raw string
onSubmit({ amount: raw })
```

**Don't fight the full-screen UX:**

SmartInput is intentional — financial input gets full focus. If a PM or designer wants inline editing for a financial field, push back. Inline number fields with a decimal-pad keyboard cause fat-finger errors; the full-screen pattern is there to prevent them.

---

## State cleanup on close

SmartInput resets to `initialValue` each time the modal opens, so stale entry state never leaks:

```tsx
// You do NOT need to do this
const handleClose = () => {
  setEntryAmount('');  // unnecessary — SmartInput handles it
  setOpen(false);
};
```

---

## Migration priority order (Phase 2)

These screens are next in line. Do not migrate until the platform primitive is stable (TypeScript clean, QA checklist passed):

1. `components/AddTransactionModal.tsx` — main ledger `amountStr` field
2. `features/trips/components/trip-detail/sections/StaffHandshakeModal.tsx` — subcontract rate + advance
3. `features/trips/components/trip-detail/TripAdjustmentModal.tsx` — adjustment amount
4. `features/clients/components/ClientProfileEditModal.tsx` — contract rate
5. `features/drivers/components/DriverFleetInviteSalaryModal.tsx` — salary
6. `features/invoicing/InvoicePreviewPanel.tsx` — line item amounts

**AddTransactionModal notes:** The amount field is the only SmartInput candidate. The party picker, category picker, and date fields are not numeric entry — leave them as-is. The modal is ~600 lines; read it fully before editing.

---

## Already migrated

| File | Field(s) |
|------|----------|
| `features/trips/components/add-trip/AddTripFormFields.tsx` | Client price, supplier rate, advance paid (aggregate + non-aggregate branches) |
| `features/vehicles/components/AddVehicleEntryModal.tsx` | Transaction amount |
| `features/network/components/BidModal.tsx` | Bid quote amount |
| `app/(driver)/salary-request.tsx` | Salary request amount |
| `features/finance/components/DisputeAuditSheet.tsx` | Proposed settlement amount |
