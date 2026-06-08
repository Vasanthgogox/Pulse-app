/**
 * Unified alert detail — treasury header + ledger sections + attribute wizard footer CTAs.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { FullPageWizardFooter } from "@/components/full-page-wizard";
import { buildAlertDetailFooterPlan } from "@/lib/alertRegistry/alertDetailPlan.util";
import type { AlertDetailMode } from "@/lib/alertRegistry/alertDetailRoute.util";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import type { AlertRegistryFinanceHandlers } from "@/components/AlertRegistryPanel";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  AlertDetailLedgerSections,
  type AlertDetailEntryModel,
  type AlertDetailLedgerModel,
  type AlertDetailTripModel,
} from "@/features/alertRegistry/components/AlertDetailLedgerSections";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import {
  getSalaryRequestByIdForOrganization,
  type SalaryRequestWithDriverRow,
} from "@/features/drivers/services/salaryRequests.service";
import {
  getTransactionsByOrganization,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import {
  getSharedLedgerNotificationById,
  type SharedLedgerNotificationRow,
} from "@/features/finance/services/sharedLedgerNotifications.service";
import { TreasuryDetailLayout } from "@/features/finance/components/TreasuryDetailLayout";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import {
  getTripById,
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { formatIndianVehicleNumber, formatLedgerDate } from "@/lib/format";
import { formatRegistryLabel } from "@/lib/alertRegistry/registryAlertPresentation.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function isTripBasedAttribution(req: SalaryRequestWithDriverRow): boolean {
  return (
    req.request_type === "trip_based" &&
    String(req.note ?? "").toLowerCase().includes("fleet trip")
  );
}

function salaryTypeLabel(req: SalaryRequestWithDriverRow): string {
  if (isTripBasedAttribution(req)) return "Fleet trip attribution";
  if (req.request_type === "trip_based") return "Driver payment";
  return formatRegistryLabel(req.request_type);
}

function resolveTripId(input: {
  kind: RegistryFeedKind;
  salary?: SalaryRequestWithDriverRow | null;
  shared?: SharedLedgerNotificationRow | null;
  ops?: GlobalOperationAlert | null;
}): string | null {
  if (input.kind === "salary" && input.salary?.trip_ids?.[0]) {
    return input.salary.trip_ids[0];
  }
  if (input.kind === "shared") {
    const payload = input.shared?.payload_json ?? {};
    const fromPayload =
      typeof payload.trip_id === "string" ? payload.trip_id : null;
    return input.shared?.trip_id ?? fromPayload;
  }
  if (input.kind === "ops" && input.ops?.trip_id) {
    return input.ops.trip_id;
  }
  return null;
}

export type AlertDetailScreenProps = {
  kind: RegistryFeedKind;
  alertId: string;
  mode: AlertDetailMode;
  onBack: () => void;
  finance: AlertRegistryFinanceHandlers;
};

export function AlertDetailScreen({
  kind,
  alertId,
  mode,
  onBack,
  finance,
}: AlertDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const orgName = currentOrganization?.name?.trim() || "Organization";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salary, setSalary] = useState<SalaryRequestWithDriverRow | null>(null);
  const [shared, setShared] = useState<SharedLedgerNotificationRow | null>(null);
  const [ops, setOps] = useState<GlobalOperationAlert | null>(null);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (!orgId || !alertId) {
      setLoading(false);
      setError("Organization not ready");
      return;
    }

    setLoading(true);
    setError(null);
    setSalary(null);
    setShared(null);
    setOps(null);
    setTrip(null);
    setTransactions([]);

    try {
      let tripId: string | null = null;

      if (kind === "salary") {
        const res = await getSalaryRequestByIdForOrganization(orgId, alertId);
        if (res.error || !res.request) {
          setError(res.error?.message ?? "Salary request not found");
          return;
        }
        setSalary(res.request);
        tripId = res.request.trip_ids?.[0] ?? null;
      } else if (kind === "shared") {
        const res = await getSharedLedgerNotificationById(orgId, alertId);
        if (res.error || !res.notification) {
          setError(res.error?.message ?? "Notification not found");
          return;
        }
        setShared(res.notification);
        const payload = res.notification.payload_json ?? {};
        tripId =
          res.notification.trip_id ??
          (typeof payload.trip_id === "string" ? payload.trip_id : null);
      } else if (kind === "ops") {
        const found =
          useGlobalSyncStore
            .getState()
            .getOperationsShelfItems()
            .find((item) => item.id === alertId) ?? null;
        if (!found) {
          setError("Alert is no longer active");
          return;
        }
        setOps(found);
        tripId = found.trip_id;
      }

      const txRes = await getTransactionsByOrganization(orgId);
      setTransactions(txRes.error ? [] : (txRes.transactions ?? []));

      if (tripId) {
        const tripRes = await getTripById(tripId);
        if (tripRes.error) {
          setError(tripRes.error.message);
        } else {
          setTrip(tripRes.trip ?? null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alert");
    } finally {
      setLoading(false);
    }
  }, [alertId, kind, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!trip || !orgId) {
      setVehicleLabel(null);
      setDriverName(null);
      return;
    }

    let cancelled = false;

    if (trip.vehicle_id) {
      getVehicleById(orgId, trip.vehicle_id).then((res) => {
        if (cancelled) return;
        if (res.vehicle) {
          const parts = [res.vehicle.vehicle_number];
          if (res.vehicle.vehicle_type) parts.push(res.vehicle.vehicle_type);
          setVehicleLabel(parts.join(" · "));
        } else {
          setVehicleLabel(null);
        }
      });
    } else if (trip.vehicle_display_number?.trim()) {
      setVehicleLabel(formatIndianVehicleNumber(trip.vehicle_display_number.trim()));
    } else {
      setVehicleLabel(null);
    }

    const fallbackDriverName = (trip.driver_display_name ?? "").trim() || null;
    if (trip.driver_id) {
      setDriverName(fallbackDriverName);
      getDriverById(orgId, trip.driver_id).then((res) => {
        if (cancelled) return;
        const fromDriver = res.driver
          ? (res.driver.name || res.driver.phone || "").trim() || null
          : null;
        setDriverName(fromDriver ?? fallbackDriverName ?? "—");
      });
    } else if (kind === "salary" && salary?.drivers?.name?.trim()) {
      setDriverName(salary.drivers.name.trim());
    } else {
      setDriverName(fallbackDriverName);
    }

    return () => {
      cancelled = true;
    };
  }, [trip, orgId, kind, salary?.drivers?.name]);

  const tripLedgerEntries = useMemo(() => {
    return getTripLedgerEntries(
      transactions,
      trip?.id,
      trip ? getTripDisplayNumber(trip) : undefined,
    );
  }, [transactions, trip]);

  const supplierCost = trip ? Number(trip.supplier_rate ?? 0) : 0;
  const supplierPaid = useMemo(() => {
    if (!tripLedgerEntries.length) return 0;
    return tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
  }, [tripLedgerEntries]);
  const supplierDue = Math.max(0, supplierCost - supplierPaid);

  const sales = trip ? Number(trip.client_price ?? 0) : 0;
  const received = useMemo(() => {
    if (!tripLedgerEntries.length) return 0;
    return tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
  }, [tripLedgerEntries]);
  const outstanding = Math.max(0, sales - received);

  const headerTitle = useMemo(() => {
    if (trip) return getTripDisplayNumber(trip);
    if (kind === "salary" && salary) {
      return salary.drivers?.name?.trim() || "Salary request";
    }
    if (kind === "shared" && shared) return shared.title;
    if (kind === "ops" && ops) return ops.trip_number ?? ops.title;
    return "Alert";
  }, [trip, kind, salary, shared, ops]);

  const headerSubtitle = useMemo(() => {
    if (trip?.client_name?.trim()) return trip.client_name.trim();
    return orgName.toUpperCase();
  }, [trip?.client_name, orgName]);

  const entryModel = useMemo((): AlertDetailEntryModel | null => {
    if (kind === "salary" && salary) {
      const route =
        trip != null
          ? `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`
          : null;
      return {
        title: salaryTypeLabel(salary),
        metaLine: `${t("tripPayment")} ${formatLedgerDate(salary.created_at)}`,
        routeLine: route,
        amount: Number(salary.amount ?? 0),
        direction: "out",
      };
    }
    if (kind === "shared" && shared) {
      const route =
        trip != null
          ? `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`
          : shared.subtitle;
      return {
        title: shared.title,
        metaLine: formatLedgerDate(shared.created_at),
        routeLine: route,
        amount: Number(shared.amount_meta ?? 0),
        direction: "out",
      };
    }
    if (kind === "ops" && ops) {
      const route =
        trip != null
          ? `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`
          : ops.subtitle;
      return {
        title: ops.title,
        metaLine: formatLedgerDate(ops.created_at),
        routeLine: route,
        amount: Number(ops.amount ?? 0),
        direction: ops.amount != null && ops.amount > 0 ? "out" : "in",
      };
    }
    return null;
  }, [kind, salary, shared, ops, trip, t]);

  const ledgerModel = useMemo((): AlertDetailLedgerModel | null => {
    if (kind === "salary" && salary) {
      return {
        typeLabel: salaryTypeLabel(salary),
        entryDate: salary.created_at,
        amountOut: Number(salary.amount ?? 0),
        note: salary.note,
      };
    }
    if (kind === "shared" && shared) {
      return {
        typeLabel: shared.title,
        entryDate: shared.created_at,
        amountOut:
          shared.amount_meta != null ? Number(shared.amount_meta) : undefined,
        note: shared.subtitle,
      };
    }
    if (kind === "ops" && ops) {
      return {
        typeLabel: ops.category.replace(/_/g, " "),
        entryDate: ops.created_at,
        amountOut: ops.amount != null ? Number(ops.amount) : undefined,
        note: ops.subtitle,
      };
    }
    return null;
  }, [kind, salary, shared, ops]);

  const tripModel = useMemo((): AlertDetailTripModel | null => {
    if (!trip) return null;
    return {
      trip,
      clientName: trip.client_name ?? "—",
      vehicleLabel,
      driverName,
      supplierCost,
      supplierPaid,
      supplierDue,
    };
  }, [trip, vehicleLabel, driverName, supplierCost, supplierPaid, supplierDue]);

  const footerPlan = buildAlertDetailFooterPlan({
    kind,
    mode,
    salary,
    shared,
    ops,
  });

  const handlePrimary = useCallback(() => {
    if (kind === "salary" && salary) {
      if (mode === "archive") {
        finance.onViewSalaryArchive(salary);
        return;
      }
      finance.onPaySalary(salary);
      return;
    }
    if (kind === "shared" && shared) {
      finance.onSharedAction(shared);
      return;
    }
    if (kind === "ops" && ops) {
      navigateToOpsAlert(router, ops);
    }
  }, [kind, salary, shared, ops, mode, finance, router]);

  const handleSecondary = useCallback(() => {
    if (kind === "salary" && salary && mode === "active") {
      finance.onRejectSalary(salary.id);
      onBack();
      return;
    }
    if (kind === "shared" && shared && mode === "active") {
      finance.onMarkSharedRead(shared.id);
      onBack();
      return;
    }
    if (kind === "ops" && ops) {
      finance.onDismissOps(ops);
      onBack();
    }
  }, [kind, salary, shared, ops, mode, finance, onBack]);

  const handleTertiary = useCallback(() => {
    const tripId = resolveTripId({ kind, salary, shared, ops });
    if (tripId) {
      router.push(`/trip-ledger/${tripId}` as const);
    }
  }, [kind, salary, shared, ops, router]);

  const layoutShell = (children: ReactNode) => (
    <TreasuryDetailLayout
      title={headerTitle}
      subtitle={headerSubtitle}
      showBack
      onBack={onBack}
      onLoadClick={() => router.push("/load-board")}
      onNetworkClick={() => router.push("/(tabs)/network")}
      onNotificationClick={() => router.push("/notifications")}
      onProfileClick={() => router.push("/(tabs)/profile")}
      summaryCard={{
        totalIn: sales,
        totalOut: outstanding,
        labelIn: t("sales"),
        labelOut: t("totalBalance"),
        searchQuery,
        onSearchChange: setSearchQuery,
        searchPlaceholder: t("searchMissionDestination"),
        onReportPress: () => {},
      }}
    >
      {children}
    </TreasuryDetailLayout>
  );

  if (loading) {
    return layoutShell(
      <View style={styles.centered}>
        <LoadingIndicator size="large" color={Theme.primary} />
      </View>,
    );
  }

  if (error || !entryModel || !ledgerModel || !footerPlan) {
    return layoutShell(
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "Alert not found"}</Text>
      </View>,
    );
  }

  const showTripLedgerLink =
    resolveTripId({ kind, salary, shared, ops }) != null &&
    mode === "active" &&
    kind !== "ops";

  return (
    <View style={styles.root}>
      {layoutShell(
        <View style={{ paddingBottom: 96 + insets.bottom }}>
          <AlertDetailLedgerSections
            entry={entryModel}
            ledger={ledgerModel}
            trip={tripModel}
            associatedTransactions={tripLedgerEntries}
            onSelectTransaction={() => {
              if (trip?.id) {
                router.push(`/trip-ledger/${trip.id}` as const);
              }
            }}
          />
        </View>,
      )}

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            paddingHorizontal: Layout.screenPaddingHorizontal,
          },
        ]}
      >
        <FullPageWizardFooter
          summary={footerPlan.summary}
          hint={footerPlan.hint}
          secondaryLabel={footerPlan.secondaryLabel}
          onSecondaryPress={
            footerPlan.secondaryLabel ? handleSecondary : undefined
          }
          tertiaryLabel={showTripLedgerLink ? "View trip" : undefined}
          onTertiaryPress={showTripLedgerLink ? handleTertiary : undefined}
          primaryLabel={footerPlan.primaryLabel}
          onPrimaryPress={handlePrimary}
          loading={kind === "salary" && finance.busySalaryId === alertId}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
  },
});
