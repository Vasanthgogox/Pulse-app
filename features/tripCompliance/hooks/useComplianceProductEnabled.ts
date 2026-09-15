import { useWorkspaceProductsQuery } from "@/lib/queries/useWorkspaceProductsQuery";

/**
 * Single source of truth for "is the Compliance workspace product active."
 * Every Compliance route (`/compliance`, `/compliance/bulk-payment`,
 * `/compliance/report`) must gate on this — not just its own RBAC surface —
 * so a Finance/Compliance member can't reach a functional Compliance screen
 * while the workspace has the product turned off.
 */
export function useComplianceProductEnabled(): { enabled: boolean; isLoading: boolean } {
  const { data: workspaceProducts, isLoading } = useWorkspaceProductsQuery();
  const enabled = (workspaceProducts ?? []).some(
    (p) => p.product_id === "pulse_compliance" && (p.status === "active" || p.status === "trial"),
  );
  return { enabled, isLoading };
}
