/**
 * Drivers service — Supabase only (mobile).
 * Single bounded context: drivers (driver records, invite, linked driver for current user).
 * One service per domain (microservices). Same DB as Q-unified-base.
 */
import { DEFAULT_PAGE_SIZE, type PageOpts } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";

export interface CreateDriverServiceData {
  driverSource?: string;
  name: string;
  phone: string | null;
  email?: string | null;
  emergencyContact?: string;
  emergencyName?: string;
  licenseNumber?: string;
  payableAmount?: number | null;
  commissionPercent?: number | null;
  commissionPerKm?: number | null;
}

export interface DriverRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email?: string | null;
  status: string;
  assigned_vehicle_id: string | null;
  created_at: string;
  updated_at: string;
  /** When set, driver has left this fleet; connection is in passbook history. */
  left_at?: string | null;
  /** When true, driver was created only for aggregate trip tracking (assign-by-phone). Exclude from Drivers tab. */
  tracking_only?: boolean;
  /** Fixed salary amount for the driver (nullable). */
  payable_amount?: number | null;
  /** Commission percentage for the driver (nullable). */
  commission_percent?: number | null;
  /** Per-kilometer rate for the driver (nullable). */
  commission_per_km?: number | null;
  /** Optional linked profile avatar fields when joined via RPC/view. */
  avatar_url?: string | null;
  avatar_seed?: string | null;
}

/**
 * Get all drivers for an organization (dispatcher/fleet owner view).
 * Excludes one-time/tracking-only drivers created only for aggregate trip tracking (assign-by-phone).
 * Filter is applied in code so the list works even when tracking_only column is not yet migrated.
 * Includes drivers who have left the fleet (left_at set) so the org can show them as "Disconnected" with reason/date.
 */
function excludeTrackingOnly(drivers: DriverRow[]): DriverRow[] {
  return drivers.filter((d) => d.tracking_only !== true);
}

/** Ensure display name is set (DB may use name or full_name). */
function normalizeDriverRow<T extends { name?: string | null; full_name?: string | null }>(row: T): T {
  const name = (row.name ?? (row as { full_name?: string | null }).full_name ?? "").trim() || "—";
  return { ...row, name };
}

export async function getDriversByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; drivers: DriverRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from("drivers")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), drivers: [] };
    const raw = excludeTrackingOnly((data ?? []) as DriverRow[]);
    const normalized = raw.map((d) => normalizeDriverRow(d));
    const hasMore = raw.length > limit;
    return {
      error: null,
      drivers: hasMore ? normalized.slice(0, limit) : normalized,
      hasMore,
    };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), drivers: [] };
  const raw = excludeTrackingOnly((data ?? []) as DriverRow[]);
  return { error: null, drivers: raw.map((d) => normalizeDriverRow(d)) };
}

export async function getDriverById(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const { data, error } = await supabase()
    .from("drivers")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", driverId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  const row = data as DriverRow | null;
  return { error: null, driver: row ? normalizeDriverRow(row) : null };
}

/** Normalize phone for comparison (strip spaces; same driver = same number). */
function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\s/g, "").trim();
}

/**
 * Add driver directly (no invitation). Inserts into public.drivers.
 * If a driver with the same phone already exists in this org and has left (left_at set),
 * reconnects that driver (clears left_at and updates name/email) instead of creating a duplicate.
 */
export async function createDriver(
  orgId: string,
  data: CreateDriverServiceData,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const phoneNorm = normalizePhone(data.phone);
  if (phoneNorm) {
    const { drivers } = await getDriversByOrganization(orgId);
    const existing = drivers.find(
      (d) => d.left_at && normalizePhone(d.phone) === phoneNorm
    );
    if (existing) {
      const { error, driver } = await updateDriver(orgId, existing.id, {
        name: (data.name || "").trim() || "—",
        phone: data.phone.trim() || null,
        email: (data.email || "").trim() || null,
        left_at: null,
      });
      if (!error && driver) return { error: null, driver };
      // If update failed (e.g. RLS), fall through to insert
    }
  }

  const payload = {
    organization_id: orgId,
    name: (data.name || "").trim() || "—",
    phone: data.phone.trim() || null,
    email: (data.email || "").trim() || null,
    status: "offline",
    payable_amount: data.payableAmount || null,
    commission_percent: data.commissionPercent || null,
    commission_per_km: data.commissionPerKm || null,
  };
  const { data: row, error } = await supabase()
    .from("drivers")
    .insert(payload)
    .select()
    .single();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: row as DriverRow };
}

export interface UpdateDriverData {
  name?: string;
  phone?: string | null;
  email?: string | null;
  status?: string;
  assigned_vehicle_id?: string | null;
  /** Set to null to reconnect a driver who had left (clear left_at). */
  left_at?: null;
  /** Fixed salary amount for the driver (nullable). */
  payable_amount?: number | null;
  /** Commission percentage for the driver (nullable). */
  commission_percent?: number | null;
  /** Per-kilometer rate for the driver (nullable). */
  commission_per_km?: number | null;
}

export async function updateDriver(
  orgId: string,
  driverId: string,
  patch: UpdateDriverData,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = (patch.name ?? '').trim() || '—';
  if (patch.phone !== undefined) updates.phone = (patch.phone ?? '').trim() || null;
  if (patch.email !== undefined) updates.email = (patch.email ?? '').trim() || null;
  if (patch.assigned_vehicle_id !== undefined) updates.assigned_vehicle_id = patch.assigned_vehicle_id || null;
  if (patch.left_at === null) updates.left_at = null;
  if (patch.payable_amount !== undefined) updates.payable_amount = patch.payable_amount;
  if (patch.commission_percent !== undefined) updates.commission_percent = patch.commission_percent;
  if (patch.commission_per_km !== undefined) updates.commission_per_km = patch.commission_per_km;
  if (Object.keys(updates).length === 0) return { error: null, driver: null };
  const { data, error } = await supabase()
    .from("drivers")
    .update(updates)
    .eq("organization_id", orgId)
    .eq("id", driverId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: data as DriverRow };
}

