/**
 * Auth service — Supabase Auth only (mobile).
 * Single bounded context: auth (sign-in, sign-up, session, role).
 * One service per domain (microservices). Same DB as Q-unified-base.
 * Service-layer validation: single pass over inputs before Supabase calls.
 */
import { validateEmail } from "@/lib/emailValidation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  extractIndianMobileTenDigits,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from "@/lib/phoneValidation";
import { supabase } from "@/lib/supabase";
import {
    VALIDATION,
    containsNullByte,
    maxLength,
    validateFullName,
    validatePassword,
    validatePasswordForSignIn,
} from "@/lib/validation";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Platform } from "react-native";

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

const AUTH_EVENT_DEBOUNCE_MS = 800;
const REFRESH_DEBOUNCE_MS = 1000;
let refreshSessionInFlight: Promise<{ user: AuthUser; profile: AuthProfile } | null> | null = null;
let lastRefreshSessionAt = 0;
let lastRefreshSessionResult: { user: AuthUser; profile: AuthProfile } | null = null;

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
  phone?: string;
  companyName?: string;
  role?: UserRole;
  operatingModel?: OperatingModel;
  addressLine?: string;
  city?: string;
  state?: string;
  zone?: string;
  /** Legal structure of the business: Sole Proprietor, Partnership, Pvt Ltd, LLP, OPC, or Other. */
  businessType?: string;
  /** Number of employees band, e.g. "1-10", "11-50", "51-200", "201-500", "500+". */
  employeeCount?: string;
  /** When true the DB trigger skips org + membership creation (user is joining an existing org). */
  skipOrgCreation?: boolean;
}

export interface PendingOAuthOnboardingMetadata {
  fullName?: string;
  phone?: string;
  companyName?: string;
  role?: UserRole;
  operatingModel?: OperatingModel;
  addressLine?: string;
  city?: string;
  state?: string;
  zone?: string;
  businessType?: string;
  employeeCount?: string;
  skipOrgCreation?: boolean;
}

const PENDING_OAUTH_METADATA_KEY = "@q_mobile_pending_oauth_metadata_v1";

