/**
 * Shared-ledger notifications service.
 * Additive to salary-request notifications; fails soft if backend contract is not deployed yet.
 */
import { supabase } from '@/lib/supabase';
import { getClientsByOrganization } from '@/features/clients/services/clients.service';
import { getSuppliersByOrganization } from '@/features/suppliers/services/suppliers.service';
import { getTransactionsByOrganization, type LedgerRow } from '@/features/finance/services/finance.service';
import {
  getDisputesForPartner,
  getDisputesReceived,
  getSharedLedgerEntriesForPartner,
} from '@/services/sharedLedgerService';

export type SharedLedgerNotificationEventType =
  | 'dispute_received'
  | 'dispute_status_changed'
  | 'pending_partner_followup'
  | 'mismatch_detected'
  | 'partner_only_ghost';

export type SharedLedgerNotificationStatus = 'open' | 'read' | 'handled' | 'resolved';

export interface SharedLedgerNotificationRow {
  id: string;
  organization_id: string;
  partner_org_id: string | null;
  partner_key: string | null;
  trip_id: string | null;
  transaction_id: string | null;
  source_dispute_id: string | null;
  event_type: SharedLedgerNotificationEventType;
  status: SharedLedgerNotificationStatus;
  title: string;
  subtitle: string | null;
  amount_meta: number | null;
  payload_json: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  read_at: string | null;
  handled_at: string | null;
}

export interface SharedLedgerNotificationCount {
  actionableCount: number;
}

const TABLE_SELECT =
  'id, organization_id, partner_org_id, partner_key, trip_id, transaction_id, source_dispute_id, event_type, status, title, subtitle, amount_meta, payload_json, created_at, updated_at, read_at, handled_at';

function rpcOrTableUnavailable(message: string): boolean {
  return /could not find the function|does not exist|relation .* does not exist|schema cache/i.test(
    message,
  );
}

function toRow(raw: Record<string, unknown>): SharedLedgerNotificationRow {
  const payload = raw.payload_json;
  return {
    id: String(raw.id ?? ''),
    organization_id: String(raw.organization_id ?? ''),
    partner_org_id:
      raw.partner_org_id == null ? null : String(raw.partner_org_id),
    partner_key: raw.partner_key == null ? null : String(raw.partner_key),
    trip_id: raw.trip_id == null ? null : String(raw.trip_id),
    transaction_id:
      raw.transaction_id == null ? null : String(raw.transaction_id),
    source_dispute_id:
      raw.source_dispute_id == null ? null : String(raw.source_dispute_id),
    event_type:
      (String(raw.event_type ?? 'mismatch_detected') as SharedLedgerNotificationEventType),
    status: (String(raw.status ?? 'open') as SharedLedgerNotificationStatus),
    title: String(raw.title ?? 'Shared ledger update'),
    subtitle: raw.subtitle == null ? null : String(raw.subtitle),
    amount_meta:
      raw.amount_meta == null ? null : Number(raw.amount_meta ?? 0),
    payload_json:
      payload != null && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {},
    created_at: String(raw.created_at ?? ''),
    updated_at: raw.updated_at == null ? null : String(raw.updated_at),
    read_at: raw.read_at == null ? null : String(raw.read_at),
    handled_at: raw.handled_at == null ? null : String(raw.handled_at),
  };
}

interface IntegratedPartnerRef {
  id: string;
  name: string;
  entityType: 'CLIENT' | 'SUPPLIER';
  contactType: 'client' | 'supplier';
  partnerOrgId: string | null;
}

function localAmountAbs(tx: LedgerRow): number {
  return Math.abs(Number(tx.amount_in ?? 0) + Number(tx.amount_out ?? 0));
}

