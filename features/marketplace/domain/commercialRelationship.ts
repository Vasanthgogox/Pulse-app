/**
 * Marketplace Platform M1 — relationship stage for viewer ↔ shipper.
 * Pure read model. Writes belong to M4 / ADR-012 — this only projects stage.
 */

export type CommercialRelationshipStage =
  | "none"
  | "consent"
  | "execution_partner"
  | "verified_partner";

export type CommercialRelationship = {
  stage: CommercialRelationshipStage;
  /** Reserved for M4 Relationship Strength */
  strength: number | null;
};

export type CommercialRelationshipInput = {
  /** Explicit stage when known (ADR-012 graph). */
  stage?: CommercialRelationshipStage | null;
  /** Soft signal: orgs already connected via organic network */
  orgsConnected?: boolean;
};

/**
 * Project relationship context onto the commercial object.
 * Does not invent Execution Partner / Verified — those require M4 writes.
 */
export function resolveCommercialRelationship(
  input: CommercialRelationshipInput,
): CommercialRelationship {
  if (input.stage) {
    return { stage: input.stage, strength: null };
  }
  // Connected via Grow/invite is still "none" for commerce-earned lifecycle
  // until Award creates Execution Partner (ADR-012). Keep signal out of stage.
  void input.orgsConnected;
  return { stage: "none", strength: null };
}