/**
 * Get the driver row linked to the current user (auth.uid).
 * Returns a single row; when the user has multiple (e.g. own org + fleet orgs), use getLinkedDriversForCurrentUser.
 */
export async function getLinkedDriverForCurrentUser(
  userId: string,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const { data, error } = await supabase()
    .from("drivers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: data as DriverRow | null };
}

/**
 * Get all driver rows linked to the current user (own org + any fleet orgs after accepting invites).
 * Used so we can load trips assigned to the user in any org.
 */
export async function getLinkedDriversForCurrentUser(
  userId: string,
): Promise<{ error: Error | null; drivers: DriverRow[] }> {
  const { data, error } = await supabase()
    .from("drivers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { error: new Error(error.message), drivers: [] };
  return { error: null, drivers: (data ?? []) as DriverRow[] };
}

/** Driver invite row (from get_driver_invites_received). Driver sees these in the app. */
export interface DriverInviteRow {
  id: string;
  from_organization_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
  from_org_name: string | null;
  from_org_logo_url?: string | null;
  from_org_avatar_url?: string | null;
  payable_amount: number | null;
  commission_percent: number | null;
  commission_per_km: number | null;
}

/** One existing driver match from platform (profile with role=driver, by phone). Contact and DL used to pre-fill form. */
export interface ExistingDriverMatch {
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /** Driving license number (from profiles.license_number when RPC returns it). */
  license_number: string | null;
  /** Optional avatar path/url from profile metadata (when RPC provides it). */
  avatar_url?: string | null;
  /** Optional avatar preset seed (when RPC provides it). */
  avatar_seed?: string | null;
  /** True when driver is currently connected to at least one fleet (left_at is null). */
  is_in_fleet?: boolean;
}

export interface DriverProfileAvatar {
  avatar_url: string | null;
  avatar_seed: string | null;
}

/**
 * Look up driver profile(s) by phone (for Add Driver: list and auto-fill).
 * Returns 0 or 1 match (DB returns at most one). Single RPC call, O(1) result set.
 */
export async function searchExistingDriversByPhone(phone: string): Promise<{
  error: Error | null;
  matches: ExistingDriverMatch[];
}> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized) return { error: null, matches: [] };
  const { data, error } = await supabase().rpc("get_driver_invitee_by_phone", {
    p_phone: normalized,
  });
  if (error) return { error: new Error(error.message), matches: [] };
  const rows = (data ?? []) as {
    user_id: string;
    full_name: string;
    phone: string;
    email?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    license_number?: string | null;
    avatar_url?: string | null;
    avatarUrl?: string | null;
    avatar_seed?: string | null;
    avatarSeed?: string | null;
    is_in_fleet?: boolean | null;
  }[];
  const matches: ExistingDriverMatch[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r?.user_id)
      matches.push({
        user_id: r.user_id,
        full_name: r.full_name ?? "",
        phone: r.phone ?? normalized,
        email: r.email ?? null,
        emergency_contact_name: r.emergency_contact_name ?? null,
        emergency_contact_phone: r.emergency_contact_phone ?? null,
        license_number: r.license_number ?? null,
        avatar_url: r.avatar_url ?? r.avatarUrl ?? null,
        avatar_seed: r.avatar_seed ?? r.avatarSeed ?? null,
        is_in_fleet: r.is_in_fleet === true,
      });
  }
  return { error: null, matches };
}

/** Fetch avatar metadata for a matched driver profile. */
export async function getDriverProfileAvatar(
  userId: string,
): Promise<{ error: Error | null; avatar: DriverProfileAvatar | null }> {
  const id = (userId || "").trim();
  if (!id) return { error: null, avatar: null };
  const { data, error } = await supabase()
    .from("profiles")
    .select("avatar_url, avatar_seed")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: new Error(error.message), avatar: null };
  const row = data as { avatar_url?: string | null; avatar_seed?: string | null } | null;
  return {
    error: null,
    avatar: row
      ? {
          avatar_url: row.avatar_url ?? null,
          avatar_seed: row.avatar_seed ?? null,
        }
      : null,
  };
}

/**
 * Look up a driver profile by phone (for sending in-app invite). Requires RPC get_driver_invitee_by_phone.
 */
export async function getDriverInviteeByPhone(phone: string): Promise<{
  error: Error | null;
  user_id: string | null;
  full_name: string | null;
  phone: string | null;
}> {
  const { error, matches } = await searchExistingDriversByPhone(phone);
  if (error) return { error, user_id: null, full_name: null, phone: null };
  const row = matches[0] ?? null;
  return {
    error: null,
    user_id: row?.user_id ?? null,
    full_name: row?.full_name ?? null,
    phone: row?.phone ?? null,
  };
}

export interface DriverInviteOffer {
  payableAmount?: number | null;
  commissionPercent?: number | null;
  commissionPerKm?: number | null;
}

/**
 * Read existing invite status for (org, driver user).
 * Returns null when no invite exists or RPC unavailable.
 */
