/**
 * Auth service — Supabase Auth only (mobile).
 * Single bounded context: auth (sign-in, sign-up, session, role).
 * One service per domain (microservices). Same DB as Q-unified-base.
 * Service-layer validation: single pass over inputs before Supabase calls.
 */
import { validateEmail } from "@/lib/emailValidation";
import { validatePhone } from "@/lib/phoneValidation";
import { supabase } from "@/lib/supabase";
import {
    VALIDATION,
    maxLength,
    validateFullName,
    validatePassword,
} from "@/lib/validation";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export type UserRole = "user" | "driver";

/** Business model: asset-based, aggregate (non-asset), or both (hybrid). Matches organizations.operating_model. */
export type OperatingModel = "ASSET_BASED" | "NON_ASSET" | "HYBRID";

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
}

export interface AuthProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  aggregated: boolean;
  asset: boolean;
  full_name?: string;
  avatar_url?: string;
  /** Custom avatar seed for presets (e.g. pilot-1). Stored in DB so it persists across devices. */
  avatar_seed?: string;
  phone?: string;
  company_name?: string;
  /** Profile quote/status (WhatsApp-style), shown under name on profile. */
  status_text?: string;
  memberships?: Record<string, unknown>;
}

function mapSupabaseUserToAuth(user: SupabaseUser): {
  user: AuthUser;
  profile: AuthProfile;
} {
  const uid = user.id;
  const email = user.email ?? "";
  const meta = user.user_metadata ?? {};
  const fullName = meta.full_name ?? meta.name ?? email.split("@")[0] ?? "User";
  const role = (meta.role === "driver" ? "driver" : "user") as UserRole;
  const isDriver = role === "driver";
  const opModel = meta.operating_model as string | undefined;
  const aggregated = isDriver
    ? false
    : opModel === "NON_ASSET"
      ? true
      : opModel === "ASSET_BASED"
        ? false
        : meta.aggregated !== false && meta.aggregated !== "false";
  const asset = isDriver
    ? false
    : opModel === "ASSET_BASED"
      ? true
      : opModel === "NON_ASSET"
        ? false
        : meta.asset !== false && meta.asset !== "false";

  return {
    user: { uid, email, displayName: fullName },
    profile: {
      uid,
      email,
      displayName: fullName,
      full_name: fullName,
      role,
      aggregated,
      asset,
      company_name: meta.company_name,
      phone: meta.phone,
      avatar_url: meta.avatar_url,
      avatar_seed: meta.avatar_seed,
      status_text: meta.status_text,
      memberships: {},
    },
  };
}

/** Map public.profiles row to AuthProfile. */
function mapDbProfileToAuth(profile: any): AuthProfile {
  return {
    uid: profile.id,
    email: profile.email || "",
    displayName: profile.full_name || profile.email?.split("@")[0] || "User",
    full_name: profile.full_name,
    role: (profile.role === "driver" ? "driver" : "user") as UserRole,
    aggregated: profile.aggregated !== false,
    asset: profile.asset !== false,
    company_name: profile.company_name,
    phone: profile.phone,
    avatar_url: profile.avatar_url,
    avatar_seed: profile.avatar_seed,
    status_text: profile.bio, // Profiles table uses 'bio' for status_text
    memberships: {},
  };
}

export interface SignInResult {
  error: Error | null;
}

export interface SignUpOptions {
  email: string;
  password: string;
  fullName?: string;
  /** Phone (e.g. for drivers). Stored in user_metadata; backends can use it to link invited drivers. */
  phone?: string;
  role?: UserRole;
  /** Business model for the new org: asset, aggregate, or both. Default HYBRID. */
  operatingModel?: OperatingModel;
}

