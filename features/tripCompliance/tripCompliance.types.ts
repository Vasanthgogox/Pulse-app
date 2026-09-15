import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * The 7 named stages from the product spec, plus "all" for the filter chip.
 * Derived, never persisted as a single column — see deriveComplianceStage().
 */
export type ComplianceStage =
  | "pending_for_docs"
  | "compliance_pending"
  | "compliance_verified"
  | "advance_payment_processed"
  | "hard_copy_pod_received"
  | "balance_pending"
  | "payment_settled";

export const COMPLIANCE_STAGES: readonly ComplianceStage[] = [
  "pending_for_docs",
  "compliance_pending",
  "compliance_verified",
  "advance_payment_processed",
  "hard_copy_pod_received",
  "balance_pending",
  "payment_settled",
];

export const COMPLIANCE_STAGE_LABEL: Record<ComplianceStage, string> = {
  pending_for_docs: "Pending for Docs",
  compliance_pending: "Compliance Pending",
  compliance_verified: "Compliance Verified",
  advance_payment_processed: "Advance Payment Processed",
  hard_copy_pod_received: "Hard Copy POD Received",
  balance_pending: "Balance Pending",
  payment_settled: "Payment Settled",
};

export type ComplianceDocumentStatus = "pending" | "verified" | "rejected";

export type ComplianceDocumentRow = {
  id: string;
  trip_id: string;
  document_type: string | null;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  status: ComplianceDocumentStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
};

/** Canonical Finance payment state, read (not duplicated) from `transactions`. */
export type CompliancePaymentSummary = {
  amount: number;
  paymentMode: string | null;
  utr: string | null;
  paidAt: string;
  actorId: string | null;
  transactionId: string;
};

export type ComplianceTripSummary = {
  trip: TripRow;
  stage: ComplianceStage;
  documents: ComplianceDocumentRow[];
  documentCounts: { total: number; verified: number; rejected: number; pending: number };
  complianceVerifiedAt: string | null;
  complianceVerifiedBy: string | null;
  advance: CompliancePaymentSummary | null;
  balance: CompliancePaymentSummary | null;
  hardCopyPod: {
    received: boolean;
    receivedAt: string | null;
    courier: string | null;
    awbNumber: string | null;
    receivedBy: string | null;
  };
};

/** Document types Compliance requires verified before a trip can be marked Compliance Verified. */
export const REQUIRED_COMPLIANCE_DOCUMENT_TYPES: readonly string[] = [
  "lr",
  "invoice",
  "eway_bill",
  "insurance",
  "rc",
];