export async function signUp({
  email,
  password,
  fullName,
  phone,
  companyName,
  role = "user",
  operatingModel: operatingModelOption,
  addressLine,
  city,
  state,
  zone,
  businessType,
  employeeCount,
  skipOrgCreation,
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
  if (companyName != null && String(companyName).trim()) {
    const c = companyName.trim();
    const companyErr = maxLength(
      VALIDATION.COMPANY_NAME_MAX_LENGTH,
      `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
    )(c);
    if (companyErr) return { error: new Error(companyErr) };
    const dup = await checkOrganizationNameTaken(c);
    if (dup.error) return { error: dup.error };
    if (dup.taken) {
      return { error: new Error("Company name already exists.") };
    }
  }
  try {
    const operatingModel: OperatingModel = operatingModelOption ?? "HYBRID";
    const metadata: Record<string, unknown> = {
      role,
      operating_model: operatingModel,
    };
    if (fullName?.trim()) metadata.full_name = fullName.trim();
    if (companyName != null && companyName.trim())
      metadata.company_name = companyName.trim();
    if (addressLine?.trim()) metadata.address_line = addressLine.trim();
    if (city?.trim()) metadata.city = city.trim();
    if (state?.trim()) metadata.state = state.trim();
    if (zone?.trim()) metadata.zone = zone.trim();
    if (businessType?.trim()) metadata.business_type = businessType.trim();
    if (employeeCount?.trim()) metadata.employee_count = employeeCount.trim();
    if (skipOrgCreation) metadata.skip_org_creation = true;
    // Canonical E.164-style India (+91…) for profiles.phone and metadata; RPCs normalize to 10 digits for lookup.
    if (phone != null && phone !== "") {
      const e164 = normalizeIndianPhoneForMetadata(phone);
      if (e164) metadata.phone = e164;
    }
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata },
    });
    if (error) {
      // Catch the database trigger exception if it fired
      if (error.message.includes("Company name already exists")) {
        return { error: new Error("Company name already exists.") };
      }
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

/** Safe user-facing copy; never forward raw DB/server messages from GoTrue. */
function mapSignInErrorMessage(raw: string): string {
  const m = (raw ?? "").toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid email or password") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("email not found")
  ) {
    return "Incorrect email or password.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email before signing in. Check your inbox.";
  }
  if (
    m.includes("too many") ||
    m.includes("rate limit") ||
    m.includes("over_email") ||
    m.includes("over_request") ||
    m.includes("too_many_requests")
  ) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (m.includes("user_banned") || m.includes("banned")) {
    return "This account cannot sign in. Contact support.";
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("econnrefused")) {
    return "Cannot reach server. Check your internet connection.";
  }
  if (
    m.includes("database") ||
    m.includes("sql") ||
    m.includes("internal server") ||
    m.includes("syntax error") ||
    m.includes("relation ") ||
    m.includes("column ")
  ) {
    return "Sign in failed. Try again or contact support.";
  }
  return "Sign in failed. Please try again.";
}

/** DB RPC: link roster drivers.user_id by profile email/phone (migration 20260510123000). */
async function trySyncMyDriverRowsUserId(): Promise<void> {
  try {
    const { error } = await supabase().rpc("sync_my_driver_rows_user_id");
    if (error && __DEV__) {
      console.warn("[auth] sync_my_driver_rows_user_id:", error.message);
    }
  } catch (e) {
    if (__DEV__) console.warn("[auth] sync_my_driver_rows_user_id failed", e);
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail.length === 0) {
    return { error: new Error("Enter your email address.") };
  }
  if (containsNullByte(trimmedEmail) || containsNullByte(password)) {
    return { error: new Error("Input contains invalid characters.") };
  }
  const emailErr = validateEmail(trimmedEmail);
  if (emailErr) return { error: new Error(emailErr) };
  const pwdErr = validatePasswordForSignIn(password);
  if (pwdErr) return { error: new Error(pwdErr) };
  try {
    const { data, error } = await supabase().auth.signInWithPassword({
      email: trimmedEmail,
      password: password ?? "",
    });
    if (error) {
      return { error: new Error(mapSignInErrorMessage(error.message)) };
    }
    if (!data.user) return { error: new Error("No user returned") };
    void trySyncMyDriverRowsUserId();
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

function getGoogleRedirectTo(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return Linking.createURL("/auth/callback");
}

/**
 * URL Supabase redirects to after the user taps "reset password" in email.
 * Must be listed under Authentication → URL configuration → Redirect URLs in Supabase Dashboard.
 * Native builds without EXPO_PUBLIC_WEB_BASE_URL use the app scheme from `Linking.createURL`.
 */
export function getPasswordRecoveryRedirectTo(): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/reset-password`;
  }
  if (webBase && /^https?:\/\//i.test(webBase)) {
    return `${webBase}/auth/reset-password`;
  }
  return Linking.createURL("/auth/reset-password");
}

/** Sends Supabase password recovery email (does not reveal whether the email is registered). */
export async function requestPasswordResetEmail(email: string): Promise<SignInResult> {
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail.length === 0) {
    return { error: new Error("Enter your email address.") };
  }
  if (containsNullByte(trimmedEmail)) {
    return { error: new Error("Input contains invalid characters.") };
  }
  const emailErr = validateEmail(trimmedEmail);
  if (emailErr) return { error: new Error(emailErr) };
  try {
    const { error } = await supabase().auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getPasswordRecoveryRedirectTo(),
    });
    if (error) {
      return { error: new Error(error.message || "Could not send reset email.") };
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
    return { error: e instanceof Error ? e : new Error("Could not send reset email.") };
  }
}

