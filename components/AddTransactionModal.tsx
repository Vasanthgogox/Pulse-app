/**
 * Add Transaction modal — demo-style ledger sync (IN/OUT, amount, party, link MSN).
 * Ledger entry form: LEDGER SYNC title, IN (green) / OUT (red) toggle, amount, party + trip dropdowns, SAVE ENTRY.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { LedgerRow } from "@/features/finance";
import { PartyAvatar } from "@/components/PartyAvatar";
import { formatIndianVehicleNumber, formatINR } from "@/lib/format";
import { computeTripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import { resolveTripLedgerTripType } from "@/features/finance/utils/tripLedgerPayoutMode.util";
import type { DriverOffer } from "@/features/drivers/services/drivers.service";
import { isTripCompleted } from "@/features/trips/services/trips.service";
import type { TripLedgerSmartTag } from "@/components/TripLedgerFinancialSummary";
import { VALIDATION, dateISO } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  isCrossOrgIntegrationTrip,
  isIntegratedClientRow,
  isIntegratedSupplierRow,
  isLoadBasedTrip,
} from "@/features/trips/visibility/tripVisibility";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleEllipsis,
  Clock,
  CreditCard,
  FileText,
  Fuel,
  Hash,
  MinusCircle,
  Package,
  ParkingCircle,
  Percent,
  PlusCircle,
  Search,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  Timer,
  Truck,
  Undo2,
  User,
  Wallet,
  Wrench,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Ledger sync full-page — protocol tiles & typography (matches web reference). */
const LEDGER_SLATE = "#0f172a";
const LEDGER_PROTOCOL_ICON = "#a5b4fc";
const LEDGER_LUCIDE_STROKE = 2.2;

/**
 * Smooths viewport width used for ledger breakpoints. On web, `useWindowDimensions` can
 * oscillate by a few pixels when scrollbars appear, flipping stack vs split layout repeatedly.
 */
function useStableLayoutWidth(rawWidth: number): number {
  const [stable, setStable] = useState(() => Math.round(rawWidth));
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setStable((prev) => {
        const next = Math.round(rawWidth);
        if (Math.abs(next - prev) < 24) return prev;
        return next;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [rawWidth]);
  return stable;
}

/** Original split/stack boundary (680). Hysteresis band avoids scrollbar layout thrash on web. */
const LEDGER_STACK_TRIP_BAND_CENTER = 680;
const LEDGER_STACK_TRIP_BAND_HYST = 48;

/**
 * Stack vs split for the trip band (~680px), with hysteresis on **raw** window width.
 * Uses raw width so layout mode stays in sync when scrollbars resize the viewport; pairing this
 * with `useStableLayoutWidth` alone could desync and still flicker. Dead zone prevents flip-flop.
 */
function useStableStackTripBand(rawWidth: number): boolean {
  const [stacked, setStacked] = useState(
    () => Math.round(rawWidth) < LEDGER_STACK_TRIP_BAND_CENTER,
  );
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const w = Math.round(rawWidth);
      const splitAt = LEDGER_STACK_TRIP_BAND_CENTER + LEDGER_STACK_TRIP_BAND_HYST;
      const stackAt = LEDGER_STACK_TRIP_BAND_CENTER - LEDGER_STACK_TRIP_BAND_HYST;
      setStacked((prev) => {
        if (w >= splitAt) return false;
        if (w < stackAt) return true;
        return prev;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [rawWidth]);
  return stacked;
}

/** Colour Lucide icons for ledger payment mode tiles (full-page grid). */
function ledgerPaymentModeLucide(modeId: string, size = 20) {
  const p = { size, strokeWidth: LEDGER_LUCIDE_STROKE };
  switch (modeId) {
    case "CASH":
      return <Banknote {...p} color="#16a34a" />;
    case "UPI":
      return <Smartphone {...p} color="#7c3aed" />;
    case "BANK":
      return <Building2 {...p} color="#2563eb" />;
    case "CHEQUE":
      return <FileText {...p} color="#db2777" />;
    case "FUEL_CARD":
      return <CreditCard {...p} color="#ea580c" />;
    case "FASTAG":
      return <Ticket {...p} color="#0891b2" />;
    case "CREDIT":
      return <Clock {...p} color="#64748b" />;
    default:
      return <Wallet {...p} color="#94a3b8" />;
  }
}

/** Colour Lucide icons for payment type / category / driver-type keys. */
function ledgerPaymentTypeLucide(kind: string, size = 20) {
  const p = { size, strokeWidth: LEDGER_LUCIDE_STROKE };
  switch (kind) {
    case "Trip Payment":
      return <Truck {...p} color="#2563eb" />;
    case "Advance Payment":
    case "Advance from Client":
    case "Advance":
      return <ArrowUpRight {...p} color="#16a34a" />;
    case "Partial Payment":
      return <ArrowLeftRight {...p} color="#d97706" />;
    case "Balance Payment":
      return <CheckCircle2 {...p} color="#0d9488" />;
    case "Extra Charges":
      return <PlusCircle {...p} color="#ca8a04" />;
    case "Detention Charges":
      return <Timer {...p} color="#ea580c" />;
    case "Cancellation Charges":
      return <Ban {...p} color="#dc2626" />;
    case "Commission":
      return <Percent {...p} color="#7c3aed" />;
    case "Penalty":
      return <AlertTriangle {...p} color="#e11d48" />;
    case "Adjustment":
      return <Sliders {...p} color="#64748b" />;
    case "Other":
      return <CircleEllipsis {...p} color="#94a3b8" />;
    case "salary":
      return <User {...p} color="#2563eb" />;
    case "settlement":
      return <CheckCircle2 {...p} color="#16a34a" />;
    case "advance":
      return <ArrowUpRight {...p} color="#d97706" />;
    case "reimbursement":
      return <Undo2 {...p} color="#8b5cf6" />;
    case "bonus":
      return <Star {...p} color="#ca8a04" />;
    case "deduction":
      return <MinusCircle {...p} color="#dc2626" />;
    case "Fuel":
      return <Fuel {...p} color="#15803d" />;
    case "Toll":
      return <ArrowLeftRight {...p} color="#0ea5e9" />;
    case "Maintenance":
    case "Repair":
      return <Wrench {...p} color="#64748b" />;
    case "Tyre":
      return <Package {...p} color="#57534e" />;
    case "Insurance":
      return <Shield {...p} color="#1d4ed8" />;
    case "Permit / Tax":
      return <FileText {...p} color="#7c3aed" />;
    case "Parking":
      return <ParkingCircle {...p} color="#0891b2" />;
    case "Cleaning":
      return <Sparkles {...p} color="#db2777" />;
    case "SUPPLIER PAYMENT":
    case "DRIVER SALARY":
    case "DRIVER COMMISSION":
    case "SUPPLIER COST":
      return <Wallet {...p} color="#0f766e" />;
    default:
      return <Package {...p} color="#94a3b8" />;
  }
}

function ledgerIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLedgerDateDdMmYyyy(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, day] = iso.split("-").map((x) => parseInt(x, 10));
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Stable noon local parse for ISO `YYYY-MM-DD` (DateTimePicker value). */
function ledgerDateFromIso(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  return new Date(`${iso}T12:00:00`);
}

const LEDGER_DATE_PICKER_MIN = new Date(2000, 0, 1);
const LEDGER_DATE_PICKER_MAX = new Date(2037, 11, 31);

function parseLedgerDateDraftToIso(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d)
    return null;
  return ledgerIsoFromDate(dt);
}

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

/**
 * Split a non-negative integer total across buckets proportional to weights (≥0).
 * Remainder units go to the largest fractional remainders. Equal split when all weights are 0.
 */
export function allocateIntegerByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sumW <= 0) {
    const base = Math.floor(safeTotal / n);
    const rem = safeTotal - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }
  const raw = weights.map((w) => (safeTotal * Math.max(0, w)) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = safeTotal - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

/** Legacy expense categories (backward compat); prefer CLIENT/SUPPLIER/DRIVER/VEHICLE_CATEGORIES. */
export const EXPENSE_CATEGORIES = [
  "DRIVER SALARY",
  "DRIVER COMMISSION",
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

/** True when mode is cash (case-insensitive so stored/legacy values still match). */
function isLedgerCashPaymentMode(id: string | null | undefined): boolean {
  return (id ?? "").trim().toUpperCase() === "CASH";
}

const LEDGER_LAST_PAYMENT_MODE_KEY = "@q/ledger_last_payment_mode";
type FontAwesomeIconName = React.ComponentProps<typeof FontAwesome>["name"];

const PAYMENT_MODE_ICON: Record<string, FontAwesomeIconName> = {
  CASH: "money",
  UPI: "mobile",
  BANK: "bank",
  CHEQUE: "file-text-o",
  FUEL_CARD: "credit-card",
  FASTAG: "ticket",
  CREDIT: "clock-o",
};

/** Short labels for ledger protocol grid (2×N tiles). */
const PAYMENT_MODE_LABEL_SHORT: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank",
  CHEQUE: "Cheque",
  FUEL_CARD: "Fuel card",
  FASTAG: "FASTag",
  CREDIT: "Credit",
};

const PAYMENT_TYPE_ICON: Record<string, FontAwesomeIconName> = {
  "Trip Payment": "truck",
  "Advance Payment": "arrow-up",
  "Advance from Client": "arrow-up",
  Advance: "arrow-up",
  "Partial Payment": "exchange",
  "Balance Payment": "check-circle-o",
  "Extra Charges": "plus-circle",
  "Detention Charges": "clock-o",
  "Cancellation Charges": "ban",
  Commission: "line-chart",
  "DRIVER COMMISSION": "line-chart",
  Penalty: "exclamation-triangle",
  "Permit / Tax": "file-text-o",
  Fuel: "tint",
  Toll: "road",
  Maintenance: "wrench",
  Repair: "wrench",
  Insurance: "shield",
  Parking: "car",
  Cleaning: "magic",
  Adjustment: "sliders",
  Reimbursement: "undo",
  Bonus: "star",
  Deduction: "minus-circle",
  salary: "user",
  settlement: "check",
  advance: "arrow-up",
  reimbursement: "undo",
  bonus: "star",
  deduction: "minus-circle",
  adjustment: "sliders",
  Other: "ellipsis-h",
};

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

/** One row when splitting a single payment across multiple trips (ledger sync). */
export type TripLedgerAllocation = {
  tripId: string;
  amount: number;
  tripNumber?: string | null;
  indentId?: string | null;
};

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
  /** When set (multi-trip batch), parent creates one ledger row per item with that trip_id and amount. */
  tripAllocations?: TripLedgerAllocation[];
}

export interface PartyOption {
  id: string;
  name: string;
  /** Optional — used in ledger trip list avatars when linked by id. */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  /** Integrated client — indent trips owned by linked org may still be receivable for this client. */
  linked_organization_id?: string | null;
  is_integrated?: boolean;
  /** Integrated supplier — org-as-shipper trips. */
  supplier_type?: string | null;
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
  driver_display_name?: string | null;
  supplier_name?: string | null;
  /** Trip owner org — required to match integrated client/supplier loads safely. */
  organization_id?: string | null;
  /** For trip-first smart tags & financial summary (from TripRow / API). */
  client_price?: number | null;
  supplier_rate?: number | null;
  driver_commission?: number | null;
  distance?: string | number | null;
  is_cross_org_supplier?: boolean | null;
  /** Non-owner indent: subcontract cost for supplier payable. */
  subcontract_rate?: number | null;
  /** DB: market = supplier payout; asset = driver + vehicle. When null, inferred from supplier_id. */
  trip_payout_mode?: string | null;
  /** Trip lifecycle — used for Active vs Completed filters on mission list. */
  status?: string | null;
  completed_at?: string | null;
}

/** Pending due for the active ledger direction — matches mission due chips & payout lane masking. */
function tripFinancialSnapshotHasRelevantDue(
  snap: ReturnType<typeof computeTripEntryFinancialSnapshot> | null | undefined,
  ledgerFlow: "in" | "out",
): boolean {
  if (!snap) return false;
  const f = snap.financials;
  if (ledgerFlow === "in") {
    return f.client_receivable > 0;
  }
  return f.supplier_payable > 0 || f.driver_payable > 0;
}

