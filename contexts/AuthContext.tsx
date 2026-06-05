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
import { useMobileKeepSignedInSignOut } from "@/features/auth/hooks/useMobileKeepSignedInSignOut";
import { useWebKeepSignedInSignOut } from "@/features/auth/hooks/useWebKeepSignedInSignOut";
import type { AuthUser } from "@/features/auth/services/auth.service";
import * as authService from "@/features/auth/services/auth.service";
import {
  areUserProfilesEqual,
  AUTH_RESTORE_REFRESH_TIMEOUT_MS,
  AUTH_SESSION_FRESH_MS,
  AUTH_TIMEOUT_MS,
  AuthError,
  PROFILE_VERIFY_TIMEOUT_MS,
  authErrorFromUnknown,
  authProfileToUserProfile,
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
  type AuthStatus,
  type UserProfile,
} from "@/lib/authEngine";
import { clearStaleAuthOnFirstLaunch } from "@/lib/firstLaunch";
import { getKeepSignedIn, setKeepSignedIn } from "@/lib/keepSignedInPreference";
import { clearAllRealtimeChannels } from "@/lib/realtimeRegistry";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

export { AuthError } from "@/lib/authEngine";
export type { AuthErrorCode, AuthStatus, UserProfile } from "@/lib/authEngine";

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
  /** Set when cold-start session restore fails; cleared on sign-in / refresh / sign-out. */
  restoreError: AuthError | null;
  clearRestoreError: () => void;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signInWithGoogle: (keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signUp: (options: authService.SignUpOptions) => Promise<{ error: Error | null; emailVerificationRequired?: boolean }>;
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

/**
 * On web, Supabase persists the session in localStorage synchronously accessible.
 * Read it before React renders so AppBootGate never blocks for returning users.
 * The async restore still runs in background to refresh tokens and verify profile.
 */
function tryReadWebSession(): {
  status: AuthStatus;
  user: AuthUser | null;
  profile: UserProfile | null;
} {
  const empty = { status: "restoring" as AuthStatus, user: null, profile: null };
  if (typeof window === "undefined" || typeof localStorage === "undefined") return empty;
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return empty;
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      expires_at?: number;
      user?: {
        id?: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      };
    };
    if (!parsed?.access_token || !parsed?.user?.id) return empty;
    const meta = parsed.user.user_metadata ?? {};
    const uid = parsed.user.id;
    const email = parsed.user.email ?? "";
    const fullName =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      email.split("@")[0] ??
      "User";
    const role = meta.role === "driver" ? ("driver" as const) : ("user" as const);
    const opModel = meta.operating_model as string | undefined;
    const aggregated =
      role === "driver"
        ? false
        : opModel === "NON_ASSET"
          ? true
          : opModel === "ASSET_BASED"
            ? false
            : meta.aggregated !== false && meta.aggregated !== "false";
    const asset =
      role === "driver"
        ? false
        : opModel === "ASSET_BASED"
          ? true
          : opModel === "NON_ASSET"
            ? false
            : meta.asset !== false && meta.asset !== "false";
    const user: AuthUser = { uid, email, displayName: fullName };
    const profile: UserProfile = {
      uid,
      email,
      displayName: fullName,
      full_name: fullName,
      role,
      aggregated: aggregated as boolean,
      asset: asset as boolean,
      company_name: meta.company_name as string | undefined,
      phone: meta.phone as string | undefined,
      avatar_url: meta.avatar_url as string | undefined,
      avatar_seed: meta.avatar_seed as string | undefined,
      status_text: meta.status_text as string | undefined,
    };
    return { status: "authenticated", user, profile };
  } catch {
    return empty;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleVerified, setRoleVerified] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [restoreError, setRestoreError] = useState<AuthError | null>(null);

  // On web: read localStorage synchronously before first paint so AppBootGate
  // never blocks for returning authenticated users. useLayoutEffect fires after
  // DOM mutations but before the browser paints, which avoids both the SSR
  // hydration mismatch (useState initializer would differ server vs client) and
  // the visible flash (useEffect fires after paint).
  useLayoutEffect(() => {
    const web = tryReadWebSession();
    if (web.status === "authenticated" && web.user && web.profile) {
      setUser(web.user);
      setProfile(web.profile);
      setStatus("authenticated");
      // Note: roleVerified intentionally NOT set here — setting it in useLayoutEffect
      // causes React hydration mismatch (#418) on Netlify static export because child
      // components render with the new value before server HTML is fully reconciled.
      // Dispatchers don't need roleVerified to boot. Drivers wait for async restore
      // (capped at BOOT_HARD_TIMEOUT_MS = 8s).
    }
  }, []);

  const clearRestoreError = useCallback(() => setRestoreError(null), []);

  const signOutRequestedRef = useRef(false);
  const authAttemptRef = useRef(0);
  const listenerSeqRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  /** True while cold-start restore runs — ignore spurious SDK sign-out events. */
  const restoringRef = useRef(true);

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
        return await withTimeout(
          (async () => {
            const dbProfile = await authService.getProfile(uid);
            if (dbProfile) return dbProfile;

            const provision = await authService.ensureCurrentUserProfile();
            if (provision.error) return null;

            return await authService.getProfile(uid);
          })(),
          PROFILE_VERIFY_TIMEOUT_MS,
        );
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
    restoringRef.current = true;

    // Dev toggle: skip restore and jump straight to expired
    if (isForceExpiredSessionEnabled()) {
      logAuth("dev_force_expired_session", {}, "warn");
      restoringRef.current = false;
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
              if (restoringRef.current) {
                logAuth("auth_state_signed_out_ignored_during_restore");
                return;
              }
              const wasRequested = signOutRequestedRef.current;
              signOutRequestedRef.current = false;
              clearAuthState(!wasRequested);
              logAuth("auth_state_signed_out", { requested: wasRequested });
            }
          } catch (err) {
            if (!mounted || !isCurrentListenerSeq(seqId)) return;
            logAuthError("auth_state_callback_error", err);
            if (restoringRef.current) {
              logAuth("auth_state_callback_error_ignored_during_restore");
              return;
            }
            await forceSignOutOnAuthFailure("auth_state_callback_error");
          }
        });
      } catch {
        // Subscription setup failed; sign-in still works
      }
    };

    // Subscribe before restore so token-refresh races during getUser() are recovered.
    setupAuthSubscription();

    (async () => {
      const initAttemptId = beginAuthAttempt();
      try {
        await clearStaleAuthOnFirstLaunch();
        if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
      } catch {
        // Proceed with restore even if first-launch clear fails
      }

      try {
        const session = await withTimeout(authService.getSession(), AUTH_TIMEOUT_MS).catch(() => null);
        if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
        if (session) {
          // On web there is no AppState "background" event, so the keep-signed-in
          // preference has no meaning for page reloads — always restore the session.
          const keep = Platform.OS === 'web' ? true : await getKeepSignedIn();
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
            // Hydrate from persisted session immediately so HMR/reload never flashes sign-in
            // while the network refresh runs.
            setUser(nextUser);
            setProfile(freezeInDev(authProfileToUserProfile(nextProfile)));
            setStatus("authenticated");
            const tokenExpiresAtMs =
              await authService.getAccessTokenExpiresAtMs();
            const tokenFresh = authService.isAccessTokenFresh(
              tokenExpiresAtMs,
              AUTH_SESSION_FRESH_MS,
            );
            try {
              if (tokenFresh) {
                logAuth("restore_skip_refresh_token_fresh", {
                  uid: session.user.uid,
                });
                verifiedDbProfile = await getVerifiedDbProfile(
                  session.user.uid,
                );
                if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                if (verifiedDbProfile) {
                  nextProfile = mergeAuthProfiles(
                    session.profile,
                    verifiedDbProfile,
                  );
                  setRoleVerified(true);
                } else {
                  setRoleVerified(false);
                }
              } else {
                const refreshed = await withTimeout(
                  authService.refreshSession(),
                  AUTH_RESTORE_REFRESH_TIMEOUT_MS,
                );
                if (mounted && isCurrentAuthAttempt(initAttemptId) && refreshed) {
                  nextUser = refreshed.user;
                  nextProfile = refreshed.profile;
                  verifiedDbProfile = await getVerifiedDbProfile(
                    refreshed.user.uid,
                  );
                  if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                  if (verifiedDbProfile) {
                    nextProfile = mergeAuthProfiles(
                      refreshed.profile,
                      verifiedDbProfile,
                    );
                    setRoleVerified(true);
                  } else {
                    setRoleVerified(false);
                  }
                } else if (mounted && isCurrentAuthAttempt(initAttemptId)) {
                  verifiedDbProfile = await getVerifiedDbProfile(
                    session.user.uid,
                  );
                  if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                  if (verifiedDbProfile) {
                    nextProfile = mergeAuthProfiles(
                      session.profile,
                      verifiedDbProfile,
                    );
                    setRoleVerified(true);
                  } else {
                    setRoleVerified(false);
                  }
                }
              }
            } catch (e) {
              if (mounted && isCurrentAuthAttempt(initAttemptId)) {
                if (e instanceof TimeoutError) {
                  logAuth(
                    "restore_refresh_timeout",
                    { uid: session.user.uid },
                    "warn",
                  );
                } else {
                  logAuthError("restore_refresh_error", e, {
                    uid: session.user.uid,
                  });
                }
                verifiedDbProfile =
                  verifiedDbProfile ??
                  (await getVerifiedDbProfile(session.user.uid).catch(
                    () => null,
                  ));
                setRoleVerified(!!verifiedDbProfile);
                if (verifiedDbProfile) {
                  nextProfile = mergeAuthProfiles(
                    session.profile,
                    verifiedDbProfile,
                  );
                }
              }
            }
            if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
            setRestoreError(null);
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
          setRestoreError(null);
          clearAuthState(false);
          logAuth("restore_no_session");
        }
      } catch (err) {
        if (mounted && isCurrentAuthAttempt(initAttemptId)) {
          logAuthError("restore_error", err);
          const stored = await authService.getSession().catch(() => null);
          if (stored) {
            setUser(stored.user);
            setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
            setRoleVerified(false);
            setStatus("authenticated");
            setRestoreError(authErrorFromUnknown(err));
            logAuth("restore_error_degraded_session_preserved", {
              uid: stored.user.uid,
            }, "warn");
          } else {
            setRestoreError(authErrorFromUnknown(err));
            clearAuthState(false);
          }
        }
      } finally {
        restoringRef.current = false;
        if (mounted && isCurrentAuthAttempt(initAttemptId)) {
          setStatus((prev) => (prev === "restoring" ? "unauthenticated" : prev));
        }
      }
    })();

    return () => {
      mounted = false;
      restoringRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- profile backfill (session metadata when DB/network is flaky) ----

  useEffect(() => {
    if (!user || profile) return;
    let cancelled = false;
    void authService.getSession().then((stored) => {
      if (cancelled || !stored) return;
      setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
      setStatus("authenticated");
      logAuth("profile_backfill_from_session", { uid: stored.user.uid }, "warn");
    });
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

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
        const stored = await withTimeout(authService.getSession(), AUTH_TIMEOUT_MS).catch(() => null);
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
      setRestoreError(null);
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
      setRestoreError(null);
      setStatus("authenticated");
      resetCircuitBreaker();
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      await refreshSessionInternal();
    }
    return wrapActionResult(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (
    options: authService.SignUpOptions,
  ) => {
    const result = await authService.signUp(options);
    if (!result.error) {
      setRestoreError(null);
      await refreshSessionInternal();
    }
    return { ...wrapActionResult(result), emailVerificationRequired: result.emailVerificationRequired };
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
        setRestoreError(null);
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
      const err = authErrorFromUnknown(e);
      if (stored) {
        setUser(stored.user);
        setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
        setRoleVerified(false);
        setStatus("authenticated");
        setRestoreError(err);
        logAuth("refresh_timeout_degraded_session_preserved", { uid: stored.user.uid }, "warn");
      } else {
        setRestoreError(err);
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
    setRestoreError(null);
    clearAuthState(false);
  }, [clearAuthState]);

  // ---- render ----

  const loading = status === "restoring";
  const sessionExpired = status === "expired";

  const authContextValue = useMemo(
    () => ({
      user,
      profile,
      roleVerified,
      status,
      loading,
      sessionExpired,
      restoreError,
      clearRestoreError,
      refreshSession,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
    }),
    [
      user,
      profile,
      roleVerified,
      status,
      loading,
      sessionExpired,
      restoreError,
      clearRestoreError,
      refreshSession,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>

  );
}
