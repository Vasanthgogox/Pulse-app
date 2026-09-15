import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { queryKeys } from "@/lib/queryKeys";
import { getTripsByOrganization } from "@/features/trips/services/trips.service";
import { buildComplianceTripSummaries } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceStage, ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

const PAGE_SIZE = 30;

/**
 * One Compliance page load = exactly 4 queries total regardless of page size
 * (trips + trip_documents + trips-flags + transactions) — no per-card RPC,
 * no per-trip fetch. Reuses `getTripsByOrganization`'s existing paginated
 * trips read rather than adding a second trips query pattern.
 */
export function useComplianceTripsQuery(page = 0) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.tripCompliance.list(orgId, page),
    queryFn: async (): Promise<{ summaries: ComplianceTripSummary[]; hasMore: boolean }> => {
      if (!orgId) return { summaries: [], hasMore: false };
      const { error, trips, hasMore } = await getTripsByOrganization(orgId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const summaries = await buildComplianceTripSummaries(trips);
      return { summaries, hasMore: hasMore ?? false };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useComplianceStageFilter(summaries: ComplianceTripSummary[] | undefined) {
  const [stage, setStage] = useState<ComplianceStage | "all">("all");
  const filtered = useMemo(() => {
    if (!summaries) return [];
    if (stage === "all") return summaries;
    return summaries.filter((s) => s.stage === stage);
  }, [summaries, stage]);
  return { stage, setStage, filtered };
}

export function useInvalidateComplianceTrips() {
  const { currentOrganization } = useOrganization();
  const qc = useQueryClient();
  const orgId = currentOrganization?.id ?? "";
  return () => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: ["q", "tripCompliance", "list", orgId] });
  };
}
