/**
 * Compliance document-type catalog.
 *
 * Single source of truth for every doc-type the app understands —
 * which entity it applies to, its display label, whether it's
 * mandatory for compliance, and the FontAwesome icon name used by
 * cards / list rows. New doc types are added here and everything
 * (dashboards, score engine, blocking rules, missing-docs list)
 * derives from this map.
 *
 * Keep `mandatory: true` in sync with:
 *   - `REQUIRED_DOC_TYPES` in `./complianceScore.util.ts` (TS scorer)
 *   - `v_required` arrays inside `compute_compliance_score(...)` SQL RPC
 *   - blocking arrays inside `is_compliance_blocking(...)` SQL RPC
 */

import type {
  DocTypeCode,
  DriverDocTypeCode,
  EntityType,
  SupplierDocTypeCode,
  VehicleDocTypeCode,
} from "../types/compliance.types";

export interface DocTypeDefinition {
  code: DocTypeCode;
  label: string;
  /** Short legal/industry abbreviation used in card chips. */
  shortLabel: string;
  /** One-line UX helper text for the upload prompt. */
  helper: string;
  /** FontAwesome v4 icon — matches the `FontAwesome` component already imported app-wide. */
  icon: string;
  /** Required-for-compliance flag — drives "missing" detection + score. */
  mandatory: boolean;
  /** True when the doc carries an `expiry_date`. */
  hasExpiry: boolean;
  /**
   * True when this doc participates in trip-allocation blocking
   * (the server-side `is_compliance_blocking` RPC enforces this).
   */
  blocksTripAllocation: boolean;
}

// ── Vehicle catalog ─────────────────────────────────────────────────────────

