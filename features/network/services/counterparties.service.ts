import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phoneNormalization";

export type UnlinkedCounterparty = {
  counterparty_name: string;
  counterparty_type: "supplier" | "client";
  trip_count: number;
  last_trip_date: string;
};

export type OrgMatch = {
  org_id: string;
  org_name: string;
  similarity_score: number;
  org_city: string | null;
};

export async function getUnlinkedCounterparties(orgId: string): Promise<{
  error: Error | null;
  counterparties: UnlinkedCounterparty[];
}> {
  const { data, error } = await supabase().rpc("get_unlinked_counterparties", {
    p_org_id: orgId,
  });
  if (error) return { error: new Error(error.message), counterparties: [] };
  return {
    error: null,
    counterparties: (data ?? []) as UnlinkedCounterparty[],
  };
}

/**
 * Finds platform orgs whose name fuzzy-matches the given counterparty name.
 * Optional phone boosts ranking when provided — phone is a signal, not identity proof.
 *
 * Phase 4 note: if 2+ results have similarity_score > 0.85, they may represent
 * duplicate orgs on the platform sharing the same name or phone. A future migration
 * should add a partial unique index on organizations.phone to prevent this.
 * TODO: add organizations.phone dedup constraint (migration required).
 */
export async function findOrgMatchesForCounterparty(
  name: string,
  options: { minSimilarity?: number; phone?: string | null } = {},
): Promise<{ error: Error | null; matches: OrgMatch[] }> {
  const { minSimilarity = 0.55, phone } = options;

  // Normalize phone before sending — surface-layer canonicalization so the
  // SQL function receives a clean value (it normalizes again internally, but
  // this avoids sending obviously malformed strings).
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase().rpc(
    "find_org_matches_for_counterparty",
    {
      p_name: name,
      p_min_similarity: minSimilarity,
      p_phone: normalizedPhone ?? null,
    },
  );

  if (error) return { error: new Error(error.message), matches: [] };

  const matches = (data ?? []) as OrgMatch[];

  // DEV-only: warn when multiple strong matches are returned.
  // This typically indicates duplicate orgs on the platform (same or similar
  // name, possibly same phone). Production behaviour is correct — both are
  // surfaced and the dispatcher chooses. The warning exists to surface
  // data-quality issues during testing.
  //
  // When a phone bonus was active (normalizedPhone != null) and 2+ results
  // share a near-identical score, they likely share the same phone number.
  // Track via TODO above; do NOT add auto-dedup logic here.
  if (__DEV__ && matches.length >= 2) {
    const [first, second] = matches;
    if (
      first.similarity_score > 0.85 &&
      second.similarity_score > 0.85 &&
      Math.abs(first.similarity_score - second.similarity_score) < 0.05
    ) {
      if (normalizedPhone) {
        console.warn(
          "[counterparty-match] duplicate normalized phone detected — two orgs scored similarly with phone bonus active",
          normalizedPhone,
          matches.slice(0, 2).map((m) => m.org_name),
        );
      } else {
        console.warn(
          "[counterparty-match] two orgs with near-identical scores — possible duplicate platform orgs",
          matches.slice(0, 2).map((m) => m.org_name),
        );
      }
    }
  }

  return { error: null, matches };
}

export async function linkCounterpartyToOrg(params: {
  orgId: string;
  counterpartyName: string;
  counterpartyType: "supplier" | "client";
  matchedOrgId: string | null;
  dismissed: boolean;
}): Promise<{ error: Error | null }> {
  const { data: sessionData } = await supabase().auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return { error: new Error("Not authenticated") };

  const { error } = await supabase()
    .from("counterparty_resolutions")
    .upsert(
      {
        org_id: params.orgId,
        counterparty_name: params.counterpartyName,
        counterparty_type: params.counterpartyType,
        matched_org_id: params.matchedOrgId,
        dismissed: params.dismissed,
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
      },
      { onConflict: "org_id,counterparty_name,counterparty_type" },
    );
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