export async function signUp({
  email,
  password,
  fullName,
  phone,
  role = "user",
  operatingModel: operatingModelOption,
}: SignUpOptions): Promise<SignInResult> {
  const emailErr = validateEmail(email ?? "");
  if (emailErr) return { error: new Error(emailErr) };
  const pwdErr = validatePassword(password);
  if (pwdErr) return { error: new Error(pwdErr) };
  if (fullName?.trim()) {
    const nameErr = validateFullName(false)(fullName);
    if (nameErr) return { error: new Error(nameErr) };
  }
  if (phone != null && String(phone).trim()) {
    const phoneErr = validatePhone(phone);
    if (phoneErr) return { error: new Error(phoneErr) };
  }
  try {
    const operatingModel: OperatingModel = operatingModelOption ?? "HYBRID";
    const metadata: Record<string, unknown> = {
      role,
      operating_model: operatingModel,
    };
    if (fullName?.trim()) metadata.full_name = fullName.trim();
    // Normalize phone (trim + collapse spaces) so it matches get_invitee_by_phone / get_driver_invitee_by_phone lookup.
    if (phone != null && phone !== "") {
      const normalized = phone.trim().replace(/\s+/g, "");
      if (normalized) metadata.phone = normalized;
    }
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata },
    });
    if (error) {
      return { error: new Error(error.message || "Sign up failed") };
    }
    if (!data.user) return { error: new Error("No user returned") };

    // Org, organization_members, and (if driver) drivers row are created by DB trigger on auth.users INSERT.
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Sign up failed") };
  }
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message === "Network request failed")
    return true;
  if (e instanceof Error && /network|fetch|failed/i.test(e.message))
    return true;
  return false;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const emailErr = validateEmail(email ?? "");
  if (emailErr) return { error: new Error(emailErr) };
  const pwdErr = validatePassword(password);
  if (pwdErr) return { error: new Error(pwdErr) };
  try {
    const { data, error } = await supabase().auth.signInWithPassword({
      email: (email ?? "").trim(),
      password,
    });
    if (error) {
      return { error: new Error(error.message || "Sign in failed") };
    }
    if (!data.user) return { error: new Error("No user returned") };
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Sign in failed") };
  }
}

export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase().auth.signOut();
    if (error) {
      console.warn("Sign out server error:", error);
      await supabase().auth.signOut({ scope: "local" });
    }
  } catch (e) {
    console.error("Sign out exception:", e);
    try {
      await supabase().auth.signOut({ scope: "local" });
    } catch (localErr) {
      // ignore
    }
  }
}

/** Detect auth errors that mean the session is invalid (e.g. refresh token not found, user deleted). */
export function isSessionExpiredError(e: unknown): boolean {
  const msg =
    typeof (e as { message?: string })?.message === "string"
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : "";
  const name = e instanceof Error ? e.name || "" : "";
  const msgLower = (msg || "").toLowerCase();
  const nameLower = (name || "").toLowerCase();
  return (
    nameLower === "authapierror" ||
    /invalid refresh token|refresh token not found|refresh token|session.*expired/i.test(
      msgLower,
    ) ||
    /user from sub claim.*does not exist|jwt.*does not exist/i.test(msgLower)
  );
}

function isInvalidSessionError(e: unknown): boolean {
  return isSessionExpiredError(e);
}

/** Clear local session when the server says the user/session is invalid (e.g. after a DB reset or refresh token not found). */
async function clearLocalSessionIfInvalid(error: unknown): Promise<void> {
  if (error == null || isInvalidSessionError(error)) {
    try {
      await supabase().auth.signOut({ scope: "local" });
      // Log once so initial "Invalid Refresh Token" from the library is clearly handled (no stale session).
      if (__DEV__) {
        console.info(
          "[Auth] Session invalid or expired; cleared local session. Please sign in again.",
        );
      }
    } catch {
      // Ignore sign-out errors so we don't mask the original session error
    }
  }
}

/** Normalize phone the same way as get_invitee_by_phone so lookups match. */
function normalizePhoneForProfile(phone: string): string {
  return phone.trim().replace(/\s+/g, "");
}

/** Normalize to 10 digits for check-user-by-phone (matches get_invitee_by_phone: digits only, 91 prefix → last 10). */
function normalizePhoneToTenDigits(phone: string): string | null {
  const trimmed = (phone ?? "").trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/\s+/g, "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length === 0 ? null : digits;
}

/** Mask email for display (e.g. ni***@gmail.com). */
function maskEmail(email: string): string {
  const t = (email ?? "").trim();
  if (t.length === 0) return "";
  const at = t.indexOf("@");
  if (at <= 0) return "***";
  const local = t.slice(0, at);
  const domain = t.slice(at);
  if (local.length <= 2) return local[0] + "***" + domain;
  return local.slice(0, 2) + "***" + domain;
}