/** Call while authenticated with a recovery session (after opening the email link). */
export async function updatePasswordWithCurrentSession(newPassword: string): Promise<SignInResult> {
  if (containsNullByte(newPassword)) {
    return { error: new Error("Password contains invalid characters.") };
  }
  const trimmed = newPassword.trim();
  const pwdErr = validatePassword(trimmed);
  if (pwdErr) return { error: new Error(pwdErr) };
  try {
    const { error } = await supabase().auth.updateUser({ password: trimmed });
    if (error) {
      return { error: new Error(error.message || "Could not update password.") };
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
    return { error: e instanceof Error ? e : new Error("Could not update password.") };
  }
}

/** Google OAuth sign-in for web and native (Expo). */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    const redirectTo = getGoogleRedirectTo();

    if (Platform.OS === "web") {
      const { data, error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: new Error(error.message || "Google sign in failed") };
      if (!data?.url) return { error: new Error("Could not start Google sign in.") };
      if (typeof window !== "undefined") {
        window.location.assign(data.url);
      }
      return { error: null };
    }

    const { data, error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: new Error(error.message || "Google sign in failed") };
    if (!data?.url) return { error: new Error("Could not start Google sign in.") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      return { error: new Error("Google sign in cancelled.") };
    }

    const parsed = Linking.parse(result.url);
    const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
    const oauthError =
      typeof parsed.queryParams?.error_description === "string"
        ? parsed.queryParams.error_description
        : typeof parsed.queryParams?.error === "string"
          ? parsed.queryParams.error
          : null;

    if (oauthError) return { error: new Error(oauthError) };
    if (!code) return { error: new Error("Missing auth code from Google.") };

    const { error: exchangeError } = await supabase().auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return { error: new Error(exchangeError.message || "Google sign in failed") };
    }

    await applyPendingOAuthMetadata();
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Google sign in failed") };
  }
}

export async function setPendingOAuthMetadata(
  metadata: PendingOAuthOnboardingMetadata,
): Promise<{ error: Error | null }> {
  try {
    await AsyncStorage.setItem(PENDING_OAUTH_METADATA_KEY, JSON.stringify(metadata));
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error("Could not save onboarding details."),
    };
  }
}

/**
 * Applies any pending metadata intended for the next OAuth session.
 * Current implementation is a no-op and kept for callback flow compatibility.
 */
export async function applyPendingOAuthMetadata(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_OAUTH_METADATA_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    void trySyncMyDriverRowsUserId();
    return;
  }

  let pending: PendingOAuthOnboardingMetadata | null = null;
  try {
    pending = JSON.parse(raw) as PendingOAuthOnboardingMetadata;
  } catch {
    pending = null;
  } finally {
    await AsyncStorage.removeItem(PENDING_OAUTH_METADATA_KEY).catch(() => {});
  }
  if (!pending) {
    void trySyncMyDriverRowsUserId();
    return;
  }

  const authData: Record<string, unknown> = {};
  const role = pending.role === "driver" ? "driver" : "user";
  authData.role = role;
  authData.operating_model = pending.operatingModel ?? "HYBRID";
  if (pending.fullName?.trim()) authData.full_name = pending.fullName.trim();
  if (pending.companyName?.trim()) authData.company_name = pending.companyName.trim();
  if (pending.addressLine?.trim()) authData.address_line = pending.addressLine.trim();
  if (pending.city?.trim()) authData.city = pending.city.trim();
  if (pending.state?.trim()) authData.state = pending.state.trim();
  if (pending.zone?.trim()) authData.zone = pending.zone.trim();
  if (pending.businessType?.trim()) authData.business_type = pending.businessType.trim();
  if (pending.employeeCount?.trim()) authData.employee_count = pending.employeeCount.trim();
  if (pending.skipOrgCreation) authData.skip_org_creation = true;
  if (pending.phone != null && pending.phone !== "") {
    const e164 = normalizeIndianPhoneForMetadata(pending.phone);
    if (e164) authData.phone = e164;
  }

  const { error: updateAuthError } = await supabase().auth.updateUser({ data: authData });
  if (updateAuthError) {
    throw new Error(updateAuthError.message || "Could not save onboarding details.");
  }

  const { data: userData } = await supabase().auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    void trySyncMyDriverRowsUserId();
    return;
  }

  const profileUpdates: Record<string, unknown> = {};
  if (pending.fullName?.trim()) profileUpdates.full_name = pending.fullName.trim();
  if (pending.companyName?.trim()) profileUpdates.company_name = pending.companyName.trim();
  if (pending.phone != null && pending.phone !== "") {
    const e164 = normalizeIndianPhoneForMetadata(pending.phone);
    if (e164) profileUpdates.phone = e164;
  }
  if (Object.keys(profileUpdates).length > 0) {
    await supabase().from("profiles").update(profileUpdates).eq("id", userId);
  }

  if (!pending.skipOrgCreation) {
    const orgUpdates: Record<string, unknown> = {};
    if (pending.companyName?.trim()) orgUpdates.name = pending.companyName.trim();
    if (pending.operatingModel) orgUpdates.operating_model = pending.operatingModel;
    if (pending.addressLine?.trim()) orgUpdates.address_line = pending.addressLine.trim();
    if (pending.city?.trim()) orgUpdates.city = pending.city.trim();
    if (pending.state?.trim()) orgUpdates.state = pending.state.trim();
    if (pending.zone?.trim()) orgUpdates.zone = pending.zone.trim();
    if (pending.businessType?.trim()) orgUpdates.business_type = pending.businessType.trim();
    if (pending.employeeCount?.trim()) orgUpdates.employee_count = pending.employeeCount.trim();
    if (Object.keys(orgUpdates).length > 0) {
      await supabase().from("organizations").update(orgUpdates).eq("owner_id", userId);
    }
  }

  void trySyncMyDriverRowsUserId();
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