export async function getDriverInviteSentStatus(
  orgId: string,
  toUserId: string,
): Promise<{ error: Error | null; status: string | null }> {
  try {
    const { data: statusRow, error } = await supabase().rpc(
      "get_driver_invite_sent_status",
      {
        p_org_id: orgId,
        p_to_user_id: toUserId,
      },
    );
    if (error) return { error: new Error(error.message), status: null };
    const row = Array.isArray(statusRow) ? statusRow[0] : statusRow;
    const s = (row as { status?: string } | undefined)?.status ?? null;
    return { error: null, status: typeof s === "string" ? s : null };
  } catch {
    return { error: null, status: null };
  }
}

/**
 * Create a driver_invites row so the driver sees the invite in the app (when they have an account).
 * RLS: org members can insert for their org.
 * Optional offer (payable_amount, commission_percent, commission_per_km) is stored when provided.
 */
async function createDriverInvite(
  fromOrganizationId: string,
  toUserId: string,
  fromOrgName?: string | null,
  inviteeName?: string | null,
  offer?: DriverInviteOffer | null,
): Promise<{ error: Error | null; created: boolean }> {
  const payload: Record<string, unknown> = {
    from_organization_id: fromOrganizationId,
    to_user_id: toUserId,
    status: "pending",
    from_org_name: fromOrgName ?? null,
    invitee_name: (inviteeName ?? "").trim() || null,
  };
  if (offer) {
    if (offer.payableAmount != null && offer.payableAmount > 0)
      payload.payable_amount = offer.payableAmount;
    if (offer.commissionPercent != null && offer.commissionPercent >= 0)
      payload.commission_percent = offer.commissionPercent;
    if (offer.commissionPerKm != null && offer.commissionPerKm >= 0)
      payload.commission_per_km = offer.commissionPerKm;
  }
  const { error } = await supabase().from("driver_invites").insert(payload);
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message ?? "";
    if (code === "23505") {
      // Unique constraint (from_org,to_user) already exists: treat as already invited.
      return { error: null, created: false };
    }
    const friendly =
      code === "42501" || /row-level security|permission|policy/i.test(msg)
        ? "You do not have permission to send invitations for this organization."
        : msg || "Failed to send invitation.";
    return { error: new Error(friendly), created: false };
  }
  return { error: null, created: true };
}

/**
 * Re-open a previously rejected/declined invite by updating it back to pending.
 * This enables explicit "Invite again" flows without creating duplicate rows.
 */
async function reopenDriverInvite(
  fromOrganizationId: string,
  toUserId: string,
  fromOrgName?: string | null,
  inviteeName?: string | null,
  offer?: DriverInviteOffer | null,
): Promise<{ error: Error | null; reopened: boolean }> {
  const { data, error } = await supabase().rpc("reopen_driver_invite", {
    p_org_id: fromOrganizationId,
    p_to_user_id: toUserId,
    p_from_org_name: fromOrgName ?? null,
    p_invitee_name: (inviteeName ?? "").trim() || null,
    p_payable_amount:
      offer?.payableAmount != null && offer.payableAmount > 0
        ? offer.payableAmount
        : null,
    p_commission_percent:
      offer?.commissionPercent != null && offer.commissionPercent >= 0
        ? offer.commissionPercent
        : null,
    p_commission_per_km:
      offer?.commissionPerKm != null && offer.commissionPerKm >= 0
        ? offer.commissionPerKm
        : null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/function.*reopen_driver_invite.*does not exist/i.test(msg)) {
      return {
        error: new Error(
          "Server update required for re-invite. Please ask admin to run latest database migrations."
        ),
        reopened: false,
      };
    }
    return { error: new Error(msg), reopened: false };
  }
  const obj = data as { ok?: boolean } | null;
  return { error: null, reopened: obj?.ok === true };
}

/**
 * Send driver invitation:
 * - If a driver account exists with this phone (get_driver_invitee_by_phone): create driver_invites
 *   so they see the invite in the app and can Accept (creates driver row in your org).
 * - Otherwise: create a driver row so you can assign trips; they'll link when they sign up with that phone.
 */
