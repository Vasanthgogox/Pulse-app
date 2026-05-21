/**
 * Auth context — thin React adapter around lib/authEngine.
 *
 * Public API: user, profile, status, roleVerified, signIn/Out/Up/Google, refreshSession.
 * Derived: loading = status === "restoring", sessionExpired = status === "expired".
 *
 * Platform-specific side effects live in dedicated hooks:
 *   - useMobileKeepSignedInSignOut (AppState)
 *   - useWebKeepSignedInSignOut   (cross-tab storage sync only)
 *
 * Core auth logic (profile merge, comparison, timeout, circuit-breaker)
 * lives in lib/authEngine.
 */
import type { AuthUser } from "@/features/auth/services/auth.service";
import * as authService from "@/features/auth/services/auth.service";
import { isFirstLaunchDone, setFirstLaunchDone } from "@/lib/firstLaunch";
import { getKeepSignedIn, setKeepSignedIn } from "@/lib/keepSignedInPreference";
import { supabase } from "@/lib/supabase";
import { clearAllRealtimeChannels } from "@/lib/realtimeRegistry";
import {
  type AuthStatus,
  type UserProfile,
  AUTH_TIMEOUT_MS,
  AuthError,
  authProfileToUserProfile,
  areUserProfilesEqual,
  freezeInDev,
  isCircuitBreakerTripped,
  isForceExpiredSessionEnabled,
  logAuth,
  logAuthError,
  mergeAuthProfiles,
  recordCircuitBreakerHit,
  resetCircuitBreaker,
  TimeoutError,
  withTimeout,
} from "@/lib/authEngine";
import { useMobileKeepSignedInSignOut } from "@/hooks/useMobileKeepSignedInSignOut";
import { useWebKeepSignedInSignOut } from "@/hooks/useWebKeepSignedInSignOut";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type { UserProfile } from "@/lib/authEngine";
export type { AuthStatus } from "@/lib/authEngine";
export { AuthError } from "@/lib/authEngine";
export type { AuthErrorCode } from "@/lib/authEngine";