function tripOptionToLedgerFinancialInput(t: TripOption) {
  return {
    id: t.id,
    organization_id: t.organization_id ?? null,
    indent_id: t.indent_id ?? null,
    client_id: t.client_id ?? null,
    supplier_id: t.supplier_id ?? null,
    driver_id: t.driver_id ?? null,
    client_price: t.client_price ?? null,
    supplier_rate: t.supplier_rate ?? null,
    driver_commission: t.driver_commission ?? null,
    distance: t.distance ?? null,
    is_cross_org_supplier: t.is_cross_org_supplier ?? null,
    subcontract_rate: t.subcontract_rate ?? null,
    trip_payout_mode: t.trip_payout_mode ?? null,
  };
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
  /** When set, used to compute trip financial summary + smart tags (trip-first ledger). */
  ledgerTransactions?: LedgerRow[] | null;
  /** Commission terms by driver id — improves driver payable on smart tags. */
  driverOffersByDriverId?: Record<string, DriverOffer> | null;
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
  ledgerTransactions = null,
  driverOffersByDriverId = null,
}: AddTransactionModalProps) {
  const insets = useSafeAreaInsets();
  const { width: winWRaw } = useWindowDimensions();
  const winW = useStableLayoutWidth(winWRaw);
  const stackTripFinancialBand = useStableStackTripBand(winWRaw);
  const isLedgerWide = winW >= 900;
  /** Full-page ledger horizontal padding — tighter on phones so all cards stay readable. */
  const ledgerFullPagePadH = winW < 420 ? 14 : stackTripFinancialBand ? 16 : 20;
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
  /** Ledger mission list: multiple trips allowed; submit splits amount across rows by suggested dues. */
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string>(PAYMENT_MODES[0].id);
  const [paymentReference, setPaymentReference] = useState<string>("");
  const ledgerPaymentModeHydratedRef = useRef(false);
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
  const [paymentModeExpanded, setPaymentModeExpanded] = useState(true);
  const [paymentTypeExpanded, setPaymentTypeExpanded] = useState(true);
  const [tripSearch, setTripSearch] = useState("");
  const deferredTripSearch = useDeferredValue(tripSearch);
  /** Mission trip list filters (full-page ledger). */
  const [missionTripFilterDue, setMissionTripFilterDue] = useState<
    "all" | "has_due" | "no_due"
  >("all");
  const [missionTripFilterPayout, setMissionTripFilterPayout] = useState<
    "all" | "asset" | "aggregate"
  >("all");
  const [missionTripFilterLifecycle, setMissionTripFilterLifecycle] = useState<
    "all" | "active" | "completed"
  >("all");
  /** Full-page ledger: show reconciliation summary in a confirm overlay before save. */
  const [ledgerSubmitConfirmVisible, setLedgerSubmitConfirmVisible] =
    useState(false);
  const [syncDateFieldFocused, setSyncDateFieldFocused] = useState(false);
  const [syncDateDraft, setSyncDateDraft] = useState("");
  const [ledgerSyncDatePickerVisible, setLedgerSyncDatePickerVisible] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(
    () =>
      initialEntry?.transaction_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  /** When fullPage: extra bottom padding so scroll can bring content above keyboard. */
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(0);
  /** Trip-first smart tags: highlight cleared when amount diverges from tag suggestion. */
  const [smartTagHighlight, setSmartTagHighlight] = useState<TripLedgerSmartTag | null>(null);
  const [smartTagSuggestedAmount, setSmartTagSuggestedAmount] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const isEditMode = Boolean(initialEntry?.id);
  /** Lock from route/entity when id is anchored; display name may resolve a tick later (avoids layout flip). */
  const isPartyLocked = lockedPartyId != null;
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
  const amount = Math.round(
    parseFloat(amountStr.replace(/,/g, "").trim()) || 0,
  );

  /** When a client or supplier is selected (or party is locked), show only trips related to that party. */
  const effectivePartyIdForTrips = isPartyLocked ? lockedPartyId : partyId;
  const filteredTrips = useMemo(() => {
    const linkedMapGet = (
      m: Record<string, string> | Map<string, string> | undefined,
      key: string,
    ): string | undefined => {
      if (!m) return undefined;
      return m instanceof Map ? m.get(key) : m[key];
    };

    const tripOrgId = (t: TripOption) =>
      (t.organization_id ?? (t as { organization_id?: string | null }).organization_id) ??
      null;

    /** Strict client match: same client_id on trip, or integrated load where org + map resolve to this client. */
    const tripMatchesClient = (t: TripOption, clientId: string): boolean => {
      if ((t.client_id ?? "").trim() === clientId) return true;
      const client = safeClients.find((c) => c.id === clientId);
      if (!client || !isIntegratedClientRow(client)) return false;
      const linkedOrgId = client.linked_organization_id ?? null;
      if (!linkedOrgId || !isLoadBasedTrip(t)) return false;
      if (tripOrgId(t) !== linkedOrgId) return false;
      return linkedMapGet(linkedClientIdByOrgId, linkedOrgId) === clientId;
    };

    /** Strict supplier match: same supplier_id on trip, or integrated shipper load for this supplier only. */
    const tripMatchesSupplier = (t: TripOption, supplierId: string): boolean => {
      if ((t.supplier_id ?? "").trim() === supplierId) return true;
      const supplier = safeSuppliers.find((s) => s.id === supplierId);
      if (!supplier || !isIntegratedSupplierRow(supplier)) return false;
      const linkedOrgId = supplier.linked_organization_id ?? null;
      if (!linkedOrgId || !isLoadBasedTrip(t)) return false;
      if (tripOrgId(t) !== linkedOrgId) return false;
      return linkedMapGet(linkedSupplierIdByOrgId, linkedOrgId) === supplierId;
    };

    // Garage vehicle expense: only trips for the selected vehicle (never all trips).
    if (hidePartyForCashOut && type === "out") {
      if (selectedVehicleIdForExpense)
        return safeTrips.filter((t) => (t.vehicle_id ?? "").trim() === selectedVehicleIdForExpense);
      return [];
    }

    if (
      !effectivePartyIdForTrips ||
      effectivePartyIdForTrips === "misc"
    ) {
      return [];
    }

    if (effectivePartyIdForTrips === "driver-salary") {
      if (!driverIdForSalary) return [];
      return safeTrips.filter((t) => (t.driver_id ?? "").trim() === driverIdForSalary);
    }

    if (partyContext === "customers") {
      return safeTrips.filter((t) =>
        tripMatchesClient(t, effectivePartyIdForTrips),
      );
    }
    if (partyContext === "suppliers") {
      return safeTrips.filter((t) =>
        tripMatchesSupplier(t, effectivePartyIdForTrips),
      );
    }

    const isClient = safeClients.some((c) => c.id === effectivePartyIdForTrips);
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    if (isClient) {
      return safeTrips.filter((t) =>
        tripMatchesClient(t, effectivePartyIdForTrips),
      );
    }
    if (isSupplier) {
      return safeTrips.filter((t) =>
        tripMatchesSupplier(t, effectivePartyIdForTrips),
      );
    }
    if (safeDrivers.some((d) => d.id === effectivePartyIdForTrips)) {
      return safeTrips.filter(
        (t) => (t.driver_id ?? "").trim() === effectivePartyIdForTrips,
      );
    }
    return [];
  }, [
    safeTrips,
    effectivePartyIdForTrips,
    partyContext,
    safeClients,
    safeSuppliers,
    safeDrivers,
    isPartyLocked,
    lockedPartyId,
    linkedClientIdByOrgId,
    linkedSupplierIdByOrgId,
    hidePartyForCashOut,
    type,
    selectedVehicleIdForExpense,
    driverIdForSalary,
  ]);

  /** Full-page global ledger: show all trips until party is chosen (trip-first). */
  const ledgerMissionTripsBase = useMemo(() => {
    if (hidePartyForCashOut && type === "out") return filteredTrips;
    if (fullPage && !tripLocked && partyContext === "all" && partyId == null) {
      return safeTrips;
    }
    return filteredTrips;
  }, [
    fullPage,
    tripLocked,
    partyContext,
    partyId,
    filteredTrips,
    safeTrips,
    hidePartyForCashOut,
    type,
  ]);

  /** Web: avoid useDeferredValue here — concurrent follow-up renders were visibly tearing the trip list. */
  const missionTripSearchQuery =
    Platform.OS === "web" ? tripSearch : deferredTripSearch;
  const missionTrips = useMemo(() => {
    const base = ledgerMissionTripsBase;
    const q = missionTripSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((t) => {
      const hay = [
        t.trip_number,
        t.route_label,
        t.trip_date,
        t.client_name,
        t.supplier_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [ledgerMissionTripsBase, missionTripSearchQuery]);

  useEffect(() => {
    setSmartTagHighlight(null);
    setSmartTagSuggestedAmount(null);
  }, [selectedTripIds]);

  useEffect(() => {
    if (!visible) setLedgerSubmitConfirmVisible(false);
  }, [visible]);

  useEffect(() => {
    if (!fullPage || !visible) {
      ledgerPaymentModeHydratedRef.current = false;
      return;
    }
    if (initialEntry?.id) return;
    if (ledgerPaymentModeHydratedRef.current) return;
    ledgerPaymentModeHydratedRef.current = true;
    void AsyncStorage.getItem(LEDGER_LAST_PAYMENT_MODE_KEY).then((stored) => {
      const id = (stored ?? "").trim().toUpperCase();
      if (id && PAYMENT_MODES.some((p) => p.id === id)) setPaymentModeId(id);
    });
  }, [fullPage, visible, initialEntry?.id]);

  useEffect(() => {
    if (!fullPage || !visible || initialEntry?.id) return;
    void AsyncStorage.setItem(LEDGER_LAST_PAYMENT_MODE_KEY, paymentModeId);
  }, [fullPage, visible, paymentModeId, initialEntry?.id]);

  useEffect(() => {
    if (isLedgerCashPaymentMode(paymentModeId) && paymentReference.trim() !== "") {
      setPaymentReference("");
    }
  }, [paymentModeId, paymentReference]);

  useEffect(() => {
    if (smartTagHighlight == null || smartTagSuggestedAmount == null) return;
    const raw = amountStr.replace(/,/g, "").trim();
    if (raw === "") return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    if (Math.abs(parsed - smartTagSuggestedAmount) > 0.009) {
      setSmartTagHighlight(null);
    }
  }, [amountStr, smartTagHighlight, smartTagSuggestedAmount]);

  /** Counterparty for trip row avatar (client on IN, supplier/driver on OUT). */
  const getLedgerTripPartyVisual = useCallback(
    (t: TripOption) => {
      if (type === "in") {
        const cid = t.client_id?.trim() || null;
        const party = cid ? safeClients.find((c) => c.id === cid) : undefined;
        const name = party?.name ?? t.client_name ?? "Client";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "client" as const,
        };
      }
      const sid = t.supplier_id?.trim() || null;
      if (sid) {
        const party = safeSuppliers.find((s) => s.id === sid);
        const name =
          party?.name ??
          (t as { supplier_name?: string | null }).supplier_name ??
          "Supplier";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "supplier" as const,
        };
      }
      const did = t.driver_id?.trim() || null;
      if (did) {
        const party = safeDrivers.find((d) => d.id === did);
        const name =
          party?.name ??
          t.driver_display_name ??
          "Driver";
        return {
          name,
          avatarUrl: party?.avatar_url ?? null,
          avatarSeed: party?.avatar_seed ?? null,
          entityType: "driver" as const,
        };
      }
      const fallback = t.client_name?.trim() || t.route_label?.trim() || "Trip";
      return {
        name: fallback,
        avatarUrl: null as string | null,
        avatarSeed: null as string | null,
        entityType: "client" as const,
      };
    },
    [type, safeClients, safeSuppliers, safeDrivers],
  );

  const resolveTripOptionById = useCallback(
    (id: string): TripOption | null => {
      const fromSafe = safeTrips.find((t) => t.id === id);
      if (fromSafe) return fromSafe as TripOption;
      const fromMission = ledgerMissionTripsBase.find((t) => t.id === id);
      return fromMission ? (fromMission as TripOption) : null;
    },
    [safeTrips, ledgerMissionTripsBase],
  );

  /** Trip list for ledger can be a superset (e.g. merged loads); first selected id drives party chips when multiple trips share context. */
  const selectedTrip = useMemo((): TripOption | null => {
    if (selectedTripIds.length === 0) return null;
    return resolveTripOptionById(selectedTripIds[0]);
  }, [selectedTripIds, resolveTripOptionById]);
  const selectedTripPayoutMode = useMemo(
    () => (selectedTrip ? resolveTripLedgerTripType(selectedTrip) : null),
    [selectedTrip],
  );
  const tripNumber = selectedTrip?.trip_number ?? null;

  const tripFinancialPreviewByTripId = useMemo(() => {
    const m: Record<string, ReturnType<typeof computeTripEntryFinancialSnapshot>> = {};
    const txs = ledgerTransactions ?? [];
    for (const raw of ledgerMissionTripsBase) {
      const t = raw as TripOption;
      if (t.client_price == null && t.supplier_rate == null) continue;
      m[t.id] = computeTripEntryFinancialSnapshot(
        tripOptionToLedgerFinancialInput(t),
        txs,
        viewerOrgId,
        t.driver_id && driverOffersByDriverId
          ? driverOffersByDriverId[t.driver_id] ?? null
          : null,
      );
    }
    return m;
  }, [ledgerMissionTripsBase, ledgerTransactions, viewerOrgId, driverOffersByDriverId]);

  const missionTripsFiltered = useMemo(() => {
    return missionTrips.filter((t) => {
      const snap = tripFinancialPreviewByTripId[t.id];
      if (
        missionTripFilterDue === "has_due" &&
        !tripFinancialSnapshotHasRelevantDue(snap, type)
      )
        return false;
      if (
        missionTripFilterDue === "no_due" &&
        tripFinancialSnapshotHasRelevantDue(snap, type)
      )
        return false;

      const payout = resolveTripLedgerTripType(t);
      if (missionTripFilterPayout === "asset" && payout !== "asset") return false;
      if (missionTripFilterPayout === "aggregate" && payout !== "market") return false;

      const completed = isTripCompleted({
        status: t.status ?? "",
        completed_at: t.completed_at ?? null,
      });
      if (missionTripFilterLifecycle === "active" && completed) return false;
      if (missionTripFilterLifecycle === "completed" && !completed) return false;

      return true;
    });
  }, [
    missionTrips,
    tripFinancialPreviewByTripId,
    missionTripFilterDue,
    missionTripFilterPayout,
    missionTripFilterLifecycle,
    type,
  ]);

  const resolveLocalClientPartyIdFromTrip = useCallback(
    (trip: TripOption): string | null => {
      const orgId = trip.organization_id ?? null;
      if (viewerOrgId && orgId && orgId !== viewerOrgId) {
        const m = linkedClientIdByOrgId;
        if (!m) return null;
        const linked = m instanceof Map ? m.get(orgId) : m[orgId as keyof typeof m];
        return typeof linked === "string" && linked.trim() ? linked.trim() : null;
      }
      const cid = (trip.client_id ?? "").trim();
      return cid || null;
    },
    [viewerOrgId, linkedClientIdByOrgId],
  );

  const resolveLocalSupplierPartyIdFromTrip = useCallback(
    (trip: TripOption): string | null => {
      const orgId = trip.organization_id ?? null;
      if (viewerOrgId && orgId && orgId !== viewerOrgId) {
        const m = linkedSupplierIdByOrgId;
        const linked =
          m instanceof Map ? m.get(orgId) : m?.[orgId as keyof typeof m];
        if (typeof linked === "string" && linked.trim()) return linked.trim();

        // Fallback for non-unique linked org maps: prefer supplier-name match
        // within local suppliers tied to this same linked organization.
        const linkedCandidates = safeSuppliers.filter(
          (s) =>
            (s as { linked_organization_id?: string | null })
              .linked_organization_id === orgId,
        );
        if (linkedCandidates.length === 0) return null;
        const tripSupplierName = (
          (trip as { supplier_name?: string | null }).supplier_name ?? ""
        )
          .trim()
          .toLowerCase();
        if (tripSupplierName) {
          const byName = linkedCandidates.find(
            (s) => (s.name ?? "").trim().toLowerCase() === tripSupplierName,
          );
          if (byName?.id) return byName.id;
        }
        if (linkedCandidates.length === 1) return linkedCandidates[0].id;
        return null;
      }
      const sid = (trip.supplier_id ?? "").trim();
      if (sid && safeSuppliers.some((s) => s.id === sid)) return sid;
      const tripSupplierName = (
        (trip as { supplier_name?: string | null }).supplier_name ?? ""
      )
        .trim()
        .toLowerCase();
      if (tripSupplierName) {
        const byName = safeSuppliers.find(
          (s) => (s.name ?? "").trim().toLowerCase() === tripSupplierName,
        );
        if (byName?.id) return byName.id;
      }
      return sid || null;
    },
    [viewerOrgId, linkedSupplierIdByOrgId, safeSuppliers],
  );

  /** Per-trip suggested due weight for placeholder + multi-trip amount split (aligned with mission chips). */
  const getLedgerTripDueWeight = useCallback(
    (trip: TripOption): number => {
      const preview = tripFinancialPreviewByTripId[trip.id];
      if (!preview) return 0;
      const f = preview.financials;
      const tripPayType = preview.trip_type;
      if (type === "in") return Math.max(0, f.client_receivable);
      const localSupplier = resolveLocalSupplierPartyIdFromTrip(trip);
      const driverId = (trip.driver_id ?? "").trim() || null;
      if (effectivePartyId && localSupplier && effectivePartyId === localSupplier)
        return Math.max(0, f.supplier_payable);
      if (effectivePartyId && driverId && effectivePartyId === driverId)
        return Math.max(0, f.driver_payable);
      if (tripPayType === "asset") return Math.max(0, f.driver_payable);
      return Math.max(0, f.supplier_payable);
    },
    [
      tripFinancialPreviewByTripId,
      type,
      effectivePartyId,
      resolveLocalSupplierPartyIdFromTrip,
    ],
  );

  /** Selected trip(s): placeholder = sum of suggested dues, not party-wide totals from props. */
  const ledgerAmountPlaceholder = useMemo(() => {
    const base = amountPlaceholder;
    if (selectedTripIds.length === 0) return base;
    let sum = 0;
    for (const tid of selectedTripIds) {
      const trip = resolveTripOptionById(tid);
      if (!trip) continue;
      sum += getLedgerTripDueWeight(trip);
    }
    if (sum > 0) return formatAmountDuePlaceholder(sum);
    return base;
  }, [
    amountPlaceholder,
    selectedTripIds,
    resolveTripOptionById,
    getLedgerTripDueWeight,
  ]);

  const applyTripSmartTag = useCallback(
    (trip: TripOption, tag: TripLedgerSmartTag) => {
      if (trip.client_price == null && trip.supplier_rate == null) return;
      const snap = computeTripEntryFinancialSnapshot(
        tripOptionToLedgerFinancialInput(trip),
        ledgerTransactions ?? [],
        viewerOrgId,
        trip.driver_id && driverOffersByDriverId
          ? driverOffersByDriverId[trip.driver_id] ?? null
          : null,
      );
      if (!snap) return;
      const f = snap.financials;
      const amt =
        tag === "client"
          ? f.client_receivable
          : tag === "supplier"
            ? f.supplier_payable
            : f.driver_payable;
      if (!(amt > 0)) return;
      setSelectedTripIds([trip.id]);
      setSmartTagSuggestedAmount(amt);
      setSmartTagHighlight(tag);
      setAmountStr(String(amt));
      setPaymentModeExpanded(false);
      setPaymentTypeExpanded(false);
      let nextPayeeId: string | null = null;
      let nextPayeeLabel: string | null = null;
      if (tag === "client") {
        const pid = resolveLocalClientPartyIdFromTrip(trip);
        if (!pid) {
          Alert.alert("Client", "Could not resolve local client for this trip.");
          return;
        }
        setType("in");
        setPartyId(pid);
        setCategory("Trip Payment");
        setDriverPaymentType(null);
        nextPayeeId = pid;
        nextPayeeLabel =
          safeClients.find((c) => c.id === pid)?.name?.trim() ||
          trip.client_name?.trim() ||
          "Client";
      } else if (tag === "supplier") {
        const sid = resolveLocalSupplierPartyIdFromTrip(trip);
        if (!sid) {
          Alert.alert("Supplier", "Could not resolve supplier for this trip.");
          return;
        }
        setType("out");
        setPartyId(sid);
        setCategory("Trip Payment");
        setDriverPaymentType(null);
        nextPayeeId = sid;
        nextPayeeLabel =
          safeSuppliers.find((s) => s.id === sid)?.name?.trim() ||
          (trip as { supplier_name?: string | null }).supplier_name?.trim() ||
          "Supplier";
      } else {
        const did = (trip.driver_id ?? "").trim();
        if (!did) return;
        setType("out");
        setPartyId(did);
        setDriverPaymentType("settlement");
        setCategory(null);
        nextPayeeId = did;
        nextPayeeLabel =
          safeDrivers.find((d) => d.id === did)?.name?.trim() ||
          trip.driver_display_name?.trim() ||
          "Driver";
      }
      if (
        isPartyLocked &&
        lockedPartyId &&
        nextPayeeId &&
        nextPayeeId !== lockedPartyId &&
        lockedPartyName
      ) {
        Alert.alert(
          "Payment party switched",
          `This entry is for ${nextPayeeLabel}, not ${lockedPartyName}. The party on this payment has been updated; trip search may still use the original context.`,
          [{ text: "OK" }],
        );
      }
    },
    [
      ledgerTransactions,
      viewerOrgId,
      driverOffersByDriverId,
      resolveLocalClientPartyIdFromTrip,
      resolveLocalSupplierPartyIdFromTrip,
      isPartyLocked,
      lockedPartyId,
      lockedPartyName,
      safeClients,
      safeSuppliers,
      safeDrivers,
    ],
  );

  const partyOptions = useMemo(() => {
    if (type === "in" && selectedTrip) {
      const lid = (selectedTrip as any).organization_id;
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

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
      const payoutMode = selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip);
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

      if (isIntegrated) {
        const localSid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
        if (localSid) {
          const supplier = safeSuppliers.find((s) => s.id === localSid);
          if (supplier) return [supplier];
          const resolvedSupplierName =
            (selectedTrip as { supplier_name?: string | null }).supplier_name?.trim() ||
            (lockedPartyName || defaultPartyName || "").trim() ||
            "Supplier";
          return [{ id: localSid, name: resolvedSupplierName }];
        }
      }

      const outOptions: PartyOption[] = [];
      if (payoutMode === "market" && selectedTrip.supplier_id) {
        const resolvedSid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
        const sup = resolvedSid
          ? safeSuppliers.find((s) => s.id === resolvedSid)
          : null;
        if (sup) {
          outOptions.push(sup);
        } else {
          const fallbackLabel =
            (selectedTrip as { supplier_name?: string | null }).supplier_name?.trim() ||
            "Supplier";
          outOptions.push({
            id: resolvedSid ?? selectedTrip.supplier_id,
            name: fallbackLabel,
          });
        }
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
    selectedTripPayoutMode,
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
    resolveLocalSupplierPartyIdFromTrip,
    lockedPartyId,
    lockedPartyName,
  ]);

  /** Cash OUT: payee from the party row (picker or smart tag). Can differ from `effectivePartyId` when the list is scoped by a locked entity. */
  const cashOutPayeeId =
    type === "out" &&
    partyId != null &&
    partyId !== "misc" &&
    partyId !== "driver-salary"
      ? partyId
      : null;

  const cashOutPayeeName =
    cashOutPayeeId == null
      ? null
      : (partyOptions.find((p) => p.id === cashOutPayeeId)?.name ??
          safeDrivers.find((d) => d.id === cashOutPayeeId)?.name ??
          safeSuppliers.find((s) => s.id === cashOutPayeeId)?.name ??
          null);
  const supplierCategorySelected =
    type === "out" &&
    category != null &&
    SUPPLIER_CATEGORIES.includes(category as SupplierCategory);
  const associatedSupplierNameForOut =
    type === "out" && selectedTrip
      ? (() => {
          const sid = resolveLocalSupplierPartyIdFromTrip(selectedTrip);
          if (sid) {
            const supplierName = safeSuppliers.find((s) => s.id === sid)?.name?.trim();
            if (supplierName) return supplierName;
          }
          const tripSupplierName = (
            selectedTrip as { supplier_name?: string | null }
          ).supplier_name?.trim();
          return tripSupplierName || null;
        })()
      : null;

  const resolvedLockedPartyName = (() => {
    if (!lockedPartyId) return null;
    const raw = (lockedPartyName ?? "").trim();
    const lower = raw.toLowerCase();
    const isGeneric =
      lower === "" ||
      lower === "supplier" ||
      lower === "client" ||
      lower === "driver" ||
      lower === "entry";
    if (!isGeneric) return raw;

    const lockedId = (lockedPartyId ?? "").trim();
    if (lockedId) {
      const byId =
        partyOptions.find((p) => p.id === lockedId)?.name?.trim() ||
        safeSuppliers.find((s) => s.id === lockedId)?.name?.trim() ||
        safeClients.find((c) => c.id === lockedId)?.name?.trim() ||
        safeDrivers.find((d) => d.id === lockedId)?.name?.trim() ||
        null;
      if (byId) return byId;
    }

    if (type === "out" && associatedSupplierNameForOut?.trim()) {
      return associatedSupplierNameForOut.trim();
    }

    const defaultId = (defaultPartyId ?? "").trim();
    if (defaultId) {
      const byDefault =
        safeSuppliers.find((s) => s.id === defaultId)?.name?.trim() ||
        safeClients.find((c) => c.id === defaultId)?.name?.trim() ||
        safeDrivers.find((d) => d.id === defaultId)?.name?.trim() ||
        null;
      if (byDefault) return byDefault;
    }

    return raw || null;
  })();

  const effectivePartyName =
    isPartyLocked && type === "in"
      ? resolvedLockedPartyName
      : tripLocked &&
          category === "DRIVER COMMISSION" &&
          type === "out" &&
          ((selectedTrip?.driver_id &&
            safeDrivers.find((d) => d.id === selectedTrip.driver_id)?.name?.trim()) ||
            ((selectedTrip as { driver_display_name?: string | null } | null)
              ?.driver_display_name ?? "")
              .trim())
        ? ((selectedTrip?.driver_id &&
            safeDrivers.find((d) => d.id === selectedTrip.driver_id)?.name?.trim()) ||
            ((selectedTrip as { driver_display_name?: string | null } | null)
              ?.driver_display_name ?? "")
              .trim())
      : type === "out" && cashOutPayeeName?.trim()
        ? cashOutPayeeName.trim()
        : type === "out" &&
            supplierCategorySelected &&
            associatedSupplierNameForOut?.trim()
          ? associatedSupplierNameForOut.trim()
        : isPartyLocked
          ? resolvedLockedPartyName
          : partyId
            ? (partyOptions.find((c) => c.id === partyId)?.name ?? null)
            : null;

  const headerPartyName =
    (() => {
      const raw = (effectivePartyName ?? "").trim();
      const generic =
        raw === "" ||
        raw.toLowerCase() === "supplier" ||
        raw.toLowerCase() === "client" ||
        raw.toLowerCase() === "driver";
      if (!generic) return raw;
      if (type !== "out" || !selectedTrip) return raw || null;

      if (associatedSupplierNameForOut?.trim()) return associatedSupplierNameForOut.trim();

      const tripOrgId = (selectedTrip.organization_id ?? "").trim();
      if (tripOrgId) {
        const byLinkedOrg = safeSuppliers.find(
          (s) =>
            (s.linked_organization_id ?? "").trim() === tripOrgId &&
            (s.name ?? "").trim().length > 0,
        );
        if (byLinkedOrg?.name?.trim()) return byLinkedOrg.name.trim();
      }

      const tripSupplierName = (
        (selectedTrip as { supplier_name?: string | null }).supplier_name ?? ""
      ).trim();
      if (tripSupplierName) return tripSupplierName;

      return raw || null;
    })();

  /**
   * Entity sheet opens add-entry with party locked to client/supplier, but trip smart tags set
   * `partyId` to the actual payout counterparty (driver/supplier). `effectivePartyId` stays locked
   * for trip filtering — use `partyId` / `cashOutPayeeId` for OUT settlement party + submit when it is a driver/supplier.
   */
  const tripLockedOutPayoutCounterpartyId =
    tripLocked &&
    type === "out" &&
    (
      (partyId != null &&
        partyId !== "misc" &&
        partyId !== "driver-salary" &&
        (safeDrivers.some((d) => d.id === partyId) ||
          safeSuppliers.some((s) => s.id === partyId)))
        ? partyId
        : (category === "DRIVER COMMISSION" && selectedTrip?.driver_id
            ? selectedTrip.driver_id
            : null)
    );
  const tripLockedOutPayoutCounterpartyName =
    tripLockedOutPayoutCounterpartyId == null
      ? null
      : (safeDrivers.find((d) => d.id === tripLockedOutPayoutCounterpartyId)?.name ??
          safeSuppliers.find((s) => s.id === tripLockedOutPayoutCounterpartyId)?.name ??
          "")
          .trim() || null;

  const isDriverSalaryParty =
    type === "out" && effectivePartyId === "driver-salary";
  const isDriverPayment =
    type === "out" &&
    (isDriverSalaryParty ||
      (cashOutPayeeId != null &&
        safeDrivers.some((d) => d.id === cashOutPayeeId)));
  const isDriverCommissionCategory =
    type === "out" && category === "DRIVER COMMISSION";
  const isSupplierPayment =
    type === "out" &&
    !hidePartyForCashOut &&
    (cashOutPayeeId != null
      ? safeSuppliers.some((s) => s.id === cashOutPayeeId)
      : effectivePartyId != null &&
        safeSuppliers.some((s) => s.id === effectivePartyId));
  const isClientPayment =
    type === "in" &&
    effectivePartyId != null &&
    safeClients.some((c) => c.id === effectivePartyId);

  /** Category list for the current context: Receivables (Cash IN), Supplier (Cash OUT), or legacy expense (backward compat when no party). */
  const categoriesForPicker = useMemo(() => {
    if (type === "in") return [...CLIENT_CATEGORIES]; // Receivables — always show when Cash IN (not tied to party selection)
    if (type === "out" && isSupplierPayment) {
      const selectedMode = selectedTrip
        ? selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip)
        : null;
      if (selectedMode === "asset") return [];
      return [...SUPPLIER_CATEGORIES];
    }
    if (hidePartyForCashOut && type === "out") return []; // Vehicle: category is the first field (party = vehicle category)
    // Legacy / fallback: old EXPENSE_CATEGORIES for any other Cash OUT
    return hidePartyForCashOut
      ? EXPENSE_CATEGORIES.filter(
          (c) => c !== "DRIVER SALARY" && c !== "DRIVER COMMISSION",
        )
      : [...EXPENSE_CATEGORIES];
  }, [
    type,
    isSupplierPayment,
    hidePartyForCashOut,
    selectedTrip,
    selectedTripPayoutMode,
  ]);

  const isVehicleExpenseOut = hidePartyForCashOut && type === "out";
  /** Cash OUT with a vehicle expense category (Fuel, Toll, etc.) — show vehicle row and store vehicle_number. */
  const isVehicleExpenseCategory =
    type === "out" &&
    effectivePartyId != null &&
    VEHICLE_EXPENSE_PARTIES.some((p) => p.id === effectivePartyId);
  const supplierNeedsTrip =
    requireTripForSupplierOut && isSupplierPayment && selectedTripIds.length === 0;

  // Trip required when not locked, party is selected (not misc), and there are trips to link.
  // Monthly Salary: trip is optional (driver payment type "salary").
  const tripRequired =
    !tripLocked &&
    effectivePartyId != null &&
    effectivePartyId !== "misc" &&
    filteredTrips.length > 0 &&
    !(isDriverPayment && driverPaymentType === "salary");
  const hasValidTrip = !tripRequired || selectedTripIds.length > 0;

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

  useEffect(() => {
    if (!paymentModeId) {
      setPaymentModeExpanded(true);
    }
  }, [paymentModeId]);

  useEffect(() => {
    const hasSelection = isDriverPayment
      ? driverPaymentType != null
      : category != null;
    if (!hasSelection) {
      setPaymentTypeExpanded(true);
    }
  }, [category, driverPaymentType, isDriverPayment]);

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
      setSelectedTripIds(tid !== undefined && tid !== null ? [tid] : []);
      setCategory(desc && (EXPENSE_CATEGORIES as readonly string[]).includes(desc) ? desc : null);
    } else {
      if (defaultTripId != null) setSelectedTripIds([defaultTripId]);
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
      if (defaultTripId == null) setSelectedTripIds([]);
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

  // Keep trip as the primary selector. If party/trip conflict, clear party instead of trip.
  // Skip when tripLocked — trip is fixed and party is derived from it.
  useEffect(() => {
    if (!visible || tripLocked || !effectivePartyIdForTrips || selectedTripIds.length === 0)
      return;
    const isSupplier = safeSuppliers.some(
      (s) => s.id === effectivePartyIdForTrips,
    );
    const isDriver = safeDrivers.some((d) => d.id === effectivePartyIdForTrips);
    const supplierLinkedOrgId =
      supplierLinkedOrgIds?.[effectivePartyIdForTrips];
    for (const tid of selectedTripIds) {
      const trip = safeTrips.find((t) => t.id === tid);
      if (!trip) continue;
      const clientIdMatch = trip.client_id === effectivePartyIdForTrips;
      const clientNameMatch =
        Boolean(effectivePartyName && (trip.client_name || "").trim()) &&
        (trip.client_name || "").trim().toLowerCase() ===
          (effectivePartyName || "").trim().toLowerCase();
      const tripMatches =
        clientIdMatch ||
        clientNameMatch ||
        (isSupplier &&
          (trip.supplier_id === effectivePartyIdForTrips ||
            (supplierLinkedOrgId != null &&
              (trip as { organization_id?: string }).organization_id ===
                supplierLinkedOrgId))) ||
        (isDriver && trip.driver_id === effectivePartyIdForTrips);
      if (!tripMatches) {
        setPartyId(null);
        if (partyId === "driver-salary") setDriverIdForSalary(null);
        return;
      }
    }
  }, [
    visible,
    effectivePartyIdForTrips,
    effectivePartyName,
    partyId,
    selectedTripIds,
    safeTrips,
    safeSuppliers,
    safeDrivers,
    type,
    supplierLinkedOrgIds,
    tripLocked,
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
      (category === "DRIVER SALARY" || category === "DRIVER COMMISSION")
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
      if (
        category !== "SUPPLIER PAYMENT" &&
        category !== "DRIVER SALARY" &&
        category !== "DRIVER COMMISSION"
      )
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

  // Driver Commission should resolve against a driver counterparty.
  useEffect(() => {
    if (!visible) return;
    if (type !== "out" || category !== "DRIVER COMMISSION") return;
    if (tripLocked || isPartyLocked) return;
    if (partyId != null && safeDrivers.some((d) => d.id === partyId)) return;
    const preferredDriverId =
      selectedTrip?.driver_id ?? (safeDrivers.length > 0 ? safeDrivers[0].id : null);
    if (preferredDriverId) setPartyId(preferredDriverId);
  }, [
    visible,
    type,
    category,
    tripLocked,
    isPartyLocked,
    partyId,
    safeDrivers,
    selectedTrip,
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

  const ledgerReconDetailRows = useMemo((): { label: string; value: string }[] => {
    const modeName = PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? "Cash";
    const typeLabel = isDriverPayment
      ? driverPaymentType != null
        ? (DRIVER_PAYMENT_TYPES.find((t) => t.type === driverPaymentType)?.label ??
          driverPaymentType)
        : null
      : (category ?? null);
    const directionLabel = type === "in" ? "Cash In" : "Cash Out";

    const reconPartySummary = (() => {
      if (tripLockedOutPayoutCounterpartyName)
        return tripLockedOutPayoutCounterpartyName;
      if (type === "out" && cashOutPayeeName?.trim())
        return cashOutPayeeName.trim();
      if (tripLocked && lockedPartyName) return lockedPartyName;
      if (isPartyLocked && type === "in") {
        const label =
          (lockedPartyName ?? "").trim() || (resolvedLockedPartyName ?? "").trim();
        if (label) return label;
      }
      if (isDriverSalaryParty && driverIdForSalary) {
        const dn = safeDrivers.find((d) => d.id === driverIdForSalary)?.name?.trim();
        return dn ? `Driver salary · ${dn}` : "Driver salary";
      }
      if (hidePartyForCashOut && type === "out" && effectivePartyId) {
        const cat =
          VEHICLE_EXPENSE_PARTIES.find((p) => p.id === effectivePartyId)?.name ??
          partyOptions.find((p) => p.id === effectivePartyId)?.name ??
          effectivePartyId;
        if (selectedVehicleNumber)
          return `${cat} · ${formatIndianVehicleNumber(selectedVehicleNumber)}`;
        return String(cat);
      }
      if (partyId === "misc") return "Misc / Unlinked";
      return effectivePartyName?.trim() || "—";
    })();

    const reconTripSummary = (() => {
      if (selectedTripIds.length === 0) return "No voyage linked";
      if (selectedTripIds.length === 1) {
        return (
          [tripNumber || lockedTripDisplay || null, selectedTrip?.route_label]
            .filter(Boolean)
            .join(" · ") || "Trip linked"
        );
      }
      const labels = selectedTripIds
        .slice(0, 3)
        .map((id) => resolveTripOptionById(id)?.trip_number ?? id)
        .join(", ");
      const extra =
        selectedTripIds.length > 3 ? ` +${selectedTripIds.length - 3} more` : "";
      return `${selectedTripIds.length} voyages · ${labels}${extra}`;
    })();

    const reconReferenceSummary = isLedgerCashPaymentMode(paymentModeId)
      ? "— (cash)"
      : paymentReference.trim() || "—";

    const reconDateSummary = formatLedgerDateDdMmYyyy(entryDate);

    return [
      { label: "Direction", value: directionLabel },
      { label: "Party", value: reconPartySummary },
      { label: "Mode", value: modeName },
      { label: "Type", value: typeLabel?.trim() || "—" },
      { label: "Reference / UTR", value: reconReferenceSummary },
      { label: "Voyage", value: reconTripSummary },
      { label: "Sync date", value: reconDateSummary },
      ...(isEditMode && initialEntry?.id
        ? [{ label: "Entry ID", value: initialEntry.id } as { label: string; value: string }]
        : []),
    ];
  }, [
    tripLockedOutPayoutCounterpartyName,
    type,
    cashOutPayeeName,
    tripLocked,
    lockedPartyName,
    resolvedLockedPartyName,
    isPartyLocked,
    isDriverSalaryParty,
    driverIdForSalary,
    safeDrivers,
    hidePartyForCashOut,
    effectivePartyId,
    partyOptions,
    selectedVehicleNumber,
    partyId,
    effectivePartyName,
    tripNumber,
    lockedTripDisplay,
    selectedTrip,
    selectedTripIds,
    resolveTripOptionById,
    paymentModeId,
    paymentReference,
    entryDate,
    isEditMode,
    initialEntry?.id,
    isDriverPayment,
    driverPaymentType,
    category,
  ]);

  const commitLedgerSubmit = () => {
    if (!canSubmit) return;
    // When tripLocked, derive party from trip (no party field shown).
    let derivedContactId: string | null = null;
    let derivedContactType: AddTransactionData["contactType"] = null;
    let derivedPartyName: string | null = null;
    if (tripLocked && selectedTrip) {
      const lid = (selectedTrip as { organization_id?: string | null })
        .organization_id;
      const selectedTripMode = selectedTripPayoutMode ?? resolveTripLedgerTripType(selectedTrip);
      const isIntegrated = isCrossOrgIntegrationTrip(
        {
          organization_id: selectedTrip.organization_id ?? "",
          indent_id: selectedTrip.indent_id ?? null,
          supplier_id: selectedTrip.supplier_id ?? null,
        },
        viewerOrgId,
      );

      if (type === "in") {
        let localCid: string | null = null;
        if (isIntegrated && lid != null) {
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
        let localSid: string | null = resolveLocalSupplierPartyIdFromTrip(
          selectedTrip,
        );

        if (localSid) {
          derivedContactId = localSid;
          derivedContactType = "supplier";
          derivedPartyName =
            safeSuppliers.find((s) => s.id === localSid)?.name ??
            (selectedTrip as { supplier_name?: string | null }).supplier_name ??
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
          const preferDriverForCommission = isDriverCommissionCategory;
          const preferredOutId =
            preferDriverForCommission
              ? (selectedTrip.driver_id ?? selectedTrip.supplier_id ?? null)
              : selectedTripMode === "asset"
              ? (selectedTrip.driver_id ?? selectedTrip.supplier_id ?? null)
              : (selectedTrip.supplier_id ?? selectedTrip.driver_id ?? null);
          derivedContactId = preferredOutId;
          derivedContactType =
            preferDriverForCommission
              ? selectedTrip.driver_id
                ? "driver"
                : selectedTrip.supplier_id
                  ? "supplier"
                  : null
              : selectedTripMode === "asset"
              ? selectedTrip.driver_id
                ? "driver"
                : selectedTrip.supplier_id
                  ? "supplier"
                  : null
              : selectedTrip.supplier_id
                ? "supplier"
                : selectedTrip.driver_id
                  ? "driver"
                  : null;
          derivedPartyName =
            derivedContactType === "supplier"
              ? (safeSuppliers.find((s) => s.id === selectedTrip!.supplier_id!)?.name ??
                (selectedTrip as { supplier_name?: string }).supplier_name ??
                null)
              : derivedContactType === "driver"
                ? (safeDrivers.find((d) => d.id === selectedTrip!.driver_id!)?.name ??
                  null)
                : null;
        }
      }
    }
    if (
      tripLocked &&
      selectedTrip &&
      type === "out" &&
      tripLockedOutPayoutCounterpartyId
    ) {
      const pid = tripLockedOutPayoutCounterpartyId;
      if (safeDrivers.some((d) => d.id === pid)) {
        derivedContactId = pid;
        derivedContactType = "driver";
        derivedPartyName =
          safeDrivers.find((d) => d.id === pid)?.name?.trim() ||
          (
            (selectedTrip as { driver_display_name?: string | null })
              .driver_display_name ?? ""
          ).trim() ||
          derivedPartyName;
      } else if (safeSuppliers.some((s) => s.id === pid)) {
        derivedContactId = pid;
        derivedContactType = "supplier";
        derivedPartyName =
          safeSuppliers.find((s) => s.id === pid)?.name?.trim() ||
          (
            (selectedTrip as { supplier_name?: string | null }).supplier_name ??
            ""
          ).trim() ||
          derivedPartyName;
      }
    }
    const isUnlinkedMisc =
      !tripLocked && effectivePartyId === "misc";
    const contactType: AddTransactionData["contactType"] = tripLocked
      ? derivedContactType
      : isUnlinkedMisc
        ? null
        : type === "out" &&
            cashOutPayeeId &&
            (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
              safeSuppliers.some((s) => s.id === cashOutPayeeId))
          ? safeDrivers.some((d) => d.id === cashOutPayeeId)
            ? "driver"
            : "supplier"
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
            : type === "out" &&
                cashOutPayeeId &&
                (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
                  safeSuppliers.some((s) => s.id === cashOutPayeeId))
              ? cashOutPayeeId
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
            : type === "out" && cashOutPayeeName?.trim()
              ? cashOutPayeeName.trim()
              : (effectivePartyName ?? null);
    const normalizedCategory =
      category === "SUPPLIER COST" ? "SUPPLIER PAYMENT" : category;

    const guardTrips: TripOption[] =
      selectedTripIds.length > 0
        ? selectedTripIds
            .map((id) => resolveTripOptionById(id))
            .filter((t): t is TripOption => t != null)
        : selectedTrip
          ? [selectedTrip]
          : [];
    for (const tr of guardTrips) {
      const mode = resolveTripLedgerTripType(tr);
      const isSupplierPaymentForAssetTrip =
        type === "out" &&
        mode === "asset" &&
        ((normalizedCategory != null &&
          SUPPLIER_CATEGORIES.includes(normalizedCategory as SupplierCategory)) ||
          finalContactType === "supplier");
      if (isSupplierPaymentForAssetTrip) {
        Alert.alert(
          "Supplier payment restricted",
          "Supplier payment is not allowed for asset-based trips. Use driver payment or vehicle expense for this trip.",
        );
        return;
      }
    }

    const tripAllocations: TripLedgerAllocation[] | undefined =
      !isUnlinkedMisc &&
      !isEditMode &&
      selectedTripIds.length > 1
        ? (() => {
            const weightPaise = selectedTripIds.map((tid) => {
              const trip = resolveTripOptionById(tid);
              if (!trip) return 0;
              return Math.round(getLedgerTripDueWeight(trip) * 100);
            });
            const totalPaise = Math.round(amount * 100);
            const allocated = allocateIntegerByWeights(totalPaise, weightPaise);
            return selectedTripIds.map((tid, i) => {
              const trip = resolveTripOptionById(tid);
              return {
                tripId: tid,
                amount: Math.round(allocated[i]) / 100,
                tripNumber: trip?.trip_number ?? null,
                indentId: trip?.indent_id ?? undefined,
              };
            });
          })()
        : undefined;

    const data: AddTransactionData = {
      type,
      amount,
      partyId:
        tripLocked && derivedContactId
          ? derivedContactId
          : isUnlinkedMisc
            ? null
            : type === "out" &&
                cashOutPayeeId &&
                (safeDrivers.some((d) => d.id === cashOutPayeeId) ||
                  safeSuppliers.some((s) => s.id === cashOutPayeeId))
              ? cashOutPayeeId
              : effectivePartyId,
      partyName: finalPartyName,
      tripId:
        isUnlinkedMisc
          ? null
          : selectedTripIds.length === 1
            ? selectedTripIds[0]
            : tripAllocations && tripAllocations.length > 0
              ? null
              : null,
      tripNumber:
        isUnlinkedMisc
          ? null
          : selectedTripIds.length === 1
            ? tripNumber || null
            : null,
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
      indentId:
        selectedTripIds.length === 1 ? selectedTrip?.indent_id ?? undefined : undefined,
      transactionDate: /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
        ? entryDate
        : undefined,
      paymentMode: paymentModeId,
      paymentReference: paymentReference.trim() || null,
      tripAllocations,
    };
    if (isEditMode && initialEntry?.id) {
      onSubmit(data, { entryId: initialEntry.id });
      // Parent closes modal after update succeeds
    } else {
      onSubmit(data);
      setAmountStr("");
      setPartyId(null);
      setSelectedTripIds([]);
      setCategory(null);
      setDriverPaymentType(null);
      onClose();
    }
  };

  const handleClose = () => {
    setLedgerSubmitConfirmVisible(false);
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

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (fullPage) {
      Keyboard.dismiss();
      closeAllPickers();
      setLedgerSubmitConfirmVisible(true);
      return;
    }
    commitLedgerSubmit();
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
        fullPage
          ? styles.submitBtnLedgerFullPage
          : type === "in"
            ? styles.submitBtnIn
            : styles.submitBtnOut,
        !canSubmit && styles.submitBtnDisabled,
      ]}
      onPress={handleSubmit}
      disabled={!canSubmit}
      activeOpacity={0.9}
    >
      <Text
        style={[
          styles.submitBtnText,
          fullPage && styles.submitBtnTextLedger,
          fullPage && winW < 420 && styles.submitBtnTextLedgerTight,
        ]}
      >
        {fullPage
          ? isEditMode
            ? "UPDATE FINANCIAL SYNC"
            : winW < 420
              ? "AUTHORIZE SYNC"
              : "AUTHORIZE FINANCIAL SYNC"
          : isEditMode
            ? "UPDATE ENTRY"
            : "SAVE ENTRY"}
      </Text>
    </TouchableOpacity>
  );
  const selectedPaymentModeName =
    PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? "Cash";
  const selectedPaymentModeIcon =
    PAYMENT_MODE_ICON[paymentModeId] ?? "circle-o";
  const selectedPaymentTypeLabel = isDriverPayment
    ? (driverPaymentType != null
        ? (DRIVER_PAYMENT_TYPES.find((t) => t.type === driverPaymentType)?.label ??
          driverPaymentType)
        : null)
    : (category ?? null);
  const selectedPaymentTypeIcon = selectedPaymentTypeLabel
    ? (PAYMENT_TYPE_ICON[selectedPaymentTypeLabel] ?? "circle-o")
    : "circle-o";
  const previewAmountText =
    amountStr.trim().length > 0 && Number.isFinite(amount) && amount > 0
      ? amount.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : ledgerAmountPlaceholder;
  const previewDirectionLabel = type === "in" ? "Cash In" : "Cash Out";

  const renderLedgerSyncV2 = () => {
    const accent = type === "in" ? Theme.darkGreen : Theme.teslaRed;
    const todayIso = ledgerIsoFromDate(new Date());
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterdayIso = ledgerIsoFromDate(yDate);

    /** Side-by-side strips: ~6 tiles visible per column; icons compact. */
    const LEDGER_PROTOCOL_TILE_GAP = 6;
    const LEDGER_PROTOCOL_TILES_ACROSS = 6;
    const LEDGER_PROTOCOL_ICON_SM = 12;
    /** Stack synchronization + date vertically on very narrow widths. */
    const LEDGER_MOBILE_STACK_BREAKPOINT = 430;
    /** Stacked trip band only: allow side-by-side sync cards on wider phones/tablets. */
    const LEDGER_SYNC_HERO_PAIR_WIDE_MIN = 820;

    const ledgerProtocolSplitWrapPad = 12 * 2;

    const ledgerNarrowPhone = winW < LEDGER_MOBILE_STACK_BREAKPOINT;

    /** Full-page ledger on desktop split layout: fixed sizing (no viewport math). */
    const ledgerTripDesktopExpand = fullPage && !stackTripFinancialBand;
    /** Standard desktop trip band height — aligns with payment column without coupling to screen height. */
    const LEDGER_DESKTOP_TRIP_BAND_MIN_HEIGHT = 520;
    const ledgerTripBandMinHeight = ledgerTripDesktopExpand
      ? LEDGER_DESKTOP_TRIP_BAND_MIN_HEIGHT
      : undefined;

    /** Split desktop band: always stack sync value + date vertically; stacked mobile band uses width rule. */
    const ledgerSyncHeroStack =
      !stackTripFinancialBand ||
      ledgerNarrowPhone ||
      (stackTripFinancialBand && winW < LEDGER_SYNC_HERO_PAIR_WIDE_MIN);

    const paymentTypeItems =
      type === "in"
        ? categoriesForPicker.map((cat) => ({
            key: cat,
            label: cat,
            selected: category === cat,
            onPress: () => {
              setCategory(cat);
              setPaymentTypeExpanded(false);
            },
            icon: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
          }))
        : isDriverPayment
          ? DRIVER_PAYMENT_TYPES.map((opt) => ({
              key: opt.type,
              label: opt.label,
              selected: driverPaymentType === opt.type,
              onPress: () => {
                setDriverPaymentType(opt.type);
                setPaymentTypeExpanded(false);
              },
              icon:
                PAYMENT_TYPE_ICON[opt.type] ??
                PAYMENT_TYPE_ICON[opt.label] ??
                "circle-o",
            }))
          : categoriesForPicker.map((cat) => ({
              key: cat,
              label: cat,
              selected: category === cat,
              onPress: () => {
                setCategory(cat);
                setPaymentTypeExpanded(false);
              },
            icon: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
          }));

    /** Mode / category tiles: inner width uses actual full-page horizontal padding + column gap (matches panel). */
    const ledgerBandGap = 12;
    const pagePadTotal = ledgerFullPagePadH * 2;
    const topBandProtocolInnerW = stackTripFinancialBand
      ? winW - pagePadTotal - ledgerProtocolSplitWrapPad
      : (winW - pagePadTotal - ledgerBandGap) / 2 - ledgerProtocolSplitWrapPad;
    const ledgerProtocolTileWidthTopBand = Math.max(
      36,
      (topBandProtocolInnerW -
        LEDGER_PROTOCOL_TILE_GAP * (LEDGER_PROTOCOL_TILES_ACROSS - 1)) /
        LEDGER_PROTOCOL_TILES_ACROSS,
    );

    /** Stacked layout must not use `flex: 1` on columns — it splits vertical space and leaves huge gaps. */
    const ledgerProtocolColStyle = stackTripFinancialBand
      ? styles.ledgerProtocolSplitColNarrow
      : styles.ledgerProtocolSplitCol;

    const ledgerModeCategoryTopBand = (
      <View
        style={[
          styles.ledgerProtocolSplitWrap,
          styles.ledgerProtocolSplitWrapTopBand,
          styles.ledgerProtocolWorkbenchElevated,
          stackTripFinancialBand && styles.ledgerProtocolSplitWrapStack,
        ]}
      >
        <View style={ledgerProtocolColStyle}>
          <View
            style={[
              styles.selectorHeaderRow,
              stackTripFinancialBand && styles.selectorHeaderRowLedgerMobile,
            ]}
          >
            <Text
              style={[
                styles.tagLabel,
                styles.fieldLabelNoMargin,
                styles.selectorHeaderTitle,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              MODE
            </Text>
            {!paymentModeExpanded ? (
              <TouchableOpacity
                style={styles.selectorChangeBtn}
                onPress={() => setPaymentModeExpanded(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.selectorChangeBtnText}>Change</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!paymentModeExpanded ? (
            <TouchableOpacity
              style={styles.selectorSummaryCard}
              onPress={() => setPaymentModeExpanded(true)}
              activeOpacity={0.85}
            >
              <View style={styles.selectorSummaryMain}>
                <View style={styles.selectorSummaryIconSm}>
                  {ledgerPaymentModeLucide(paymentModeId, LEDGER_PROTOCOL_ICON_SM)}
                </View>
                <Text style={styles.selectorSummaryText} numberOfLines={1}>
                  {selectedPaymentModeName}
                </Text>
              </View>
              <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} />
            </TouchableOpacity>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator
              style={styles.protocolStripScrollSplit}
              contentContainerStyle={[
                styles.protocolStripContent,
                { gap: LEDGER_PROTOCOL_TILE_GAP },
              ]}
            >
              {PAYMENT_MODES.map((opt) => {
                const selected = paymentModeId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.protocolTile,
                      styles.protocolTileSplit,
                      { width: ledgerProtocolTileWidthTopBand },
                      selected && styles.protocolTileSplitSelected,
                    ]}
                    onPress={() => {
                      setPaymentModeId(opt.id);
                      setPaymentModeExpanded(false);
                    }}
                    activeOpacity={0.85}
                  >
                    {ledgerPaymentModeLucide(opt.id, LEDGER_PROTOCOL_ICON_SM)}
                    <Text
                      style={[
                        styles.protocolTileText,
                        styles.protocolTileTextSplit,
                        selected && styles.protocolTileTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {PAYMENT_MODE_LABEL_SHORT[opt.id] ?? opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={ledgerProtocolColStyle}>
          <View
            style={[
              styles.selectorHeaderRow,
              stackTripFinancialBand && styles.selectorHeaderRowLedgerMobile,
            ]}
          >
            <Text
              style={[
                styles.tagLabel,
                styles.fieldLabelNoMargin,
                styles.selectorHeaderTitle,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {type === "in"
                ? "PAYMENT TYPE"
                : isDriverPayment
                  ? "PAYMENT TYPE"
                  : "CATEGORY"}
            </Text>
            {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
              <TouchableOpacity
                style={styles.selectorChangeBtn}
                onPress={() => setPaymentTypeExpanded(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.selectorChangeBtnText}>Change</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
            <TouchableOpacity
              style={styles.selectorSummaryCard}
              onPress={() => setPaymentTypeExpanded(true)}
              activeOpacity={0.85}
            >
              <View style={styles.selectorSummaryMain}>
                <View style={styles.selectorSummaryIconSm}>
                  {ledgerPaymentTypeLucide(
                    String(isDriverPayment ? driverPaymentType ?? "" : category ?? ""),
                    LEDGER_PROTOCOL_ICON_SM,
                  )}
                </View>
                <Text style={styles.selectorSummaryText} numberOfLines={2}>
                  {selectedPaymentTypeLabel}
                </Text>
              </View>
              <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} />
            </TouchableOpacity>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator
              style={styles.protocolStripScrollSplit}
              contentContainerStyle={[
                styles.protocolStripContent,
                { gap: LEDGER_PROTOCOL_TILE_GAP },
              ]}
            >
              {paymentTypeItems.map((item) => (
                <TouchableOpacity
                  key={String(item.key)}
                  style={[
                    styles.protocolTile,
                    styles.protocolTileSplit,
                    { width: ledgerProtocolTileWidthTopBand },
                    item.selected && styles.protocolTileSplitSelected,
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.85}
                >
                  {ledgerPaymentTypeLucide(String(item.key), LEDGER_PROTOCOL_ICON_SM)}
                  <Text
                    style={[
                      styles.protocolTileText,
                      styles.protocolTileTextSplit,
                      item.selected && styles.protocolTileTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    );

    const ledgerSyncHeroDateRow = (
      <View
        style={[
          styles.syncHeroDateRow,
          styles.syncHeroDateRowInTripBand,
          ledgerSyncHeroStack && styles.syncHeroDateRowStack,
        ]}
      >
        <View
          style={[
            styles.syncAmountCard,
            styles.syncAmountCardSide,
            styles.syncHeroBandCard,
            ledgerSyncHeroStack && styles.syncHeroCardFullWidth,
            stackTripFinancialBand && styles.syncAmountCardMobileAlign,
          ]}
        >
          <Text
            style={[
              styles.syncAmountEyebrow,
              stackTripFinancialBand && styles.syncSectionEyebrowMobile,
            ]}
          >
            Synchronization value
          </Text>
          <View
            style={[
              styles.syncAmountRow,
              stackTripFinancialBand && styles.syncAmountRowMobile,
            ]}
          >
            <Text style={[styles.syncRupee, styles.syncRupeeSide, { color: accent }]}>₹</Text>
            <TextInput
              style={[
                styles.syncAmountInput,
                styles.syncAmountInputSide,
                stackTripFinancialBand && styles.syncAmountInputMobileLeft,
              ]}
              placeholder={ledgerAmountPlaceholder}
              placeholderTextColor={Theme.textMutedDemo}
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="decimal-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
          {amountStr.trim().length > 0 &&
          (amount <= 0 || !Number.isFinite(parseFloat(amountStr.replace(/,/g, "")))) ? (
            <Text style={styles.fieldErrorText}>Enter a valid amount.</Text>
          ) : null}
        </View>

        <View
          style={[
            styles.syncDateCard,
            styles.syncDateCardSide,
            styles.syncHeroBandCard,
            ledgerSyncHeroStack && styles.syncHeroCardFullWidth,
            stackTripFinancialBand && styles.syncDateCardMobileAlign,
            styles.syncDateMatrixCard,
          ]}
        >
          <View
            style={[
              styles.syncDateHead,
              styles.syncDateMatrixHead,
              stackTripFinancialBand && styles.syncDateHeadMobile,
            ]}
          >
            <Text
              style={[
                styles.syncDateEyebrow,
                stackTripFinancialBand && styles.syncSectionEyebrowMobile,
              ]}
            >
              Sync date matrix
            </Text>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => {
                Keyboard.dismiss();
                if (Platform.OS === "web") return;
                setLedgerSyncDatePickerVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open calendar"
            >
              <CalendarDays size={20} color={Theme.primaryLight} strokeWidth={LEDGER_LUCIDE_STROKE} />
            </TouchableOpacity>
          </View>
          <View style={[styles.syncDateChips, styles.syncDateChipsMatrix]}>
            <TouchableOpacity
              style={[
                styles.syncDateChip,
                styles.syncDateChipSide,
                entryDate === todayIso && styles.syncDateChipActive,
              ]}
              onPress={() => {
                setSyncDateFieldFocused(false);
                setLedgerSyncDatePickerVisible(false);
                setEntryDate(todayIso);
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.syncDateChipText,
                  entryDate === todayIso && styles.syncDateChipTextActive,
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.syncDateChip,
                styles.syncDateChipSide,
                entryDate === yesterdayIso && styles.syncDateChipActive,
              ]}
              onPress={() => {
                setSyncDateFieldFocused(false);
                setLedgerSyncDatePickerVisible(false);
                setEntryDate(yesterdayIso);
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.syncDateChipText,
                  entryDate === yesterdayIso && styles.syncDateChipTextActive,
                ]}
              >
                Yesterday
              </Text>
            </TouchableOpacity>
          </View>
          {Platform.OS === "web" ? (
            <View
              style={[
                styles.syncDateFieldWrap,
                styles.syncDateFieldWrapSide,
                styles.syncDateFieldRowMatrix,
                entryDateError && styles.syncDateFieldWrapError,
              ]}
            >
              <TextInput
                style={[
                  styles.syncDateInput,
                  styles.syncDateInputSide,
                  entryDateError && styles.fieldInputError,
                ]}
                value={
                  syncDateFieldFocused
                    ? syncDateDraft
                    : formatLedgerDateDdMmYyyy(entryDate)
                }
                onFocus={() => {
                  setSyncDateFieldFocused(true);
                  setSyncDateDraft(formatLedgerDateDdMmYyyy(entryDate));
                }}
                onBlur={() => {
                  setSyncDateFieldFocused(false);
                  const iso = parseLedgerDateDraftToIso(syncDateDraft);
                  if (iso) setEntryDate(iso);
                }}
                onChangeText={(t) => {
                  if (syncDateFieldFocused) setSyncDateDraft(t);
                }}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Theme.textMutedDemo}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <CalendarDays size={18} color={Theme.primaryLight} strokeWidth={LEDGER_LUCIDE_STROKE} />
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.syncDateFieldWrap,
                styles.syncDateFieldWrapSide,
                styles.syncDateFieldRowMatrix,
                styles.syncDateFieldWrapPressable,
                pressed && styles.syncDateFieldWrapPressed,
                entryDateError && styles.syncDateFieldWrapError,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setLedgerSyncDatePickerVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Pick sync date"
            >
              <Text
                style={[
                  styles.syncDateInput,
                  styles.syncDateInputSide,
                  styles.syncDateDisplayText,
                  entryDateError && styles.fieldInputError,
                ]}
                numberOfLines={1}
              >
                {formatLedgerDateDdMmYyyy(entryDate)}
              </Text>
              <CalendarDays size={18} color={Theme.primaryLight} strokeWidth={LEDGER_LUCIDE_STROKE} />
            </Pressable>
          )}
          {entryDateError ? <Text style={styles.fieldErrorText}>{entryDateError}</Text> : null}
        </View>
      </View>
    );

    const needsLedgerPaymentReference = !isLedgerCashPaymentMode(paymentModeId);

    const ledgerReferenceCard =
      needsLedgerPaymentReference ? (
        <View style={[styles.syncReferenceCard, styles.syncReferenceCardTripBand]}>
          <Text style={[styles.syncReferenceEyebrow, styles.syncReferenceEyebrowLedger]}>
            Reference / UTR
          </Text>
          <View style={styles.syncReferenceInputRow}>
            <Hash size={22} color={Theme.textSection} strokeWidth={LEDGER_LUCIDE_STROKE} />
            <TextInput
              style={styles.syncReferenceInputPill}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder="Bank reference for validation"
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
        </View>
      ) : null;

    const missionLedgerBlock = (
      <View
        style={[
          styles.missionCard,
          stackTripFinancialBand && styles.missionCardTripBandStack,
        ]}
      >
        <View style={styles.missionHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.missionTitle}>Select trip</Text>
            <Text style={styles.missionSub}>
              Primary — search voyages; use due chips or the summary to autofill
            </Text>
          </View>
          <Search size={18} color={Theme.textMutedDemo} strokeWidth={LEDGER_LUCIDE_STROKE} />
        </View>
        {tripLocked ? null : (
          <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator
            style={[
              styles.missionFilterStrip,
              stackTripFinancialBand && styles.missionFilterStripMobile,
            ]}
            contentContainerStyle={[
              styles.missionFilterStripContent,
              stackTripFinancialBand && styles.missionFilterStripContentMobile,
            ]}
          >
            <TextInput
              style={[
                styles.missionSearchInline,
                stackTripFinancialBand && styles.missionSearchInlineCompact,
              ]}
              value={tripSearch}
              onChangeText={setTripSearch}
              placeholder="Search trips, routes, dates…"
              placeholderTextColor={Theme.textMutedDemo}
            />
            <View style={styles.missionFilterSegment}>
              <Text style={styles.missionFilterLabelInline}>Due</Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "has_due" as const, label: "Has due" },
                    { id: "no_due" as const, label: "No due" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterDue === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.missionFilterChip, on && styles.missionFilterChipOn]}
                      onPress={() => setMissionTripFilterDue(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.missionFilterChipText, on && styles.missionFilterChipTextOn]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.missionFilterSegment}>
              <Text style={styles.missionFilterLabelInline}>Type</Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "asset" as const, label: "Asset" },
                    { id: "aggregate" as const, label: "Aggregate" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterPayout === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.missionFilterChip, on && styles.missionFilterChipOn]}
                      onPress={() => setMissionTripFilterPayout(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.missionFilterChipText, on && styles.missionFilterChipTextOn]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.missionFilterSegment}>
              <Text style={styles.missionFilterLabelInline}>Status</Text>
              <View style={styles.missionFilterChipsRowInline}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "active" as const, label: "Active" },
                    { id: "completed" as const, label: "Completed" },
                  ]
                ).map((opt) => {
                  const on = missionTripFilterLifecycle === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.missionFilterChip, on && styles.missionFilterChipOn]}
                      onPress={() => setMissionTripFilterLifecycle(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.missionFilterChipText, on && styles.missionFilterChipTextOn]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}
        {tripLocked ? (
          <View style={styles.missionLocked}>
            <Text style={styles.missionLockedLabel}>Trip locked</Text>
            <Text style={styles.missionLockedVal} numberOfLines={2}>
              {tripNumber || lockedTripDisplay || "—"}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={[
              styles.missionList,
              ledgerTripDesktopExpand && styles.missionListDesktopStandard,
              stackTripFinancialBand && !ledgerTripDesktopExpand && styles.missionListTripBandStack,
            ]}
            contentContainerStyle={
              stackTripFinancialBand ? styles.missionListContentFit : undefined
            }
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            removeClippedSubviews={false}
          >
            <View style={styles.missionTripBlock}>
              <TouchableOpacity
                style={[
                  styles.missionTripRowCompact,
                  selectedTripIds.length === 0 && styles.missionTripRowCompactOn,
                ]}
                onPress={() => setSelectedTripIds([])}
                activeOpacity={0.85}
              >
                <View style={styles.missionTripIconPlaceholder}>
                  <FontAwesome name="unlink" size={12} color={Theme.textMutedDemo} />
                </View>
                <Text style={styles.missionTripRouteInline} numberOfLines={1}>
                  No associated trip
                </Text>
                {selectedTripIds.length === 0 ? (
                  <FontAwesome name="check" size={12} color={accent} />
                ) : null}
              </TouchableOpacity>
            </View>
            {missionTripsFiltered.length === 0 && missionTrips.length > 0 ? (
              <Text style={styles.missionFilterEmpty}>No trips match these filters.</Text>
            ) : null}
            {missionTripsFiltered.map((t) => {
              const selected = selectedTripIds.includes(t.id);
              const routeLine = (t.route_label || "").trim() || "—";
              const partyVis = getLedgerTripPartyVisual(t);
              const sub = [t.trip_date].filter(Boolean).join(" · ");
              const titleLine = [t.trip_number, routeLine, sub].filter(Boolean).join(" · ");
              const preview = tripFinancialPreviewByTripId[t.id];
              const fin = preview?.financials;
              const tripPayType = preview?.trip_type;
              const pendingChips: {
                tag: TripLedgerSmartTag;
                label: string;
                disabled?: boolean;
              }[] = [];
              if (type === "in" && fin && fin.client_receivable > 0) {
                pendingChips.push({
                  tag: "client",
                  label: `Client due ${formatINR(fin.client_receivable)}`,
                });
              }
              if (type === "out" && fin && fin.client_receivable > 0) {
                pendingChips.push({
                  tag: "client",
                  label: `Client due ${formatINR(fin.client_receivable)}`,
                  disabled: true,
                });
              }
              if (
                type === "out" &&
                fin &&
                tripPayType === "market" &&
                fin.supplier_payable > 0
              ) {
                pendingChips.push({
                  tag: "supplier",
                  label: `Supplier due ${formatINR(fin.supplier_payable)}`,
                });
              }
              if (
                type === "in" &&
                fin &&
                tripPayType === "market" &&
                fin.supplier_payable > 0
              ) {
                pendingChips.push({
                  tag: "supplier",
                  label: `Supplier due ${formatINR(fin.supplier_payable)}`,
                  disabled: true,
                });
              }
              if (
                type === "out" &&
                fin &&
                tripPayType === "asset" &&
                fin.driver_payable > 0
              ) {
                pendingChips.push({
                  tag: "driver",
                  label: `Driver due ${formatINR(fin.driver_payable)}`,
                });
              }
              if (
                type === "in" &&
                fin &&
                tripPayType === "asset" &&
                fin.driver_payable > 0
              ) {
                pendingChips.push({
                  tag: "driver",
                  label: `Driver due ${formatINR(fin.driver_payable)}`,
                  disabled: true,
                });
              }
              return (
                <View key={t.id} style={styles.missionTripBlock}>
                  <TouchableOpacity
                    style={[styles.missionTripRowCompact, selected && styles.missionTripRowCompactOn]}
                    onPress={() => {
                      if (isEditMode || tripLocked) {
                        setSelectedTripIds([t.id]);
                        return;
                      }
                      setSelectedTripIds((prev) =>
                        prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      );
                    }}
                    activeOpacity={0.85}
                  >
                    <PartyAvatar
                      name={partyVis.name}
                      avatarUrl={partyVis.avatarUrl}
                      avatarSeed={partyVis.avatarSeed}
                      entityType={partyVis.entityType}
                      size={28}
                    />
                    <Text style={[styles.missionTripRouteInline, styles.missionTripTextCol]} numberOfLines={1}>
                      {titleLine}
                    </Text>
                    {selected ? (
                      <FontAwesome name="check" size={12} color={accent} />
                    ) : null}
                  </TouchableOpacity>
                  {pendingChips.length > 0 ? (
                    <View style={styles.missionTripPendingChipsRow}>
                      {pendingChips.map((c) => (
                        <TouchableOpacity
                          key={`${c.tag}-${c.disabled ? "d" : "a"}`}
                          style={[
                            styles.missionTripPendingChip,
                            c.disabled && styles.missionTripPendingChipDisabled,
                          ]}
                          onPress={() => {
                            if (c.disabled) {
                              if (c.tag === "client") {
                                Alert.alert(
                                  "Different party · Cash IN",
                                  "Client receipts use Cash IN. Switch to IN to record money from the client.",
                                );
                              } else {
                                Alert.alert(
                                  "Different party · Cash OUT",
                                  "Supplier and driver payments use Cash OUT. Switch to OUT to record this payment.",
                                );
                              }
                              return;
                            }
                            applyTripSmartTag(t, c.tag);
                          }}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={c.label}
                        >
                          <Text
                            style={[
                              styles.missionTripPendingChipText,
                              c.disabled && styles.missionTripPendingChipTextDisabled,
                            ]}
                            numberOfLines={1}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );

    const ledgerSyncDatePickerValue = ledgerDateFromIso(entryDate);
    const ledgerSyncAndroidPicker =
      ledgerSyncDatePickerVisible && Platform.OS === "android" ? (
        <DateTimePicker
          value={ledgerSyncDatePickerValue}
          mode="date"
          display="default"
          minimumDate={LEDGER_DATE_PICKER_MIN}
          maximumDate={LEDGER_DATE_PICKER_MAX}
          onChange={(event, date) => {
            setLedgerSyncDatePickerVisible(false);
            if (event.type === "set" && date) {
              setEntryDate(ledgerIsoFromDate(date));
              setSyncDateFieldFocused(false);
            }
          }}
        />
      ) : null;

    const ledgerSyncIosPicker =
      ledgerSyncDatePickerVisible && Platform.OS === "ios" ? (
        <Modal
          transparent
          visible
          animationType="slide"
          onRequestClose={() => setLedgerSyncDatePickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.ledgerDatePickerBackdrop}
            activeOpacity={1}
            onPress={() => setLedgerSyncDatePickerVisible(false)}
          >
            <View
              style={[styles.ledgerDatePickerSheet, { paddingBottom: insets.bottom + 14 }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.ledgerDatePickerHeader}>
                <Text style={styles.ledgerDatePickerTitle}>Sync date</Text>
                <TouchableOpacity
                  onPress={() => setLedgerSyncDatePickerVisible(false)}
                  hitSlop={12}
                >
                  <Text style={styles.ledgerDatePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={ledgerSyncDatePickerValue}
                mode="date"
                display="spinner"
                minimumDate={LEDGER_DATE_PICKER_MIN}
                maximumDate={LEDGER_DATE_PICKER_MAX}
                onChange={(_, date) => {
                  if (date) setEntryDate(ledgerIsoFromDate(date));
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null;

    return (
      <>
      <View
        style={[styles.ledgerV2Shell, stackTripFinancialBand && styles.ledgerV2ShellMobileTablet]}
      >
        <View style={styles.ledgerV2HeaderLedger}>
          <View style={styles.ledgerV2HeaderTitleBlock}>
            <Text style={styles.ledgerV2Title}>Ledger sync</Text>
            <Text style={styles.ledgerV2Sub} numberOfLines={1}>
              {headerPartyName
                ? `Party · ${headerPartyName}`
                : entryContextLabel
                  ? `Context · ${entryContextLabel}`
                  : "Global network"}
            </Text>
          </View>
          <View style={[styles.toggleWrap, styles.toggleWrapLedger]}>
            <TouchableOpacity
              style={[styles.toggleBtn, type === "in" && styles.toggleBtnIn]}
              onPress={() => setType("in")}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleBtnText, type === "in" && styles.toggleBtnTextActive]}>
                IN
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, type === "out" && styles.toggleBtnOut]}
              onPress={() => setType("out")}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleBtnText, type === "out" && styles.toggleBtnTextActive]}>
                OUT
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.ledgerV2TripFirstBand,
            stackTripFinancialBand && styles.ledgerV2TripFirstBandStack,
            ledgerTripBandMinHeight != null && { minHeight: ledgerTripBandMinHeight },
          ]}
        >
          <View
            style={[
              styles.ledgerTripBandLeftCol,
              stackTripFinancialBand && styles.ledgerTripBandLeftColStack,
            ]}
          >
            {missionLedgerBlock}
          </View>
          <View
            style={[
              styles.ledgerV2TripFirstColRight,
              stackTripFinancialBand && styles.ledgerV2TripFirstColRightStack,
            ]}
          >
            <View
              style={[
                styles.ledgerTripBandRightColumn,
                stackTripFinancialBand && styles.ledgerTripBandRightColumnStacked,
              ]}
            >
              {ledgerModeCategoryTopBand}
              {ledgerReferenceCard}
              {ledgerSyncHeroDateRow}
            </View>
          </View>
        </View>

        <View style={[styles.ledgerV2Grid, isLedgerWide && styles.ledgerV2GridWide]}>
          <View style={styles.ledgerV2Col}>
            {!tripLocked && !isPartyLocked ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
                onPress={() => {
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowPartyPicker((v) => !v);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.syncPartyLabel}>Party / person</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {effectivePartyName || "Select party"}
                </Text>
                <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
              </TouchableOpacity>
            ) : null}

            {type === "out" && isDriverSalaryParty ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
                onPress={() => {
                  setShowPartyPicker(false);
                  setShowTripPicker(false);
                  setShowCategoryPicker(false);
                  setShowDriverPaymentTypePicker(false);
                  setShowDriverForSalaryPicker((v) => !v);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.syncPartyLabel}>Driver</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {driverIdForSalary
                    ? (safeDrivers.find((d) => d.id === driverIdForSalary)?.name ?? "Driver")
                    : "Select driver"}
                </Text>
                <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
              </TouchableOpacity>
            ) : null}

            {type === "out" && (isVehicleExpenseOut || isVehicleExpenseCategory) ? (
              <TouchableOpacity
                style={styles.syncPartyRow}
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
                activeOpacity={safeVehicles.length > 0 ? 0.85 : 1}
                disabled={safeVehicles.length === 0}
              >
                <Text style={styles.syncPartyLabel}>Vehicle</Text>
                <Text style={styles.syncPartyValue} numberOfLines={1}>
                  {selectedVehicleNumber
                    ? formatIndianVehicleNumber(selectedVehicleNumber)
                    : safeVehicles.length > 0
                      ? "Select vehicle"
                      : "No vehicles"}
                </Text>
                {safeVehicles.length > 0 ? (
                  <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                ) : null}
              </TouchableOpacity>
            ) : null}

            {supplierNeedsTrip ? (
              <Text style={styles.hintText}>
                Supplier payments must be linked to a trip. Select a voyage below.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {ledgerSyncAndroidPicker}
      {ledgerSyncIosPicker}
      </>
    );
  };

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
          fullPage && { paddingHorizontal: ledgerFullPagePadH },
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
          <View
            style={[
              styles.panelScrollInner,
              fullPage && stackTripFinancialBand && styles.panelScrollInnerLedgerNarrow,
            ]}
          >
            {fullPage ? (
              renderLedgerSyncV2()
            ) : (
            <>
            <View style={styles.flowCard}>
              <View style={styles.flowCardHead}>
                <View
                  style={[
                    styles.flowStepBadge,
                    type === "in" ? styles.flowStepBadgeIn : styles.flowStepBadgeOut,
                  ]}
                >
                  <Text style={styles.flowStepBadgeText}>01</Text>
                </View>
                <Text style={styles.flowCardTitle}>Entry Details</Text>
              </View>
              {/* Header: LEDGER SYNC + optional "Entry for [name]" + IN/OUT toggle */}
              <View style={styles.headerRow}>
                <View style={styles.titleBlock}>
                  <Text style={[styles.tagLabel, styles.title]}>
                    {isEditMode ? "EDIT ENTRY" : "ADD ENTRY"}
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
                <Text style={[styles.tagLabel, styles.amountLabel]}>SETTLEMENT AMOUNT (INR)</Text>
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
                    placeholder={ledgerAmountPlaceholder}
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

              <View style={styles.paymentModeBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>MODE OF PAYMENT</Text>
                  {!paymentModeExpanded ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentModeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentModeExpanded ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentModeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentModeIcon as any} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentModeName}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.paymentModeGrid}>
                    {PAYMENT_MODES.map((opt) => {
                      const selected = paymentModeId === opt.id;
                      const isIn = type === "in";
                      const accentColor = isIn ? Theme.darkGreen : Theme.teslaRed;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[
                            styles.paymentModeChip,
                            selected && styles.paymentModeChipSelected,
                            selected && { borderColor: accentColor, backgroundColor: `${accentColor}12` },
                          ]}
                          onPress={() => {
                            setPaymentModeId(opt.id);
                            setPaymentModeExpanded(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.paymentModeIconWrap,
                              selected && { backgroundColor: accentColor },
                            ]}
                          >
                            <FontAwesome
                              name={PAYMENT_MODE_ICON[opt.id] ?? "circle-o"}
                              size={11}
                              color={selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                            />
                          </View>
                          <Text
                            style={[
                              styles.paymentModeChipText,
                              selected && { color: accentColor },
                            ]}
                            numberOfLines={1}
                          >
                            {opt.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {!isLedgerCashPaymentMode(paymentModeId) && (
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
            </View>

            <View style={styles.flowCard}>
              <View style={styles.flowCardHead}>
                <View
                  style={[
                    styles.flowStepBadge,
                    type === "in" ? styles.flowStepBadgeIn : styles.flowStepBadgeOut,
                  ]}
                >
                  <Text style={styles.flowStepBadgeText}>02</Text>
                </View>
                <Text style={styles.flowCardTitle}>Links & Classification</Text>
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
                  style={[styles.fieldBlock, showTripPicker && styles.fieldBlockOpen]}
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
                    color={showTripPicker ? Theme.primary : Theme.textMutedDemo}
                    style={[styles.fieldChevron, showTripPicker && styles.fieldChevronOpen]}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Party: hidden when tripLocked (party derived from trip). */}
            {!tripLocked && !isPartyLocked ? (
              <TouchableOpacity
                style={[styles.fieldBlockFull, showPartyPicker && styles.fieldBlockOpen]}
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
                  color={showPartyPicker ? Theme.primary : Theme.textMutedDemo}
                  style={[styles.fieldChevron, showPartyPicker && styles.fieldChevronOpen]}
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
                style={[styles.fieldBlockFull, showDriverForSalaryPicker && styles.fieldBlockOpen]}
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
                  color={showDriverForSalaryPicker ? Theme.primary : Theme.textMutedDemo}
                  style={[styles.fieldChevron, showDriverForSalaryPicker && styles.fieldChevronOpen]}
                />
              </TouchableOpacity>
            )}
            {type === "in" && (
              <View style={styles.categoryBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>
                    PAYMENT TYPE
                  </Text>
                  {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentTypeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentTypeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentTypeIcon as any} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentTypeLabel}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.categoryChipGrid}>
                    {categoriesForPicker.map((cat) => {
                      const selected = category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.categoryChip,
                            selected && styles.categoryChipSelected,
                            selected && styles.categoryChipIn,
                          ]}
                          onPress={() => {
                            setCategory(cat);
                            setPaymentTypeExpanded(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.categoryChipIconWrap,
                              selected && styles.categoryChipIconWrapIn,
                            ]}
                          >
                            <FontAwesome
                              name={PAYMENT_TYPE_ICON[cat] ?? "circle-o"}
                              size={11}
                              color={selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                            />
                          </View>
                          <Text
                            style={[
                              styles.categoryChipText,
                              selected && styles.categoryChipTextIn,
                            ]}
                            numberOfLines={1}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            {type === "out" && !isVehicleExpenseOut && !isDriverSalaryParty && (
              <View style={styles.categoryBlock}>
                <View style={styles.selectorHeaderRow}>
                  <Text style={[styles.tagLabel, styles.fieldLabelNoMargin]}>
                    {isDriverPayment ? "PAYMENT TYPE" : "CATEGORY"}
                  </Text>
                  {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                    <TouchableOpacity
                      style={styles.selectorChangeBtn}
                      onPress={() => setPaymentTypeExpanded(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectorChangeBtnText}>Change</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!paymentTypeExpanded && selectedPaymentTypeLabel ? (
                  <TouchableOpacity
                    style={styles.selectorSummaryCard}
                    onPress={() => setPaymentTypeExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorSummaryMain}>
                      <View style={styles.selectorSummaryIcon}>
                        <FontAwesome name={selectedPaymentTypeIcon as any} size={12} color={Theme.textPrimaryDark} />
                      </View>
                      <Text style={styles.selectorSummaryText}>{selectedPaymentTypeLabel}</Text>
                    </View>
                    <FontAwesome name="chevron-down" size={11} color={Theme.textMutedDemo} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.categoryChipGrid}>
                    {(isDriverPayment
                      ? DRIVER_PAYMENT_TYPES.map((opt) => ({
                          key: opt.type,
                          label: opt.label,
                          selected: driverPaymentType === opt.type,
                          onPress: () => {
                            setDriverPaymentType(opt.type);
                            setPaymentTypeExpanded(false);
                          },
                          iconName: PAYMENT_TYPE_ICON[opt.type] ?? PAYMENT_TYPE_ICON[opt.label] ?? "circle-o",
                        }))
                      : categoriesForPicker.map((cat) => ({
                          key: cat,
                          label: cat,
                          selected: category === cat,
                          onPress: () => {
                            setCategory(cat);
                            setPaymentTypeExpanded(false);
                          },
                          iconName: PAYMENT_TYPE_ICON[cat] ?? "circle-o",
                        }))
                    ).map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[
                          styles.categoryChip,
                          item.selected && styles.categoryChipSelected,
                          item.selected && styles.categoryChipOut,
                        ]}
                        onPress={item.onPress}
                        activeOpacity={0.85}
                      >
                        <View
                          style={[
                            styles.categoryChipIconWrap,
                            item.selected && styles.categoryChipIconWrapOut,
                          ]}
                        >
                          <FontAwesome
                            name={item.iconName as any}
                            size={11}
                            color={item.selected ? Theme.textOnPrimary : Theme.textMutedDemo}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryChipText,
                            item.selected && styles.categoryChipTextOut,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
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
                  style={[styles.vehicleRow, showVehiclePicker && styles.fieldBlockOpen]}
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
                      color={showVehiclePicker ? Theme.primary : Theme.textMutedDemo}
                      style={[styles.fieldChevron, showVehiclePicker && styles.fieldChevronOpen]}
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
                      selectedTripIds.length === 0 && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setSelectedTripIds([]);
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
                          selectedTripIds.length === 1 &&
                            selectedTripIds[0] === t.id &&
                            styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setSelectedTripIds([t.id]);
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

            <View style={styles.ledgerPreviewCard}>
              <View style={styles.ledgerPreviewHead}>
                <Text style={styles.ledgerPreviewHeadText}>Ledger Preview</Text>
                <Text
                  style={[
                    styles.ledgerPreviewStatus,
                    type === "in" ? styles.ledgerPreviewStatusIn : styles.ledgerPreviewStatusOut,
                  ]}
                >
                  LIVE
                </Text>
              </View>
              <View style={styles.ledgerPreviewBody}>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Direction</Text>
                  <Text
                    style={[
                      styles.ledgerPreviewValue,
                      type === "in" ? styles.ledgerPreviewValueIn : styles.ledgerPreviewValueOut,
                    ]}
                  >
                    {previewDirectionLabel}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Amount</Text>
                  <Text
                    style={[
                      styles.ledgerPreviewAmount,
                      type === "in" ? styles.ledgerPreviewAmountIn : styles.ledgerPreviewAmountOut,
                    ]}
                  >
                    ₹{previewAmountText}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Party</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {effectivePartyName || "—"}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Trip</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {tripNumber || lockedTripDisplay || "General"}
                  </Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Date</Text>
                  <Text style={styles.ledgerPreviewValue}>{entryDate || "—"}</Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Mode</Text>
                  <Text style={styles.ledgerPreviewValue}>{selectedPaymentModeName}</Text>
                </View>
                <View style={styles.ledgerPreviewRow}>
                  <Text style={styles.ledgerPreviewLabel}>Type</Text>
                  <Text style={styles.ledgerPreviewValue} numberOfLines={1}>
                    {category || "General"}
                  </Text>
                </View>
              </View>
            </View>
            </View>
            </>
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
  const activePickerTitle = showTripPicker
    ? "Select Trip"
    : showCategoryPicker
      ? (type === "in" ? "Select Payment Type" : "Select Category")
      : showPartyPicker
        ? "Select Party"
        : showDriverPaymentTypePicker
          ? "Select Payment Type"
          : showDriverForSalaryPicker
            ? "Select Driver"
            : showPaymentPicker
              ? "Select Payment Mode"
              : showVehiclePicker
                ? "Select Vehicle"
                : "Select";

  const renderPickerModalContent = () => {
    if (showTripPicker) {
      return (
        <ScrollView style={pickerModalScrollStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <TouchableOpacity
            style={[
              styles.pickerItem,
              selectedTripIds.length === 0 && styles.pickerItemActive,
            ]}
            onPress={() => {
              setSelectedTripIds([]);
              setShowTripPicker(false);
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.pickerItemText}>General</Text>
          </TouchableOpacity>
          {filteredTrips.map((t) => {
            const routeAndDate = [t.route_label, t.trip_date].filter(Boolean).join(" · ");
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.pickerItem,
                  selectedTripIds.length === 1 &&
                    selectedTripIds[0] === t.id &&
                    styles.pickerItemActive,
                ]}
                onPress={() => {
                  setSelectedTripIds([t.id]);
                  setShowTripPicker(false);
                }}
                activeOpacity={0.6}
              >
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
            <View style={[styles.pickerModalContainer, { paddingBottom: insets.bottom + 16, pointerEvents: 'box-none' }]}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeAllPickers} activeOpacity={1} />
              <View style={[styles.pickerModalPanel, { height: Math.min(windowHeight * 0.5, 380), pointerEvents: 'auto' }]}>
                <View style={styles.pickerModalHeader}>
                  <View style={styles.pickerModalHandle} />
                  <Text style={styles.pickerModalTitle}>{activePickerTitle}</Text>
                </View>
                {renderPickerModalContent()}
              </View>
            </View>
          </Modal>
        ) : null}
        {ledgerSubmitConfirmVisible ? (
          <Modal
            transparent
            visible
            animationType="fade"
            onRequestClose={() => setLedgerSubmitConfirmVisible(false)}
          >
            <View style={styles.ledgerConfirmBackdrop}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setLedgerSubmitConfirmVisible(false)}
              />
              <View
                style={[
                  styles.ledgerConfirmCardWrap,
                  { paddingBottom: insets.bottom + 12, marginTop: insets.top + 8 },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.ledgerConfirmScroll}
                  contentContainerStyle={styles.ledgerConfirmScrollContent}
                >
                  <View style={styles.reconCard}>
                    <View style={styles.reconHeadRow}>
                      <Text style={styles.reconEyebrow}>Reconciliation summary</Text>
                      <View style={styles.readyPill}>
                        <Text style={styles.readyPillText}>Ready</Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.reconAmountHero,
                        { color: type === "in" ? Theme.darkGreen : Theme.teslaRed },
                      ]}
                      numberOfLines={1}
                    >
                      ₹{previewAmountText}
                    </Text>
                    <View style={styles.reconDetailList}>
                      {ledgerReconDetailRows.map((row) => (
                        <View key={row.label} style={styles.reconDetailRow}>
                          <Text style={styles.reconDetailLabel} numberOfLines={1}>
                            {row.label}
                          </Text>
                          <Text
                            style={styles.reconDetailValue}
                            numberOfLines={row.label === "Party" ? 2 : 2}
                          >
                            {row.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </ScrollView>
                <View style={styles.ledgerConfirmActions}>
                  <TouchableOpacity
                    style={styles.ledgerConfirmBtnGhost}
                    onPress={() => setLedgerSubmitConfirmVisible(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ledgerConfirmBtnGhostText}>Go back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ledgerConfirmBtnPrimary,
                      type === "in"
                        ? styles.ledgerConfirmBtnPrimaryIn
                        : styles.ledgerConfirmBtnPrimaryOut,
                    ]}
                    onPress={() => {
                      setLedgerSubmitConfirmVisible(false);
                      commitLedgerSubmit();
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.ledgerConfirmBtnPrimaryText}>
                      {isEditMode ? "Save changes" : "Confirm sync"}
                    </Text>
                  </TouchableOpacity>
                </View>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: Theme.screenBackground,
  },
  fullPageFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
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
  panelScrollInnerLedgerNarrow: {
    gap: 14,
  },
  panelScrollContent: { gap: 28, paddingBottom: 8 },
  panelScrollContentFullPage: {
    gap: 24,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: Theme.surface,
  },
  flowCard: {
    backgroundColor: Theme.surface,
    borderRadius: 28,
    borderWidth: 1.2,
    borderColor: Theme.borderLight,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  flowCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  flowStepBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  flowStepBadgeIn: {
    backgroundColor: Theme.darkGreen,
  },
  flowStepBadgeOut: {
    backgroundColor: Theme.teslaRed,
  },
  flowStepBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.8,
  },
  flowCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
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
    marginBottom: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: Theme.textPrimaryDark,
  },
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleWrapLedger: {
    backgroundColor: Theme.liquidPillBg,
    borderColor: Theme.liquidPillBorder,
    padding: 6,
    borderRadius: 14,
  },
  toggleBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 12,
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
    backgroundColor: Theme.surface,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 22,
    minHeight: 110,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  amountLabel: {
    marginBottom: 14,
    letterSpacing: 1.4,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    gap: 10,
  },
  amountSymbol: {
    fontSize: 34,
    fontWeight: "900",
    width: 24,
    textAlign: "center",
  },
  amountSymbolIn: { color: Theme.darkGreen },
  amountSymbolOut: { color: Theme.teslaRed },
  amountInput: {
    flex: 1,
    fontSize: 42,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    minWidth: 0,
    borderWidth: 0,
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
  twoCol: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  twoColSingle: {},
  fieldBlock: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: Layout.minTouchTargetSize + 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
    minWidth: 220,
  },
  fieldBlockFull: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
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
    marginRight: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  fieldLabelNoMargin: {
    marginRight: 0,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 0,
  },
  fieldValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
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
  fieldChevron: {
    marginLeft: 6,
    transform: [{ rotate: "0deg" }],
    ...Platform.select({
      web: {
        transitionDuration: "160ms",
      } as any,
    }),
  },
  fieldChevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  fieldBlockOpen: {
    borderColor: Theme.primary + "66",
    backgroundColor: Theme.primary + "0D",
  },
  paymentModeBlock: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  /** Mode + category side-by-side (full-page ledger). */
  ledgerProtocolSplitWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ledgerProtocolSplitWrapStack: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    flexGrow: 0,
    gap: 10,
  },
  ledgerProtocolSplitWrapTopBand: {
    alignSelf: "stretch",
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  /** Reference UI: elevated MODE / TYPE workbench card (Pulse-style). */
  ledgerProtocolWorkbenchElevated: {
    borderColor: Theme.borderMedium,
    borderWidth: 1.5,
    borderRadius: 24,
    backgroundColor: Theme.screenBackground,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  ledgerProtocolSplitCol: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    overflow: "hidden",
  },
  /** Stacked MODE / TYPE: height = content only (no `flex: 1` vertical steal). */
  ledgerProtocolSplitColNarrow: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    overflow: "visible",
  },
  selectorHeaderTitle: {
    flex: 1,
    minWidth: 0,
  },
  selectorHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  selectorHeaderRowLedgerMobile: {
    marginBottom: 6,
    minHeight: 22,
  },
  selectorChangeBtn: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectorChangeBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  selectorSummaryCard: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectorSummaryMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  selectorSummaryIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorSummaryIconSm: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorSummaryText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  paymentModeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentModeChip: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "48.6%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  paymentModeChipSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  paymentModeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentModeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  categoryBlock: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 9,
    paddingVertical: 8,
    width: "48.6%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  categoryChipSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  categoryChipIn: {
    borderColor: Theme.darkGreen,
    backgroundColor: `${Theme.darkGreen}12`,
  },
  categoryChipOut: {
    borderColor: Theme.teslaRed,
    backgroundColor: `${Theme.teslaRed}12`,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  categoryChipTextIn: {
    color: Theme.darkGreen,
  },
  categoryChipTextOut: {
    color: Theme.teslaRed,
  },
  categoryChipIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipIconWrapIn: {
    backgroundColor: Theme.darkGreen,
  },
  categoryChipIconWrapOut: {
    backgroundColor: Theme.teslaRed,
  },
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
    height: 240,
    borderRadius: 18,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  pickerModalHeader: {
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  pickerModalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  pickerScroll: {
    flex: 1,
    height: 240,
  },
  pickerModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  pickerItemActive: {
    backgroundColor: Theme.primary + "14",
    borderLeftWidth: 3,
    borderLeftColor: Theme.primary,
  },
  pickerItemTripContent: { flex: 1 },
  pickerItemText: {
    fontSize: 13,
    fontWeight: "700",
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
    paddingVertical: 19,
    borderRadius: 20,
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
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 2.2,
  },
  submitBtnLedgerFullPage: {
    backgroundColor: LEDGER_SLATE,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
    borderRadius: 28,
  },
  submitBtnTextLedger: {
    letterSpacing: 1.4,
    fontSize: 12,
  },
  submitBtnTextLedgerTight: {
    letterSpacing: 0.8,
    fontSize: 11,
  },
  ledgerV2Shell: {
    gap: 20,
    paddingBottom: 8,
    width: "100%",
  },
  ledgerV2ShellMobileTablet: {
    gap: 16,
    paddingBottom: 4,
  },
  ledgerV2TripFirstBand: {
    width: "100%",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 12,
  },
  ledgerV2TripFirstBandStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 10,
  },
  ledgerTripBandLeftCol: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: "stretch",
  },
  /** Stacked trip band: do not grow — avoids empty space above MODE / sync blocks. */
  ledgerTripBandLeftColStack: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  ledgerTripBandRightColumn: {
    flex: 1,
    flexBasis: 0,
    alignSelf: "stretch",
    minWidth: 0,
    width: "100%",
    gap: 10,
    alignItems: "stretch",
  },
  ledgerTripBandRightColumnStacked: {
    gap: 12,
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    alignSelf: "stretch",
    alignItems: "stretch",
  },
  ledgerV2TripFirstColRight: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  ledgerV2TripFirstColRightStack: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
  },
  ledgerV2HeaderLedger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
    width: "100%",
  },
  ledgerV2HeaderTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  ledgerV2Title: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ledgerV2Sub: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  ledgerV2Grid: {
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },
  ledgerV2GridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  ledgerV2Col: {
    flex: 1,
    gap: 18,
    minWidth: 0,
  },
  syncHeroDateRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
  },
  syncHeroDateRowStack: {
    flexDirection: "column",
    gap: 10,
  },
  syncHeroDateRowInTripBand: {
    width: "100%",
  },
  syncHeroBandCard: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  syncHeroCardFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  syncAmountCardMobileAlign: {
    alignItems: "flex-start",
  },
  syncDateCardMobileAlign: {
    alignItems: "stretch",
  },
  syncSectionEyebrowMobile: {
    alignSelf: "stretch",
    textAlign: "left",
    marginBottom: 8,
    letterSpacing: 2,
  },
  syncDateHeadMobile: {
    width: "100%",
  },
  syncAmountRowMobile: {
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  syncAmountInputMobileLeft: {
    textAlign: "left",
  },
  syncAmountCardSide: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 26,
  },
  syncRupeeSide: {
    fontSize: 20,
  },
  syncAmountInputSide: {
    fontSize: 22,
  },
  syncDateCardSide: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 24,
  },
  syncDateChipSide: {
    paddingVertical: 10,
    borderRadius: 14,
  },
  syncDateFieldWrapSide: {
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 10,
    gap: 8,
  },
  syncDateInputSide: {
    fontSize: 18,
  },
  syncAmountCard: {
    backgroundColor: Theme.surface,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  syncAmountEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 2.4,
    marginBottom: 12,
  },
  syncAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  syncRupee: {
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  syncAmountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    paddingVertical: 4,
  },
  syncDateCard: {
    backgroundColor: Theme.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  syncDateHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  syncDateEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  syncDateChips: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  syncDateChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  syncDateChipActive: {
    backgroundColor: LEDGER_SLATE,
    borderColor: LEDGER_SLATE,
  },
  syncDateChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  syncDateChipTextActive: {
    color: Theme.textOnDark,
  },
  syncDateFieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: 12,
  },
  syncDateFieldWrapError: {
    borderColor: Theme.teslaRed,
  },
  syncDateMatrixCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  syncDateMatrixHead: {
    marginBottom: 10,
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  syncDateChipsMatrix: {
    marginBottom: 14,
    marginTop: 2,
  },
  syncDateFieldRowMatrix: {
    marginTop: 4,
    minHeight: 48,
  },
  syncDateFieldWrapPressable: {
    alignSelf: "stretch",
  },
  syncDateFieldWrapPressed: {
    backgroundColor: Theme.surfaceForm,
  },
  syncDateDisplayText: {
    flex: 1,
    minWidth: 0,
  },
  ledgerDatePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  ledgerDatePickerSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
  },
  ledgerDatePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  ledgerDatePickerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  ledgerDatePickerDone: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.primary,
  },
  syncDateInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  protocolInnerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  /** Full-page protocol / category: single row, horizontal scroll; ~6 tiles across. */
  protocolStripScroll: {
    width: "100%",
    flexGrow: 0,
  },
  protocolStripScrollSplit: {
    width: "100%",
    flexGrow: 0,
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  protocolStripContent: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingRight: 4,
  },
  protocolTile: {
    minHeight: 68,
    flexShrink: 0,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  protocolTileSelected: {
    backgroundColor: LEDGER_SLATE,
    borderColor: LEDGER_SLATE,
    transform: [{ scale: 1.02 }],
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  /** Ledger split strips: same active styling without scale (avoids horizontal clipping on narrow columns). */
  protocolTileSplitSelected: {
    backgroundColor: LEDGER_SLATE,
    borderColor: LEDGER_SLATE,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  protocolTileText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  protocolTileTextSelected: {
    color: Theme.textOnDark,
  },
  protocolTileSplit: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  protocolTileTextSplit: {
    fontSize: 7,
    letterSpacing: 0.3,
    lineHeight: 9,
  },
  syncReferenceCard: {
    backgroundColor: Theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  syncReferenceCardTripBand: {
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 0,
  },
  syncReferenceEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  syncReferenceEyebrowLedger: {
    textAlign: "left",
    letterSpacing: 2.4,
    color: Theme.textSection,
  },
  syncReferenceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 28,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  syncReferenceInputPill: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  syncReferenceInput: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  syncPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  syncPartyLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    width: 96,
  },
  syncPartyValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  missionCardTripBandStack: {
    minHeight: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
  },
  missionListTripBandStack: {
    maxHeight: 200,
  },
  /** Desktop full-page split: taller list area than default `missionList`, fixed cap (not viewport-based). */
  missionListDesktopStandard: {
    maxHeight: 320,
  },
  missionCard: {
    flex: 1,
    minHeight: 200,
    backgroundColor: Theme.screenBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  missionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  missionTitle: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  missionSub: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  missionFilterStrip: {
    marginBottom: 10,
    flexGrow: 0,
  },
  missionFilterStripMobile: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  missionFilterStripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  missionFilterStripContentMobile: {
    paddingRight: 4,
  },
  missionSearchInline: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 152,
    maxWidth: 220,
    flexShrink: 0,
  },
  missionSearchInlineCompact: {
    minWidth: 0,
    maxWidth: 140,
    flexShrink: 1,
    flexGrow: 0,
  },
  missionFilterSegment: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  missionFilterLabelInline: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  missionFilterChipsRowInline: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  missionFilterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  missionFilterChipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.aggregatePillBg,
  },
  missionFilterChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  missionFilterChipTextOn: {
    color: Theme.textPrimaryDark,
  },
  missionFilterEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  missionList: {
    maxHeight: 220,
    flexGrow: 0,
  },
  missionListContentFit: {
    flexGrow: 0,
    paddingBottom: 4,
  },
  missionLocked: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  missionLockedLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  missionLockedVal: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  missionTripBlock: {
    marginBottom: 6,
  },
  missionTripRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  missionTripPendingChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    paddingLeft: 4,
  },
  missionTripPendingChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1,
    borderColor: Theme.primary,
    maxWidth: "100%",
  },
  missionTripPendingChipDisabled: {
    opacity: 0.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  missionTripPendingChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  missionTripPendingChipTextDisabled: {
    color: Theme.textSecondary,
  },
  missionTripRowCompactOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.aggregatePillBg,
  },
  missionTripIconPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  missionTripTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  missionTripRouteInline: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  reconCard: {
    borderRadius: 26,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: LEDGER_SLATE,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  reconEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: LEDGER_PROTOCOL_ICON,
    textTransform: "uppercase",
    letterSpacing: 2,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  reconHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  reconAmountHero: {
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 0.3,
    marginBottom: 14,
  },
  reconDetailList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: 10,
    gap: 0,
  },
  reconDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  reconDetailLabel: {
    width: "34%",
    maxWidth: 120,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingTop: 2,
  },
  reconDetailValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
    textAlign: "right",
  },
  readyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.22)",
  },
  readyPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a7f3d0",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ledgerConfirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  ledgerConfirmCardWrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    maxHeight: "88%",
  },
  ledgerConfirmScroll: {
    maxHeight: 440,
  },
  ledgerConfirmScrollContent: {
    flexGrow: 0,
  },
  ledgerConfirmActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  ledgerConfirmBtnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
  },
  ledgerConfirmBtnGhostText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  ledgerConfirmBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  ledgerConfirmBtnPrimaryIn: {
    backgroundColor: Theme.darkGreen,
  },
  ledgerConfirmBtnPrimaryOut: {
    backgroundColor: Theme.teslaRed,
  },
  ledgerConfirmBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textOnPrimary,
  },
  ledgerPreviewCard: {
    backgroundColor: Theme.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginTop: 2,
  },
  ledgerPreviewHead: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ledgerPreviewHeadText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  ledgerPreviewStatus: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ledgerPreviewStatusIn: { color: Theme.darkGreen },
  ledgerPreviewStatusOut: { color: Theme.teslaRed },
  ledgerPreviewBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  ledgerPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  ledgerPreviewLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  ledgerPreviewValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  ledgerPreviewValueIn: { color: Theme.darkGreen },
  ledgerPreviewValueOut: { color: Theme.teslaRed },
  ledgerPreviewAmount: {
    flex: 1,
    textAlign: "right",
    fontSize: 18,
    fontWeight: "900",
  },
  ledgerPreviewAmountIn: { color: Theme.darkGreen },
  ledgerPreviewAmountOut: { color: Theme.teslaRed },
});
