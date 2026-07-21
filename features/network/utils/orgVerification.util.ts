/**
 * Shared KYC verification helpers for network public profile + workspace surfaces.
 */
export type OrgVerificationState = "verified" | "pending" | "not_verified";

export type OrgVerificationInput = {
  is_kyc_verified?: boolean | null;
  verification_status?: string | null;
  verificationStatus?: string | null;
} | null | undefined;

export function resolveOrgVerificationState(
  input: OrgVerificationInput,
): OrgVerificationState {
  if (!input) return "not_verified";
  if (input.is_kyc_verified === true) return "verified";
  const status = String(
    input.verification_status ?? input.verificationStatus ?? "",
  )
    .trim()
    .toLowerCase();
  if (status === "verified") return "verified";
  if (status === "pending") return "pending";
  return "not_verified";
}

export function isOrgKycVerified(input: OrgVerificationInput): boolean {
  return resolveOrgVerificationState(input) === "verified";
}

export function orgVerificationLabel(state: OrgVerificationState): string {
  if (state === "verified") return "Verified";
  if (state === "pending") return "Pending";
  return "Not verified";
}

export function orgVerificationTagLabel(state: OrgVerificationState): string {
  if (state === "verified") return "VERIFIED";
  if (state === "pending") return "PENDING";
  return "NOT VERIFIED";
}

/** Verified orgs are also recommended on discover / public surfaces. */
export function shouldShowRecommended(state: OrgVerificationState): boolean {
  return state === "verified";
}