// ---------------------------------------------------------------------------
// Context type — narrow public surface
// ---------------------------------------------------------------------------

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  roleVerified: boolean;
  status: AuthStatus;
  /** @deprecated Use `status === "restoring"` */
  loading: boolean;
  /** @deprecated Use `status === "expired"` */
  sessionExpired: boolean;
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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleVerified, setRoleVerified] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("restoring");

  const signOutRequestedRef = useRef(false);
  const authAttemptRef = useRef(0);
  const listenerSeqRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  // ---- sequence guards ----

  const beginAuthAttempt = () => {
    authAttemptRef.current += 1;
    return authAttemptRef.current;
  };
  const isCurrentAuthAttempt = (id: number) => authAttemptRef.current === id;

  const beginListenerSeq = () => {
    listenerSeqRef.current += 1;
    return listenerSeqRef.current;
  };
  const isCurrentListenerSeq = (id: number) => listenerSeqRef.current === id;

  // ---- state transitions ----

  const clearAuthState = useCallback((expired: boolean) => {
    setUser(null);
    setProfile(null);
    setRoleVerified(false);
    setStatus(expired ? "expired" : "unauthenticated");
  }, []);

  const forceSignOutOnAuthFailure = useCallback(async (reason: string) => {
    recordCircuitBreakerHit();
    if (isCircuitBreakerTripped()) {
      logAuth(
        "circuit_breaker_tripped",
        { reason },
        "warn",
      );
      clearAuthState(true);
      return;
    }

    signOutRequestedRef.current = true;
    try {
      await withTimeout(authService.signOut(), AUTH_TIMEOUT_MS);
    } catch (e) {
      logAuthError("force_sign_out_error", e, { reason });
    }
    clearAuthState(true);
    logAuth("forced_sign_out", { reason });
  }, [clearAuthState]);

  // ---- profile verification with timeout ----

  const getVerifiedDbProfile = useCallback(
    async (uid: string): Promise<authService.AuthProfile | null> => {
      try {
        const dbProfile = await authService.getProfile(uid);
        if (dbProfile) return dbProfile;

        const provision = await authService.ensureCurrentUserProfile();
        if (provision.error) return null;

        return await authService.getProfile(uid);
      } catch (e) {
        logAuthError("profile_verification_error", e, { uid });
        return null;
      }
    },
    [],
  );

  /** Apply session from auth metadata when DB profile is not yet available (zombie recovery will retry). */
  const applyDegradedAuthSession = useCallback(
    (auth: { user: AuthUser; profile: authService.AuthProfile }) => {
      const nextProfile = freezeInDev(authProfileToUserProfile(auth.profile));
      setUser(auth.user);
      setProfile(nextProfile);
      setRoleVerified(false);
      setStatus("authenticated");
      logAuth("profile_verification_degraded", { uid: auth.user.uid }, "warn");
    },
    [],
  );

  // ---- session restore + subscription ----

  useEffect(() => {
    let mounted = true;

    // Dev toggle: skip restore and jump straight to expired
    if (isForceExpiredSessionEnabled()) {
      logAuth("dev_force_expired_session", {}, "warn");
      clearAuthState(true);
      return;
    }

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
                applyDegradedAuthSession(auth);
                return;
              }
              const merged = mergeAuthProfiles(auth.profile, dbProfile);
              const nextProfile = freezeInDev(authProfileToUserProfile(merged));
              setUser((prev) => (prev?.uid === auth.user.uid ? prev : auth.user));
              setProfile((prev) => (areUserProfilesEqual(prev, nextProfile) ? prev : nextProfile));
              setRoleVerified(true);
              setStatus("authenticated");
              resetCircuitBreaker();
              logAuth("auth_state_signed_in", {
                uid: auth.user.uid,
                role: merged.role,
              });
            } else {
              const wasRequested = signOutRequestedRef.current;
              signOutRequestedRef.current = false;
              clearAuthState(!wasRequested);
              logAuth("auth_state_signed_out", { requested: wasRequested });
            }
          } catch (err) {
            if (!mounted || !isCurrentListenerSeq(seqId)) return;
            logAuthError("auth_state_callback_error", err);
            await forceSignOutOnAuthFailure("auth_state_callback_error");
          }
        });
      } catch {
        // Subscription setup failed; sign-in still works
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
                setStatus("unauthenticated");
                logAuth("restore_signed_out_keep_off", { uid: session.user.uid });
              } else {
                let nextUser = session.user;
                let nextProfile = session.profile;
                let verifiedDbProfile: authService.AuthProfile | null = null;
                try {
                  const refreshed = await withTimeout(
                    authService.refreshSession(),
                    AUTH_TIMEOUT_MS,
                  );
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
                } catch (e) {
                  if (mounted && isCurrentAuthAttempt(initAttemptId)) {
                    setRoleVerified(false);
                    if (e instanceof TimeoutError) {
                      logAuthError("restore_refresh_timeout", e);
                    }
                  }
                }
                if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                if (!verifiedDbProfile) {
                  setUser(nextUser);
                  setProfile(freezeInDev(authProfileToUserProfile(nextProfile)));
                  setRoleVerified(false);
                  setStatus("authenticated");
                  logAuth("restore_profile_degraded", { uid: nextUser.uid }, "warn");
                  return;
                }
                const finalProfile = freezeInDev(authProfileToUserProfile(nextProfile));
                setUser(nextUser);
                setProfile(finalProfile);
                setStatus("authenticated");
                resetCircuitBreaker();
                logAuth("restore_completed", {
                  uid: nextUser.uid,
                  role: nextProfile.role,
                });
              }
            } else {
              // No stored session — unauthenticated, not "expired" (nothing expired).
              clearAuthState(false);
              logAuth("restore_no_session");
            }
          } finally {
            if (mounted && isCurrentAuthAttempt(initAttemptId)) {
              setStatus((prev) => (prev === "restoring" ? "unauthenticated" : prev));
              setupAuthSubscription();
            }
          }
        })
        .catch(() => {
          if (mounted && isCurrentAuthAttempt(initAttemptId)) {
            clearAuthState(false);
            logAuth("restore_error");
          }
          setupAuthSubscription();
        });
    })();

    return () => {
      mounted = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- zombie recovery ----

  useEffect(() => {
    if (status === "restoring" || !user || roleVerified) return;
    const timer = setTimeout(async () => {
      if (!user) return;
      logAuth("zombie_recovery_triggered", { uid: user.uid });
      try {
        const dbProfile = await getVerifiedDbProfile(user.uid);
        if (dbProfile) {
          setRoleVerified(true);
          resetCircuitBreaker();
          logAuth("zombie_recovery_success", { uid: user.uid });
          return;
        }
      } catch {
        // Fall through to session check
      }
      // Profile lookup failed — could be a transient network issue, not an expired session.
      // Genuinely expired sessions are handled by the onAuthStateChange subscription
      // (Supabase fires SIGNED_OUT when auto-refresh fails server-side).
      // Only force sign-out here when the local session token is also gone, meaning
      // the app already has no credentials to restore on reload.
      try {
        const stored = await authService.getSession();
        if (stored) {
          logAuth("zombie_recovery_deferred_session_present", { uid: user.uid }, "warn");
          return;
        }
      } catch {
        // Cannot read storage — be conservative and do not sign out.
        logAuth("zombie_recovery_storage_error", { uid: user.uid }, "warn");
        return;
      }
      await forceSignOutOnAuthFailure("zombie_recovery_failed_no_session");
    }, 10_000);
    return () => clearTimeout(timer);
  }, [status, user, roleVerified, getVerifiedDbProfile, forceSignOutOnAuthFailure]);

  // ---- platform hooks: sign out on background/hidden when keep-signed-in is off ----

  useMobileKeepSignedInSignOut(clearAuthState, signOutRequestedRef);
  useWebKeepSignedInSignOut(clearAuthState, signOutRequestedRef);

  // ---- actions ----

  const signIn = useCallback(async (
    email: string,
    password: string,
    keepSignedIn: boolean = true,
  ) => {
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithPassword(email, password);
    if (!result.error) {
      setStatus("authenticated");
      resetCircuitBreaker();
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      await refreshSessionInternal();
    }
    return wrapActionResult(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signInWithGoogle = useCallback(async (keepSignedIn: boolean = true) => {
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithGoogle();
    if (!result.error) {
      setStatus("authenticated");
      resetCircuitBreaker();
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      await refreshSessionInternal();
    }
    return wrapActionResult(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (
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
      await refreshSessionInternal();
    }
    return wrapActionResult(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSessionInternal = async () => {
    const refreshAttemptId = beginAuthAttempt();
    try {
      const session = await withTimeout(
        authService.refreshSession(),
        AUTH_TIMEOUT_MS,
      );
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      if (session) {
        const dbProfile = await getVerifiedDbProfile(session.user.uid);
        if (!isCurrentAuthAttempt(refreshAttemptId)) return;
        if (!dbProfile) {
          setUser(session.user);
          setProfile(freezeInDev(authProfileToUserProfile(session.profile)));
          setRoleVerified(false);
          setStatus("authenticated");
          logAuth("refresh_profile_degraded", { uid: session.user.uid }, "warn");
          return;
        }
        const merged = mergeAuthProfiles(session.profile, dbProfile);
        const finalProfile = freezeInDev(authProfileToUserProfile(merged));
        setUser(session.user);
        setProfile(finalProfile);
        setRoleVerified(true);
        setStatus("authenticated");
        resetCircuitBreaker();
        logAuth("refresh_completed", {
          uid: session.user.uid,
          role: merged.role,
        });
      } else {
        // refreshSession returned null — network failure or genuinely expired session.
        // Check local storage before deciding to sign out: if a token is still stored,
        // this is a transient failure (slow network, backend hiccup). The
        // onAuthStateChange subscription handles genuine expiry via the SIGNED_OUT event.
        const stored = await authService.getSession();
        if (!isCurrentAuthAttempt(refreshAttemptId)) return;
        if (stored) {
          setUser(stored.user);
          setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
          setRoleVerified(false);
          setStatus("authenticated");
          logAuth("refresh_degraded_session_preserved", { uid: stored.user.uid }, "warn");
        } else {
          clearAuthState(true);
        }
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        logAuthError("refresh_session_timeout", e);
      } else {
        logAuthError("refresh_session_error", e);
      }
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      // Timeout / unexpected error: never sign out if a token is still in storage.
      // The stored session may be perfectly valid — the network call just failed.
      const stored = await authService.getSession();
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      if (stored) {
        setUser(stored.user);
        setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
        setRoleVerified(false);
        setStatus("authenticated");
        logAuth("refresh_timeout_degraded_session_preserved", { uid: stored.user.uid }, "warn");
      } else {
        clearAuthState(true);
      }
    }
  };

  /**
   * Wraps a service-layer `{ error }` result: if the original error
   * is a TimeoutError, returns an AuthError with code so callers
   * can show tailored UI (e.g. retry button vs generic message).
   */
  const wrapActionResult = (result: { error: Error | null }): { error: Error | null } => {
    if (!result.error) return result;
    if (result.error instanceof TimeoutError) {
      return { error: new AuthError("NETWORK_TIMEOUT", result.error.message, result.error) };
    }
    return result;
  };

  const refreshSession = useCallback(refreshSessionInternal, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    signOutRequestedRef.current = true;
    clearAllRealtimeChannels();
    try {
      await withTimeout(authService.signOut(), AUTH_TIMEOUT_MS);
    } catch (e) {
      logAuthError("sign_out_error", e);
    }
    clearAuthState(false);
  }, [clearAuthState]);

  // ---- render ----

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roleVerified,
        status,
        loading: status === "restoring",
        sessionExpired: status === "expired",
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
