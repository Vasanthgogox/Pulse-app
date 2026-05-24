/**
 * ActiveWorkspaceContext — manages multi-workspace state.
 *
 * Loads all workspaces the authenticated user belongs to via
 * organization_members join, persists the active selection in AsyncStorage,
 * and keeps OrganizationContext in sync when the workspace switches.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import type { CurrentOrganization } from '@/types/organization';
import type { ActiveWorkspaceState, Workspace, WorkspaceMember } from '@/types/workspace';

// ─────────────────────────────────────────────────────────────────────────────
// Storage key
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pulse:active_workspace_id';

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row type
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceMemberRow {
  role: WorkspaceMember['role'];
  status: string;
  joined_at: string;
  organizations: {
    id: string;
    name: string | null;
    slug: string | null;
    logo_url: string | null;
    operating_model: string | null;
    address_line: string | null;
    city: string | null;
    state: string | null;
    zone: string | null;
    business_pan: string | null;
    gstin: string | null;
    cin: string | null;
    verification_status: string | null;
    verified_at: string | null;
    kyc_rejected_reason: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper
// ─────────────────────────────────────────────────────────────────────────────

function mapRowToWorkspace(
  row: WorkspaceMemberRow,
): { workspace: Workspace; role: WorkspaceMember['role'] } | null {
  const o = row.organizations;
  if (!o) return null;

  const operatingModel =
    o.operating_model === 'ASSET_BASED' ||
    o.operating_model === 'NON_ASSET' ||
    o.operating_model === 'HYBRID'
      ? (o.operating_model as Workspace['operating_model'])
      : 'HYBRID';

  const verificationStatus =
    o.verification_status === 'pending' ||
    o.verification_status === 'verified' ||
    o.verification_status === 'rejected'
      ? (o.verification_status as Workspace['verification_status'])
      : 'unverified';

  return {
    workspace: {
      id: o.id,
      name: o.name ?? '',
      slug: o.slug ?? null,
      logo_url: o.logo_url ?? null,
      operating_model: operatingModel,
      address_line: o.address_line ?? null,
      city: o.city ?? null,
      state: o.state ?? null,
      zone: o.zone ?? null,
      business_pan: o.business_pan ?? null,
      gstin: o.gstin ?? null,
      cin: o.cin ?? null,
      verification_status: verificationStatus,
      verified_at: o.verified_at ?? null,
      kyc_rejected_reason: o.kyc_rejected_reason ?? null,
    },
    role: row.role,
  };
}

function workspaceToCurrentOrganization(
  workspace: Workspace,
): CurrentOrganization {
  return {
    id: workspace.id,
    name: workspace.name,
    logo_url: workspace.logo_url ?? null,
    operatingModel: workspace.operating_model,
    sourcingStrategy: 'MARKETPLACE_FIRST',
    marketplaceEnabled: true,
    capabilities: {
      canPostIndent: true,
      canBid: true,
      canManageAssets: true,
      canUseMarketplace: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ActiveWorkspaceContext = createContext<ActiveWorkspaceState | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { setCurrentOrganization } = useOrganization();

  // Capture setter in a ref so loadWorkspaces never needs it as a dep.
  // useState setters are stable, but expressing it as a dep causes unnecessary
  // callback recreation if OrganizationProvider ever remounts.
  const setCurrentOrganizationRef = useRef(setCurrentOrganization);
  setCurrentOrganizationRef.current = setCurrentOrganization;

  // Stable primitive: only re-triggers the load effect when the uid string changes.
  const userId = user?.uid ?? null;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [memberRole, setMemberRole] = useState<WorkspaceMember['role'] | null>(null);
  const [roleMap, setRoleMap] = useState<Map<string, WorkspaceMember['role']>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const sessionSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const userRef = useRef(user);
  userRef.current = user;

  // ── Load workspaces from DB ─────────────────────────────────────────────────

  const loadWorkspaces = useCallback(
    async (signal: { cancelled: boolean }) => {
      const stale = () => signal.cancelled;
      const currentUser = userRef.current;

      if (!currentUser) {
        if (!stale()) {
          setWorkspaces([]);
          setActiveWorkspace(null);
          setMemberRole(null);
          setRoleMap(new Map());
          setCurrentOrganizationRef.current(null);
          setIsLoading(false);
        }
        return;
      }

      if (!stale()) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const { data, error: dbError } = await supabase()
          .from('organization_members')
          .select(`
            role,
            status,
            joined_at,
            organizations (
              id, name, slug, logo_url, operating_model,
              address_line, city, state, zone,
              business_pan, gstin, cin,
              verification_status, verified_at, kyc_rejected_reason
            )
          `)
          .eq('user_id', currentUser.uid)
          .eq('status', 'active');

        if (stale()) return;

        if (dbError) {
          setError(new Error(dbError.message));
          setIsLoading(false);
          return;
        }

        const rows = (data ?? []) as unknown as WorkspaceMemberRow[];
        const mapped = rows
          .map(mapRowToWorkspace)
          .filter((r): r is NonNullable<ReturnType<typeof mapRowToWorkspace>> => r !== null);

        const loadedWorkspaces = mapped.map((m) => m.workspace);
        const newRoleMap = new Map<string, WorkspaceMember['role']>(
          mapped.map((m) => [m.workspace.id, m.role]),
        );

        if (stale()) return;

        setWorkspaces(loadedWorkspaces);
        setRoleMap(newRoleMap);

        // Read persisted workspace ID, fall back to first
        let targetWorkspace: Workspace | null = loadedWorkspaces[0] ?? null;
        try {
          const persisted = await AsyncStorage.getItem(STORAGE_KEY);
          if (persisted) {
            const found = loadedWorkspaces.find((w) => w.id === persisted);
            if (found) targetWorkspace = found;
          }
        } catch {
          // AsyncStorage read failure — use first workspace
        }

        if (stale()) return;

        setActiveWorkspace(targetWorkspace);
        setMemberRole(targetWorkspace ? (newRoleMap.get(targetWorkspace.id) ?? null) : null);
        setCurrentOrganization(
          targetWorkspace ? workspaceToCurrentOrganization(targetWorkspace) : null,
        );
      } catch (e) {
        if (!stale()) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!stale()) {
          setIsLoading(false);
        }
      }
    },
    [], // stable: accesses user via userRef, setCurrentOrganization via setCurrentOrganizationRef
  );

  // ── Re-run on user identity change only ────────────────────────────────────
  // Depend on userId (primitive string) not user (object) to prevent
  // re-firing when the auth object reference changes but the uid is the same.

  useEffect(() => {
    const signal = { cancelled: false };
    sessionSignalRef.current = signal;
    void loadWorkspaces(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [userId, loadWorkspaces]); // loadWorkspaces is now stable → fires only when userId changes

  // ── Public actions ──────────────────────────────────────────────────────────

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const found = workspaces.find((w) => w.id === workspaceId);
      if (!found) return;
      setActiveWorkspace(found);
      setMemberRole(roleMap.get(workspaceId) ?? null);
      setCurrentOrganizationRef.current(workspaceToCurrentOrganization(found));
      try {
        await AsyncStorage.setItem(STORAGE_KEY, workspaceId);
      } catch {
        // Persist failure is non-fatal
      }
    },
    [workspaces, roleMap], // setCurrentOrganization removed — accessed via stable ref
  );

  const refresh = useCallback(async () => {
    await loadWorkspaces(sessionSignalRef.current);
  }, [loadWorkspaces]);

  const canManageWorkspace =
    memberRole === 'owner' || memberRole === 'admin';

  const value: ActiveWorkspaceState = {
    workspaces,
    activeWorkspace,
    memberRole,
    isLoading,
    error,
    switchWorkspace,
    refresh,
    canManageWorkspace,
  };

  return (
    <ActiveWorkspaceContext.Provider value={value}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Must be used inside ActiveWorkspaceProvider.
 * Throws if the provider is missing — helps catch wiring mistakes early.
 */
export function useActiveWorkspace(): ActiveWorkspaceState {
  const ctx = useContext(ActiveWorkspaceContext);
  if (ctx === undefined) {
    throw new Error('useActiveWorkspace must be used within an ActiveWorkspaceProvider');
  }
  return ctx;
}

/**
 * Same as useActiveWorkspace but returns undefined when used outside the provider.
 * Use in components that may render in both provider and non-provider trees.
 */
export function useOptionalActiveWorkspace(): ActiveWorkspaceState | undefined {
  return useContext(ActiveWorkspaceContext);
}
