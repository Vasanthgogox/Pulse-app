import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseAuth } from "@/lib/supabaseAuth";

export type AdminAuthStatus =
  | "loading"
  | "signed_out"
  | "signed_in_not_provisioned"
  | "signed_in_provisioned";

interface AdminAuthState {
  status: AdminAuthStatus;
  session: Session | null;
  /** Permission keys from the existing get_my_platform_permissions() RPC. Empty until resolved. */
  permissions: string[];
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

/**
 * Whole-console authentication gate (S3a). Resolves a real Supabase Auth session against the
 * existing platform_users/platform_roles/platform_permissions tables via the already-existing
 * get_my_platform_permissions() RPC — no new permission mechanism. Authentication only: this
 * provider decides whether the console renders at all, not what any individual panel is allowed
 * to do (that stays on each panel's existing service-role path until S3b/S3d).
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function resolve(nextSession: Session | null) {
      if (!active) return;
      setSession(nextSession);

      if (!nextSession) {
        setPermissions([]);
        setStatus("signed_out");
        return;
      }

      // S3b: flips platform_users.status 'invited' -> 'active' on first login, a no-op for
      // everyone else (status != 'invited'). Runs before the permission check below so a
      // freshly-invited admin's very first login lands them straight into the console instead
      // of a stale "not provisioned" until they refresh.
      await supabaseAuth.rpc("activate_platform_user");
      if (!active) return;

      const { data, error } = await supabaseAuth.rpc("get_my_platform_permissions");
      if (!active) return;

      if (error || !data || data.length === 0) {
        setPermissions([]);
        setStatus("signed_in_not_provisioned");
        return;
      }

      setPermissions((data as { permission_key: string }[]).map((row) => row.permission_key));
      setStatus("signed_in_provisioned");
    }

    supabaseAuth.auth.getSession().then(({ data }) => resolve(data.session));

    const { data: subscription } = supabaseAuth.auth.onAuthStateChange((_event, nextSession) => {
      resolve(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabaseAuth.auth.signOut();
  };

  return (
    <AdminAuthContext.Provider value={{ status, session, permissions, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
