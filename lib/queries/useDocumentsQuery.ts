/**
 * TanStack Query hooks for Compliance & Document Intelligence.
 *
 * All keys come from `queryKeys.compliance.*` so realtime invalidation
 * (`useRealtimeInvalidation`) can target precise scopes (e.g.
 * `queryKeys.compliance.byEntity(orgId, "vehicle", vehicleId)`).
 *
 * Stale-time policy:
 *   - per-entity doc list    : 60s  (interactive — drives the detail tab)
 *   - org-wide summary       : 120s (dashboard top cards)
 *   - expiring list          : 300s (slowly-changing timeline)
 *   - score                  : 120s
 *   - audit log              : Infinity (immutable, refreshed on mutation)
 *   - blocking probe         : 0     (always fresh — gates trip allocation)
 */

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import {
  type GetOrgDocumentsOptions,
  getComplianceScoreForEntity,
  getComplianceSummary,
  getDocumentAuditLog,
  getDocumentsByEntity,
  getExpiringDocuments,
  getOrgComplianceDocuments,
  checkComplianceBlocking,
} from "@/features/compliance/services/documents.service";
import type { EntityType } from "@/features/compliance/types/compliance.types";

// ── Per-entity document list (Vehicle / Driver / Supplier detail tabs) ─────

export function useEntityDocumentsQuery(
  orgId: string | null,
  entityType: EntityType,
  entityId: string | null,
) {
  return useQuery({
    queryKey: orgId && entityId
      ? queryKeys.compliance.byEntity(orgId, entityType, entityId)
      : ["q", "compliance", "noop"],
    queryFn: () => getDocumentsByEntity(orgId!, entityType, entityId!),
    enabled: !!orgId && !!entityId,
    staleTime: 60_000,
    select: (data) => data.documents,
  });
}

// ── Org-wide aggregated summary (dashboard top cards) ──────────────────────

export function useComplianceSummaryQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.compliance.summary(orgId)
      : ["q", "compliance", "noop"],
    queryFn: () => getComplianceSummary(orgId!),
    enabled: !!orgId,
    staleTime: 120_000,
    select: (data) => data.summary,
  });
}

// ── Expiring documents (timeline + Documents Center "Expiring Soon" tab) ──

export function useExpiringDocumentsQuery(
  orgId: string | null,
  daysAhead = 30,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.compliance.expiring(orgId, daysAhead)
      : ["q", "compliance", "noop"],
    queryFn: () => getExpiringDocuments(orgId!, daysAhead),
    enabled: !!orgId,
    staleTime: 300_000,
    select: (data) => data.documents,
  });
}

// ── Org-wide list with filters (Documents Center sections) ─────────────────

export function useOrgComplianceDocumentsQuery(
  orgId: string | null,
  options: GetOrgDocumentsOptions = {},
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.compliance.orgList(orgId, options as Record<string, unknown>)
      : ["q", "compliance", "noop"],
    queryFn: () => getOrgComplianceDocuments(orgId!, options),
    enabled: !!orgId,
    staleTime: 60_000,
    select: (data) => data.documents,
  });
}

// ── Server-computed compliance score for a single entity ───────────────────

export function useComplianceScoreQuery(
  entityType: EntityType | null,
  entityId: string | null,
) {
  return useQuery({
    queryKey: entityType && entityId
      ? queryKeys.compliance.score(entityType, entityId)
      : ["q", "compliance", "noop"],
    queryFn: () => getComplianceScoreForEntity(entityType!, entityId!),
    enabled: !!entityType && !!entityId,
    staleTime: 120_000,
    select: (data) => data.score,
  });
}

// ── Audit trail for a single document (immutable feed) ─────────────────────

export function useDocumentAuditLogQuery(
  documentId: string | null,
  options: { limit?: number } = {},
) {
  return useQuery({
    queryKey: documentId
      ? queryKeys.compliance.audit(documentId)
      : ["q", "compliance", "noop"],
    queryFn: () => getDocumentAuditLog(documentId!, options),
    enabled: !!documentId,
    staleTime: Infinity,
    select: (data) => data.entries,
  });
}

// ── Trip-allocation blocking probe (no stale time — must be fresh) ─────────

export function useComplianceBlockingQuery(input: {
  vehicleId: string | null;
  driverId: string | null;
  enabled?: boolean;
}) {
  const enabled = (input.enabled ?? true) && (!!input.vehicleId || !!input.driverId);
  return useQuery({
    queryKey: queryKeys.compliance.blocking(input.vehicleId, input.driverId),
    queryFn: () =>
      checkComplianceBlocking({
        vehicleId: input.vehicleId,
        driverId: input.driverId,
      }),
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
    select: (data) => data.result,
  });
}