/** Ten-digit national number for get_email_by_phone / check-user-by-phone (aligned with validatePhone). */
function normalizePhoneToTenDigits(phone: string): string | null {
  return extractIndianMobileTenDigits(phone ?? "");
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

export interface CheckOrganizationNameTakenResult {
  error: Error | null;
  taken: boolean;
}

/**
 * True if an organization already uses this display name (trimmed, case-insensitive).
 * Used before sign-up; callable by anon via SECURITY DEFINER RPC.
 */
export async function checkOrganizationNameTaken(
  companyName: string,
): Promise<CheckOrganizationNameTakenResult> {
  const key = (companyName ?? "").trim();
  if (!key) return { error: null, taken: false };
  try {
    const { data, error } = await supabase().rpc("organization_name_is_taken", {
      p_name: key,
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("function") &&
        (msg.includes("does not exist") ||
          msg.includes("not found") ||
          msg.includes("could not find"))
      ) {
        if (__DEV__) {
          console.warn(
            "[auth] organization_name_is_taken RPC missing; blocking sign-up to enforce uniqueness. Run NOTIFY pgrst, reload_schema; in your DB.",
          );
        }
        // STRICT ENFORCEMENT: If the database function is missing, we must NOT allow sign-up,
        // because we cannot guarantee the company name is unique.
        return { 
          error: new Error("System update required: Cannot verify if company name exists. Please run the SQL migrations."), 
          taken: false 
        };
      }
      return {
        error: new Error("Could not verify company name. Please try again."),
        taken: false,
      };
    }
    return { error: null, taken: data === true };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
        taken: false,
      };
    }
    return {
      error: e instanceof Error ? e : new Error("Check failed"),
      taken: false,
    };
  }
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
  const now = Date.now();
  if (refreshSessionInFlight) return refreshSessionInFlight;
  if (now - lastRefreshSessionAt < REFRESH_DEBOUNCE_MS && lastRefreshSessionResult) {
    return lastRefreshSessionResult;
  }
  refreshSessionInFlight = (async () => {
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
  })();
  const result = await refreshSessionInFlight;
  lastRefreshSessionAt = Date.now();
  lastRefreshSessionResult = result;
  refreshSessionInFlight = null;
  return result;
}

const authEventGate = new Map<string, number>();

function shouldSkipAuthEvent(event: string, userId: string | null): boolean {
  const gateKey = `${event}:${userId ?? "none"}`;
  const now = Date.now();
  const last = authEventGate.get(gateKey) ?? 0;
  authEventGate.set(gateKey, now);
  return now - last < AUTH_EVENT_DEBOUNCE_MS;
}

function flushAuthEventGate(maxEntries = 64) {
  if (authEventGate.size <= maxEntries) return;
  const items = Array.from(authEventGate.entries()).sort((a, b) => b[1] - a[1]);
  authEventGate.clear();
  for (const [key, ts] of items.slice(0, maxEntries)) {
    authEventGate.set(key, ts);
  }
}

/**
 * SDK can emit sign-out-ish events with a null session during token refresh races
 * (common on web HMR / cold restore). Confirm storage + refresh before clearing UI.
 */
