/**
 * Load-chain loop guard — stops a load being sub-contracted back to an org that
 * already sits upstream in its own custody chain.
 *
 * Observed case: MAX (cargo owner) → Lenovo company (broker) → ABI Logistics
 * (carrier). ABI's supplier list offered MAX back as a carrier, which would
 * have billed MAX to haul MAX's own freight.
 *
 * Why a single field check is not enough: `indents` has no client_id, only a
 * free-text `client_name`, and the looping org can be two or more hops upstream
 * — so it is NOT the assigning org's own client. Comparing "supplier vs my
 * client" tests MAX against Lenovo and passes. The only reliable signal is the
 * load's full ancestor org set, resolved by get_load_chain_ancestor_orgs.
 *
 * Decision rule: block supplier S when S.linked_organization_id is in
 * (ancestors ∪ {self}). Suppliers with no linked org are offline/manual records
 * that carry no org identity and can never close a loop, so they always pass.
 *
 * Failure policy: fail OPEN on resolution errors, fail CLOSED only on a
 * confirmed match. A resolver outage must not halt all dispatch; the DB trigger
 * in 20270119000000_load_chain_loop_guard.sql is the real backstop.
 */
import { supabase } from '@/lib/supabase';

/** Ancestor org of a load, with distance from the indent owner (hop 0 = owner). */
export type LoadChainAncestor = {
  orgId: string;
  hop: number;
};

/** Minimal supplier shape this guard needs — matches SupplierRow's relevant fields. */
export type ChainCheckableSupplier = {
  id: string;
  name?: string | null;
  linked_organization_id?: string | null;
};

export type ChainBlockReason = {
  /** Why this supplier cannot take the load — safe to show to the operator. */
  message: string;
  /** 'self' = the assigning org; 'client' = direct client; 'upstream' = further up. */
  kind: 'self' | 'client' | 'upstream';
};

/** After a confirmed "function missing", stop calling it for the rest of the session. */
let ancestorRpcUnavailable = false;

/** PostgREST/Postgres shapes meaning the RPC is absent from this deployment. */
function isMissingAncestorRpc(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '').toUpperCase();
  if (code === '42883' || code === 'PGRST202') return true;
  if (err.status === 404) return true;
  const m = String(err.message ?? '').toLowerCase();
  if (m.includes('schema cache')) return true;
  if (m.includes('could not find the function')) return true;
  if (m.includes('get_load_chain_ancestor_orgs') && m.includes('does not exist')) {
    return true;
  }
  return false;
}

/**
 * Orgs already upstream of this load. Empty array means "unknown" — callers
 * must treat that as no restriction, never as "nothing upstream".
 */
export async function getLoadChainAncestors(
  indentId: string | null | undefined,
): Promise<{ error: Error | null; ancestors: LoadChainAncestor[] }> {
  const id = String(indentId ?? '').trim();
  if (!id) return { error: null, ancestors: [] };
  if (ancestorRpcUnavailable) return { error: null, ancestors: [] };

  try {
    const { data, error } = await supabase().rpc('get_load_chain_ancestor_orgs', {
      p_indent_id: id,
    });

    if (error) {
      if (isMissingAncestorRpc(error)) {
        ancestorRpcUnavailable = true;
        if (__DEV__) {
          console.warn(
            '[loadChainGuard] ancestor RPC missing; loop guard relies on DB trigger only',
          );
        }
        return { error: null, ancestors: [] };
      }
      return { error: new Error(error.message), ancestors: [] };
    }

    const rows = (data ?? []) as { org_id: string | null; hop: number | null }[];
    const ancestors = rows
      .map((r) => ({
        orgId: String(r.org_id ?? '').trim(),
        hop: Number(r.hop ?? 0),
      }))
      .filter((a) => a.orgId.length > 0);

    return { error: null, ancestors };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      ancestors: [],
    };
  }
}

/**
 * Pure decision function — no I/O, so the UI can call it per row while
 * rendering. Returns null when the supplier is allowed.
 */
