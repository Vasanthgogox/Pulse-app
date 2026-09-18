/**
 * Public surface of the Compliance & Document Intelligence feature.
 * Screens / hooks should import from here, not reach into subpaths.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type {
  ComplianceBlockResult,
  ComplianceDashboardCard,
  ComplianceDocument,
  ComplianceHeatmapCell,
  ComplianceLevel,
  ComplianceScore,
  ComplianceSummaryRow,
  DocTypeCode,
  DocumentAuditAction,
  DocumentAuditEntry,
  DocumentCenterSection,
  DocumentRow,
  DocumentStatus,
  DriverDocTypeCode,
  EntityRef,
  EntityType,
  ExpiringDocRow,
  ExpiryAlertLevel,
  SupplierDocTypeCode,
  VehicleDocTypeCode,
} from "./types/compliance.types";

// ── Doc-type catalog ───────────────────────────────────────────────────────

export {
  DRIVER_DOC_TYPES,
  SUPPLIER_DOC_TYPES,
  VEHICLE_DOC_TYPES,
  getBlockingDocCodes,
  getDocTypeDefinition,
  getDocTypesForEntity,
  getRequiredDocCodes,
  type DocTypeDefinition,
} from "./utils/docTypes.util";

// ── Expiry helpers ─────────────────────────────────────────────────────────

export {
  EXPIRY_CRITICAL_DAYS,
  EXPIRY_NOTICE_DAYS,
  EXPIRY_WARNING_DAYS,
  daysUntilExpiry,
  enrichDocument,
  enrichDocuments,
  formatExpiryNarrative,
  formatExpiryShort,
  getExpiryAlertLevel,
  getExpiryToneColors,
} from "./utils/expiry.util";

// ── Scoring engine ─────────────────────────────────────────────────────────

export {
  REQUIRED_DOC_TYPES,
  computeComplianceScore,
  getComplianceLevelColor,
  getDaysUntilExpiry,
  getExpiryAlertLevel as getExpiryAlertLevelLegacy,
} from "./utils/complianceScore.util";

// ── Components ────────────────────────────────────────────────────────────

export { ComplianceDashboard } from "./components/ComplianceDashboard";
export type { ComplianceDashboardProps } from "./components/ComplianceDashboard";
export { DocumentCenter } from "./components/DocumentCenter";
export type { DocumentCenterProps } from "./components/DocumentCenter";

// ── Services ──────────────────────────────────────────────────────────────

export {
  COMPLIANCE_BUCKET,
  checkComplianceBlocking,
  createDocument,
  deleteComplianceDocument,
  getComplianceDocumentSignedUrl,
  getComplianceScoreForEntity,
  getComplianceSummary,
  getDocumentAuditLog,
  getDocumentsByEntity,
  getDocumentsForEntities,
  getExpiringDocuments,
  getOrgComplianceDocuments,
  recordDocumentAuditEvent,
  rejectDocument,
  replaceComplianceDocument,
  updateDocumentStatus,
  uploadComplianceDocument,
  validateComplianceFile,
  verifyDocument,
  type GetOrgDocumentsOptions,
  type UploadComplianceDocumentInput,
  type UploadComplianceDocumentResult,
} from "./services/documents.service";
