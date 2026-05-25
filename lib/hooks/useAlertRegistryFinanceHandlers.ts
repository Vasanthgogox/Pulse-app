import { useCallback, useState } from "react";
import type { AlertRegistryFinanceHandlers } from "@/components/AlertRegistryPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAlertRegistryNotifications } from "@/lib/globalSync/useAlertRegistryNotifications";
import { resolveSharedActionKind } from "@/lib/sharedLedger/registryLabels";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { SharedLedgerNotificationRow } from "@/services/sharedLedgerNotificationsService";
import { useRouter } from "expo-router";

export function useAlertRegistryFinanceHandlers(): {
  finance: AlertRegistryFinanceHandlers;
  refreshRegistry: () => void;
} {
  const router = useRouter();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [notifActionId, setNotifActionId] = useState<string | null>(null);
  const {
    refreshRegistry,
    rejectSalaryRequest,
    markSharedLedgerRead,
  } = useAlertRegistryNotifications(orgId);

  const handleSalaryReject = useCallback(
    async (requestId: string) => {
      setNotifActionId(requestId);
      await rejectSalaryRequest(requestId);
      setNotifActionId(null);
    },
    [rejectSalaryRequest],
  );

  const openLedgerForSalaryPayment = useCallback(
    (req: SalaryRequestWithDriverRow) => {
      const driverName = req.drivers?.name?.trim() || t("driver");
      const isTripBased =
        req.request_type === "trip_based" &&
        Array.isArray(req.trip_ids) &&
        req.trip_ids.length > 0;
      const q = new URLSearchParams({
        entityType: "DRIVER",
        entityId: req.driver_id,
        partyName: driverName,
        partyId: req.driver_id,
        defaultType: "out",
        salaryAmount: String(req.amount),
        defaultDriverPaymentType: isTripBased ? "settlement" : "advance",
        salaryRequestId: req.id,
      });
      if (isTripBased && req.trip_ids[0]) {
        q.set("tripId", req.trip_ids[0]);
      }
      router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
    },
    [router, t],
  );

  const handleSharedAction = useCallback(
    async (item: SharedLedgerNotificationRow) => {
      const payload = item.payload_json ?? {};
      const actionKind = resolveSharedActionKind(item.event_type, payload);
      const tripId = typeof payload.trip_id === "string" ? payload.trip_id : null;
      const entityType =
        typeof payload.entity_type === "string"
          ? payload.entity_type.toUpperCase()
          : null;
      const entityId = typeof payload.entity_id === "string" ? payload.entity_id : null;

      if (entityType === "CLIENT" && entityId) {
        const q = new URLSearchParams({
          shared: "1",
          sharedAction: actionKind,
        });
        if (tripId) q.set("tripId", tripId);
        router.push(`/client/${entityId}?${q.toString()}` as const);
      } else if (entityType === "SUPPLIER" && entityId) {
        const q = new URLSearchParams({
          shared: "1",
          sharedAction: actionKind,
        });
        if (tripId) q.set("tripId", tripId);
        router.push(`/supplier/${entityId}?${q.toString()}` as const);
      } else if (tripId) {
        router.push(`/trip-ledger/${tripId}` as const);
      } else {
        router.push("/(tabs)/finance");
      }

      if (orgId && item.status === "open") {
        void markSharedLedgerRead(item.id);
      }
    },
    [orgId, markSharedLedgerRead, router],
  );

  const finance: AlertRegistryFinanceHandlers = {
    onRejectSalary: (id) => void handleSalaryReject(id),
    onPaySalary: openLedgerForSalaryPayment,
    onMarkSharedRead: (id) => void markSharedLedgerRead(id),
    onSharedAction: (item) => void handleSharedAction(item),
    busySalaryId: notifActionId,
  };

  return { finance, refreshRegistry };
}
