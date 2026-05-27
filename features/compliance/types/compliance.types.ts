/**
 * Compliance & Document Intelligence — type contracts.
 *
 * Re-exports the row shapes already defined in `services/documents.service.ts`
 * and adds the higher-level domain types used across the UI (entity profile
 * tabs, Documents Center dashboard, scoring engine, alert system, blocking
 * gate). Keep this file the single source of truth — components should
 * import from `@/features/compliance/types/compliance.types` and never
 * reach into the service file directly.
 */

import type {
  ComplianceSummaryRow,
  DocumentRow,
  ExpiringDocRow,
} from "../services/documents.service";
import type {
  ComplianceLevel,
  ComplianceScore,
} from "../utils/complianceScore.util";

// ── Re-exports (single import surface) ──────────────────────────────────────

export type {
  ComplianceSummaryRow,
  DocumentRow,
  ExpiringDocRow,
  ComplianceLevel,
  ComplianceScore,
};

// ── Domain enums ────────────────────────────────────────────────────────────

/** Entity types that can own compliance documents (matches the SQL CHECK). */
export type EntityType =
  | "vehicle"
  | "driver"
  | "supplier"
  | "organization";

/**
 * Lifecycle status — mirrors `entity_documents.status` CHECK constraint.
 *
 *   pending  → just uploaded, awaiting verification
 *   active   → in force; expiry may still apply
 *   verified → checked by a verifier (e.g. ops admin)
 *   expired  → past expiry_date (also computed live from `expiry_date`)
 *   rejected → verifier marked as invalid (e.g. wrong doc, photo unclear)
 *   replaced → superseded by `replaced_by_id` row (kept for audit only)
 */
export type DocumentStatus =
  | "pending"
  | "active"
  | "verified"
  | "expired"
  | "rejected"
  | "replaced";

/**
 * Visual expiry bucket used by `DocumentCard`, `ExpiryTimeline`, status
 * pills, and the dashboard top cards. Resolved by
 * `getExpiryAlertLevel(daysUntil)` in `expiry.util.ts`.
 */
export type ExpiryAlertLevel =
  | "ok"        // > 90 days OR no expiry date
  | "notice"    // 31–90 days
  | "warning"   // 8–30 days
  | "critical"  // 0–7 days
  | "expired";  // < 0 days

/** Audit-trail action — matches the post-fix CHECK enum on `document_audit_log.action`. */
export type DocumentAuditAction =
  | "created"
  | "uploaded"
  | "updated"
  | "verified"
  | "rejected"
  | "replaced"
  | "deleted"
  | "downloaded";

// ── Doc-type catalog ───────────────────────────────────────────────────────
//
// Concrete document codes live in `utils/docTypes.util.ts` (label, icon,
// applicable entity types, required vs optional). The types here keep the
// `doc_type` column open (string) so we never have to migrate when adding
// a new doc; downstream callers can narrow via the `DocTypeCode` union.

/** Vehicle doc codes — extend `VEHICLE_DOC_TYPES` in `docTypes.util.ts`. */
export type VehicleDocTypeCode =
  | "rc"
  | "insurance"
  | "fitness"
  | "permit"
  | "national_permit"
  | "road_tax"
  | "pollution"
  | "fastag_kyc";

/** Driver doc codes — extend `DRIVER_DOC_TYPES` in `docTypes.util.ts`. */
export type DriverDocTypeCode =
  | "license"
  | "aadhaar"
  | "pan"
  | "medical"
  | "police_verification"
  | "training_certificate"
  | "hazardous_license";

/** Supplier / organization doc codes. */
export type SupplierDocTypeCode = "gst" | "pan" | "agreement" | "cin";

export type DocTypeCode =
  | VehicleDocTypeCode
  | DriverDocTypeCode
  | SupplierDocTypeCode;

// ── Higher-level shapes ────────────────────────────────────────────────────

/**
 * A document enriched for UI rendering. Computed once at the service
 * boundary so screens don't have to call `getExpiryAlertLevel` themselves.
 */
export interface ComplianceDocument extends DocumentRow {
  /** -Infinity if `expiry_date` is null. */
  daysUntilExpiry: number | null;
  alertLevel: ExpiryAlertLevel;
  /** Display label resolved from the doc-types catalog (e.g. "Insurance"). */
  displayLabel: string;
  /** True when service layer / signed-URL is available for view/download. */
  hasFile: boolean;
}

/** Polymorphic descriptor for a compliance owner used by services and UI. */
export interface EntityRef {
  entityType: EntityType;
  entityId: string;
  /** Display name resolved upstream (vehicle number / driver name / etc.). */
  label?: string;
}

/** Audit-log row enriched for UI (actor display name resolved upstream). */
export interface DocumentAuditEntry {
  id: string;
  documentId: string | null;
  organizationId: string;
  entityType: EntityType;
  entityId: string;
  action: DocumentAuditAction;
  actorId: string | null;
  actorDisplayName?: string;
  oldStatus: DocumentStatus | null;
  newStatus: DocumentStatus | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Result of the server-side `is_compliance_blocking(vehicle, driver)` RPC.
 * Consumed by `updateTripAssignment` and the reassign / add-trip UI to
 * refuse allocation with a human-readable reason list.
 */
export interface ComplianceBlockResult {
  blocked: boolean;
  reasons: Array<{
    entity_type: EntityType;
    entity_id: string;
    doc_type: DocTypeCode | string;
    reason: "expired" | "missing";
    expiry_date: string | null;
  }>;
}

/** Top-card payload for the Compliance Dashboard ("Expiring in 7 days" etc.). */
export interface ComplianceDashboardCard {
  id:
    | "expiring_7d"
    | "expiring_30d"
    | "expired"
    | "high_risk_vehicles"
    | "blocked_drivers"
    | "compliance_score";
  label: string;
  value: number | string;
  helper?: string;
  tone: "ok" | "notice" | "warning" | "critical" | "neutral";
}

/** Sections of the Documents Center sub-navigation. */
export type DocumentCenterSection =
  | "all"
  | "expiring"
  | "expired"
  | "pending_verification"
  | "missing"
  | "renewal_queue";

/** A single cell in the fleet compliance heatmap. */
export interface ComplianceHeatmapCell {
  entityType: EntityType | "branch";
  entityId: string;
  label: string;
  score: number;
  level: ComplianceLevel;
  expiredCount: number;
  expiringCount: number;
}
