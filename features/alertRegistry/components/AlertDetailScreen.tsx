/**
 * Unified alert detail — chat-style notification card (avatar + feed layout).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { FullPageWizardFooter } from "@/components/full-page-wizard";
import { buildAlertDetailFooterPlan } from "@/lib/alertRegistry/alertDetailPlan.util";
import type { AlertDetailMode } from "@/lib/alertRegistry/alertDetailRoute.util";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import type { AlertRegistryFinanceHandlers } from "@/components/AlertRegistryPanel";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AlertDetailChatBody } from "@/features/alertRegistry/components/AlertDetailChatBody";
import {
  getSalaryRequestByIdForOrganization,
  type SalaryRequestWithDriverRow,
} from "@/features/drivers/services/salaryRequests.service";
import {
  getSharedLedgerNotificationById,
  type SharedLedgerNotificationRow,
} from "@/features/finance/services/sharedLedgerNotifications.service";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salary, setSalary] = useState<SalaryRequestWithDriverRow | null>(null);
  const [shared, setShared] = useState<SharedLedgerNotificationRow | null>(null);
  const [ops, setOps] = useState<GlobalOperationAlert | null>(null);

  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const partnerDisplayByOrgId = useGlobalSyncStore((s) => s.partnerDisplayByOrgId);
  const partnerAvatarUriByOrgId = useGlobalSyncStore((s) => s.partnerAvatarUriByOrgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);

  const driversById = useMemo(
    () => new Map(drivers.map((d) => [d.id, d])),
    [drivers],
  );
  const clientsById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  const partyCtx = useMemo(
    () => ({
      activeTrips,
      driversById,
      clientsById,
      suppliersById,
      org: currentOrganization,
      partnerDisplay: partnerDisplayByOrgId,
      partnerAvatarUri: partnerAvatarUriByOrgId,
    }),
    [
      activeTrips,
      driversById,
      clientsById,
      suppliersById,
      currentOrganization,
      partnerDisplayByOrgId,
      partnerAvatarUriByOrgId,
    ],
  );

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

    try {
      if (kind === "salary") {
        const res = await getSalaryRequestByIdForOrganization(orgId, alertId);
        if (res.error || !res.request) {
          setError(res.error?.message ?? "Salary request not found");
          return;
        }
        setSalary(res.request);
      } else if (kind === "shared") {
        const res = await getSharedLedgerNotificationById(orgId, alertId);
        if (res.error || !res.notification) {
          setError(res.error?.message ?? "Notification not found");
          return;
        }
        setShared(res.notification);
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

  const footerPlan = buildAlertDetailFooterPlan({
    kind,
    mode,
    salary,
    shared,
    ops,
  });

  const hasCardContent =
    (kind === "salary" && salary != null) ||
    (kind === "shared" && shared != null) ||
    (kind === "ops" && ops != null);

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

  const showTripLedgerLink =
    resolveTripId({ kind, salary, shared, ops }) != null &&
    mode === "active" &&
    kind !== "ops";

  const footerHeight = 96 + insets.bottom;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <ChevronLeft size={22} color={Theme.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <LoadingIndicator size="large" color={Theme.primary} />
        </View>
      ) : error || !hasCardContent || !footerPlan ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "Alert not found"}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: footerHeight + 16 }}
          showsVerticalScrollIndicator={false}
        >
          <AlertDetailChatBody
            kind={kind}
            mode={mode}
            salary={salary}
            shared={shared}
            ops={ops}
            driversById={driversById}
            partyCtx={partyCtx}
          />
        </ScrollView>
      )}

      {footerPlan && hasCardContent && !loading && !error ? (
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
            actionVariant="registry"
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  centered: {
    flex: 1,
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
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
  },
});
