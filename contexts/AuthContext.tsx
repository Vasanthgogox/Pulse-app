/**
 * Auth context — Supabase Auth. Uses services/authService for sign in/out and session.
 * Restores session from storage on mount so "Keep me signed in" works across reloads.
 * When "Keep me signed in" is unchecked, signs out on app background (see lib/keepSignedInPreference).
 */
import type {
    AuthUser,
} from "@/features/auth/services/auth.service";
import * as authService from "@/features/auth/services/auth.service";
import { isFirstLaunchDone, setFirstLaunchDone } from "@/lib/firstLaunch";
import { getKeepSignedIn, setKeepSignedIn } from "@/lib/keepSignedInPreference";
import { supabase } from "@/lib/supabase";
import { clearAllRealtimeChannels } from "@/lib/realtimeRegistry";
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { AppState } from "react-native";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: authService.UserRole;
  aggregated?: boolean;
  asset?: boolean;
  full_name?: string;
  avatar_url?: string;
  /** Custom avatar seed for presets (e.g. pilot-1). */
  avatar_seed?: string;
  phone?: string;
  company_name?: string;
  /** Profile quote/status (WhatsApp-style). */
  status_text?: string;
}

function authProfileToUserProfile(p: authService.AuthProfile): UserProfile {
  return {
    uid: p.uid,
    email: p.email,
    displayName: p.displayName,
    role: p.role,
    aggregated: p.aggregated ?? true,
    asset: p.asset ?? true,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    avatar_seed: p.avatar_seed,
    phone: p.phone,
    company_name: p.company_name,
    status_text: p.status_text,
  };
}

function areUserProfilesEqual(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.role === b.role &&
    a.aggregated === b.aggregated &&
    a.asset === b.asset &&
    a.full_name === b.full_name &&
    a.avatar_url === b.avatar_url &&
    a.avatar_seed === b.avatar_seed &&
    a.phone === b.phone &&
    a.company_name === b.company_name &&
    a.status_text === b.status_text
  );
}

