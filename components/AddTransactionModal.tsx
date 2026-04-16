/**
 * Add Transaction modal — demo-style ledger sync (IN/OUT, amount, party, link MSN).
 * Ledger entry form: LEDGER SYNC title, IN (green) / OUT (red) toggle, amount, party + trip dropdowns, SAVE ENTRY.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { LedgerRow } from "@/features/finance";
import { formatIndianVehicleNumber } from "@/lib/format";
import { VALIDATION, dateISO } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { isCrossOrgIntegrationTrip } from "@/features/trips/visibility/tripVisibility";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type TransactionType = "in" | "out";

export type AddTransactionSubmitOptions = { entryId: string };

/** Amount input placeholder when empty: Indian grouping, 2 decimals; use for suggested due/receivable. */
export function formatAmountDuePlaceholder(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "0.00";
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy expense categories (backward compat); prefer CLIENT/SUPPLIER/DRIVER/VEHICLE_CATEGORIES. */
export const EXPENSE_CATEGORIES = [
  "DRIVER SALARY",
  "SUPPLIER PAYMENT",
  "FUEL",
  "TOLL",
  "MAINTENANCE",
  "REPAIR",
  "PERMIT / TAX",
  "INSURANCE",
  "PARKING",
  "OFFICE EXPENSE",
  "COMMISSION",
  "FINES / PENALTIES",
  "ADVANCE PAYMENT",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Client (Cash IN / Receivables) — payment categories. Stored in description. */
export const CLIENT_CATEGORIES = [
  "Trip Payment",
  "Advance Payment",
  "Partial Payment",
  "Extra Charges",
  "Detention Charges",
  "Cancellation Charges",
  "Adjustment",
  "Other",
] as const;
export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

/** Supplier (Payables) — payment categories. Stored in description. */
export const SUPPLIER_CATEGORIES = [
  "Trip Payment",
  "Advance",
  "Balance Payment",
  "Commission",
  "Detention Charges",
  "Penalty",
  "Adjustment",
  "Other",
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

/** Driver payment types (driver_ledger.type). Shown when Cash OUT and party is driver. */
export const DRIVER_PAYMENT_TYPES = [
  { label: "Monthly Salary", type: "salary" as const },
  { label: "Trip Commission", type: "settlement" as const },
  { label: "Advance", type: "advance" as const },
  { label: "Reimbursement", type: "reimbursement" as const },
  { label: "Bonus", type: "bonus" as const },
  { label: "Deduction", type: "deduction" as const },
  { label: "Adjustment", type: "adjustment" as const },
] as const;
export type DriverPaymentType = (typeof DRIVER_PAYMENT_TYPES)[number]["type"];

/** Receivable categories for Cash IN (client payments). Stored as description. */
export const RECEIVABLE_CATEGORIES = [
  "Trip Payment",
  "Advance from Client",
  "Extra Charges",
  "Detention Charges",
  "Cancellation Charges",
  "Other",
] as const;
export type ReceivableCategory = (typeof RECEIVABLE_CATEGORIES)[number];

/** Supplier payment types (Cash OUT, party = supplier). Stored as description. */
export const SUPPLIER_PAYMENT_TYPES = [
  "Trip Payment",
  "Advance",
  "Balance Payment",
  "Adjustment",
  "Penalty",
  "Other",
] as const;
export type SupplierPaymentType = (typeof SUPPLIER_PAYMENT_TYPES)[number];

/** Vehicle / Garage expense categories. First field when adding vehicle expense (Cash OUT). */
export const VEHICLE_CATEGORIES = [
  "Fuel",
  "Toll",
  "Maintenance",
  "Repair",
  "Tyre",
  "Insurance",
  "Permit / Tax",
  "Parking",
  "Cleaning",
  "Other",
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const PAYMENT_MODES = [
  { id: 'CASH', name: 'Cash' },
  { id: 'UPI', name: 'UPI' },
  { id: 'BANK', name: 'Bank Transfer' },
  { id: 'CHEQUE', name: 'Cheque' },
  { id: 'FUEL_CARD', name: 'Fuel Card' },
  { id: 'FASTAG', name: 'FASTag' },
  { id: 'CREDIT', name: 'Credit' },
] as const;

/** Vehicle expense "parties" — vehicle cannot be party; user selects expense type. id = name = stored in description. */
export const VEHICLE_EXPENSE_PARTIES: PartyOption[] = [
  ...VEHICLE_CATEGORIES,
].map((c) => ({ id: c, name: c }));

/** All category/description values that should display as-is in ledger (not "GENERAL"). */
export const ALL_LEDGER_CATEGORY_VALUES: readonly string[] = [
  ...EXPENSE_CATEGORIES,
  ...CLIENT_CATEGORIES,
  ...SUPPLIER_CATEGORIES,
  ...RECEIVABLE_CATEGORIES,
  ...SUPPLIER_PAYMENT_TYPES,
  ...DRIVER_PAYMENT_TYPES.map((t) => t.label),
  ...VEHICLE_CATEGORIES,
  ...VEHICLE_EXPENSE_PARTIES.map((p) => p.id),
];

export interface AddTransactionData {
  type: TransactionType;
  amount: number;
  partyId: string | null;
  partyName: string | null;
  tripId: string | null;
  tripNumber: string | null;
  /** Expense/receivable/supplier category. Cash IN: receivable; Cash OUT + supplier: supplier payment type; else expense. Stored as description. */
  category?: string | null;
  /** When contactType is driver: driver_ledger.type for this payment. */
  driverPaymentType?: DriverPaymentType | null;
  /** For cash_entries: contact_id and contact_type when party is selected. */
  contactId?: string | null;
  contactType?: "client" | "supplier" | "driver" | null;
  /** Optional: vehicle number and driver name from trip for cash_entries. */
  vehicleNumber?: string | null;
  driverName?: string | null;
  indentId?: string | null;
  /** Entry date (YYYY-MM-DD). When not set, parent uses today or editing entry's date. */
  transactionDate?: string | null;
  /** Payment mode (e.g. CASH, UPI, BANK) */
  paymentMode?: string | null;
  /** Reference number / UTR for online transactions */
  paymentReference?: string | null;
}

export interface PartyOption {
  id: string;
  name: string;
}

/** Optional vehicle display for trip (e.g. "Vehicle: MH-01-XX-XXXX"). */
export interface VehicleOption {
  id: string;
  vehicle_number: string;
}

export interface TripOption {
  id: string;
  trip_number: string;
  /** For Cash IN: trip's client. */
  client_id: string | null;
  client_name: string | null;
  /** For Cash OUT: trip's supplier and driver (auto-tag). */
  supplier_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  /** Optional: for cash_entries indent_id. */
  indent_id?: string | null;
  /** Route label for dropdown e.g. "Mumbai → Pune". */
  route_label?: string | null;
  /** Formatted date for dropdown e.g. "26 FEB" (pickup_date or created_at). */
  trip_date?: string | null;
}

/** When set, Party dropdown shows only that type; 'all' shows clients + suppliers (e.g. Ledger tab). */
export type PartyContext = "customers" | "suppliers" | "all";

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Second arg entryId is set when editing an existing entry. */
  onSubmit: (
    data: AddTransactionData,
    options?: AddTransactionSubmitOptions,
  ) => void;
  clients: PartyOption[];
  /** Optional suppliers — shown in party dropdown when partyContext is 'all' or 'suppliers'; used for Cash OUT + trip auto-tag. */
  suppliers?: PartyOption[];
  /** Optional drivers — used for Cash OUT + trip auto-tag when user selects a trip. */
  drivers?: PartyOption[];
  /** Optional vehicles — used to display vehicle number when a trip with vehicle_id is selected (Cash OUT). */
  vehicles?: VehicleOption[];
  trips: TripOption[];
  /** When set (e.g. from client/supplier detail), party is pre-selected when modal opens. */
  defaultPartyId?: string | null;
  /** When set with defaultPartyId, ensures the party appears in the list and can be pre-selected (e.g. entity from overlay). */
  defaultPartyName?: string | null;
  /** When both set, party and name are read-only (auto-tagged from tab/entity). */
  lockedPartyId?: string | null;
  lockedPartyName?: string;
  /** When 'customers', Party list is clients only; when 'suppliers', suppliers only; when 'all', both. */
  partyContext?: PartyContext;
  /** When set, modal opens in edit mode with form pre-filled; onSubmit will be called with { entryId: initialEntry.id }. */
  initialEntry?: LedgerRow | null;
  /** When set (e.g. from entity detail), amount is pre-filled from this value (e.g. commission due); field stays editable. */
  lockedAmount?: number | null;
  /** When set (e.g. driver offer payable_amount), used to auto-fill amount when user selects "Monthly salary". */
  salaryAmount?: number | null;
  /** When opening from trip statement: pre-select this trip. */
  defaultTripId?: string | null;
  /** When opening from trip statement: pre-select IN or OUT. */
  defaultType?: "in" | "out";
  /** When opening from trip statement: pre-select this party (client/supplier/driver id). */
  defaultContactId?: string | null;
  /** When opening from trip statement: party type for defaultContactId. */
  defaultContactType?: "client" | "supplier" | "driver" | null;
  /** When opening from driver salary request (Pay Now), pre-select this driver payment type (e.g. 'advance'). */
  defaultDriverPaymentType?: DriverPaymentType | null;
  /** When true, trip is fixed (e.g. opened from inside a trip); LINK TO TRIP is read-only. */
  tripLocked?: boolean;
  /** When tripLocked, display this when trip not yet in list (e.g. from URL params). */
  lockedTripDisplay?: string | null;
  /** When true, render as full-page content (no Modal); parent provides header/safe area. */
  fullPage?: boolean;
  /** When true, supplier Cash OUT must have a trip linked (suppliers always link to trips). */
  requireTripForSupplierOut?: boolean;
  /** When set (e.g. from entity detail), show "Entry for [label]" so user sees which party/vehicle the entry is for. */
  entryContextLabel?: string;
  /** Map supplier party id -> linked_organization_id so trips created by that org (org-as-client) are shown for the supplier. */
  supplierLinkedOrgIds?: Record<string, string>;
  /** Map linked_organization_id -> local_client_id (for integrated trips). */
  linkedClientIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Map linked_organization_id -> local_supplier_id. */
  linkedSupplierIdByOrgId?: Record<string, string> | Map<string, string>;
  /** Current organization ID to detect if trip is "ours". */
  viewerOrgId?: string | null;
  /** When true (e.g. Garrage/vehicle context), hide party dropdown for Cash OUT and use vehicle expense categories as first field. */
  hidePartyForCashOut?: boolean;
  /** Cash IN: suggested receivable in amount placeholder when the field is empty (e.g. customer / trip pending). */
  dueAmountIn?: number | null;
  /** Cash OUT: suggested payable in amount placeholder when the field is empty (e.g. supplier / driver due). */
  dueAmountOut?: number | null;
}

export function AddTransactionModal({
  visible,
  onClose,
  onSubmit,
  clients,
  suppliers = [],
  drivers = [],
  vehicles = [],
  trips,
  defaultPartyId,
  defaultPartyName,
  lockedPartyId,
  lockedPartyName,
  partyContext = "all",
  initialEntry = null,
  lockedAmount,
  salaryAmount,
  defaultTripId,
  defaultType,
  defaultContactId,
  defaultContactType,
  defaultDriverPaymentType,
  tripLocked = false,
  lockedTripDisplay,
  fullPage = false,
  requireTripForSupplierOut = true,
  entryContextLabel,
  supplierLinkedOrgIds,
  linkedClientIdByOrgId,
  linkedSupplierIdByOrgId,
  viewerOrgId,
  hidePartyForCashOut = false,
  dueAmountIn = null,
  dueAmountOut = null,
}: AddTransactionModalProps) {
  const insets = useSafeAreaInsets();
  const safeClients = clients ?? [];
  const safeSuppliers = suppliers ?? [];
  const safeDrivers = drivers ?? [];
  const safeVehicles = vehicles ?? [];
  const safeTrips = trips ?? [];

  const [type, setType] = useState<TransactionType>(
    () => defaultType ?? (partyContext === "customers" ? "in" : "out"),
  );
  const [amountStr, setAmountStr] = useState("");

  const amountPlaceholder = useMemo(
    () =>
      formatAmountDuePlaceholder(type === "in" ? dueAmountIn : dueAmountOut),
    [type, dueAmountIn, dueAmountOut],
  );
  const [partyId, setPartyId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string>(PAYMENT_MODES[0].id);
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [driverPaymentType, setDriverPaymentType] =
    useState<DriverPaymentType | null>(null);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDriverPaymentTypePicker, setShowDriverPaymentTypePicker] =
    useState(false);
  /** When party is "Driver salary", which driver this salary is for. */
  const [driverIdForSalary, setDriverIdForSalary] = useState<string | null>(
    null,
  );
  const [showDriverForSalaryPicker, setShowDriverForSalaryPicker] =
    useState(false);
  /** When vehicle expense (Cash OUT, no party) and no trip selected, user can pick a vehicle so it's stored. */
  const [selectedVehicleIdForExpense, setSelectedVehicleIdForExpense] =
    useState<string | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(
    () =>
      initialEntry?.transaction_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  /** When fullPage: extra bottom padding so scroll can bring content above keyboard. */
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const isEditMode = Boolean(initialEntry?.id);
  const isPartyLocked = lockedPartyId != null && lockedPartyName != null;
  const effectivePartyId = isPartyLocked ? lockedPartyId : partyId;

  /** Today as short label for tag (e.g. "11 Mar"). */
  const todayTagLabel = useMemo(() => {
    const d = new Date();
    const day = d.getDate();
    const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    return `${day} ${months[d.getMonth()]}`;
  }, []);

  const allParties = useMemo(
    () => [...safeClients, ...safeSuppliers],
    [safeClients, safeSuppliers],
  );

  /** When set, amount is pre-filled from entity detail but remains editable. */
  const amount = Math.round(parseFloat(amountStr) || 0);

  /** When a client or supplier is selected (or party is locked), show only trips related to that party. */
  const effectivePartyIdForTrips = isPartyLocked ? lockedPartyId : partyId;
  const filteredTrips = useMemo(() => {
    if (!effectivePartyIdForTrips) return safeTrips;
    if (partyContext === "customers") {
      const partyName =
        safeClients.find((c) => c.id === effectivePartyIdForTrips)?.name ??
        null;
      const nameKey = partyName != null ? partyName.trim().toLowerCase() : "";
      const linkedOrgId = supplierLinkedOrgIds?.[effectivePartyIdForTrips];
      return safeTrips.filter(
        (t) =>
          t.client_id === effectivePartyIdForTrips ||
          (nameKey &&
            (t.client_name || "").trim().toLowerCase() === nameKey) ||
          (linkedOrgId != null &&
            (t as { organization_id?: string }).organization_id ===
              linkedOrgId),
      );
    }
    if (partyContext === "suppliers") {
      const partyName =
        safeSuppliers.find((s) => s.id === effectivePartyIdForTrips)?.name ??
        null;
      const nameKey = partyName != null ? partyName.trim().toLowerCase() : "";
      const linkedOrgId = supplierLinkedOrgIds?.[effectivePartyIdForTrips];
      return safeTrips.filter(
        (t) =>
          t.supplier_id === effectivePartyIdForTrips ||
          (nameKey &&
            (t as { supplier_name?: string }).supplier_name
              ?.trim()
              .toLowerCase() === nameKey) ||
          (linkedOrgId != null &&
            (t as { organization_id?: string }).organization_id ===
              linkedOrgId),
      );
    }
    const isClient = safeClients.some((c) => c.id === effectivePartyIdForTrips);
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    if (isClient) {
      const partyName =
        safeClients.find((c) => c.id === effectivePartyIdForTrips)?.name ??
        null;
      const nameKey = partyName != null ? partyName.trim().toLowerCase() : "";
      const linkedOrgId = supplierLinkedOrgIds?.[effectivePartyIdForTrips];
      return safeTrips.filter(
        (t) =>
          t.client_id === effectivePartyIdForTrips ||
          (nameKey &&
            (t.client_name || "").trim().toLowerCase() === nameKey) ||
          (linkedOrgId != null &&
            (t as { organization_id?: string }).organization_id ===
              linkedOrgId),
      );
    }
    if (isSupplier) {
      const partyName =
        safeSuppliers.find((s) => s.id === effectivePartyIdForTrips)?.name ??
        null;
      const nameKey = partyName != null ? partyName.trim().toLowerCase() : "";
      const linkedOrgId = supplierLinkedOrgIds?.[effectivePartyIdForTrips];
      return safeTrips.filter(
        (t) =>
          t.supplier_id === effectivePartyIdForTrips ||
          (nameKey &&
            (t as { supplier_name?: string }).supplier_name
              ?.trim()
              .toLowerCase() === nameKey) ||
          (linkedOrgId != null &&
            (t as { organization_id?: string }).organization_id ===
              linkedOrgId),
      );
    }
    if (safeDrivers.some((d) => d.id === effectivePartyIdForTrips))
      return safeTrips.filter((t) => t.driver_id === effectivePartyIdForTrips);
    return safeTrips;
  }, [
    safeTrips,
    effectivePartyIdForTrips,
    partyContext,
    safeClients,
    safeSuppliers,
    safeDrivers,
    isPartyLocked,
    lockedPartyId,
    supplierLinkedOrgIds,
  ]);

  const selectedTrip = tripId
    ? (safeTrips.find((t) => t.id === tripId) ?? null)
    : null;
  const tripNumber = selectedTrip?.trip_number ?? null;

  const partyOptions = useMemo(() => {
    if (type === "in" && selectedTrip) {
      const lid = (selectedTrip as any).organization_id;
      const isIntegrated = isCrossOrgIntegrationTrip(selectedTrip, viewerOrgId);

      if (isIntegrated) {
        const localCid =
          linkedClientIdByOrgId instanceof Map
            ? linkedClientIdByOrgId.get(lid)
            : linkedClientIdByOrgId?.[lid];
        if (localCid) {
          const client = safeClients.find((c) => c.id === localCid);
          if (client) return [client];
          // If we have a local ID but not in full list, try defaultPartyName/lockedPartyName
          if (
            (defaultPartyId === localCid || lockedPartyId === localCid) &&
            (defaultPartyName || lockedPartyName)
          ) {
            return [
              {
                id: localCid,
                name: (lockedPartyName || defaultPartyName) as string,
              },
            ];
          }
        }
      }

      const cid =
        selectedTrip.client_id && selectedTrip.client_id.trim()
          ? selectedTrip.client_id
          : null;
      const cname = (selectedTrip.client_name || "").trim().toLowerCase();
      if (cid) {
        const inList = safeClients.find((c) => c.id === cid);
        if (inList) return [inList];
        return [
          { id: cid, name: selectedTrip.client_name || "Unknown client" },
        ];
      }
      if (cname) {
        const byName = safeClients.filter(
          (c) => (c.name || "").trim().toLowerCase() === cname,
        );
        if (byName.length >= 1) return byName;
        return [{ id: "", name: selectedTrip.client_name || "Unknown client" }];
      }
    }
    if (type === "out" && selectedTrip) {
      const lid = (selectedTrip as any).organization_id;
      const isIntegrated = isCrossOrgIntegrationTrip(selectedTrip, viewerOrgId);

      if (isIntegrated) {
        const localSid =
          linkedSupplierIdByOrgId instanceof Map
            ? linkedSupplierIdByOrgId.get(lid)
            : linkedSupplierIdByOrgId?.[lid];
        if (localSid) {
          const supplier = safeSuppliers.find((s) => s.id === localSid);
          if (supplier) return [supplier];
          if (
            (defaultPartyId === localSid || lockedPartyId === localSid) &&
            (defaultPartyName || lockedPartyName)
          ) {
            return [
              {
                id: localSid,
                name: (lockedPartyName || defaultPartyName) as string,
              },
            ];
          }
        }
      }

      const outOptions: PartyOption[] = [];
      if (selectedTrip.supplier_id) {
        const sup = safeSuppliers.find(
          (s) => s.id === selectedTrip.supplier_id!,
        );
        if (sup) outOptions.push(sup);
        else
          outOptions.push({ id: selectedTrip.supplier_id, name: "Supplier" });
      }
      if (selectedTrip.driver_id) {
        const dr = safeDrivers.find((d) => d.id === selectedTrip.driver_id!);
        if (dr) outOptions.push(dr);
        else outOptions.push({ id: selectedTrip.driver_id, name: "Driver" });
      }
      if (outOptions.length > 0) return outOptions;
    }
    if (partyContext === "customers") {
      const list = safeClients;
      if (
        defaultPartyId &&
        defaultPartyName &&
        !list.some((p) => p.id === defaultPartyId)
      )
        return [{ id: defaultPartyId, name: defaultPartyName }, ...list];
      return list;
    }
    if (partyContext === "suppliers") {
      const list = safeSuppliers;
      if (
        defaultPartyId &&
        defaultPartyName &&
        !list.some((p) => p.id === defaultPartyId)
      )
        return [{ id: defaultPartyId, name: defaultPartyName }, ...list];
      return list;
    }
    let options = allParties;
    // In edit mode, ensure the entry's party appears in the list (e.g. if not in current clients/suppliers).
    if (initialEntry?.contact_id && initialEntry.party_name) {
      const exists = options.some((p) => p.id === initialEntry!.contact_id);
      if (!exists)
        options = [
          { id: initialEntry.contact_id, name: initialEntry.party_name },
          ...options,
        ];
    }
    // Ledger (all): Cash OUT can be supplier, driver, or "Driver salary" (then pick driver); plus Misc.
    if (partyContext === "all") {
      if (type === "out" && safeDrivers.length > 0) {
        options = [
          ...options,
          ...safeDrivers,
          { id: "driver-salary", name: "Driver salary" },
        ];
      }
      options = [...options, { id: "misc", name: "Misc / Unlinked" }];
    }
    return options;
  }, [
    type,
    selectedTrip,
    safeClients,
    safeSuppliers,
    safeDrivers,
    allParties,
    partyContext,
    initialEntry?.contact_id,
    initialEntry?.party_name,
    defaultPartyId,
    defaultPartyName,
    viewerOrgId,
    linkedClientIdByOrgId,
    linkedSupplierIdByOrgId,
    lockedPartyId,
    lockedPartyName,
  ]);

  const effectivePartyName = isPartyLocked
    ? lockedPartyName
    : partyId
      ? (partyOptions.find((c) => c.id === partyId)?.name ?? null)
      : null;

  const isDriverSalaryParty =
    type === "out" && effectivePartyId === "driver-salary";
  const isDriverPayment =
    type === "out" &&
    effectivePartyId != null &&
    (safeDrivers.some((d) => d.id === effectivePartyId) || isDriverSalaryParty);
  const effectiveDriverIdForPayment = isDriverSalaryParty
    ? driverIdForSalary
    : safeDrivers.some((d) => d.id === effectivePartyId)
      ? effectivePartyId
      : null;
  const isSupplierPayment =
    type === "out" &&
    !hidePartyForCashOut &&
    effectivePartyId != null &&
    safeSuppliers.some((s) => s.id === effectivePartyId);
  const isClientPayment =
    type === "in" &&
    effectivePartyId != null &&
    safeClients.some((c) => c.id === effectivePartyId);

  /** Category list for the current context: Receivables (Cash IN), Supplier (Cash OUT), or legacy expense (backward compat when no party). */
  const categoriesForPicker = useMemo(() => {
    if (type === "in") return [...CLIENT_CATEGORIES]; // Receivables — always show when Cash IN (not tied to party selection)
    if (type === "out" && isSupplierPayment) return [...SUPPLIER_CATEGORIES];
    if (hidePartyForCashOut && type === "out") return []; // Vehicle: category is the first field (party = vehicle category)
    // Legacy / fallback: old EXPENSE_CATEGORIES for any other Cash OUT
    return hidePartyForCashOut
      ? EXPENSE_CATEGORIES.filter((c) => c !== "DRIVER SALARY")
      : [...EXPENSE_CATEGORIES];
  }, [type, isSupplierPayment, hidePartyForCashOut]);

  const isVehicleExpenseOut = hidePartyForCashOut && type === "out";
  /** Cash OUT with a vehicle expense category (Fuel, Toll, etc.) — show vehicle row and store vehicle_number. */
  const isVehicleExpenseCategory =
    type === "out" &&
    effectivePartyId != null &&
    VEHICLE_EXPENSE_PARTIES.some((p) => p.id === effectivePartyId);
  const supplierNeedsTrip =
    requireTripForSupplierOut && isSupplierPayment && !tripId;

  // Trip required when not locked, party is selected (not misc), and there are trips to link.
  // Monthly Salary: trip is optional (driver payment type "salary").
  const tripRequired =
    !tripLocked &&
    effectivePartyId != null &&
    effectivePartyId !== "misc" &&
    filteredTrips.length > 0 &&
    !(isDriverPayment && driverPaymentType === "salary");
  const hasValidTrip = !tripRequired || tripId != null;

  // Party required: user must select a party (incl. Misc when no other option).
  // When tripLocked, party is derived from trip on submit — no party field shown.
  const hasValidParty =
    tripLocked ||
    (effectivePartyId != null &&
      (effectivePartyId !== "misc" ||
        (type === "in" && safeClients.length === 0) ||
        (type === "out" &&
          safeSuppliers.length === 0 &&
          safeDrivers.length === 0 &&
          !hidePartyForCashOut)));

  // Category / payment type required when the field is shown.
  // When tripLocked + Cash IN, party is derived from trip — treat as client payment for category.
  const hasValidCategory =
    (type === "in" &&
      (isClientPayment || tripLocked) &&
      category != null &&
      (CLIENT_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "in" &&
      !isClientPayment &&
      !tripLocked &&
      category != null &&
      (EXPENSE_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "out" &&
      isSupplierPayment &&
      category != null &&
      (SUPPLIER_CATEGORIES as readonly string[]).includes(category)) ||
    (type === "out" &&
      isDriverPayment &&
      (isDriverSalaryParty
        ? driverIdForSalary != null
        : driverPaymentType != null)) ||
    (type === "out" && isVehicleExpenseOut && effectivePartyId != null) ||
    (type === "out" &&
      !isDriverPayment &&
      !isVehicleExpenseOut &&
      category != null &&
      ((EXPENSE_CATEGORIES as readonly string[]).includes(category) ||
        category === "SUPPLIER COST"));

  /** Entry date: when non-empty must be valid YYYY-MM-DD; empty falls back to today in submit. */
  const entryDateError =
    entryDate.trim().length > 0 ? dateISO()(entryDate) : null;

  const canSubmit =
    amount > 0 &&
    amount <= VALIDATION.AMOUNT_MAX &&
    hasValidParty &&
    hasValidCategory &&
    hasValidTrip &&
    !supplierNeedsTrip &&
    !entryDateError;

  // When modal opens: prefill from initialEntry (edit) or defaultPartyId (add); on close, hide pickers.
  // Do not depend on partyOptions here: selecting a trip changes partyOptions and would re-run this effect and reset tripId.
  const partyOptionsRef = React.useRef(partyOptions);
  partyOptionsRef.current = partyOptions;
  useEffect(() => {
    if (!visible) {
      setShowPartyPicker(false);
      setShowTripPicker(false);
      setShowCategoryPicker(false);
      setShowDriverForSalaryPicker(false);
      setDriverIdForSalary(null);
      return;
    }
    if (initialEntry?.id) {
      const isIn = (initialEntry.amount_in ?? 0) > 0;
      setType(isIn ? "in" : "out");
      setAmountStr(
        String(initialEntry.amount_in || initialEntry.amount_out || 0),
      );
      const desc = (initialEntry as { description?: string }).description ?? "";
      const isVehicleExpenseDesc =
        desc &&
        VEHICLE_EXPENSE_PARTIES.some((p) => p.id === desc || p.name === desc);
      const isDriverSalaryEntry =
        initialEntry.contact_id &&
        (initialEntry.party_name === "Driver salary" ||
          desc === "DRIVER SALARY" ||
          desc === "Monthly salary" ||
          desc === "Monthly Salary");
      setPartyId(
        isDriverSalaryEntry
          ? "driver-salary"
          : isVehicleExpenseDesc && !initialEntry.contact_id
            ? (VEHICLE_EXPENSE_PARTIES.find(
                (p) => p.id === desc || p.name === desc,
              )?.id ?? desc)
            : (initialEntry.contact_id ?? null),
      );
      setDriverIdForSalary(
        isDriverSalaryEntry ? (initialEntry.contact_id ?? null) : null,
      );
      setTripId(
        initialEntry.trip_id === undefined || initialEntry.trip_id === null
          ? null
          : initialEntry.trip_id,
      );
      const matchedClientCat =
        desc && (CLIENT_CATEGORIES as readonly string[]).includes(desc);
      const matchedSupplierCat =
        desc && (SUPPLIER_CATEGORIES as readonly string[]).includes(desc);
      const matchedLegacyCat =
        desc && (EXPENSE_CATEGORIES as readonly string[]).includes(desc);
      setCategory(
        matchedClientCat || matchedSupplierCat || matchedLegacyCat
          ? desc
          : ((isVehicleExpenseDesc
              ? (VEHICLE_EXPENSE_PARTIES.find(
                  (p) => p.id === desc || p.name === desc,
                )?.id ?? null)
              : null) ?? null),
      );
      setDriverIdForSalary(
        isDriverSalaryEntry && initialEntry.contact_id != null ? initialEntry.contact_id : null
      );
      const tid = initialEntry.trip_id;
      setTripId(tid !== undefined && tid !== null ? tid : null);
      setCategory(desc && (EXPENSE_CATEGORIES as readonly string[]).includes(desc) ? desc : null);
    } else {
      if (defaultTripId != null) setTripId(defaultTripId);
      if (defaultType != null) setType(defaultType);
      if (defaultContactId != null) {
        setPartyId(defaultContactId);
      } else if (lockedPartyId != null) {
        setPartyId(lockedPartyId);
      } else if (defaultPartyId != null) {
        setPartyId(defaultPartyId);
      } else {
        setPartyId(null);
      }
      setAmountStr(lockedAmount != null ? String(lockedAmount) : "");
      if (defaultTripId == null) setTripId(null);
      setCategory(null);
      setDriverPaymentType(
        (defaultDriverPaymentType == null ? null : defaultDriverPaymentType) as DriverPaymentType | null
      );
    }
  }, [
    visible,
    defaultPartyId,
    lockedPartyId,
    lockedAmount,
    defaultTripId,
    defaultType,
    defaultContactId,
    defaultDriverPaymentType,
    initialEntry?.id,
    initialEntry?.amount_in,
    initialEntry?.amount_out,
    initialEntry?.contact_id,
    initialEntry?.trip_id,
    initialEntry?.description,
  ]);

  // Clear party when it is no longer in the filtered list (e.g. context or type/trip change). Skip when party is locked.
  useEffect(() => {
    if (!visible || isPartyLocked) return;
    if (partyId != null && !partyOptions.some((p) => p.id === partyId)) {
      setPartyId(null);
      if (partyId === "driver-salary") setDriverIdForSalary(null);
    }
  }, [visible, partyId, partyOptions, isPartyLocked]);
  // When switching away from "Driver salary", clear driver selection.
  useEffect(() => {
    if (!visible || effectivePartyId !== "driver-salary")
      setDriverIdForSalary(null);
  }, [visible, effectivePartyId]);

  // When party (client/supplier) changes, clear trip if the selected trip is not for this party.
  // Skip when tripLocked — trip is fixed and party is derived from it.
  useEffect(() => {
    if (!visible || tripLocked || !effectivePartyIdForTrips || !tripId) return;
    const trip = safeTrips.find((t) => t.id === tripId);
    if (!trip) return;
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    const isDriver = safeDrivers.some((d) => d.id === effectivePartyIdForTrips);
    const clientIdMatch = trip.client_id === effectivePartyIdForTrips;
    const clientNameMatch =
      Boolean(effectivePartyName && (trip.client_name || "").trim()) &&
      (trip.client_name || "").trim().toLowerCase() ===
        (effectivePartyName || "").trim().toLowerCase();
    const supplierLinkedOrgId =
      supplierLinkedOrgIds?.[effectivePartyIdForTrips];
    const tripMatches =
      clientIdMatch ||
      clientNameMatch ||
      (isSupplier &&
        (trip.supplier_id === effectivePartyIdForTrips ||
          (supplierLinkedOrgId != null &&
            (trip as { organization_id?: string }).organization_id ===
              supplierLinkedOrgId))) ||
      (isDriver && trip.driver_id === effectivePartyIdForTrips);
    if (!tripMatches) setTripId(null);
  }, [
    visible,
    effectivePartyIdForTrips,
    effectivePartyName,
    tripId,
    safeTrips,
    safeSuppliers,
    safeDrivers,
    type,
    supplierLinkedOrgIds,
  ]);

  // Sync entry date when opening for edit or new. When from client or trip, always use today.
  useEffect(() => {
    if (!visible) return;
    if (isPartyLocked || tripLocked) {
      setEntryDate(new Date().toISOString().slice(0, 10));
      return;
    }
    setEntryDate(
      initialEntry?.transaction_date?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
    );
  }, [visible, initialEntry?.id, initialEntry?.transaction_date, isPartyLocked, tripLocked]);

  // When IN + tagged trip: auto-select the trip's client (single option or first of list). When OUT + tagged trip: auto-select if single supplier/driver. Skip when party is locked.
  useEffect(() => {
    if (!visible || isPartyLocked) return;
    if (type === "in" && selectedTrip && partyOptions.length >= 1) {
      const firstId = partyOptions[0].id;
      const currentInList =
        partyId != null && partyOptions.some((c) => c.id === partyId);
      if (!currentInList && firstId) setPartyId(firstId);
      return;
    }
    if (
      type === "out" &&
      selectedTrip &&
      partyOptions.length === 1 &&
      partyOptions[0].id &&
      partyId !== partyOptions[0].id
    ) {
      setPartyId(partyOptions[0].id);
    }
  }, [visible, type, selectedTrip?.id, partyOptions, partyId, isPartyLocked]);

  // When user selects Trip-based commission or Monthly salary, auto-fill amount from commission due or salary (payable).
  useEffect(() => {
    if (!visible || !isDriverPayment || isEditMode) return;
    if (driverPaymentType === "settlement" && lockedAmount != null) {
      setAmountStr(String(lockedAmount));
    } else if (driverPaymentType === "salary" && salaryAmount != null) {
      setAmountStr(String(salaryAmount));
    }
  }, [
    visible,
    isDriverPayment,
    isEditMode,
    driverPaymentType,
    lockedAmount,
    salaryAmount,
  ]);

  // Full page: adjust scroll padding when keyboard opens so user can scroll to focused field and submit.
  useEffect(() => {
    if (!fullPage) return;
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardPaddingBottom(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardPaddingBottom(0);
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [fullPage]);

  // When Cash OUT: default category by party — supplier → SUPPLIER COST; otherwise DRIVER SALARY for backward compat.
  useEffect(() => {
    if (
      visible &&
      hidePartyForCashOut &&
      type === "out" &&
      category === "DRIVER SALARY"
    )
      setCategory(null);
  }, [visible, hidePartyForCashOut, type, category]);
  // Default category by party: Receivables (Cash IN) -> Trip Payment; Supplier (Cash OUT) -> Trip Payment; legacy Cash OUT -> SUPPLIER PAYMENT or DRIVER SALARY.
  useEffect(() => {
    if (!visible) return;
    if (type === "in") {
      if (!category || !CLIENT_CATEGORIES.includes(category as ClientCategory))
        setCategory("Trip Payment");
      return;
    }
    if (type === "out" && hidePartyForCashOut) return;
    if (type === "out" && isDriverPayment) return;
    if (type === "out" && isSupplierPayment) {
      if (
        !category ||
        !SUPPLIER_CATEGORIES.includes(category as SupplierCategory)
      )
        setCategory("Trip Payment");
      return;
    }
    if (type === "out") {
      if (category !== "SUPPLIER PAYMENT" && category !== "DRIVER SALARY")
        setCategory("SUPPLIER PAYMENT");
    }
  }, [
    visible,
    type,
    hidePartyForCashOut,
    isDriverPayment,
    isSupplierPayment,
    isClientPayment,
    category,
  ]);

  /** Vehicle number: from selected trip when present, else from explicit vehicle pick (aggregated flow). */
  const selectedVehicleNumber =
    type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory)
      ? selectedTrip?.vehicle_id
        ? (safeVehicles.find((v) => v.id === selectedTrip.vehicle_id!)
            ?.vehicle_number ?? null)
        : selectedVehicleIdForExpense
          ? (safeVehicles.find((v) => v.id === selectedVehicleIdForExpense)
              ?.vehicle_number ?? null)
          : null
      : null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    // When tripLocked, derive party from trip (no party field shown).
    let derivedContactId: string | null = null;
    let derivedContactType: AddTransactionData["contactType"] = null;
    let derivedPartyName: string | null = null;
    if (tripLocked && selectedTrip) {
      const isIntegrated = isCrossOrgIntegrationTrip(selectedTrip, viewerOrgId);

      if (type === "in") {
        let localCid: string | null = null;
        if (isIntegrated) {
          localCid =
            (linkedClientIdByOrgId instanceof Map
              ? linkedClientIdByOrgId.get(lid)
              : linkedClientIdByOrgId?.[lid]) ?? null;
        }

        if (localCid) {
          derivedContactId = localCid;
          derivedContactType = "client";
          derivedPartyName =
            safeClients.find((c) => c.id === localCid)?.name ??
            lockedPartyName ??
            defaultPartyName ??
            null;
        } else {
          derivedContactId = selectedTrip.client_id ?? null;
          derivedContactType = derivedContactId ? "client" : null;
          derivedPartyName = selectedTrip.client_name ?? null;
        }
      } else {
        let localSid: string | null = null;
        if (isIntegrated) {
          localSid =
            (linkedSupplierIdByOrgId instanceof Map
              ? linkedSupplierIdByOrgId.get(lid)
              : linkedSupplierIdByOrgId?.[lid]) ?? null;
        }

        if (localSid) {
          derivedContactId = localSid;
          derivedContactType = "supplier";
          derivedPartyName =
            safeSuppliers.find((s) => s.id === localSid)?.name ??
            lockedPartyName ??
            defaultPartyName ??
            null;
        } else if (
          isPartyLocked &&
          lockedPartyId &&
          safeSuppliers.some((s) => s.id === lockedPartyId)
        ) {
          derivedContactId = lockedPartyId;
          derivedContactType = "supplier";
          derivedPartyName =
            safeSuppliers.find((s) => s.id === lockedPartyId)?.name ??
            lockedPartyName ??
            null;
        } else {
          derivedContactId =
            selectedTrip.supplier_id ?? selectedTrip.driver_id ?? null;
          derivedContactType = selectedTrip.supplier_id
            ? "supplier"
            : selectedTrip.driver_id
              ? "driver"
              : null;
          derivedPartyName = selectedTrip.supplier_id
            ? (safeSuppliers.find((s) => s.id === selectedTrip!.supplier_id!)?.name ??
              (selectedTrip as { supplier_name?: string }).supplier_name ??
              null)
            : selectedTrip.driver_id
              ? (safeDrivers.find((d) => d.id === selectedTrip!.driver_id!)?.name ??
                null)
              : null;
        }
      }
    }
    const isUnlinkedMisc =
      !tripLocked && effectivePartyId === "misc";
    const contactType: AddTransactionData["contactType"] = tripLocked
      ? derivedContactType
      : isUnlinkedMisc
        ? null
        : isPartyLocked && effectivePartyId
          ? safeClients.some((c) => c.id === effectivePartyId)
            ? "client"
            : safeSuppliers.some((s) => s.id === effectivePartyId)
              ? "supplier"
              : safeDrivers.some((d) => d.id === effectivePartyId)
                ? "driver"
                : null
          : type === "in"
            ? "client"
            : type === "out" && effectivePartyId
              ? safeDrivers.some((d) => d.id === effectivePartyId)
                ? "driver"
                : "supplier"
              : null;
    const finalContactId =
      tripLocked && derivedContactId
        ? derivedContactId
        : isDriverSalaryParty
          ? driverIdForSalary
          : isUnlinkedMisc
            ? null
            : (effectivePartyId ?? undefined);
    const finalContactType =
      tripLocked ? derivedContactType : isDriverSalaryParty
        ? "driver"
        : isUnlinkedMisc
          ? null
          : (contactType ?? undefined);
    const finalDriverPaymentType = isDriverSalaryParty
      ? "salary"
      : isDriverPayment
        ? (driverPaymentType ?? undefined)
        : undefined;
    const finalPartyName =
      tripLocked && derivedPartyName
        ? derivedPartyName
        : isDriverSalaryParty
          ? "Driver salary"
          : isUnlinkedMisc
            ? "Misc / Unlinked"
            : (effectivePartyName ?? null);
    const normalizedCategory =
      category === "SUPPLIER COST" ? "SUPPLIER PAYMENT" : category;

    const data: AddTransactionData = {
      type,
      amount,
      partyId:
        tripLocked && derivedContactId
          ? derivedContactId
          : isUnlinkedMisc
            ? null
            : effectivePartyId,
      partyName: finalPartyName,
      tripId: isUnlinkedMisc ? null : tripId,
      tripNumber: isUnlinkedMisc ? null : tripNumber || null,
      category:
        type === "in"
          ? (isClientPayment || tripLocked)
            ? (normalizedCategory ?? undefined)
            : undefined
          : type === "out" && !isDriverPayment
            ? isVehicleExpenseOut
              ? (effectivePartyId ?? undefined)
              : (normalizedCategory ?? undefined)
            : undefined,
      driverPaymentType: finalDriverPaymentType,
      contactId: finalContactId ?? undefined,
      contactType: finalContactType ?? undefined,
      vehicleNumber: selectedVehicleNumber ?? undefined,
      driverName:
        type === "out" && finalContactType === "driver"
          ? (safeDrivers.find((d) => d.id === (finalContactId ?? ""))?.name ??
            effectivePartyName ??
            null)
          : undefined,
      indentId: selectedTrip?.indent_id ?? undefined,
      transactionDate: /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
        ? entryDate
        : undefined,
      paymentMode: paymentModeId,
      paymentReference: paymentReference.trim() || null,
    };
    if (isEditMode && initialEntry?.id) {
      onSubmit(data, { entryId: initialEntry.id });
      // Parent closes modal after update succeeds
    } else {
      onSubmit(data);
      setAmountStr("");
      setPartyId(null);
      setTripId(null);
      setCategory(null);
      setDriverPaymentType(null);
      onClose();
    }
  };

  const handleClose = () => {
    setShowPartyPicker(false);
    setShowTripPicker(false);
    setShowCategoryPicker(false);
    setShowDriverPaymentTypePicker(false);
    setShowDriverForSalaryPicker(false);
    setShowVehiclePicker(false);
    setSelectedVehicleIdForExpense(null);
    setPartyId(null);
    setDriverPaymentType(null);
    setDriverIdForSalary(null);
    onClose();
  };

  const closeAllPickers = () => {
    setShowPartyPicker(false);
    setShowTripPicker(false);
    setShowCategoryPicker(false);
    setShowDriverPaymentTypePicker(false);
    setShowDriverForSalaryPicker(false);
    setShowVehiclePicker(false);
    setShowPaymentPicker(false);
  };

  const pickerModalVisible =
    fullPage &&
    (showPartyPicker ||
      showTripPicker ||
      showCategoryPicker ||
      showDriverPaymentTypePicker ||
      showDriverForSalaryPicker ||
      showVehiclePicker ||
      showPaymentPicker);

  if (!visible && !fullPage) return null;
  if (fullPage && !visible) return null;

  const windowHeight = Dimensions.get("window").height;
  const panelHeight = Math.min(
    windowHeight * Layout.ledgerPanelHeightRatio,
    Layout.ledgerPanelMaxHeight,
  );
  const scrollContentPaddingBottom = fullPage
    ? 24 + keyboardPaddingBottom
    : 280;
  const submitButton = (
    <TouchableOpacity
      style={[
        styles.submitBtn,
        type === "in" ? styles.submitBtnIn : styles.submitBtnOut,
        !canSubmit && styles.submitBtnDisabled,
      ]}
      onPress={handleSubmit}
      disabled={!canSubmit}
      activeOpacity={0.9}
    >
      <Text style={styles.submitBtnText}>
        {isEditMode ? "UPDATE ENTRY" : "SAVE ENTRY"}
      </Text>
    </TouchableOpacity>
  );

  const formContent = (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoid, fullPage && styles.keyboardAvoidFullPage]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={fullPage ? 100 : 0}
    >
      <View
        style={[
          styles.panel,
          fullPage && styles.panelFullPage,
          {
            paddingBottom: fullPage
              ? 0
              : insets.bottom + Layout.modalBottomPadding,
            ...(fullPage
              ? {}
              : { height: panelHeight, maxHeight: panelHeight }),
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => {
            Keyboard.dismiss();
            closeAllPickers();
          }}
          scrollEnabled={
            fullPage ||
            (!showPartyPicker &&
              !showTripPicker &&
              !showCategoryPicker &&
              !showDriverPaymentTypePicker &&
              !showDriverForSalaryPicker)
          }
          style={styles.panelScroll}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={[
            styles.panelScrollContent,
            fullPage && styles.panelScrollContentFullPage,
            {
              paddingBottom: fullPage
                ? Math.max(16, scrollContentPaddingBottom)
                : scrollContentPaddingBottom,
              flexGrow: fullPage ? 1 : undefined,
            },
          ]}
        >
          <View style={styles.panelScrollInner}>
            {/* Header: LEDGER SYNC + optional "Entry for [name]" + IN/OUT toggle */}
            <View style={styles.headerRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.tagLabel, styles.title]}>
                  {isEditMode ? "EDIT ENTRY" : "LEDGER SYNC"}
                </Text>
                {entryContextLabel && !isPartyLocked && !tripLocked ? (
                  <Text style={[styles.tagLabel, styles.entryContextLabel]} numberOfLines={1}>
                    Entry for {entryContextLabel}
                  </Text>
                ) : null}
              </View>
              <View style={styles.toggleWrap}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    type === "in" && styles.toggleBtnIn,
                  ]}
                  onPress={() => setType("in")}
                  activeOpacity={0.8}
                  accessibilityLabel={
                    type === "in"
                      ? "Money in — selected"
                      : "Money in — tap to record cash received"
                  }
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      type === "in" && styles.toggleBtnTextActive,
                    ]}
                  >
                    IN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    type === "out" && styles.toggleBtnOut,
                  ]}
                  onPress={() => setType("out")}
                  activeOpacity={0.8}
                  accessibilityLabel={
                    type === "out"
                      ? "Money out — selected"
                      : "Money out — tap to record cash paid"
                  }
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      type === "out" && styles.toggleBtnTextActive,
                    ]}
                  >
                    OUT
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tiny tag when opened from client (party locked): show party name. Trip + date are in form below. */}
            {isPartyLocked && effectivePartyName ? (
              <View style={styles.tagsRow}>
                <View style={styles.tinyTag}>
                  <Text style={styles.tinyTagText}>{effectivePartyName}</Text>
                </View>
              </View>
            ) : null}

            {/* Amount: pre-filled from entity detail (e.g. Salary Due) when lockedAmount is set; always editable. */}
            <View style={styles.amountBlock}>
              <Text style={[styles.tagLabel, styles.amountLabel]}>AMOUNT (INR)</Text>
              <View style={styles.amountRow}>
                <Text
                  style={[
                    styles.amountSymbol,
                    type === "in"
                      ? styles.amountSymbolIn
                      : styles.amountSymbolOut,
                  ]}
                >
                  ₹
                </Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder={amountPlaceholder}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={visible || fullPage}
                  onFocus={() => {
                    if (fullPage && scrollRef.current) {
                      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
                    }
                  }}
                />
              </View>
              {amountStr.trim().length > 0 &&
              (amount <= 0 || !Number.isFinite(parseFloat(amountStr.replace(/,/g, "")))) ? (
                <Text style={styles.fieldErrorText}>Enter a valid amount.</Text>
              ) : null}
            </View>

            {/* Entry date + Trip: show date and trip in same row (trip near date). */}
            <View style={styles.twoCol}>
              <View style={styles.fieldBlock}>
                <Text style={[styles.tagLabel, styles.fieldLabel]}>ENTRY DATE</Text>
                <View style={styles.fieldInputDateWrap}>
                  <TextInput
                    style={[
                      styles.fieldInputDate,
                      entryDateError && styles.fieldInputError,
                    ]}
                    value={entryDate}
                    onChangeText={setEntryDate}
                    placeholder="2025-03-05"
                    placeholderTextColor={Theme.textMutedDemo}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    onFocus={() => {
                      if (fullPage && scrollRef.current) {
                        setTimeout(() => scrollRef.current?.scrollTo({ y: 200, animated: true }), 100);
                      }
                    }}
                    accessibilityLabel="Entry date — when the money was received or paid. Format: year, month, day."
                  />
                  {entryDateError ? (
                    <Text style={styles.fieldErrorText}>{entryDateError}</Text>
                  ) : null}
                </View>
              </View>
              {tripLocked ? (
                <View style={styles.fieldBlock}>
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>TRIP</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {tripNumber || lockedTripDisplay || "—"}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldBlock}
                  onPress={() => {
                    setShowPartyPicker(false);
                    setShowCategoryPicker(false);
                    setShowTripPicker((v) => !v);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>TRIP (optional)</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {tripNumber || "No trip"}
                  </Text>
                  <FontAwesome
                    name="chevron-down"
                    size={10}
                    color={Theme.textMutedDemo}
                    style={styles.fieldChevron}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Party: hidden when tripLocked (party derived from trip). */}
            {!tripLocked && !isPartyLocked ? (
              <TouchableOpacity
                style={styles.fieldBlockFull}
                onPress={() => {
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowPartyPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>PARTY / PERSON</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {effectivePartyName || "SELECT PARTY..."}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={Theme.textMutedDemo}
                  style={styles.fieldChevron}
                />
              </TouchableOpacity>
            ) : null}

            {supplierNeedsTrip && (
              <Text style={styles.hintText}>
                Supplier payments must be linked to a trip. Select a trip above.
              </Text>
            )}

            {type === "out" && isDriverSalaryParty && (
              <TouchableOpacity
                style={styles.fieldBlockFull}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowDriverPaymentTypePicker(false);
                  setShowDriverForSalaryPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>DRIVER</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {driverIdForSalary
                    ? (safeDrivers.find((d) => d.id === driverIdForSalary)
                        ?.name ?? "Driver")
                    : "SELECT DRIVER..."}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={Theme.textMutedDemo}
                  style={styles.fieldChevron}
                />
              </TouchableOpacity>
            )}
            {type === "in" && (
              <TouchableOpacity
                style={styles.fieldBlockFull}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  setShowCategoryPicker((v) => !v);
                  setShowDriverPaymentTypePicker(false);
                  setShowDriverForSalaryPicker(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>PAYMENT TYPE</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {category || "SELECT PAYMENT TYPE..."}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={Theme.textMutedDemo}
                  style={styles.fieldChevron}
                />
              </TouchableOpacity>
            )}
            {type === "out" && !isVehicleExpenseOut && !isDriverSalaryParty && (
              <TouchableOpacity
                style={styles.fieldBlockFull}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  if (isDriverPayment) {
                    setShowCategoryPicker(false);
                    setShowDriverPaymentTypePicker((v) => !v);
                  } else {
                    setShowDriverPaymentTypePicker(false);
                    setShowCategoryPicker((v) => !v);
                  }
                  setShowDriverForSalaryPicker(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagLabel, styles.fieldLabel]}>
                  {isDriverPayment ? "PAYMENT TYPE" : "CATEGORY"}
                </Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {isDriverPayment
                    ? driverPaymentType != null
                      ? (DRIVER_PAYMENT_TYPES.find(
                          (t) => t.type === driverPaymentType,
                        )?.label ?? driverPaymentType)
                      : "SELECT PAYMENT TYPE..."
                    : (category ?? "SELECT CATEGORY...")}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={10}
                  color={Theme.textMutedDemo}
                  style={styles.fieldChevron}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.fieldBlockFull}
              onPress={() => {
                setShowPartyPicker(false);
                setShowTripPicker(false);
                setShowCategoryPicker(false);
                setShowDriverPaymentTypePicker(false);
                setShowDriverForSalaryPicker(false);
                setShowPaymentPicker((v) => !v);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tagLabel, styles.fieldLabel]}>PAYMENT MODE</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? "Cash"}
              </Text>
              <FontAwesome
                name="chevron-down"
                size={10}
                color={Theme.textMutedDemo}
                style={styles.fieldChevron}
              />
            </TouchableOpacity>

            {paymentModeId !== 'CASH' && (
              <View style={[styles.fieldBlockFull, { marginTop: 0, borderTopWidth: 0 }]}>
                <Text style={[styles.tagLabel, styles.fieldLabel]}>REFERENCE NO / UTR</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={paymentReference}
                  onChangeText={setPaymentReference}
                  placeholder="Refer the bank to validate"
                  placeholderTextColor={Theme.textMutedDemo}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  accessibilityLabel="Reference Number or UTR"
                  onFocus={() => {
                    if (fullPage && scrollRef.current) {
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                    }
                  }}
                />
              </View>
            )}

            {showDriverForSalaryPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !driverIdForSalary && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setDriverIdForSalary(null);
                      setShowDriverForSalaryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>SELECT DRIVER...</Text>
                  </TouchableOpacity>
                  {safeDrivers.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.pickerItem,
                        driverIdForSalary === d.id && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setDriverIdForSalary(d.id);
                        setShowDriverForSalaryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText} numberOfLines={1}>
                        {d.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {showDriverPaymentTypePicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !driverPaymentType && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setDriverPaymentType(null);
                      setShowDriverPaymentTypePicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>
                      SELECT PAYMENT TYPE...
                    </Text>
                  </TouchableOpacity>
                  {DRIVER_PAYMENT_TYPES.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.pickerItem,
                        driverPaymentType === opt.type &&
                          styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setDriverPaymentType(opt.type);
                        setShowDriverPaymentTypePicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showCategoryPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !category && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setCategory(null);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>
                      {type === "in"
                        ? "SELECT PAYMENT TYPE..."
                        : "SELECT CATEGORY..."}
                    </Text>
                  </TouchableOpacity>
                  {categoriesForPicker.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.pickerItem,
                        category === cat && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setCategory(cat);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showPaymentPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {PAYMENT_MODES.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.pickerItem,
                        paymentModeId === opt.id && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setPaymentModeId(opt.id);
                        setShowPaymentPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{opt.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory) && (
              <>
                <TouchableOpacity
                  style={styles.vehicleRow}
                  onPress={() => {
                    if (safeVehicles.length > 0) {
                      setShowPartyPicker(false);
                      setShowTripPicker(false);
                      setShowCategoryPicker(false);
                      setShowDriverPaymentTypePicker(false);
                      setShowDriverForSalaryPicker(false);
                      setShowVehiclePicker((v) => !v);
                    }
                  }}
                  activeOpacity={safeVehicles.length > 0 ? 0.8 : 1}
                  disabled={safeVehicles.length === 0}
                >
                  <Text style={[styles.tagLabel, styles.fieldLabel]}>VEHICLE</Text>
                  <Text style={styles.vehicleValue} numberOfLines={1}>
                    {selectedVehicleNumber
                      ? formatIndianVehicleNumber(selectedVehicleNumber)
                      : safeVehicles.length > 0
                        ? "Select vehicle..."
                        : "No vehicles"}
                  </Text>
                  {safeVehicles.length > 0 ? (
                    <FontAwesome
                      name="chevron-down"
                      size={10}
                      color={Theme.textMutedDemo}
                      style={styles.fieldChevron}
                    />
                  ) : null}
                </TouchableOpacity>
                {showVehiclePicker && safeVehicles.length > 0 && !fullPage && (
                  <View style={styles.pickerList}>
                    <ScrollView
                      style={styles.pickerScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                    >
                      <TouchableOpacity
                        style={[
                          styles.pickerItem,
                          !selectedVehicleIdForExpense &&
                            !selectedTrip?.vehicle_id &&
                          styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setSelectedVehicleIdForExpense(null);
                          setShowVehiclePicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemText}>
                          General (no vehicle)
                        </Text>
                      </TouchableOpacity>
                      {safeVehicles.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.pickerItem,
                            (selectedVehicleIdForExpense === v.id ||
                              selectedTrip?.vehicle_id === v.id) &&
                              styles.pickerItemActive,
                          ]}
                          onPress={() => {
                            setSelectedVehicleIdForExpense(v.id);
                            setShowVehiclePicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemText} numberOfLines={1}>
                            {formatIndianVehicleNumber(v.vehicle_number ?? "")}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {showPartyPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => {
                      setPartyId(null);
                      setShowPartyPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>SELECT PARTY...</Text>
                  </TouchableOpacity>
                  {partyOptions.length === 0 ? (
                    <View style={styles.pickerItem}>
                      <Text style={styles.pickerEmptyText}>
                        {type === "in" && selectedTrip
                          ? "No client associated with this trip."
                          : partyContext === "customers"
                            ? "No customers. Add clients from Home."
                            : partyContext === "suppliers"
                              ? "No suppliers. Add suppliers first."
                              : "No parties available."}
                      </Text>
                    </View>
                  ) : (
                    partyOptions.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.pickerItem,
                          partyId === c.id && styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setPartyId(c.id);
                          setShowPartyPicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemText} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {showTripPicker && !fullPage && (
              <View style={styles.pickerList}>
                <ScrollView
                  style={styles.pickerScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      !tripId && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setTripId(null);
                      setShowTripPicker(false);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.pickerItemText}>General</Text>
                  </TouchableOpacity>
                  {filteredTrips.map((t) => {
                    const routeAndDate = [t.route_label, t.trip_date]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.pickerItem,
                          tripId === t.id && styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setTripId(t.id);
                          setShowTripPicker(false);
                        }}
                        activeOpacity={0.6}
                      >
                        <View style={styles.pickerItemTripContent}>
                          <Text style={styles.pickerItemText} numberOfLines={1}>
                            {t.trip_number}
                          </Text>
                          {routeAndDate ? (
                            <Text
                              style={styles.pickerItemSubtext}
                              numberOfLines={1}
                            >
                              {routeAndDate}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {!fullPage && submitButton}
          </View>
        </ScrollView>

        {fullPage && (
          <View
            style={[
              styles.fullPageFooter,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            {submitButton}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  const pickerModalScrollStyle = [styles.pickerScroll, styles.pickerModalScroll];

  const renderPickerModalContent = () => {
    if (showTripPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !tripId && styles.pickerItemActive]} onPress={() => { setTripId(null); setShowTripPicker(false); }} activeOpacity={0.6}>
            <Text style={styles.pickerItemText}>General</Text>
          </TouchableOpacity>
          {filteredTrips.map((t) => {
            const routeAndDate = [t.route_label, t.trip_date].filter(Boolean).join(" · ");
            return (
              <TouchableOpacity key={t.id} style={[styles.pickerItem, tripId === t.id && styles.pickerItemActive]} onPress={() => { setTripId(t.id); setShowTripPicker(false); }} activeOpacity={0.6}>
                <View style={styles.pickerItemTripContent}>
                  <Text style={styles.pickerItemText} numberOfLines={1}>{t.trip_number}</Text>
                  {routeAndDate ? <Text style={styles.pickerItemSubtext} numberOfLines={1}>{routeAndDate}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }
    if (showCategoryPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !category && styles.pickerItemActive]} onPress={() => { setCategory(null); setShowCategoryPicker(false); }}>
            <Text style={styles.pickerItemText}>{type === "in" ? "SELECT PAYMENT TYPE..." : "SELECT CATEGORY..."}</Text>
          </TouchableOpacity>
          {categoriesForPicker.map((cat) => (
            <TouchableOpacity key={cat} style={[styles.pickerItem, category === cat && styles.pickerItemActive]} onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}>
              <Text style={styles.pickerItemText}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showPartyPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={styles.pickerItem} onPress={() => { setPartyId(null); setShowPartyPicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT PARTY...</Text>
          </TouchableOpacity>
          {partyOptions.length === 0 ? (
            <View style={styles.pickerItem}><Text style={styles.pickerEmptyText}>{type === "in" && selectedTrip ? "No client associated with this trip." : partyContext === "customers" ? "No customers. Add clients from Home." : partyContext === "suppliers" ? "No suppliers. Add suppliers first." : "No parties available."}</Text></View>
          ) : (
            partyOptions.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.pickerItem, partyId === c.id && styles.pickerItemActive]} onPress={() => { setPartyId(c.id); setShowPartyPicker(false); }}>
                <Text style={styles.pickerItemText} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      );
    }
    if (showDriverPaymentTypePicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !driverPaymentType && styles.pickerItemActive]} onPress={() => { setDriverPaymentType(null); setShowDriverPaymentTypePicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT PAYMENT TYPE...</Text>
          </TouchableOpacity>
          {DRIVER_PAYMENT_TYPES.map((opt) => (
            <TouchableOpacity key={opt.label} style={[styles.pickerItem, driverPaymentType === opt.type && styles.pickerItemActive]} onPress={() => { setDriverPaymentType(opt.type); setShowDriverPaymentTypePicker(false); }}>
              <Text style={styles.pickerItemText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showDriverForSalaryPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !driverIdForSalary && styles.pickerItemActive]} onPress={() => { setDriverIdForSalary(null); setShowDriverForSalaryPicker(false); }}>
            <Text style={styles.pickerItemText}>SELECT DRIVER...</Text>
          </TouchableOpacity>
          {safeDrivers.map((d) => (
            <TouchableOpacity key={d.id} style={[styles.pickerItem, driverIdForSalary === d.id && styles.pickerItemActive]} onPress={() => { setDriverIdForSalary(d.id); setShowDriverForSalaryPicker(false); }}>
              <Text style={styles.pickerItemText} numberOfLines={1}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showPaymentPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          {PAYMENT_MODES.map((opt) => (
            <TouchableOpacity key={opt.id} style={[styles.pickerItem, paymentModeId === opt.id && styles.pickerItemActive]} onPress={() => { setPaymentModeId(opt.id); setShowPaymentPicker(false); }}>
              <Text style={styles.pickerItemText}>{opt.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (showVehiclePicker && safeVehicles.length > 0) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity style={[styles.pickerItem, !selectedVehicleIdForExpense && !selectedTrip?.vehicle_id && styles.pickerItemActive]} onPress={() => { setSelectedVehicleIdForExpense(null); setShowVehiclePicker(false); }}>
            <Text style={styles.pickerItemText}>General (no vehicle)</Text>
          </TouchableOpacity>
          {safeVehicles.map((v) => (
            <TouchableOpacity key={v.id} style={[styles.pickerItem, (selectedVehicleIdForExpense === v.id || selectedTrip?.vehicle_id === v.id) && styles.pickerItemActive]} onPress={() => { setSelectedVehicleIdForExpense(v.id); setShowVehiclePicker(false); }}>
              <Text style={styles.pickerItemText} numberOfLines={1}>{formatIndianVehicleNumber(v.vehicle_number ?? "")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    return null;
  };

  if (fullPage) {
    return (
      <>
        {formContent}
        {pickerModalVisible ? (
          <Modal transparent visible animationType="fade" onRequestClose={closeAllPickers}>
            <View style={[styles.pickerModalContainer, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeAllPickers} activeOpacity={1} />
              <View style={[styles.pickerModalPanel, { height: Math.min(windowHeight * 0.5, 380) }]} pointerEvents="auto">
                {renderPickerModalContent()}
              </View>
            </View>
          </Modal>
        ) : null}
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => {
            const hasOpenPicker =
              showPartyPicker ||
              showTripPicker ||
              showCategoryPicker ||
              showDriverPaymentTypePicker ||
              showDriverForSalaryPicker ||
              showVehiclePicker ||
              showPaymentPicker;
            if (hasOpenPicker) {
              closeAllPickers();
            } else {
              handleClose();
            }
          }}
          activeOpacity={1}
        />
        {formContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  keyboardAvoid: {
    width: "100%",
  },
  keyboardAvoidFullPage: {
    flex: 1,
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  panelFullPage: {
    flex: 1,
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: Theme.surface,
  },
  fullPageFooter: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  hintText: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: -4,
    marginBottom: 8,
  },
  panelScroll: { flex: 1, minHeight: 0 },
  panelScrollInner: { gap: 28 },
  panelScrollContent: { gap: 28, paddingBottom: 8 },
  panelScrollContentFullPage: { gap: 24, paddingBottom: 8, paddingTop: 4 },
  /** Non-editable labels shown as small tags above/beside inputs. */
  tagLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  toggleBtnIn: {
    backgroundColor: Theme.darkGreen,
    shadowColor: Theme.darkGreen,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtnOut: {
    backgroundColor: Theme.teslaRed,
    shadowColor: Theme.teslaRed,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  toggleBtnTextActive: { color: Theme.textOnPrimary },
  entryContextLabel: {
    fontSize: 10,
    marginTop: 4,
    opacity: 0.9,
  },

  amountBlock: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    padding: 20,
    minHeight: 72,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  amountLabel: {
    marginBottom: 10,
  },
  amountRow: { flexDirection: "row", alignItems: "center", minHeight: 36 },
  amountSymbol: {
    fontSize: 22,
    fontWeight: "800",
    marginRight: 10,
  },
  amountSymbolIn: { color: Theme.darkGreen },
  amountSymbolOut: { color: Theme.teslaRed },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    borderWidth: 0,
    letterSpacing: -0.5,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  tinyTag: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tinyTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  twoCol: { flexDirection: "row", gap: 12 },
  twoColSingle: {},
  fieldBlock: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: Layout.minTouchTargetSize + 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  fieldBlockFull: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: Layout.minTouchTargetSize + 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  fieldLabel: {
    marginRight: 8,
  },
  fieldValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  fieldInputDateWrap: { flex: 1, minWidth: 0 },
  fieldInputDate: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 6,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  fieldInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  fieldInputError: { borderWidth: 1, borderColor: Theme.negative, borderRadius: 8 },
  fieldErrorText: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 6,
  },
  fieldChevron: { marginLeft: 6 },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 8,
    minHeight: Layout.minTouchTargetSize + 4,
  },
  vehicleValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },

  pickerList: {
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  pickerModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerModalPanel: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerScroll: {
    flex: 1,
    height: 220,
  },
  pickerModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  pickerItemActive: {
    backgroundColor: Theme.surface,
  },
  pickerItemTripContent: { flex: 1 },
  pickerItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  pickerItemSubtext: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
    textTransform: "none",
  },
  pickerEmptyText: {
    fontSize: 12,
    color: Theme.textMutedDemo,
    fontStyle: "italic",
  },

  submitBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    minHeight: Layout.minTouchTargetSize + 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnIn: {
    backgroundColor: Theme.darkGreen,
    shadowColor: Theme.darkGreen,
    shadowOpacity: 0.2,
  },
  submitBtnOut: {
    backgroundColor: Theme.buttonPrimary,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
});
