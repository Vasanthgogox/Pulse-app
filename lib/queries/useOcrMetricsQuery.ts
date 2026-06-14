import { useOrganization } from "@/contexts/OrganizationContext";
import { getOcrMetrics } from "@/features/ocr";
import type { OcrMetricsSummary } from "@/features/ocr";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export const EMPTY_OCR_METRICS: OcrMetricsSummary = {
  jobs_today: 0,
  jobs_this_month: 0,
  jobs_in_window: 0,
  avg_duration_ms: null,
  avg_confidence: null,
  failed_count: 0,
  duplicate_count: 0,
  quota_used: 0,
  quota_limit: null,
  quota_remaining: null,
  quota_tier: "pulse_core",
};

type Options = {
  days?: number;
  enabled?: boolean;
};

export function useOcrMetricsQuery({ days = 30, enabled = true }: Options = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.ocr.metrics(orgId, days),
    queryFn: () => getOcrMetrics(orgId, days),
    enabled: enabled && Boolean(orgId),
    staleTime: 60_000,
    placeholderData: EMPTY_OCR_METRICS,
  });
}
