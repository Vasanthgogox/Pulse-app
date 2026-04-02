/**
 * Auth context — Supabase Auth. Uses services/authService for sign in/out and session.
 * Restores session from storage on mount so "Keep me signed in" works across reloads.
 * When "Keep me signed in" is unchecked, signs out on app background (see lib/keepSignedInPreference).
 */
import type {
    AuthProfile,
    AuthUser,
} from "@/features/auth/services/auth.service";
import * as authService from "@/features/auth/services/auth.service";
import { isFirstLaunchDone, setFirstLaunchDone } from "@/lib/firstLaunch";
import { getKeepSignedIn, setKeepSignedIn } from "@/lib/keepSignedInPreference";
import { supabase } from "@/lib/supabase";
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
  phone?: string;
  company_name?: string;
  /** Profile quote/status (WhatsApp-style). */
  status_text?: string;
}

function authProfileToUserProfile(p: AuthProfile): UserProfile {
  return {
    uid: p.uid,
    email: p.email,
    displayName: p.displayName,
    role: p.role,
    aggregated: p.aggregated ?? true,
    asset: p.asset ?? true,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    phone: p.phone,
    company_name: p.company_name,
    status_text: p.status_text,
  };
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True when the previous session was invalid/expired (e.g. refresh token not found). */
  sessionExpired: boolean;
  /** Refetch session from server so profile (e.g. avatar_url) is up to date. Call after updating profile. */
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    role?: authService.UserRole,
    operatingModel?: authService.OperatingModel,
    phone?: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const signOutRequestedRef = useRef(false);

  useEffect(() => {
    // Always attempt to restore session from storage so "Keep me signed in" works on reload.
    // On first launch after install, clear any lingering Keychain auth data, then proceed.
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const firstLaunchDone = await isFirstLaunchDone();
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
        if (!mounted) return;
        if (session) {
          const keep = await getKeepSignedIn();
          if (!mounted) return;
          if (!keep) {
            signOutRequestedRef.current = true;
            await authService.signOut();
            if (!mounted) return;
            setUser(null);
            setProfile(null);
            setSessionExpired(false);
          } else {
            setUser(session.user);
            setProfile(authProfileToUserProfile(session.profile));
            setSessionExpired(false);
          }
        } else {
          setUser(null);
          setProfile(null);
          setSessionExpired(true);
        }
        setLoading(false);
        try {
          unsubscribe = authService.onAuthStateChange((auth) => {
            if (!mounted) return;
            if (auth) {
              setUser(auth.user);
              setProfile(authProfileToUserProfile(auth.profile));
              setSessionExpired(false);
            } else {
              if (!signOutRequestedRef.current) setSessionExpired(true);
              signOutRequestedRef.current = false;
              setUser(null);
              setProfile(null);
            }
          });
        } catch {
          // Subscription setup failed; app can still use sign-in
        }
      })
      .catch(() => {
        // Defensive: if getSession ever rejects (e.g. unhandled throw), show sign-in
        if (mounted) {
          setUser(null);
          setProfile(null);
          setSessionExpired(true);
          setLoading(false);
        }
        try {
          unsubscribe = authService.onAuthStateChange((auth) => {
            if (!mounted) return;
            if (auth) {
              setUser(auth.user);
              setProfile(authProfileToUserProfile(auth.profile));
              setSessionExpired(false);
            } else {
              if (!signOutRequestedRef.current) setSessionExpired(true);
              signOutRequestedRef.current = false;
              setUser(null);
              setProfile(null);
            }
          });
        } catch {
          // Subscription setup failed
        }
      });
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  // When "Keep me signed in" is off, sign out on app background so next open shows sign-in.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background") return;
      getKeepSignedIn().then((keep) => {
        if (keep) return;
        signOutRequestedRef.current = true;
        authService.signOut().finally(() => {
          setUser(null);
          setProfile(null);
          setSessionExpired(false);
        });
      });
    });
    return () => sub.remove();
  }, []);

  const signIn = async (email: string, password: string, keepSignedIn: boolean = true) => {
    const result = await authService.signInWithPassword(email, password);
    if (!result.error) {
      setSessionExpired(false);
      await setKeepSignedIn(keepSignedIn);
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
  ) => {
    return authService.signUp({
      email,
      password,
      fullName,
      phone,
      role,
      operatingModel,
    });
  };

  const refreshSession = async () => {
    const session = await authService.getSession();
    if (session) {
      setUser(session.user);
      setProfile(authProfileToUserProfile(session.profile));
      setSessionExpired(false);
    }
  };

  const signOut = async () => {
    signOutRequestedRef.current = true;
    await authService.signOut();
    setSessionExpired(false);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        sessionExpired,
        refreshSession,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
