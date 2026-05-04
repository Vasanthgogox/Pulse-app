/**
 * Trip detail — "Add transaction" entry point: choose Client / Supplier / Vehicle / Driver
 * so ledger-sync opens with correct entity + trip lock + smart defaults (see docs/CORE_ACCOUNTING_MODEL.md).
 *
 * v1: **market** trips (partner / supplier) → client + supplier only.
 * **asset** trips (own fleet) → client + vehicle + driver only (never supplier + driver together).
 */
import { resolveTripLedgerTripType } from "@/features/finance/utils/tripLedgerPayoutMode.util";
import { Alert, Platform } from "react-native";
import type { Router } from "expo-router";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";

type ExpoRouterLike = Pick<Router, "push">;

export interface TripLedgerChooserLabels {
  addTransaction: string;
  chooseEntryType: string;
  clientPayment: string;
  supplierPayment: string;
  vehicleExpense: string;
  driverPayment: string;
  cancel: string;
  missingClient: string;
  missingSupplier: string;
  missingVehicle: string;
  missingDriver: string;
}

function alertUser(title: string, message?: string): void {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message != null) Alert.alert(title, message);
  else Alert.alert(title);
}

const DEFAULT_LABELS: TripLedgerChooserLabels = {
  addTransaction: "Add transaction",
  chooseEntryType: "Pick who this entry is for. Trip stays linked.",
  clientPayment: "Client payment (receivable)",
  supplierPayment: "Supplier payment (payable)",
  vehicleExpense: "Vehicle expense",
  driverPayment: "Driver payment",
  cancel: "Cancel",
  missingClient: "This trip has no client to bill.",
  missingSupplier: "This trip has no supplier linked.",
  missingVehicle: "This trip has no vehicle assigned.",
  missingDriver: "This trip has no driver assigned.",
};

function pushLedgerSync(
  router: ExpoRouterLike,
  params: Record<string, string>,
  extra?: Record<string, string | null | undefined>,
) {
  const merged: Record<string, string> = { ...params };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && String(v).trim() !== "") merged[k] = String(v);
    }
  }
  const q = new URLSearchParams(merged);
  router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
}

export type TripLedgerQuickTag = "client" | "supplier" | "driver" | "vehicle";

export interface TripLedgerNavigationContext {
  trip: TripRow;
  router: ExpoRouterLike;
  labels?: Partial<TripLedgerChooserLabels>;
  displayClientName?: string | null;
  clientIdFromContext?: string | null;
  clientNameFromContext?: string | null;
  partnerName?: string | null;
  driverDisplayName?: string | null;
  /** Optional ledger-sync query pairs (e.g. due hints) merged after base params. */
  ledgerSyncExtraParams?: Record<string, string | null | undefined>;
}

/** Open ledger-sync for one trip + counterparty, respecting market vs asset payout rules. */
export function pushTripLedgerQuickEntry(
  ctx: TripLedgerNavigationContext,
  tag: TripLedgerQuickTag,
): void {
  const {
    trip,
    router,
    displayClientName,
    clientIdFromContext,
    clientNameFromContext,
    partnerName,
    driverDisplayName,
    ledgerSyncExtraParams,
  } = ctx;
  const L = { ...DEFAULT_LABELS, ...ctx.labels };
  if (!trip?.id) return;

  const mode = resolveTripLedgerTripType(trip);
  if (tag === "supplier" && mode !== "market") {
    alertUser(
      L.addTransaction,
      "Supplier payout applies to marketplace (partner) trips only. This trip is asset / own fleet.",
    );
    return;
  }
  if ((tag === "driver" || tag === "vehicle") && mode !== "asset") {
    alertUser(
      L.addTransaction,
      "Driver and vehicle payouts apply to asset (own fleet) trips only. This trip uses a supplier partner.",
    );
    return;
  }

  const tripNumber = getTripDisplayNumber(trip);
  const base = { tripId: trip.id, tripNumber };

  if (tag === "client") {
    const cid = (clientIdFromContext ?? trip.client_id ?? "").trim();
    const partyNameHint =
      (clientNameFromContext ?? displayClientName ?? trip.client_name ?? "").trim() || "Client";
    if (cid) {
      pushLedgerSync(
        router,
        {
          ...base,
          defaultType: "in",
          partyContext: "customers",
          partyId: cid,
          partyName: partyNameHint,
          entityType: "CLIENT",
          entityId: cid,
        },
        ledgerSyncExtraParams,
      );
      return;
    }
    // No linked client on the trip: open ledger-sync with trip preset so user can pick the customer (native Alert is easy to miss on web).
    pushLedgerSync(
      router,
      {
        ...base,
        defaultType: "in",
        partyContext: "customers",
        ...(partyNameHint && partyNameHint !== "Client"
          ? { partyName: partyNameHint }
          : {}),
      },
      ledgerSyncExtraParams,
    );
    return;
  }

  if (tag === "supplier") {
    const sid = (trip.supplier_id ?? "").trim();
    if (!sid) {
      alertUser(L.addTransaction, L.missingSupplier);
      return;
    }
    const partyName = (partnerName ?? trip.supplier_name ?? "").trim() || "—";
    pushLedgerSync(
      router,
      {
        ...base,
        defaultType: "out",
        partyContext: "suppliers",
        partyId: sid,
        partyName,
        entityType: "SUPPLIER",
        entityId: sid,
      },
      ledgerSyncExtraParams,
    );
    return;
  }

  if (tag === "vehicle") {
    const vid = (trip.vehicle_id ?? "").trim();
    if (!vid) {
      alertUser(L.addTransaction, L.missingVehicle);
      return;
    }
    pushLedgerSync(
      router,
      {
        ...base,
        entityType: "VEHICLE",
        entityId: vid,
        defaultType: "out",
      },
      ledgerSyncExtraParams,
    );
    return;
  }

  const did = (trip.driver_id ?? "").trim();
  if (!did) {
    alertUser(L.addTransaction, L.missingDriver);
    return;
  }
  const partyName = (driverDisplayName ?? trip.driver_display_name ?? "").trim() || "Driver";
  pushLedgerSync(
    router,
    {
      ...base,
      defaultType: "out",
      entityType: "DRIVER",
      entityId: did,
      partyId: did,
      partyName,
    },
    ledgerSyncExtraParams,
  );
}

export function openTripLedgerEntryChooser(options: TripLedgerNavigationContext): void {
  const { trip } = options;
  const L = { ...DEFAULT_LABELS, ...options.labels };
  if (!trip?.id) return;

  const mode = resolveTripLedgerTripType(trip);

  const goClient = () => pushTripLedgerQuickEntry(options, "client");
  const goSupplier = () => pushTripLedgerQuickEntry(options, "supplier");
  const goVehicle = () => pushTripLedgerQuickEntry(options, "vehicle");
  const goDriver = () => pushTripLedgerQuickEntry(options, "driver");

  const buttons: {
    text: string;
    onPress?: () => void;
    style?: "cancel" | "destructive" | "default";
  }[] = [{ text: L.clientPayment, onPress: goClient }];

  if (mode === "market") {
    buttons.push({ text: L.supplierPayment, onPress: goSupplier });
  } else {
    buttons.push({ text: L.vehicleExpense, onPress: goVehicle });
    buttons.push({ text: L.driverPayment, onPress: goDriver });
  }
  buttons.push({ text: L.cancel, style: "cancel" });

  Alert.alert(L.addTransaction, L.chooseEntryType, buttons);
}