export async function inviteDriver(
  orgId: string,
  data: CreateDriverServiceData,
  orgName?: string | null,
  options?: {
    allowReinviteRejected?: boolean;
  },
): Promise<{
  error: Error | null;
  driver: DriverRow | null;
  inviteSent: boolean;
  /** True when a driver_invites row already exists for (from_org_id,to_user_id). */
  inviteAlreadyExists?: boolean;
  inviteStatus?: string;
}> {
  const phone = (data.phone || "").trim();
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm)
    return {
      error: new Error("Phone is required"),
      driver: null,
      inviteSent: false,
    };

  const invitee = await getDriverInviteeByPhone(phone);
  if (invitee.error) {
    const msg = invitee.error.message ?? "";
    const friendly = /function.*does not exist|relation.*does not exist/i.test(
      msg,
    )
      ? "Server setup is incomplete. Please try again later or contact support."
      : /permission|policy|row-level security/i.test(msg)
        ? "You do not have permission to look up drivers for this organization."
        : msg;
    return { error: new Error(friendly), driver: null, inviteSent: false };
  }

  let toUserId = invitee.user_id ?? null;

  if (!toUserId) {
    const phoneNorm = normalizePhone(phone);
    if (phoneNorm) {
      const { drivers } = await getDriversByOrganization(orgId);
      const disconnected = drivers.find(
        (d) => d.left_at && d.user_id && normalizePhone(d.phone) === phoneNorm,
      );
      if (disconnected?.user_id) toUserId = disconnected.user_id;
    }
  }

  if (toUserId) {
    // Validation: block duplicate driver_invites for this (org,driver user).
    // Use RPC because client-side RLS typically prevents selecting invite rows by from_organization_id.
    let existingStatus: string | null = null;
    try {
      const { data: statusRow } = await supabase().rpc("get_driver_invite_sent_status", {
        p_org_id: orgId,
        p_to_user_id: toUserId,
      });
      // RPC returns TABLE(status text); supabase-js usually returns an array.
      const row = Array.isArray(statusRow) ? statusRow[0] : statusRow;
      const s = (row as { status?: string } | undefined)?.status ?? null;
      existingStatus = typeof s === "string" ? s : null;
    } catch {
      // If RPC is not deployed yet, we rely on unique constraint handling below.
    }

    if (existingStatus) {
      const normalizedStatus = existingStatus.toLowerCase();
      if (
        options?.allowReinviteRejected === true &&
        (normalizedStatus === "rejected" || normalizedStatus === "declined")
      ) {
        const offer: DriverInviteOffer | null =
          data.payableAmount != null ||
          data.commissionPercent != null ||
          data.commissionPerKm != null
            ? {
                payableAmount: data.payableAmount ?? null,
                commissionPercent: data.commissionPercent ?? null,
                commissionPerKm: data.commissionPerKm ?? null,
              }
            : null;
        const { error: reopenError, reopened } = await reopenDriverInvite(
          orgId,
          toUserId,
          orgName,
          invitee.full_name ?? null,
          offer,
        );
        if (reopenError) {
          return { error: reopenError, driver: null, inviteSent: false };
        }
        if (reopened) {
          const verify = await getDriverInviteSentStatus(orgId, toUserId);
          if (verify.error) {
            return { error: verify.error, driver: null, inviteSent: false };
          }
          if ((verify.status ?? "").toLowerCase() !== "pending") {
            return {
              error: new Error(
                "Re-invite could not be activated. Please try again."
              ),
              driver: null,
              inviteSent: false,
            };
          }
          return { error: null, driver: null, inviteSent: true };
        }
        return {
          error: new Error(
            "Re-invite could not be activated. Please try again."
          ),
          driver: null,
          inviteSent: false,
        };
      }
      return {
        error: null,
        driver: null,
        inviteSent: false,
        inviteAlreadyExists: true,
        inviteStatus: existingStatus,
      };
    }

    const offer: DriverInviteOffer | null =
      data.payableAmount != null ||
      data.commissionPercent != null ||
      data.commissionPerKm != null
        ? {
            payableAmount: data.payableAmount ?? null,
            commissionPercent: data.commissionPercent ?? null,
            commissionPerKm: data.commissionPerKm ?? null,
          }
        : null;
    const { error: inviteError, created } = await createDriverInvite(
      orgId,
      toUserId,
      orgName,
      invitee.full_name ?? null,
      offer,
    );
    if (inviteError)
      return { error: inviteError, driver: null, inviteSent: false };
    if (created) {
      return { error: null, driver: null, inviteSent: true };
    }

    // Race/concurrency: unique constraint prevented insert, treat as already invited.
    return {
      error: null,
      driver: null,
      inviteSent: false,
      inviteAlreadyExists: true,
      inviteStatus: existingStatus ?? "pending",
    };
  }

  // No platform driver user found for this phone -> create/upsert a driver row for assignment.
  // Validation: avoid duplicating driver rows for the same (org,phone).
  const existingDriver = await supabase()
    .from("drivers")
    .select("*")
    .eq("organization_id", orgId)
    .eq("phone", phoneNorm)
    .limit(1)
    .maybeSingle();

  if (existingDriver.data) {
    const { data: updated, error: updateErr } = await supabase()
      .from("drivers")
      .update({
        name: (data.name || "").trim() || "—",
        phone: phoneNorm,
        email: (data.email || "").trim() || null,
        left_at: null,
        status: "offline",
        payable_amount: data.payableAmount || null,
        commission_percent: data.commissionPercent || null,
        commission_per_km: data.commissionPerKm || null,
      })
      .eq("organization_id", orgId)
      .eq("id", existingDriver.data.id)
      .select()
      .single();

    if (updateErr) return { error: new Error(updateErr.message), driver: null, inviteSent: false };
    return { error: null, driver: updated as DriverRow, inviteSent: false };
  }

  const payload = {
    organization_id: orgId,
    name: (data.name || "").trim() || "—",
    phone: phoneNorm,
    email: (data.email || "").trim() || null,
    status: "offline",
    payable_amount: data.payableAmount || null,
    commission_percent: data.commissionPercent || null,
    commission_per_km: data.commissionPerKm || null,
  };
  const { data: row, error } = await supabase()
    .from("drivers")
    .insert(payload)
    .select()
    .single();
  if (error)
    return { error: new Error(error.message), driver: null, inviteSent: false };
  return { error: null, driver: row as DriverRow, inviteSent: false };
}

export interface EnsureDriverRowByPhoneOptions {
  /** When true, mark driver as tracking-only (one-time for aggregate trip). Excluded from Drivers tab. */
  trackingOnly?: boolean;
  /**
   * When true (used for reassignment), always return an unlinked driver row (user_id = null)
   * so the trip must be claimed via OTP and does not show directly in any driver's trips list.
   */
  forceUnlinkedForOtp?: boolean;
}

/**
 * Ensure a driver row exists in the org for the given phone (assign-by-phone / ad-hoc trip).
 * Normalizes phone, looks up platform user by phone, then finds or creates driver row in this org.
 * O(1): one RPC + one select + at most one insert.
 */