function mergeAuthProfiles(
  base: authService.AuthProfile,
  db: authService.AuthProfile | null,
): authService.AuthProfile {
  if (!db) return base;
  return {
    ...base,
    ...db,
    // Prefer DB when present, but keep fresh auth metadata values when DB field is empty/stale.
    avatar_url: db.avatar_url ?? base.avatar_url,
    avatar_seed: db.avatar_seed ?? base.avatar_seed,
    status_text: db.status_text ?? base.status_text,
    company_name: db.company_name ?? base.company_name,
    phone: db.phone ?? base.phone,
    full_name: db.full_name ?? base.full_name,
    displayName: db.displayName || base.displayName,
  };
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  /** True only when role has been verified from server-backed profile data. */
  roleVerified: boolean;
  loading: boolean;
  /** True when the previous session was invalid/expired (e.g. refresh token not found). */
  sessionExpired: boolean;
  /** Refetch session from server so profile (e.g. avatar_url) is up to date. Call after updating profile. */
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signInWithGoogle: (keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    role?: authService.UserRole,
    operatingModel?: authService.OperatingModel,
    phone?: string,
    companyName?: string,
    addressLine?: string,
    city?: string,
    state?: string,
    zone?: string,
    businessType?: string,
    employeeCount?: string,
    skipOrgCreation?: boolean,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleVerified, setRoleVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const signOutRequestedRef = useRef(false);
  const authAttemptRef = useRef(0);
  const listenerSeqRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const beginAuthAttempt = () => {
    authAttemptRef.current += 1;
    return authAttemptRef.current;
  };

  const isCurrentAuthAttempt = (attemptId: number) => {
    return authAttemptRef.current === attemptId;
  };

  const beginListenerSeq = () => {
    listenerSeqRef.current += 1;
    return listenerSeqRef.current;
  };

  const isCurrentListenerSeq = (seqId: number) => {
    return listenerSeqRef.current === seqId;
  };

  const logAuthRouteDecision = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info("[AuthGuard]", event, details);
  };

  const clearAuthState = (expired: boolean) => {
    setUser(null);
    setProfile(null);
    setRoleVerified(false);
    setSessionExpired(expired);
  };

  const forceSignOutOnAuthFailure = async (reason: string) => {
    signOutRequestedRef.current = true;
    try {
      await authService.signOut();
    } catch (e) {
      console.warn("[auth] forceSignOut: signOut call failed", e instanceof Error ? e.message : e);
    }
    clearAuthState(true);
    logAuthRouteDecision("forced_sign_out_auth_failure", { reason });
  };

  const getVerifiedDbProfile = async (uid: string): Promise<authService.AuthProfile | null> => {
    let dbProfile = await authService.getProfile(uid);
    if (dbProfile) return dbProfile;
    const provision = await authService.ensureCurrentUserProfile();
    if (provision.error) return null;
    dbProfile = await authService.getProfile(uid);
    return dbProfile;
  };

  useEffect(() => {
    // Always attempt to restore session from storage so "Keep me signed in" works on reload.
    // On first launch after install, clear any lingering Keychain auth data, then proceed.
    let mounted = true;

    // Single subscription handler shared by both the success and error paths of session restore.
    // getVerifiedDbProfile already provisions missing profiles internally.
    // Do NOT call refreshSession() here — it fires TOKEN_REFRESHED which
    // re-triggers this handler, causing an infinite cascade that freezes the app.
    const setupAuthSubscription = () => {
      if (unsubscribeRef.current) return;
      try {
        unsubscribeRef.current = authService.onAuthStateChange(async (auth) => {
          const seqId = beginListenerSeq();
          if (!mounted || !isCurrentListenerSeq(seqId)) return;
          try {
            if (auth) {
              const dbProfile = await getVerifiedDbProfile(auth.user.uid);
              if (!mounted || !isCurrentListenerSeq(seqId)) return;
              if (!dbProfile) {
                await forceSignOutOnAuthFailure("auth_state_profile_verification_failed");
                return;
              }
              const merged = mergeAuthProfiles(auth.profile, dbProfile);
              const nextProfile = authProfileToUserProfile(merged);
              setUser((prev) => (prev?.uid === auth.user.uid ? prev : auth.user));
              setProfile((prev) => (areUserProfilesEqual(prev, nextProfile) ? prev : nextProfile));
              setRoleVerified(true);
              setSessionExpired(false);
              logAuthRouteDecision("auth_state_signed_in", {
                uid: auth.user.uid,
                role: merged.role,
                roleVerified: true,
              });
            } else {
              const wasRequested = signOutRequestedRef.current;
              signOutRequestedRef.current = false;
              clearAuthState(!wasRequested);
              logAuthRouteDecision("auth_state_signed_out", {});
            }
          } catch (err) {
            if (!mounted || !isCurrentListenerSeq(seqId)) return;
            console.warn("[auth] onAuthStateChange callback error, forcing sign out:", err);
            await forceSignOutOnAuthFailure("auth_state_callback_error");
          }
        });
      } catch {
        // Subscription setup failed; app can still use sign-in
      }
    };

    (async () => {
      const initAttemptId = beginAuthAttempt();
      try {
        const firstLaunchDone = await isFirstLaunchDone();
        if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
        if (!firstLaunchDone) {
          await supabase().auth.signOut({ scope: "local" });
          await setFirstLaunchDone();
        }
      } catch {
        // Proceed with restore even if first-launch clear fails
      }

      // Restore session, then subscribe to auth changes.
      // getSession() never rejects (it catches and returns null for invalid/refresh token errors).
      // When "Keep me signed in" was unchecked, do not restore session on cold start (sign out immediately).
      authService
        .getSession()
        .then(async (session) => {
          if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
          try {
            if (session) {
              const keep = await getKeepSignedIn();
              if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
              if (!keep) {
                signOutRequestedRef.current = true;
                await authService.signOut();
                if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                setUser(null);
                setProfile(null);
                setRoleVerified(false);
                setSessionExpired(false);
                logAuthRouteDecision("restore_signed_out_keep_off", {
                  uid: session.user.uid,
                });
              } else {
                setSessionExpired(false);
                // Do not expose JWT-only metadata to routing before DB merge: stale
                // `user_metadata.role` can disagree with `profiles.role` and send fleet
                // users to the driver app until refresh completes.
                let nextUser = session.user;
                let nextProfile = session.profile;
                let verifiedDbProfile: authService.AuthProfile | null = null;
                try {
                  const refreshed = await authService.refreshSession();
                  if (mounted && isCurrentAuthAttempt(initAttemptId) && refreshed) {
                    nextUser = refreshed.user;
                    nextProfile = refreshed.profile;
                    verifiedDbProfile = await getVerifiedDbProfile(refreshed.user.uid);
                    if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                    if (verifiedDbProfile) {
                      nextProfile = mergeAuthProfiles(refreshed.profile, verifiedDbProfile);
                      setRoleVerified(true);
                    } else {
                      setRoleVerified(false);
                    }
                  } else if (mounted && isCurrentAuthAttempt(initAttemptId)) {
                    verifiedDbProfile = await getVerifiedDbProfile(session.user.uid);
                    if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                    if (verifiedDbProfile) {
                      nextProfile = mergeAuthProfiles(session.profile, verifiedDbProfile);
                      setRoleVerified(true);
                    } else {
                      setRoleVerified(false);
                    }
                  }
                } catch {
                  // Treat restore/profile verification failures as auth failures.
                  if (mounted && isCurrentAuthAttempt(initAttemptId)) setRoleVerified(false);
                }
                if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                if (!verifiedDbProfile) {
                  await forceSignOutOnAuthFailure("restore_profile_verification_failed");
                  if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                  return;
                }
                setUser(nextUser);
                setProfile(authProfileToUserProfile(nextProfile));
                logAuthRouteDecision("restore_completed", {
                  uid: nextUser.uid,
                  role: nextProfile.role,
                  roleVerified: true,
                });
              }
            } else {
              clearAuthState(true);
              logAuthRouteDecision("restore_no_session", {});
            }
          } finally {
            // Always unblock UI for the active restore attempt (avoids infinite spinner when
            // an inner branch returns early after StrictMode remount or aborted refresh).
            if (mounted && isCurrentAuthAttempt(initAttemptId)) {
              setLoading(false);
              setupAuthSubscription();
            }
          }
        })
      .catch(() => {
        // Defensive: if getSession ever rejects (e.g. unhandled throw), show sign-in
        if (mounted && isCurrentAuthAttempt(initAttemptId)) {
          clearAuthState(true);
          setLoading(false);
          logAuthRouteDecision("restore_error", {});
        }
        setupAuthSubscription();
      });
    })();

    return () => {
      mounted = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
    };
  }, []);

  // Zombie recovery: if user+profile exist but roleVerified stays false after
  // loading completes, retry verification once then force sign out.
  useEffect(() => {
    if (loading || !user || roleVerified) return;
    const timer = setTimeout(async () => {
      if (!user) return;
      logAuthRouteDecision("zombie_recovery_triggered", { uid: user.uid });
      try {
        const dbProfile = await getVerifiedDbProfile(user.uid);
        if (dbProfile) {
          setRoleVerified(true);
          logAuthRouteDecision("zombie_recovery_success", { uid: user.uid });
          return;
        }
      } catch {
        // Fall through to force sign out
      }
      await forceSignOutOnAuthFailure("zombie_recovery_failed");
    }, 10_000);
    return () => clearTimeout(timer);
  }, [loading, user, roleVerified]);

  // When "Keep me signed in" is off, sign out on app background so next open shows sign-in.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background") return;
      getKeepSignedIn().then((keep) => {
        if (keep) return;
        signOutRequestedRef.current = true;
        authService.signOut().finally(() => {
          clearAuthState(false);
        });
      });
    });
    return () => sub.remove();
  }, []);

  const signIn = async (email: string, password: string, keepSignedIn: boolean = true) => {
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithPassword(email, password);
    if (!result.error) {
      setSessionExpired(false);
      await setKeepSignedIn(keepSignedIn);
      // Wait for the session state to be fully populated before returning,
      // ensuring the redirect doesn't hit an empty state and bounce back.
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      await refreshSession();
    }
    return result;
  };

  const signInWithGoogle = async (keepSignedIn: boolean = true) => {
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithGoogle();
    if (!result.error) {
      setSessionExpired(false);
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      await refreshSession();
    }
    return result;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName?: string,
    role?: authService.UserRole,
    operatingModel?: authService.OperatingModel,
    phone?: string,
    companyName?: string,
    addressLine?: string,
    city?: string,
    state?: string,
    zone?: string,
    businessType?: string,
    employeeCount?: string,
    skipOrgCreation?: boolean,
  ) => {
    const result = await authService.signUp({
      email,
      password,
      fullName,
      phone,
      companyName,
      role,
      operatingModel,
      addressLine,
      city,
      state,
      zone,
      businessType,
      employeeCount,
      skipOrgCreation,
    });
    if (!result.error) {
      await refreshSession();
    }
    return result;
  };

  const refreshSession = async () => {
    const refreshAttemptId = beginAuthAttempt();
    const session = await authService.refreshSession();
    if (!isCurrentAuthAttempt(refreshAttemptId)) return;
    if (session) {
      const dbProfile = await getVerifiedDbProfile(session.user.uid);
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      if (!dbProfile) {
        await forceSignOutOnAuthFailure("manual_refresh_profile_verification_failed");
        return;
      }
      const merged = dbProfile
        ? mergeAuthProfiles(session.profile, dbProfile)
        : session.profile;
      setUser(session.user);
      setProfile(authProfileToUserProfile(merged));
      setRoleVerified(true);
      setSessionExpired(false);
      logAuthRouteDecision("refresh_completed", {
        uid: session.user.uid,
        role: merged.role,
        roleVerified: true,
      });
    } else {
      clearAuthState(true);
    }
  };

  const signOut = async () => {
    signOutRequestedRef.current = true;
    clearAllRealtimeChannels();
    try {
      await authService.signOut();
    } catch (error) {
      console.error("Error during signOut in AuthContext:", error);
    }
    clearAuthState(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roleVerified,
        loading,
        sessionExpired,
        refreshSession,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
