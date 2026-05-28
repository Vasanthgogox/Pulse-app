import type { ReimbursementState } from "../types";

export type EnterpriseReimbursementState =
  | "none"
  | "pending_review"
  | "approved"
  | "reimbursed"
  | "rejected"
  | "disputed";

export function toEnterpriseReimbursementState(input: {
  reimbursementState: ReimbursementState | null | undefined;
  approvalState: string | null | undefined;
  paymentOwner: string | null | undefined;
  reimbursementNotes?: string | null;
}): EnterpriseReimbursementState {
  const owner = String(input.paymentOwner ?? "").toLowerCase();
  if (owner !== "driver") return "none";
  const notes = String(input.reimbursementNotes ?? "").toLowerCase();
  if (notes.includes("#disputed") || notes.includes("dispute")) return "disputed";
  const reimbursement = String(input.reimbursementState ?? "").toLowerCase();
  if (reimbursement === "reimbursed") return "reimbursed";
  if (reimbursement === "rejected") return "rejected";
  if (reimbursement === "approved") return "approved";
  if (reimbursement === "reported" || reimbursement === "reimbursement_pending") {
    return "pending_review";
  }
  const approval = String(input.approvalState ?? "").toLowerCase();
  if (approval === "approved") return "approved";
  if (approval === "rejected") return "rejected";
  return "pending_review";
}

export function canTransitionEnterpriseReimbursementState(
  from: EnterpriseReimbursementState,
  to: EnterpriseReimbursementState,
): boolean {
  if (from === to) return true;
  const transitions: Record<
    EnterpriseReimbursementState,
    EnterpriseReimbursementState[]
  > = {
    none: ["pending_review", "approved"],
    pending_review: ["approved", "rejected", "disputed"],
    approved: ["reimbursed", "rejected", "disputed"],
    reimbursed: [],
    rejected: [],
    disputed: ["pending_review", "approved", "rejected"],
  };
  return transitions[from].includes(to);
}

export function toPersistedReimbursementState(
  enterpriseState: EnterpriseReimbursementState,
): ReimbursementState {
  if (enterpriseState === "approved") return "approved";
  if (enterpriseState === "reimbursed") return "reimbursed";
  if (enterpriseState === "rejected") return "rejected";
  if (enterpriseState === "disputed") return "reported";
  if (enterpriseState === "none") return "approved";
  return "reimbursement_pending";
}