export async function ensureDriverRowByPhone(
  orgId: string,
  phone: string,
  name?: string,
  options?: EnsureDriverRowByPhoneOptions,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized)
    return { error: new Error("Phone is required"), driver: null };

  const { error: lookupError, matches } =
    await searchExistingDriversByPhone(normalized);
  if (lookupError) return { error: lookupError, driver: null };
  const match = matches[0] ?? null;

  // Aggregate trips: prefer existing driver in org with this phone (driver already in app
  // sees the trip immediately). If none, create tracking_only row and they claim via OTP.
  if (options?.trackingOnly === true) {
    // Reassignment flow: always use an unlinked row so driver must claim via OTP.
    if (options.forceUnlinkedForOtp === true) {
      const wantLast10 = normalized.replace(/\D/g, "").slice(-10);
      const { data: existingUnlinked, error: findUnlinkedErr } = await supabase()
        .from("drivers")
        .select("*")
        .eq("organization_id", orgId)
        .eq("phone", normalized)
        .is("user_id", null)
        .limit(1)
        .maybeSingle();
      if (findUnlinkedErr)
        return { error: new Error(findUnlinkedErr.message), driver: null };
      if (existingUnlinked)
        return { error: null, driver: existingUnlinked as DriverRow };

      // Fallback: match unlinked row by last 10 digits so 9876543210 reuses +919876543210
      if (wantLast10.length >= 10) {
        const { data: orgUnlinked, error: listErr } = await supabase()
          .from("drivers")
          .select("id, phone")
          .eq("organization_id", orgId)
          .is("user_id", null)
          .not("phone", "is", null);
        if (listErr) return { error: new Error(listErr.message), driver: null };
        const found = (orgUnlinked as { id: string; phone: string | null }[]).find(
          (d) => d.phone && d.phone.replace(/\D/g, "").slice(-10) === wantLast10,
        );
        if (found) {
          const { data: full, error: fullErr } = await supabase()
            .from("drivers")
            .select("*")
            .eq("id", found.id)
            .single();
          if (fullErr) return { error: new Error(fullErr.message), driver: null };
          if (full) return { error: null, driver: full as DriverRow };
        }
      }

      // Existing row with this phone is linked (org allows only one row per phone): unlink it
      // so we can assign the trip to it and the driver must claim via OTP (avoids duplicate key).
      let { data: anyByPhone, error: anyErr } = await supabase()
        .from("drivers")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone", normalized)
        .limit(1)
        .maybeSingle();
      if (anyErr) return { error: new Error(anyErr.message), driver: null };
      if (!anyByPhone && wantLast10.length >= 10) {
        const { data: orgDrivers, error: listErr } = await supabase()
          .from("drivers")
          .select("id, phone")
          .eq("organization_id", orgId)
          .not("phone", "is", null);
        if (!listErr && orgDrivers?.length) {
          const found = (orgDrivers as { id: string; phone: string | null }[]).find(
            (d) => d.phone && d.phone.replace(/\D/g, "").slice(-10) === wantLast10,
          );
          if (found) anyByPhone = { id: found.id };
        }
      }
      if (anyByPhone) {
        const { error: unlinkErr } = await supabase()
          .from("drivers")
          .update({ user_id: null, updated_at: new Date().toISOString() })
          .eq("id", anyByPhone.id);
        if (unlinkErr) return { error: new Error(unlinkErr.message), driver: null };
        const { data: full, error: fullErr } = await supabase()
          .from("drivers")
          .select("*")
          .eq("id", anyByPhone.id)
          .single();
        if (fullErr) return { error: new Error(fullErr.message), driver: null };
        if (full) return { error: null, driver: full as DriverRow };
      }
    } else {
    let { data: existing, error: findError } = await supabase()
      .from("drivers")
      .select("*")
      .eq("organization_id", orgId)
      .eq("phone", normalized)
      .limit(1)
      .maybeSingle();
    if (findError) return { error: new Error(findError.message), driver: null };
    if (existing) return { error: null, driver: existing as DriverRow };
    // Fallback: match by last 10 digits so 9876543210 finds +919876543210
    const wantLast10 = normalized.replace(/\D/g, "").slice(-10);
    if (wantLast10.length >= 10) {
      const { data: orgDrivers, error: listErr } = await supabase()
        .from("drivers")
        .select("id, phone")
        .eq("organization_id", orgId)
        .not("phone", "is", null);
      if (!listErr && orgDrivers?.length) {
        const found = (orgDrivers as { id: string; phone: string | null }[]).find(
          (d) =>
            d.phone &&
            d.phone.replace(/\D/g, "").slice(-10) === wantLast10,
        );
        if (found) {
          const { data: full, error: fullErr } = await supabase()
            .from("drivers")
            .select("*")
            .eq("id", found.id)
            .single();
          if (!fullErr && full) return { error: null, driver: full as DriverRow };
        }
      }
    }
    }
  } else {
    const q = supabase().from("drivers").select("*").eq("organization_id", orgId);
    const orClause = match
      ? `phone.eq.${normalized},user_id.eq.${match.user_id}`
      : `phone.eq.${normalized}`;
    const { data: existing, error: findError } = await q
      .or(orClause)
      .limit(1)
      .maybeSingle();
    if (findError) return { error: new Error(findError.message), driver: null };
    if (existing) return { error: null, driver: existing as DriverRow };
  }

  const insertPayload: Record<string, unknown> = {
    organization_id: orgId,
    name: (name ?? match?.full_name ?? "Driver").trim() || "Driver",
    phone: normalized,
    user_id: options?.trackingOnly === true ? null : (match?.user_id ?? null),
    status: "offline",
  };
  if (options?.trackingOnly === true) insertPayload.tracking_only = true;

  const { data: row, error: insertError } = await supabase()
    .from("drivers")
    .insert(insertPayload)
    .select()
    .single();
  if (insertError)
    return { error: new Error(insertError.message), driver: null };
  return { error: null, driver: row as DriverRow };
}

/**
 * Link phone to an existing driver row (post-OTP claim). Driver can only update own row.
 * Uses RPC link_driver_phone so driver app can set phone for tracking. O(1).
 */
