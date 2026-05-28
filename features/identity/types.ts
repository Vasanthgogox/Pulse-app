export type IdentityTrustLevel = "low" | "medium" | "high";
export type IdentityOnboardingState = "unknown" | "incomplete" | "completed";
export type IdentityVerificationState =
  | "none"
  | "partial"
  | "driver_verified"
  | "gps_verified"
  | "business_verified";

export interface ResolvedIdentity {
  userId: string;
  displayName: string;
  avatar: string | null;
  avatarSeed: string | null;
  operationalRole: string;
  trustLevel: IdentityTrustLevel;
  verificationState: IdentityVerificationState;
  onboardingState: IdentityOnboardingState;
}
