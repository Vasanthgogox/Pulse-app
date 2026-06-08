import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/lib/supabase";
import type { ProductId } from "@/lib/productRegistry";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface OrgProductActivation {
  product_id: ProductId;
  status: "inactive" | "trial" | "active" | "suspended" | "cancelled";
  activated_at: string | null;
  trial_ends_at: string | null;
  expires_at: string | null;
  billing_cycle: string | null;
  seats: number | null;
}

export interface OrgWaitlistEntry {
  product_id: ProductId;
  status: "pending" | "invited" | "activated";
  created_at: string;
}

function isMissingWorkspaceProductsSchema(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("workspace_products") ||
    message.includes("product_waitlist") ||
    message.includes("does not exist")
  );
}

export function useWorkspaceProductsQuery() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.workspace.products(orgId),
    queryFn: async (): Promise<OrgProductActivation[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase()
        .from("workspace_products")
        .select(
          "product_id, status, activated_at, trial_ends_at, expires_at, billing_cycle, seats",
        )
        .eq("org_id", orgId);
      if (error) {
        if (isMissingWorkspaceProductsSchema(error)) return [];
        throw new Error(error.message);
      }
      return (data ?? []) as OrgProductActivation[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useWorkspaceWaitlistQuery() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.workspace.waitlist(orgId),
    queryFn: async (): Promise<OrgWaitlistEntry[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase()
        .from("product_waitlist")
        .select("product_id, status, created_at")
        .eq("org_id", orgId);
      if (error) {
        if (isMissingWorkspaceProductsSchema(error)) return [];
        throw new Error(error.message);
      }
      return (data ?? []) as OrgWaitlistEntry[];
    },
    enabled: !!orgId,
    staleTime: 120_000,
    retry: 1,
  });
}

export function useJoinWaitlistMutation() {
  const { currentOrganization } = useOrganization();
  const qc = useQueryClient();
  const orgId = currentOrganization?.id ?? "";

  return useMutation({
    mutationFn: async ({
      productId,
      email,
      fleetSize,
      useCase,
    }: {
      productId: ProductId;
      email: string;
      fleetSize?: string;
      useCase?: string;
    }) => {
      const { data, error } = await supabase().rpc("join_product_waitlist", {
        p_product_id: productId,
        p_org_id: orgId,
        p_email: email,
        p_fleet_size: fleetSize ?? null,
        p_use_case: useCase ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({ queryKey: queryKeys.workspace.waitlist(orgId) });
    },
  });
}