export async function linkPhoneToDriver(
  driverId: string,
  phone: string,
): Promise<{ error: Error | null }> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized) return { error: new Error("Phone is required") };
  const { data, error } = await supabase().rpc("link_driver_phone", {
    p_driver_id: driverId,
    p_phone: normalized,
  });
  if (error) return { error: new Error(error.message) };
  const obj = data as { ok?: boolean; error?: string } | null;
  if (obj && obj.ok === false && obj.error)
    return { error: new Error(obj.error) };
  return { error: null };
}

/**
 * List invites received by the current user (driver app). Requires RPC get_driver_invites_received.
 */
export async function getDriverInvitesReceived(): Promise<{
  error: Error | null;
  invites: DriverInviteRow[];
}> {
  const { data, error } = await supabase().rpc("get_driver_invites_received");
  if (error) return { error: new Error(error.message), invites: [] };
  return { error: null, invites: (data ?? []) as DriverInviteRow[] };
}

/**
 * Driver app: fetch the accepted pay terms for the current user in a given org.
 * Uses invites received RPC (RLS-safe) and returns the offer terms if accepted.
 */
export async function getAcceptedDriverOfferForOrganization(
  orgId: string,
): Promise<{
  error: Error | null;
  offer: DriverOffer | null;
}> {
  const normalizedOrgId = (orgId ?? "").trim();
  if (!normalizedOrgId) return { error: null, offer: null };

  const { error, invites } = await getDriverInvitesReceived();
  if (error) return { error, offer: null };

  const invite =
    invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() === normalizedOrgId &&
        String(i.status ?? "").toLowerCase() === "accepted",
    ) ?? null;

  if (!invite) return { error: null, offer: null };

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    error: null,
    offer: {
      payableAmount: num(
        (invite as { payable_amount?: unknown }).payable_amount,
      ),
      commissionPercent: num(
        (invite as { commission_percent?: unknown }).commission_percent,
      ),
      commissionPerKm: num(
        (invite as { commission_per_km?: unknown }).commission_per_km,
      ),
    },
  };
}

/** Minimal row for "driver invites sent" list (e.g. Network REQUESTS tab). */
export interface DriverInviteSentRow {
  id: string;
  from_org_name: string | null;
  driver_name: string | null;
  status: string;
  created_at: string;
  /** Invitee auth user; used to hide accepted invites when they already appear on the driver roster. */
  to_user_id?: string | null;
}

/** Match state when a manual driver's phone later signs up in app. */
export interface DriverSignupMatchStatus {
  id: string;
  state: "pending_owner_action" | "invite_sent" | "linked" | "declined" | "ignored" | "expired";
  matched_user_id: string;
  detected_at: string;
}

/** Offer terms from an accepted driver invite. Used to compute commission from trip base price. */
export interface DriverOffer {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
}

/**
 * Fetch display profile (name/avatar) for a driver's linked user profile.
 * Uses RPC get_driver_profile_display (SECURITY DEFINER) to read profile safely.
 */
export async function getDriverProfileDisplay(driverId: string): Promise<{
  error: Error | null;
  profile: { fullName: string; avatarUrl?: string; avatarSeed?: string } | null;
}> {
  const normalizedDriverId = (driverId ?? "").trim();
  if (!normalizedDriverId) return { error: null, profile: null };

  const { data, error } = await supabase().rpc("get_driver_profile_display", {
    p_driver_id: normalizedDriverId,
  });
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (data == null || typeof data !== "object") {
    return { error: null, profile: null };
  }

  const raw = data as {
    fullName?: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };

  return {
    error: null,
    profile: {
      fullName: (raw.fullName ?? "").trim(),
      avatarUrl: (raw.avatarUrl ?? "").trim(),
      avatarSeed: (raw.avatarSeed ?? "").trim(),
    },
  };
}

/**
 * Read latest invite terms for a specific org + user from driver_invites (any status).
 * Used by owner profile re-invite flow to reuse previously entered compensation values.
 */
export async function getLatestDriverInviteTermsByUser(
  orgId: string,
  userId: string,
): Promise<{ error: Error | null; offer: DriverOffer | null; status: string | null }> {
  const { data, error } = await supabase()
    .from("driver_invites")
    .select("status, payable_amount, commission_percent, commission_per_km, created_at")
    .eq("from_organization_id", orgId)
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), offer: null, status: null };
  if (!data) return { error: null, offer: null, status: null };

  const row = data as {
    status?: string | null;
    payable_amount?: number | string | null;
    commission_percent?: number | string | null;
    commission_per_km?: number | string | null;
  };
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    error: null,
    status: row.status ?? null,
    offer: {
      payableAmount: num(row.payable_amount),
      commissionPercent: num(row.commission_percent),
      commissionPerKm: num(row.commission_per_km),
    },
  };
}

/**
 * Get driver offers (salary + commission terms) for all drivers in the org from accepted invites.
 * Used for: commission = trip client_price * (commission_percent/100) or distance * commission_per_km; salary is predefined.
 */