export interface CheckExistingUserByPhoneResult {
  error: Error | null;
  exists: boolean;
  email?: string;
  masked_email?: string;
}

/**
 * Check if a phone is already registered (profiles table). Call before sign-up to redirect
 * existing users to sign-in with email prefilled. Uses fast RPC get_email_by_phone when available,
 * falls back to Edge Function check-user-by-phone.
 */
export async function checkExistingUserByPhone(
  phone: string,
): Promise<CheckExistingUserByPhoneResult> {
  const normalized = normalizePhoneToTenDigits(phone);
  if (!normalized || normalized.length !== 10) {
    return { error: null, exists: false };
  }
  try {
    const { data, error } = await supabase().rpc("get_email_by_phone", {
      p_phone: normalized,
    });
    if (!error) {
      if (data != null && typeof data === "string" && data.trim() !== "") {
        const email = data.trim();
        return {
          error: null,
          exists: true,
          email,
          masked_email: maskEmail(email),
        };
      }
      return { error: null, exists: false };
    }
  } catch {
    // RPC may not exist (old DB); fall back to Edge Function
  }
  try {
    const { data, error } = await supabase().functions.invoke(
      "check-user-by-phone",
      {
        body: { phone: normalized },
      },
    );
    if (error) {
      return {
        error: new Error(error.message ?? "Check failed"),
        exists: false,
      };
    }
    const payload = data as {
      exists?: boolean;
      email?: string;
      masked_email?: string;
    } | null;
    const exists = Boolean(payload?.exists);
    return {
      error: null,
      exists,
      email: payload?.email,
      masked_email: payload?.masked_email,
    };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
        exists: false,
      };
    }
    return {
      error: e instanceof Error ? e : new Error("Check failed"),
      exists: false,
    };
  }
}

/**
 * Read session from local storage only (no network). Use for cold start so we don't
 * depend on getUser() network latency; onAuthStateChange and token refresh handle validation.
 */
export async function getSession(): Promise<{
  user: AuthUser;
  profile: AuthProfile;
} | null> {
  try {
    const { data: { session }, error } = await supabase().auth.getSession();
    if (error || !session?.user) return null;
    return mapSupabaseUserToAuth(session.user);
  } catch {
    return null;
  }
}

/**
 * Refresh user and profile from server (network call).
 * Uses getUser() for latest metadata and queries public.profiles for DB-side updates.
 */
export async function refreshSession(): Promise<{
  user: AuthUser;
  profile: AuthProfile;
} | null> {
  try {
    const { data: { user }, error } = await supabase().auth.getUser();
    if (error || !user) return null;

    // Base profile from auth metadata (immediate source after avatar/profile updates).
    const base = mapSupabaseUserToAuth(user);

    // Fetch from public.profiles and merge with metadata so stale DB values don't hide fresh updates.
    const { data: profile } = await supabase()
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      const dbProfile = mapDbProfileToAuth(profile);
      const merged: AuthProfile = {
        ...base.profile,
        ...dbProfile,
        avatar_url: dbProfile.avatar_url ?? base.profile.avatar_url,
        avatar_seed: dbProfile.avatar_seed ?? base.profile.avatar_seed,
        status_text: dbProfile.status_text ?? base.profile.status_text,
        company_name: dbProfile.company_name ?? base.profile.company_name,
        phone: dbProfile.phone ?? base.profile.phone,
        full_name: dbProfile.full_name ?? base.profile.full_name,
        displayName: dbProfile.displayName || base.profile.displayName,
      };
      return {
        user: { uid: user.id, email: user.email ?? "", displayName: merged.displayName || "User" },
        profile: merged,
      };
    }

    return base;
  } catch {
    return null;
  }
}

/** Fetch a specific user's profile from the public.profiles table. */
export async function getProfile(uid: string): Promise<AuthProfile | null> {
  try {
    const { data, error } = await supabase()
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    if (error || !data) return null;
    return mapDbProfileToAuth(data);
  } catch {
    return null;
  }
}