export function getChainBlockReason(
  supplier: ChainCheckableSupplier,
  ancestors: LoadChainAncestor[],
  selfOrgId: string | null | undefined,
): ChainBlockReason | null {
  const linkedOrg = String(supplier.linked_organization_id ?? '').trim();
  // Offline/manual supplier: no org identity, cannot close a loop.
  if (!linkedOrg) return null;

  const label = String(supplier.name ?? '').trim() || 'This partner';

  const self = String(selfOrgId ?? '').trim();
  if (self && linkedOrg === self) {
    return {
      kind: 'self',
      message: `${label} is your own organisation and cannot be your supplier on this load.`,
    };
  }

  const match = ancestors.find((a) => a.orgId === linkedOrg);
  if (!match) return null;

  // hop 0 is the org that awarded this load out — the assigner's direct client.
  if (match.hop === 0) {
    return {
      kind: 'client',
      message: `${label} gave you this load. Assigning it back would bill your own client.`,
    };
  }

  return {
    kind: 'upstream',
    message: `${label} is the cargo owner on this load and has already handled it upstream. Assigning it back would create a billing loop.`,
  };
}

/**
 * Write-path guard. Resolves the chain and throws on a confirmed loop.
 * Resolution failures are swallowed (fail-open) — the DB trigger still holds.
 */
export async function assertNoChainLoop(params: {
  indentId: string | null | undefined;
  supplierId: string | null | undefined;
  selfOrgId?: string | null;
}): Promise<void> {
  const supplierId = String(params.supplierId ?? '').trim();
  const indentId = String(params.indentId ?? '').trim();
  // Asset trips (no supplier) and trips with no provenance cannot loop.
  if (!supplierId || !indentId) return;

  let supplier: ChainCheckableSupplier | null = null;
  try {
    const { data, error } = await supabase()
      .from('suppliers')
      .select('id, name, linked_organization_id')
      .eq('id', supplierId)
      .maybeSingle();
    if (error || !data) return; // cannot verify → let the DB trigger decide.
    supplier = data as ChainCheckableSupplier;
  } catch {
    return;
  }

  // Offline supplier: skip the ancestor round-trip entirely.
  if (!String(supplier.linked_organization_id ?? '').trim()) return;

  const { error, ancestors } = await getLoadChainAncestors(indentId);
  if (error || ancestors.length === 0) return; // unknown chain → fail open.

  const reason = getChainBlockReason(supplier, ancestors, params.selfOrgId);
  if (reason) throw new Error(reason.message);
}

/**
 * Write-path guard for flows that name a sub-carrier by ORG id rather than by
 * supplier row (e.g. trip_subcontracts). Resolves the parent trip's provenance
 * itself, so callers only need the trip id.
 */
export async function assertNoChainLoopForOrg(params: {
  parentTripId: string | null | undefined;
  subSupplierOrgId: string | null | undefined;
  selfOrgId?: string | null;
}): Promise<void> {
  const orgId = String(params.subSupplierOrgId ?? '').trim();
  const tripId = String(params.parentTripId ?? '').trim();
  // Off-platform sub-carrier (name/phone only) carries no org identity.
  if (!orgId || !tripId) return;

  const self = String(params.selfOrgId ?? '').trim();
  if (self && orgId === self) {
    throw new Error(
      'Your own organisation cannot be the sub-carrier on this load.',
    );
  }

  let indentId = '';
  try {
    const { data, error } = await supabase()
      .from('trips')
      .select('source_indent_id, indent_id')
      .eq('id', tripId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as { source_indent_id?: string | null; indent_id?: string | null };
    indentId = String(row.source_indent_id ?? row.indent_id ?? '').trim();
  } catch {
    return;
  }
  if (!indentId) return; // no provenance → nothing to compare against.

  const { error, ancestors } = await getLoadChainAncestors(indentId);
  if (error || ancestors.length === 0) return; // unknown chain → fail open.

  const match = ancestors.find((a) => a.orgId === orgId);
  if (!match) return;

  throw new Error(
    match.hop === 0
      ? 'This partner gave you the load. Sub-contracting it back would bill your own client.'
      : 'This partner is the cargo owner on this load and has already handled it upstream. Sub-contracting it back would create a billing loop.',
  );
}

/** Human-readable text for the DB trigger's error, for UI error surfaces. */
export function isChainLoopDbError(message: string | null | undefined): boolean {
  return String(message ?? '').includes('load_chain_loop');
}