export async function getDriverOffersByOrganization(orgId: string): Promise<{
  error: Error | null;
  offersByDriverId: Record<string, DriverOffer>;
}> {
  const { error: driversErr, drivers } = await getDriversByOrganization(orgId);
  if (driversErr || !drivers.length)
    return { error: driversErr ?? null, offersByDriverId: {} };
  const userIds = drivers
    .map((d) => d.user_id)
    .filter((u): u is string => u != null && u !== "");
  if (userIds.length === 0) return { error: null, offersByDriverId: {} };
  const { data: invites, error } = await supabase()
    .from("driver_invites")
    .select("to_user_id, payable_amount, commission_percent, commission_per_km")
    .eq("from_organization_id", orgId)
    .eq("status", "accepted")
    .in("to_user_id", userIds);
  if (error) return { error: new Error(error.message), offersByDriverId: {} };
  const userToDriverId = new Map<string, string>();
  for (const d of drivers) {
    if (d.user_id) userToDriverId.set(d.user_id, d.id);
  }
  /** Parse numeric from DB (Supabase may return numeric as string). */
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const offersByDriverId: Record<string, DriverOffer> = {};
  for (const row of invites ?? []) {
    const driverId = userToDriverId.get(
      (row as { to_user_id: string }).to_user_id,
    );
    if (!driverId) continue;
    const r = row as {
      payable_amount?: unknown;
      commission_percent?: unknown;
      commission_per_km?: unknown;
    };
    const payable = num(r.payable_amount);
    const pct = num(r.commission_percent);
    const perKm = num(r.commission_per_km);
    offersByDriverId[driverId] = {
      payableAmount: payable != null ? payable : null,
      commissionPercent: pct != null ? pct : null,
      commissionPerKm: perKm != null ? perKm : null,
    };
  }
  return { error: null, offersByDriverId };
}

/**
 * List driver invites sent by the given org (pending only). Used by Network Architecture REQUESTS tab.
 * RLS: from_org members can select. Single indexed query, O(n) in result size.
 */
export async function getDriverInvitesSent(orgId: string): Promise<{
  error: Error | null;
  invites: DriverInviteSentRow[];
}> {
  // Prefer an RPC because client-side RLS typically blocks reading invitee details (auth.users/profiles).
  const { data, error } = await supabase().rpc("get_driver_invites_sent", { p_org_id: orgId });
  if (error) {
    // Fallback: show invites even when the RPC isn't available (e.g. not deployed yet / RLS differences).
    const { data: fallback, error: fallbackErr } = await supabase()
      .from("driver_invites")
      .select("id, from_org_name, invitee_name, status, created_at, to_user_id")
      .eq("from_organization_id", orgId)
      .order("created_at", { ascending: false });
    if (fallbackErr) return { error: new Error(fallbackErr.message), invites: [] };
    return {
      error: null,
      invites: ((fallback ?? []) as Array<{
        id: string;
        from_org_name: string | null;
        invitee_name: string | null;
        status: string;
        created_at: string;
        to_user_id?: string | null;
      }>).map((r) => ({
        ...r,
        driver_name: r.invitee_name ?? null,
        to_user_id: r.to_user_id ?? null,
      })),
    };
  }
  return { error: null, invites: (data ?? []) as DriverInviteSentRow[] };
}

/**
 * Read signup-match state for a driver row in owner/dispatcher app.
 * Returns pending/invite-sent state when a manually-added driver later signs up with same phone.
 */
export async function getDriverSignupMatchStatus(
  driverId: string,
): Promise<{ error: Error | null; match: DriverSignupMatchStatus | null }> {
  const { data, error } = await supabase().rpc("get_driver_signup_match_status", {
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), match: null };
  const row = (Array.isArray(data) ? data[0] : data) as DriverSignupMatchStatus | undefined;
  return { error: null, match: row ?? null };
}

/**
 * Owner action: send invitation for a detected signup-match (manual driver -> real app account).
 * Uses DB RPC so it stays idempotent and updates signup-match state consistently.
 */
export async function sendDriverSignupMatchInvite(
  driverId: string,
  offer?: {
    payableAmount?: number | null;
    commissionPercent?: number | null;
    commissionPerKm?: number | null;
  },
): Promise<{
  error: Error | null;
  ok: boolean;
  already_exists: boolean;
  status: string | null;
}> {
  const payloadWithOffer = {
    p_driver_id: driverId,
    p_payable_amount: offer?.payableAmount ?? null,
    p_commission_percent: offer?.commissionPercent ?? null,
    p_commission_per_km: offer?.commissionPerKm ?? null,
  };
  let { data, error } = await supabase().rpc(
    "send_driver_signup_match_invite",
    payloadWithOffer,
  );
  if (error) {
    const msg = error.message ?? "";
    // Backward-compat: older backend has send_driver_signup_match_invite(uuid) only.
    if (/Could not find the function public\.send_driver_signup_match_invite/i.test(msg)) {
      const legacy = await supabase().rpc("send_driver_signup_match_invite", {
        p_driver_id: driverId,
      });
      data = legacy.data;
      error = legacy.error;
    }
  }
  if (error) return { error: new Error(error.message), ok: false, already_exists: false, status: null };
  const obj = data as { ok?: boolean; already_exists?: boolean; status?: string } | null;
  if (obj?.ok === false) {
    return {
      error: new Error((obj as { error?: string }).error ?? "Failed to send invitation"),
      ok: false,
      already_exists: Boolean(obj?.already_exists),
      status: obj?.status ?? null,
    };
  }
  return {
    error: null,
    ok: obj?.ok ?? true,
    already_exists: Boolean(obj?.already_exists),
    status: obj?.status ?? null,
  };
}

/**
 * Owner dismisses a pending signup match (manual driver ↔ app account detected).
 */
export async function dismissDriverSignupMatch(
  driverId: string,
): Promise<{ error: Error | null; dismissed: number }> {
  const { data, error } = await supabase().rpc("dismiss_driver_signup_match", {
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), dismissed: 0 };
  const obj = data as { ok?: boolean; dismissed?: number } | null;
  const n = typeof obj?.dismissed === "number" ? obj.dismissed : 0;
  return { error: null, dismissed: n };
}