export function onAuthStateChange(
  callback: (auth: { user: AuthUser; profile: AuthProfile } | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase().auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    callback(mapSupabaseUserToAuth(session.user));
  });
  return () => subscription.unsubscribe();
}

/** Updates to apply to the current user's profile (stored in auth user_metadata and public.profiles). */
export interface UpdateProfileOptions {
  full_name?: string;
  phone?: string;
  company_name?: string;
  /** Profile photo URL; pass null to clear. */
  avatar_url?: string | null;
  /** Custom avatar seed for presets (e.g. pilot-1). */
  avatar_seed?: string | null;
  /** Profile quote/status (WhatsApp-style). */
  status_text?: string | null;
}

/**
 * Update the current user's profile. Stored in both auth.users.raw_user_meta_data (Supabase Auth)
 * and the public.profiles table for relational integrity and searchability.
 * Connection invite-by-phone (get_invitee_by_phone) reads from auth.users. Triggers onAuthStateChange so AuthContext reflects the new profile.
 */
export async function updateProfile(
  updates: UpdateProfileOptions,
): Promise<{ error: Error | null }> {
  if (updates.full_name !== undefined) {
    const nameErr = validateFullName(true)(updates.full_name);
    if (nameErr) return { error: new Error(nameErr) };
  }
  if (updates.phone !== undefined && String(updates.phone).trim()) {
    const phoneErr = validatePhone(updates.phone);
    if (phoneErr) return { error: new Error(phoneErr) };
  }
  if (updates.company_name !== undefined) {
    const companyErr = maxLength(VALIDATION.COMPANY_NAME_MAX_LENGTH)(
      updates.company_name,
    );
    if (companyErr) return { error: new Error(companyErr) };
  }
  if (updates.status_text !== undefined && updates.status_text !== null) {
    const statusErr = maxLength(
      VALIDATION.STATUS_TEXT_MAX_LENGTH,
      "Status must be at most " +
        VALIDATION.STATUS_TEXT_MAX_LENGTH +
        " characters.",
    )(String(updates.status_text).trim());
    if (statusErr) return { error: new Error(statusErr) };
  }
  try {
    const {
      data: { user },
    } = await supabase().auth.getUser();
    if (!user) return { error: new Error("Not signed in") };

    // 1. Update auth.users metadata (for fast local access and sync across devices)
    const data: Record<string, unknown> = {};
    if (updates.full_name !== undefined)
      data.full_name = updates.full_name.trim();
    if (updates.phone !== undefined)
      data.phone = updates.phone.trim()
        ? normalizePhoneForProfile(updates.phone)
        : "";
    if (updates.company_name !== undefined)
      data.company_name = updates.company_name.trim();
    if (updates.avatar_url !== undefined)
      data.avatar_url = updates.avatar_url || null;
    if (updates.avatar_seed !== undefined)
      data.avatar_seed = updates.avatar_seed || null;
    if (updates.status_text !== undefined)
      data.status_text = updates.status_text?.trim() ?? "";

    const { error: authError } = await supabase().auth.updateUser({ data });
    if (authError) return { error: new Error(authError.message || "Auth update failed") };

    // 2. Sync to public.profiles table (for relational use, searching, and public profile view)
    const profileUpdates: Record<string, any> = {};
    if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name.trim();
    if (updates.phone !== undefined) profileUpdates.phone = updates.phone.trim() ? normalizePhoneForProfile(updates.phone) : "";
    if (updates.company_name !== undefined) profileUpdates.company_name = updates.company_name.trim();
    if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url;
    if (updates.avatar_seed !== undefined) profileUpdates.avatar_seed = updates.avatar_seed;
    // Note: Profiles table uses 'bio' for status/quote (from migrations)
    if (updates.status_text !== undefined) profileUpdates.bio = updates.status_text?.trim() ?? "";
    
    // We update public.profiles but don't block the UI if it fails (metadata is the primary driver for the current user)
    const { error: dbError } = await supabase()
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user.id);

    if (dbError) {
      console.warn("[authService] Failed to sync profile to public table:", dbError.message);
      // We still return success if metadata update worked, as it drives the app UI
    }

    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Update failed") };
  }
}