export const VEHICLE_DOC_TYPES: Record<VehicleDocTypeCode, DocTypeDefinition> = {
  rc: {
    code: "rc",
    label: "Registration Certificate (RC)",
    shortLabel: "RC",
    helper: "Vehicle ownership and registration proof issued by RTO.",
    icon: "id-card",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  insurance: {
    code: "insurance",
    label: "Insurance Policy",
    shortLabel: "Insurance",
    helper: "Active third-party or comprehensive motor insurance.",
    icon: "shield",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: true,
  },
  fitness: {
    code: "fitness",
    label: "Fitness Certificate",
    shortLabel: "Fitness",
    helper: "RTO-issued mechanical fitness certificate.",
    icon: "wrench",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: true,
  },
  permit: {
    code: "permit",
    label: "Permit (State)",
    shortLabel: "Permit",
    helper: "State transport permit — required for commercial use.",
    icon: "map",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: true,
  },
  national_permit: {
    code: "national_permit",
    label: "National Permit",
    shortLabel: "Nat. Permit",
    helper: "All-India / multi-state national permit (NP).",
    icon: "globe",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  road_tax: {
    code: "road_tax",
    label: "Road Tax",
    shortLabel: "Road Tax",
    helper: "Latest road / motor-vehicle tax receipt.",
    icon: "money",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  pollution: {
    code: "pollution",
    label: "PUC (Pollution Under Control)",
    shortLabel: "PUC",
    helper: "Pollution-under-control emissions certificate.",
    icon: "leaf",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  fastag_kyc: {
    code: "fastag_kyc",
    label: "FASTag KYC",
    shortLabel: "FASTag",
    helper: "FASTag KYC verification document.",
    icon: "credit-card",
    mandatory: false,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
};

// ── Driver catalog ──────────────────────────────────────────────────────────

export const DRIVER_DOC_TYPES: Record<DriverDocTypeCode, DocTypeDefinition> = {
  license: {
    code: "license",
    label: "Driving License",
    shortLabel: "License",
    helper: "Government-issued commercial driving license.",
    icon: "drivers-license",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: true,
  },
  aadhaar: {
    code: "aadhaar",
    label: "Aadhaar",
    shortLabel: "Aadhaar",
    helper: "UIDAI Aadhaar identity proof.",
    icon: "id-badge",
    mandatory: false,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
  pan: {
    code: "pan",
    label: "PAN Card",
    shortLabel: "PAN",
    helper: "Income-tax PAN identity proof.",
    icon: "credit-card-alt",
    mandatory: false,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
  medical: {
    code: "medical",
    label: "Medical Fitness",
    shortLabel: "Medical",
    helper: "Doctor-certified medical fitness for commercial driving.",
    icon: "heartbeat",
    mandatory: true,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  police_verification: {
    code: "police_verification",
    label: "Police Verification",
    shortLabel: "Police V.",
    helper: "Police-verified background check.",
    icon: "shield",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  training_certificate: {
    code: "training_certificate",
    label: "Training Certificate",
    shortLabel: "Training",
    helper: "Defensive-driving or hazardous-handling training proof.",
    icon: "graduation-cap",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  hazardous_license: {
    code: "hazardous_license",
    label: "Hazardous-Goods License",
    shortLabel: "HazMat",
    helper: "Special endorsement for hazardous-goods movement.",
    icon: "exclamation-triangle",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
};

// ── Supplier / organization catalog ─────────────────────────────────────────

export const SUPPLIER_DOC_TYPES: Record<SupplierDocTypeCode, DocTypeDefinition> = {
  gst: {
    code: "gst",
    label: "GSTIN",
    shortLabel: "GST",
    helper: "Goods & Services Tax registration certificate.",
    icon: "building",
    mandatory: true,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
  pan: {
    code: "pan",
    label: "PAN",
    shortLabel: "PAN",
    helper: "Business PAN.",
    icon: "credit-card-alt",
    mandatory: true,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
  agreement: {
    code: "agreement",
    label: "Service Agreement",
    shortLabel: "Agreement",
    helper: "Master service agreement / contract document.",
    icon: "file-text",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  },
  cin: {
    code: "cin",
    label: "CIN",
    shortLabel: "CIN",
    helper: "Corporate Identification Number (MCA).",
    icon: "id-badge",
    mandatory: false,
    hasExpiry: false,
    blocksTripAllocation: false,
  },
};

// ── Catalog accessors ──────────────────────────────────────────────────────

/**
 * Return the full ordered list of doc-type definitions applicable to an
 * entity. Ordering controls how cards appear in `VehicleComplianceTab`,
 * `DriverComplianceTab`, etc. — keep highest-impact docs first.
 */
export function getDocTypesForEntity(
  entityType: EntityType,
): DocTypeDefinition[] {
  switch (entityType) {
    case "vehicle":
      return Object.values(VEHICLE_DOC_TYPES);
    case "driver":
      return Object.values(DRIVER_DOC_TYPES);
    case "supplier":
    case "organization":
      return Object.values(SUPPLIER_DOC_TYPES);
    default:
      return [];
  }
}

/** Resolve a single definition by entity type + code. Falls back to a stub. */
export function getDocTypeDefinition(
  entityType: EntityType,
  code: string,
): DocTypeDefinition {
  const all = getDocTypesForEntity(entityType);
  const hit = all.find((d) => d.code === code);
  if (hit) return hit;

  return {
    code: code as DocTypeCode,
    label: code
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" "),
    shortLabel: code.toUpperCase(),
    helper: "",
    icon: "file-text",
    mandatory: false,
    hasExpiry: true,
    blocksTripAllocation: false,
  };
}

/** Codes that are required for compliance — used by missing-docs detection. */
export function getRequiredDocCodes(entityType: EntityType): string[] {
  return getDocTypesForEntity(entityType)
    .filter((d) => d.mandatory)
    .map((d) => d.code);
}

/** Codes that block trip allocation (mirror of the SQL helper). */
export function getBlockingDocCodes(entityType: EntityType): string[] {
  return getDocTypesForEntity(entityType)
    .filter((d) => d.blocksTripAllocation)
    .map((d) => d.code);
}