/**
 * Owner action: reset a sent/declined signup-match invitation back to pending_owner_action.
 * Preferred RPC is reset_driver_signup_invite; falls back to dismiss behavior for older backends.
 */
export async function resetDriverSignupInvite(
  driverId: string,
): Promise<{ error: Error | null; reset: boolean }> {
  const { data, error } = await supabase().rpc("reset_driver_signup_invite", {
    p_driver_id: driverId,
  });
  if (!error) {
    const obj = data as { ok?: boolean; reset?: boolean } | null;
    return {
      error: null,
      reset: Boolean(obj?.ok ?? obj?.reset ?? true),
    };
  }
  // Backward-compat fallback while backend RPC is rolling out.
  const fallback = await dismissDriverSignupMatch(driverId);
  if (fallback.error) return { error: fallback.error, reset: false };
  if (fallback.dismissed > 0) return { error: null, reset: true };
  return {
    error: new Error("Unable to reset invitation right now. Please try again shortly."),
    reset: false,
  };
}

/**
 * Accept a driver invite: creates driver row in that org and links to current user. Requires RPC accept_driver_invite.
 * Backend should prefer reconnecting: if a driver with the same phone already exists in that org with left_at set,
 * update that row (clear left_at, set user_id) and return it instead of inserting a duplicate.
 */
export async function acceptDriverInvite(inviteId: string): Promise<{
  error: Error | null;
  driver_id: string | null;
  organization_id: string | null;
}> {
  const { data, error } = await supabase().rpc("accept_driver_invite", {
    p_invite_id: inviteId,
  });
  if (error)
    return {
      error: new Error(error.message),
      driver_id: null,
      organization_id: null,
    };
  const obj = data as { driver_id?: string; organization_id?: string } | null;
  return {
    error: null,
    driver_id: obj?.driver_id ?? null,
    organization_id: obj?.organization_id ?? null,
  };
}

/**
 * Reject a driver invite. Requires RPC reject_driver_invite.
 */
export async function rejectDriverInvite(
  inviteId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("reject_driver_invite", {
    p_invite_id: inviteId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Cancel a driver invite that you have sent.
 * Deletes the pending invite row.
 */
export async function cancelDriverInvite(inviteId: string): Promise<{
  error: Error | null;
  deleted: boolean;
}> {
  const { data: deleteData, error } = await supabase()
    .from("driver_invites")
    .delete()
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: new Error(error.message), deleted: false };
  const deleted = Array.isArray(deleteData) && deleteData.length > 0;
  return { error: null, deleted };
}

/**
 * Leave a fleet (set driver's left_at for that org). Requires RPC leave_fleet in Q-unified-base.
 * Driver must be linked to current user; after success the connection appears in passbook history.
 */
export async function leaveFleet(
  organizationId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("leave_fleet", {
    p_organization_id: organizationId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Link an existing driver row to an app user by phone/email (dispatcher action).
 * Requires RPC attach_driver_by_contact in the DB (Q-unified-base). The driver must
 * have signed up first (profile with role=driver and matching phone/email).
 */
export async function attachDriverByContact(
  driverId: string,
  options: { phone?: string | null; email?: string | null },
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const phone = options.phone?.trim() || null;
  const email = options.email?.trim() || null;
  const { data, error } = await supabase()
    .rpc("attach_driver_by_contact", {
      p_driver_id: driverId,
      p_phone: phone || undefined,
      p_email: email || undefined,
    })
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: data as DriverRow | null };
}

/** driver_ledger.type values (CHECK constraint). Add new values via DB migration in Q-unified-base if needed. */
export const DRIVER_LEDGER_TYPES = [
  "salary",
  "settlement",
  "advance",
  "reimbursement",
  "bonus",
  "adjustment",
  "deduction",
] as const;
export type DriverLedgerType = (typeof DRIVER_LEDGER_TYPES)[number];

export interface DriverLedgerRow {
  id: string;
  organization_id: string;
  driver_id: string;
  trip_id: string | null;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Create a driver_ledger entry when the supplier pays a driver.
 * RLS: org members can insert for their org. Driver can read own ledger.
 */
export async function createDriverLedgerEntry(
  orgId: string,
  driverId: string,
  amount: number,
  type: DriverLedgerType,
  options?: {
    tripId?: string | null;
    createdBy?: string | null;
    description?: string | null;
  },
): Promise<{ error: Error | null; row: DriverLedgerRow | null }> {
  if (amount <= 0)
    return { error: new Error("Amount must be positive"), row: null };
  if (!DRIVER_LEDGER_TYPES.includes(type))
    return { error: new Error("Invalid driver ledger type"), row: null };
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    driver_id: driverId,
    amount,
    type,
    trip_id: options?.tripId ?? null,
    created_by: options?.createdBy ?? null,
    description: options?.description ?? null,
  };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .insert(payload)
    .select()
    .single();
  if (error) return { error: new Error(error.message), row: null };
  return { error: null, row: data as DriverLedgerRow };
}

/**
 * Get driver_ledger entries for a driver (e.g. driver app Wallet). RLS: driver can read own ledger.
 */
export async function getDriverLedgerByDriver(
  driverId: string,
): Promise<{ error: Error | null; entries: DriverLedgerRow[] }> {
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as DriverLedgerRow[] };
}

/**
 * Get driver_ledger entries for multiple driver ids (e.g. current user has multiple org links). Single query.
 */
export async function getDriverLedgerByDriverIds(
  driverIds: string[],
): Promise<{ error: Error | null; entries: DriverLedgerRow[] }> {
  if (driverIds.length === 0) return { error: null, entries: [] };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select("*")
    .in("driver_id", driverIds)
    .order("created_at", { ascending: false });
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as DriverLedgerRow[] };
}