function normalizeDay(iso: string | null | undefined): string {
  const raw = String(iso ?? '').trim();
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function matchesAmountAndDate(
  local: LedgerRow,
  partnerAbsAmount: number,
  partnerDate: string,
): boolean {
  if (Math.abs(localAmountAbs(local) - partnerAbsAmount) >= 0.5) return false;
  const ld = normalizeDay(local.transaction_date);
  const pd = normalizeDay(partnerDate);
  if (!ld || !pd) return true;
  const ldt = new Date(ld).getTime();
  const pdt = new Date(pd).getTime();
  if (!Number.isFinite(ldt) || !Number.isFinite(pdt)) return ld === pd;
  const delta = Math.abs(ldt - pdt) / (24 * 60 * 60 * 1000);
  return delta <= 2;
}

async function getDerivedSharedLedgerNotifications(
  organizationId: string,
): Promise<SharedLedgerNotificationRow[]> {
  const [{ clients }, { suppliers }, txRes, disputesReceivedRes] = await Promise.all([
    getClientsByOrganization(organizationId),
    getSuppliersByOrganization(organizationId),
    getTransactionsByOrganization(organizationId),
    getDisputesReceived(organizationId),
  ]);

  const localTxs = txRes.error ? [] : txRes.transactions ?? [];
  const disputesReceived = disputesReceivedRes.error
    ? []
    : disputesReceivedRes.disputes ?? [];

  const partners: IntegratedPartnerRef[] = [];
  for (const c of clients) {
    if (!(c.is_integrated || c.linked_organization_id)) continue;
    partners.push({
      id: c.id,
      name: (c.name ?? '').trim() || 'Integrated client',
      entityType: 'CLIENT',
      contactType: 'client',
      partnerOrgId: c.linked_organization_id ?? null,
    });
  }
  for (const s of suppliers) {
    const integrated =
      s.supplier_type === 'integrated' || s.linked_organization_id != null;
    if (!integrated) continue;
    const displayName =
      (s.name ?? '').trim() ||
      (s.company_name ?? '').trim() ||
      (s.contact_person ?? '').trim() ||
      'Integrated supplier';
    partners.push({
      id: s.id,
      name: displayName,
      entityType: 'SUPPLIER',
      contactType: 'supplier',
      partnerOrgId: s.linked_organization_id ?? null,
    });
  }

  const out = new Map<string, SharedLedgerNotificationRow>();
  const nowIso = new Date().toISOString();
  const add = (row: SharedLedgerNotificationRow) => {
    if (!out.has(row.id)) out.set(row.id, row);
  };

  await Promise.all(
    partners.map(async (partner) => {
      const [sharedRes, raisedRes] = await Promise.all([
        getSharedLedgerEntriesForPartner(organizationId, partner.id),
        partner.partnerOrgId
          ? getDisputesForPartner(organizationId, partner.partnerOrgId)
          : Promise.resolve({ error: null, disputes: [] }),
      ]);

      const sharedEntries = sharedRes.error ? [] : sharedRes.entries ?? [];
      const localPartnerTxs = localTxs.filter(
        (t) =>
          t.contact_type === partner.contactType &&
          String(t.contact_id ?? '').trim() === partner.id,
      );

      const unmatchedLocalRecent = localPartnerTxs.filter((tx) => {
        const localDate = normalizeDay(tx.transaction_date);
        if (!localDate) return false;
        const daysOld =
          (Date.now() - new Date(localDate).getTime()) / (24 * 60 * 60 * 1000);
        if (!Number.isFinite(daysOld) || daysOld > 7) return false;
        return !sharedEntries.some((se) =>
          matchesAmountAndDate(tx, Math.abs(Number(se.amount ?? 0)), se.transaction_date),
        );
      });

      if (unmatchedLocalRecent.length > 0) {
        const sample = unmatchedLocalRecent[0];
        add({
          id: `derived:pending_partner_followup:${partner.id}:${sample.id}`,
          organization_id: organizationId,
          partner_org_id: partner.partnerOrgId,
          partner_key: partner.id,
          trip_id: sample.trip_id ?? null,
          transaction_id: sample.id,
          source_dispute_id: null,
          event_type: 'pending_partner_followup',
          status: 'open',
          title: `${partner.name} has not reflected your recent shared entry`,
          subtitle: `Follow up for ${partner.entityType.toLowerCase()} reconciliation.`,
          amount_meta: localAmountAbs(sample),
          payload_json: {
            entity_type: partner.entityType,
            entity_id: partner.id,
            partner_name: partner.name,
            trip_id: sample.trip_id ?? null,
            cta_kind: "follow_up",
          },
          created_at: sample.created_at || nowIso,
          updated_at: null,
          read_at: null,
          handled_at: null,
        });
      }

      for (const e of sharedEntries) {
        const eAbs = Math.abs(Number(e.amount ?? 0));
        const matched = localPartnerTxs.some((tx) =>
          matchesAmountAndDate(tx, eAbs, e.transaction_date),
        );
        if (matched) continue;
        add({
          id: `derived:partner_only_ghost:${partner.id}:${e.id}`,
          organization_id: organizationId,
          partner_org_id: partner.partnerOrgId,
          partner_key: partner.id,
          trip_id: e.reference_id ?? null,
          transaction_id: e.id,
          source_dispute_id: null,
          event_type: 'partner_only_ghost',
          status: 'open',
          title: `${partner.name} posted a shared entry not found in your book`,
          subtitle: 'Review and merge/fix this shared-ledger record.',
          amount_meta: eAbs,
          payload_json: {
            entity_type: partner.entityType,
            entity_id: partner.id,
            partner_name: partner.name,
            trip_id: e.reference_id ?? null,
            transaction_id: e.id,
            cta_kind: "fix_records",
          },
          created_at: e.transaction_date || nowIso,
          updated_at: null,
          read_at: null,
          handled_at: null,
        });
      }

      const localGross = localPartnerTxs.reduce((s, tx) => s + localAmountAbs(tx), 0);
      const partnerGross = sharedEntries.reduce(
        (s, e) => s + Math.abs(Number(e.amount ?? 0)),
        0,
      );
      if (localGross > 0 && Math.abs(localGross - partnerGross) >= 0.5) {
        add({
          id: `derived:mismatch_detected:${partner.id}`,
          organization_id: organizationId,
          partner_org_id: partner.partnerOrgId,
          partner_key: partner.id,
          trip_id: null,
          transaction_id: null,
          source_dispute_id: null,
          event_type: 'mismatch_detected',
          status: 'open',
          title: `Mismatch detected with ${partner.name}`,
          subtitle: `Your total ${localGross.toLocaleString('en-IN')} vs partner ${partnerGross.toLocaleString('en-IN')}.`,
          amount_meta: Math.abs(localGross - partnerGross),
          payload_json: {
            entity_type: partner.entityType,
            entity_id: partner.id,
            partner_name: partner.name,
            cta_kind: "compare_now",
          },
          created_at: nowIso,
          updated_at: null,
          read_at: null,
          handled_at: null,
        });
      }

      const raisedDisputes = raisedRes.error ? [] : raisedRes.disputes ?? [];
      for (const d of raisedDisputes) {
        if (d.status !== 'RESOLVED') continue;
        add({
          id: `derived:dispute_status_changed:${d.id}`,
          organization_id: organizationId,
          partner_org_id: partner.partnerOrgId,
          partner_key: partner.id,
          trip_id: d.transaction_id,
          transaction_id: d.transaction_id,
          source_dispute_id: d.id,
          event_type: 'dispute_status_changed',
          status: 'resolved',
          title: `Dispute updated with ${partner.name}`,
          subtitle: 'A dispute you raised has been resolved.',
          amount_meta: null,
          payload_json: {
            entity_type: partner.entityType,
            entity_id: partner.id,
            partner_name: partner.name,
            trip_id: d.transaction_id,
            source_dispute_id: d.id,
            cta_kind: "view_status",
          },
          created_at: nowIso,
          updated_at: null,
          read_at: nowIso,
          handled_at: nowIso,
        });
      }
    }),
  );

  for (const d of disputesReceived) {
    if (d.status !== 'OPEN') continue;
    const partner =
      partners.find((p) => p.partnerOrgId === d.raised_by_org_id) ?? null;
    add({
      id: `derived:dispute_received:${d.id}`,
      organization_id: organizationId,
      partner_org_id: d.raised_by_org_id,
      partner_key: partner?.id ?? null,
      trip_id: d.transaction_id,
      transaction_id: d.transaction_id,
      source_dispute_id: d.id,
      event_type: 'dispute_received',
      status: 'open',
      title: partner
        ? `${partner.name} raised a dispute`
        : 'A partner raised a dispute',
      subtitle: 'Review and accept/decline this dispute.',
      amount_meta: null,
      payload_json: {
        entity_type: partner?.entityType ?? null,
        entity_id: partner?.id ?? null,
        trip_id: d.transaction_id,
        source_dispute_id: d.id,
        cta_kind: "review_dispute",
      },
      created_at: nowIso,
      updated_at: null,
      read_at: null,
      handled_at: null,
    });
  }

  return Array.from(out.values()).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
}

export async function getSharedLedgerNotifications(
  organizationId: string,
  statusFilter: 'all' | 'action_required' | 'history' = 'all',
): Promise<{
  error: Error | null;
  notifications: SharedLedgerNotificationRow[];
  unavailable?: boolean;
}> {
  const { data, error } = await supabase().rpc('get_shared_ledger_notifications', {
    org_id: organizationId,
    status_filter: statusFilter,
  });
  if (!error) {
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    return { error: null, notifications: rows.map(toRow) };
  }

  if (!rpcOrTableUnavailable(error.message)) {
    return { error: new Error(error.message), notifications: [] };
  }

  // Fallback to direct table read when RPC is not deployed yet.
  let query = supabase()
    .from('shared_ledger_notifications')
    .select(TABLE_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (statusFilter === 'action_required') {
    query = query.eq('status', 'open');
  } else if (statusFilter === 'history') {
    query = query.in('status', ['read', 'handled', 'resolved']);
  }

  const { data: tableRows, error: tableError } = await query;
  if (tableError) {
    if (rpcOrTableUnavailable(tableError.message)) {
      const derived = await getDerivedSharedLedgerNotifications(organizationId);
      const filtered =
        statusFilter === 'action_required'
          ? derived.filter((r) => r.status === 'open')
          : statusFilter === 'history'
            ? derived.filter((r) => r.status !== 'open')
            : derived;
      return {
        error: null,
        notifications: filtered,
        unavailable: derived.length === 0,
      };
    }
    return { error: new Error(tableError.message), notifications: [] };
  }

  const rows = (tableRows ?? []) as Array<Record<string, unknown>>;
  return { error: null, notifications: rows.map(toRow) };
}

export async function getSharedLedgerNotificationsCount(
  organizationId: string,
): Promise<{
  error: Error | null;
  count: SharedLedgerNotificationCount;
  unavailable?: boolean;
}> {
  const { data, error } = await supabase().rpc('get_shared_ledger_notifications_count', {
    org_id: organizationId,
  });
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    const first = (rows[0] ?? {}) as Record<string, unknown>;
    const actionable = Number(
      first.actionable_count ?? first.count ?? 0,
    );
    return { error: null, count: { actionableCount: Number.isFinite(actionable) ? actionable : 0 } };
  }

  if (!rpcOrTableUnavailable(error.message)) {
    return { error: new Error(error.message), count: { actionableCount: 0 } };
  }

  // Fallback to direct table count for open events.
  const { count, error: tableError } = await supabase()
    .from('shared_ledger_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'open');

  if (tableError) {
    if (rpcOrTableUnavailable(tableError.message)) {
      const derived = await getDerivedSharedLedgerNotifications(organizationId);
      const actionable = derived.filter((r) => r.status === 'open').length;
      return {
        error: null,
        count: { actionableCount: actionable },
        unavailable: derived.length === 0,
      };
    }
    return { error: new Error(tableError.message), count: { actionableCount: 0 } };
  }

  return { error: null, count: { actionableCount: Number(count ?? 0) } };
}

export async function markSharedLedgerNotificationRead(
  notificationId: string,
  organizationId: string,
): Promise<{ error: Error | null; unavailable?: boolean }> {
  const { error } = await supabase().rpc('mark_shared_ledger_notification_read', {
    p_id: notificationId,
    p_org_id: organizationId,
  });
  if (!error) return { error: null };

  if (!rpcOrTableUnavailable(error.message)) {
    return { error: new Error(error.message) };
  }

  const { error: tableError } = await supabase()
    .from('shared_ledger_notifications')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('organization_id', organizationId)
    .eq('status', 'open');
  if (tableError) {
    if (rpcOrTableUnavailable(tableError.message)) {
      return { error: null, unavailable: true };
    }
    return { error: new Error(tableError.message) };
  }
  return { error: null };
}

export async function markSharedLedgerNotificationHandled(
  notificationId: string,
  organizationId: string,
): Promise<{ error: Error | null; unavailable?: boolean }> {
  const { error } = await supabase().rpc('mark_shared_ledger_notification_handled', {
    p_id: notificationId,
    p_org_id: organizationId,
  });
  if (!error) return { error: null };

  if (!rpcOrTableUnavailable(error.message)) {
    return { error: new Error(error.message) };
  }

  const { error: tableError } = await supabase()
    .from('shared_ledger_notifications')
    .update({
      status: 'handled',
      handled_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('organization_id', organizationId)
    .in('status', ['open', 'read']);
  if (tableError) {
    if (rpcOrTableUnavailable(tableError.message)) {
      return { error: null, unavailable: true };
    }
    return { error: new Error(tableError.message) };
  }
  return { error: null };
}