async function confirmSignOutOrRecover(
  runCallback: (payload: { user: AuthUser; profile: AuthProfile } | null) => void,
  event: string,
): Promise<void> {
  try {
    const { data: { session: stored } } = await supabase().auth.getSession();
    if (stored?.user) {
      const { data: { session: refreshed }, error } = await supabase().auth.refreshSession();
      if (refreshed?.user && !error) {
        if (__DEV__) {
          console.info(
            `[auth] ${event} suppressed — session recovered via refresh`,
          );
        }
        runCallback(mapSupabaseUserToAuth(refreshed.user));
        return;
      }
    }
    if (__DEV__) console.info(`[auth] ${event} confirmed — session unrecoverable`);
    runCallback(null);
  } catch {
    if (__DEV__) {
      console.warn(`[auth] ${event} verify failed (network?) — suppressing sign-out`);
    }
  }
}

export function onAuthStateChange(
  callback: (auth: { user: AuthUser; profile: AuthProfile } | null) => void | Promise<void>,
): () => void {
  let isProcessing = false;
  let queuedPayload: { user: AuthUser; profile: AuthProfile } | null | undefined;
  let signOutVerifyInFlight = false;

  const runCallback = (payload: { user: AuthUser; profile: AuthProfile } | null) => {
    if (isProcessing) {
      queuedPayload = payload;
      return;
    }
    isProcessing = true;
    void Promise.resolve(callback(payload))
      .catch((err: unknown) => {
        console.warn("[auth] onAuthStateChange callback failed:", err);
      })
      .finally(() => {
        isProcessing = false;
        if (queuedPayload !== undefined) {
          const next = queuedPayload;
          queuedPayload = undefined;
          runCallback(next ?? null);
        }
      });
  };

  const {
    data: { subscription },
  } = supabase().auth.onAuthStateChange((event, session) => {
    if (
      event === 'TOKEN_REFRESHED' ||
      event === 'INITIAL_SESSION' ||
      event === 'USER_UPDATED'
    ) {
      return;
    }
    const userId = session?.user?.id ?? null;
    if (shouldSkipAuthEvent(event, userId)) return;
    flushAuthEventGate();

    if (!session?.user) {
      if (signOutVerifyInFlight) return;
      signOutVerifyInFlight = true;
      void confirmSignOutOrRecover(runCallback, event).finally(() => {
        signOutVerifyInFlight = false;
      });
      return;
    }
    runCallback(mapSupabaseUserToAuth(session.user));
  });
  return () => subscription.unsubscribe();
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

/**
 * Self-heal for environments where DB auth trigger did not provision profiles.
 * Upserts the current user's own profile using auth metadata under RLS (auth.uid() = id).
 */
export async function ensureCurrentUserProfile(): Promise<{ error: Error | null }> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase().auth.getUser();
    if (userError || !user) {
      return { error: new Error(userError?.message || "Not signed in") };
    }

    const mapped = mapSupabaseUserToAuth(user).profile;
    const payload = {
      id: user.id,
      email: user.email ?? mapped.email,
      full_name: mapped.full_name ?? mapped.displayName,
      role: mapped.role,
      aggregated: mapped.aggregated,
      asset: mapped.asset,
      company_name: mapped.company_name ?? null,
      phone: mapped.phone ?? null,
      avatar_url: mapped.avatar_url ?? null,
      avatar_seed: mapped.avatar_seed ?? null,
      bio: mapped.status_text ?? null,
    };

    const { error } = await supabase().from("profiles").upsert(payload, {
      onConflict: "id",
    });
    if (error) return { error: new Error(error.message || "Profile provisioning failed") };
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error("Profile provisioning failed"),
    };
  }
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
    if (updates.phone !== undefined) {
      const t = updates.phone.trim();
      if (!t) {
        data.phone = "";
      } else {
        const e164 = normalizeIndianPhoneForMetadata(updates.phone);
        data.phone = e164 ?? "";
      }
    }
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
    if (updates.phone !== undefined) {
      const t = updates.phone.trim();
      profileUpdates.phone = t
        ? normalizeIndianPhoneForMetadata(updates.phone) ?? ""
        : "";
    }
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
