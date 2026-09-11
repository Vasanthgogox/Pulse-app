import { useMemo } from "react";
import { buildFinanceProChromeAlerts } from "../model/financeProChromeAlerts.util";
import { useFinanceProModel } from "./useFinanceProModel";

export function useFinanceProChromeAlerts() {
  const { model, loading } = useFinanceProModel();
  const alerts = useMemo(
    () => buildFinanceProChromeAlerts(model.tripFacts),
    [model.tripFacts],
  );
  const podPendingCount = useMemo(
    () => alerts.filter((a) => a.kind === "pod_pending").length,
    [alerts],
  );
  const invoiceOverdueCount = useMemo(
    () => alerts.filter((a) => a.kind === "invoice_overdue").length,
    [alerts],
  );
  return {
    alerts,
    count: alerts.length,
    podPendingCount,
    invoiceOverdueCount,
    loading,
  };
}
