/**
 * Discover service — search organizations outside your current network.
 */
import { isOrgKycVerified } from '@/features/network/utils/orgVerification.util';
import { supabase } from '@/lib/supabase';

type PartnerDisplayBatch = Record<
  string,
  {
    avatarUrl?: string | null;
    avatarSeed?: string | null;
    verificationStatus?: string | null;
    verification_status?: string | null;
    averageRating?: number | string | null;
    average_rating?: number | string | null;
    tripCount?: number | string | null;
    trip_count?: number | string | null;
    vehicleCount?: number | string | null;
    vehicle_count?: number | string | null;
    ratingCount?: number | string | null;
    rating_count?: number | string | null;
    orgCreatedAt?: string | null;
    org_created_at?: string | null;
    networkIndentCount?: number | string | null;
    network_indent_count?: number | string | null;
  }
>;

function parseRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve org logo / owner photo + KYC verification via SECURITY DEFINER batch RPC —
 * same path as the network profile modal (`getOrgProfileSnapshot`). Remote
 * `discover_organizations` may omit `avatar_url` or only return `avatar_seed`; logos
 * still live on `organizations.logo_url` and must be merged here. Verification is
 * also merged so home/grow cards can show Verified + Recommended tags.
 */
async function enrichDiscoverOrgsWithPartnerDisplay(
  orgs: DiscoverOrg[],
): Promise<DiscoverOrg[]> {
  if (orgs.length === 0) return orgs;

  const ids = orgs.map((o) => o.id);
  const { data, error } = await supabase().rpc(
    "get_connection_partner_display_batch",
    { p_linked_organization_ids: ids },
  );

  const map =
    !error && data && typeof data === "object"
      ? (data as PartnerDisplayBatch)
      : null;

  return orgs.map((org) => {
    const row = map?.[org.id];
    const batchUrl = (row?.avatarUrl ?? "").trim();
    const batchSeed = (row?.avatarSeed ?? "").trim();
    const verificationStatus =
      (
        row?.verificationStatus ??
        row?.verification_status ??
        org.verification_status ??
        ""
      )
        .toString()
        .trim() || null;
    const batchRating = parseRating(row?.averageRating ?? row?.average_rating);
    const orgRating = parseRating(org.average_rating ?? org.rating);
    const rating = batchRating ?? orgRating;
    const tripCount =
      parseCount(row?.tripCount ?? row?.trip_count) ?? parseCount(org.trip_count);
    const vehicleCount = parseCount(row?.vehicleCount ?? row?.vehicle_count);
    const ratingCount = parseCount(row?.ratingCount ?? row?.rating_count);
    const orgCreatedAt =
      parseTimestamp(row?.orgCreatedAt ?? row?.org_created_at) ??
      parseTimestamp(org.org_created_at);
    const networkIndentCount = parseCount(
      row?.networkIndentCount ?? row?.network_indent_count,
    );
    return {
      ...org,
      avatar_url: (org.avatar_url ?? "").trim() || batchUrl || null,
      avatar_seed: (org.avatar_seed ?? "").trim() || batchSeed || org.avatar_seed,
      verification_status: verificationStatus,
      is_kyc_verified: isOrgKycVerified({
        verification_status: verificationStatus,
        is_kyc_verified: org.is_kyc_verified,
      }),
      average_rating: rating,
      rating,
      trip_count: tripCount,
      vehicle_count: vehicleCount,
      rating_count: ratingCount,
      org_created_at: orgCreatedAt,
      network_indent_count: networkIndentCount,
    };
  });
}

export interface DiscoverOrg {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Org logo or owner profile photo — same resolution as chat / connection cards. */
  avatar_url?: string | null;
  /** Optional profile role from RPC, used to hide drivers in Discover. */
  profile_role?: string | null;
  /** Counterparty operating model (ASSET_BASED / NON_ASSET / HYBRID) for connect-role gating. */
  operating_model?: string | null;
  /** From organizations — RPC discover_organizations returns these for card location. */
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  business_location?: string | null;
  headquarters?: string | null;
  mutual_count?: number | null;
  mutual_connections_count?: number | null;
  rating?: number | null;
  average_rating?: number | null;
  trip_count?: number | null;
  rating_count?: number | null;
  vehicle_count?: number | null;
  network_indent_count?: number | null;
  org_created_at?: string | null;
  lane_overlap_count?: number | null;
  recommendation_score?: number | null;
  is_in_user_trip_city?: boolean | null;
  connection_status: 'none' | 'pending' | 'approved' | 'rejected' | string;
  /** Admin KYC status from discover RPC / partner display enrichment. */
  verification_status?: string | null;
  /** True when `verification_status === 'verified'`. */
  is_kyc_verified?: boolean;
}

export async function discoverOrganizations(
  orgId: string,
  search = '',
  limit = 20,
  offset = 0,
): Promise<{ error: Error | null; orgs: DiscoverOrg[] }> {
  const cappedLimit = Math.min(Math.max(limit, 1), 40);
  const { data, error } = await supabase().rpc('discover_organizations', {
    p_org_id: orgId,
    p_search: search,
    p_limit: cappedLimit,
    p_offset: Math.max(offset, 0),
  });

  if (error) return { error: new Error(error.message), orgs: [] };
  const raw = ((data ?? []) as DiscoverOrg[]).map((org) => {
    const verificationStatus =
      (org.verification_status ?? "").toString().trim() || null;
    return {
      ...org,
      verification_status: verificationStatus,
      is_kyc_verified: isOrgKycVerified({
        verification_status: verificationStatus,
        is_kyc_verified: org.is_kyc_verified,
      }),
    };
  });
  const orgs = await enrichDiscoverOrgsWithPartnerDisplay(raw);
  return { error: null, orgs };
}
