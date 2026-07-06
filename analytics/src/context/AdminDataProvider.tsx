import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Organization, AdminContextValue, AccountFilter,
  OrgUser, UsageMetric, FeatureFlag,
  BillingTier, AppStatus,
  AuditEntry, AutomatedCheck, BusinessDocument,
} from '@/types/admin';
import { supabase } from '@/lib/supabase';
import { fetchKycDocumentsByOrg } from '@/lib/kycDocuments';

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminDataProvider');
  return ctx;
}

// ─── Map DB row → Organization ────────────────────────────────────────────────

function ensureRequiredDocuments(orgId: string, docs: BusinessDocument[]): BusinessDocument[] {
  const required: BusinessDocument['type'][] = ['GST Certificate', 'PAN Card', 'Address Proof'];
  const result = [...docs];
  for (const type of required) {
    if (!result.some((d) => d.type === type)) {
      result.push({
        id: `${orgId}-${type.replace(/\s+/g, '_').toLowerCase()}`,
        type,
        file_name: '',
        status: 'Missing',
        uploaded_at: '',
        url: '',
        mime_type: 'application/pdf',
        size_kb: 0,
      });
    }
  }
  return result;
}

function mapOrg(
  row: Record<string, unknown>,
  members: Record<string, unknown>[],
  tripCounts: Record<string, number>,
  featureFlagMap: Record<string, Record<string, boolean>>,
  auditByOrg: Record<string, AuditEntry[]>,
  documents: BusinessDocument[],
): Organization {
  const status = mapStatus(row.verification_status as string);

  const users: OrgUser[] = members.map((m) => ({
    id:        m.user_id as string,
    name:      (m as Record<string, unknown>).display_name as string ?? 'Unknown',
    email:     (m as Record<string, unknown>).email as string ?? '',
    role:      capitalize((m.role as string) ?? 'member') as OrgUser['role'],
    status:    m.status === 'active' ? 'Active' : 'Suspended',
    lastLogin: null,
  }));

  const tripCount = (tripCounts[row.id as string] ?? 0) as number;
  const usagePct = Math.min(100, Math.round((tripCount / 200) * 100));
  const usageVariant: UsageMetric['variant'] = usagePct >= 90 ? 'danger' : usagePct >= 70 ? 'warning' : 'default';

  const usage: UsageMetric[] = [
    {
      id: 'trips', label: 'Trips this month',
      pct: usagePct,
      detail: `${tripCount} trips`,
      variant: usageVariant,
    },
  ];

  const dbFlags = featureFlagMap[row.id as string] ?? {};
  const flags: FeatureFlag[] = [
    { id: 'load_board',  label: 'Load Board',    description: 'Access to marketplace load board', enabled: dbFlags['load_board']  ?? true },
    { id: 'analytics',   label: 'Analytics',     description: 'Finance & fleet analytics',         enabled: dbFlags['analytics']   ?? false },
    { id: 'ai_dispatch', label: 'AI Dispatch',   description: 'AI-powered dispatch suggestions',   enabled: dbFlags['ai_dispatch'] ?? false },
  ];

  return {
    id:                   row.id as string,
    company_name:         (row.name as string) ?? 'Unnamed',
    trade_name:           undefined,
    entity_type:          mapEntityType(row.registration_type as string),
    gstin:                (row.gstin as string) ?? '—',
    pan:                  (row.business_pan as string) ?? '—',
    cin:                  (row.cin as string) ?? undefined,
    registration_number:  (row.gstin as string) ?? '—',
    registration_date:    (row.created_at as string) ?? '',
    directors:            [],
    registered_address:   [row.address_line, row.city, row.state].filter(Boolean).join(', ') || '—',
    pincode:              (row.pincode as string) ?? (row.address_pincode as string) ?? '',
    city:                 (row.city as string) ?? '—',
    state:                (row.state as string) ?? '—',
    contact_name:         members[0] ? ((members[0] as Record<string, unknown>).display_name as string ?? '—') : '—',
    contact_email:        members[0] ? ((members[0] as Record<string, unknown>).email as string ?? '—') : '—',
    contact_phone:        '—',
    submission_date:      (row.submitted_at as string) ?? (row.created_at as string) ?? '',
    status,
    risk_score:           'Low',
    risk_factors:         [],
    assigned_to:          'System',
    rejection_reason:     undefined,
    rejection_notes:      undefined,
    escalation_reason:    undefined,
    automated_checks:     mapChecks(row, documents),
    documents:            ensureRequiredDocuments(row.id as string, documents),
    audit_trail:          auditByOrg[row.id as string] ?? [] as AuditEntry[],
    billing_tier:         'Starter' as BillingTier,
    api_usage:            0,
    users,
    usage_metrics:        usage,
    feature_flags:        flags,
  };
}

function mapStatus(s: string): AppStatus {
  switch (s) {
    case 'pending':   return 'Under Review';
    case 'verified':  return 'Approved';
    case 'rejected':  return 'Rejected';
    case 'unverified':
    default:          return 'Pending';
  }
}

function mapEntityType(r: string): Organization['entity_type'] {
  switch (r) {
    case 'pvt_ltd':    return 'Pvt Ltd';
    case 'llp':        return 'LLP';
    case 'public_ltd': return 'Public Ltd';
    case 'partnership':return 'Partnership';
    default:           return 'Proprietorship';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mapAuditEventType(prev: string | null, next: string): AuditEntry['event_type'] {
  if (!prev) return 'submitted';
  if (next === 'verified') return 'approved';
  if (next === 'rejected') return 'rejected';
  if (next === 'pending')  return 'escalated';
  return 'comment';
}

function auditTitle(prev: string | null, next: string): string {
  if (!prev) return 'Application submitted';
  if (next === 'verified') return 'Approved';
  if (next === 'rejected') return 'Rejected';
  if (next === 'pending')  return 'Escalated for review';
  return `Status changed to ${next}`;
}

function mapChecks(row: Record<string, unknown>, documents: BusinessDocument[]): AutomatedCheck[] {
  const docCheck = (type: BusinessDocument['type']): AutomatedCheck['status'] => {
    const doc = documents.find((d) => d.type === type);
    if (!doc || doc.status === 'Missing') return 'Pending';
    if (doc.status === 'Flagged' || doc.status === 'Expired') return 'Failed';
    if (doc.status === 'Unreadable') return 'Manual Review';
    return 'Passed';
  };

  const addressPassed =
    docCheck('Address Proof') === 'Passed' || !!row.address_proof_path;

  return [
    {
      id: 'gstin',
      label: 'GSTIN Registry',
      status: row.gstin ? 'Passed' : 'Pending',
      detail: row.gstin ? `GSTIN: ${row.gstin}` : 'Not submitted',
    },
    {
      id: 'pan',
      label: 'PAN Verification',
      status: row.business_pan ? 'Passed' : 'Pending',
      detail: row.business_pan ? `PAN: ${row.business_pan}` : 'Not submitted',
    },
    {
      id: 'gst_cert',
      label: 'GST Certificate',
      status: docCheck('GST Certificate'),
      detail:
        documents.find((d) => d.type === 'GST Certificate')?.file_name ?? 'Not uploaded',
    },
    {
      id: 'pan_card',
      label: 'PAN Card',
      status: docCheck('PAN Card'),
      detail: documents.find((d) => d.type === 'PAN Card')?.file_name ?? 'Not uploaded',
    },
    {
      id: 'address',
      label: 'Address Proof',
      status: addressPassed ? 'Passed' : 'Pending',
      detail:
        (row.address_proof_type as string) ??
        documents.find((d) => d.type === 'Address Proof')?.file_name ??
        'Not uploaded',
    },
  ];
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [applications, setApplications] = useState<Organization[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('All Orgs');
  const [searchQuery, setSearchQuery]   = useState('');
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [isActing, setIsActing]         = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all orgs
      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgErr) throw orgErr;

      // Fetch all members (no FK join — user_id has no FK to profiles)
      const { data: members, error: memErr } = await supabase
        .from('organization_members')
        .select('*');

      if (memErr) throw memErr;

      // Fetch profiles for all member user_ids
      const userIds = [...new Set((members ?? []).map(m => m.user_id as string))];
      let profileMap: Record<string, { full_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        for (const p of (profiles ?? [])) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email };
        }
      }

      // Group members by org
      const byOrg: Record<string, Record<string, unknown>[]> = {};
      for (const m of (members ?? [])) {
        const orgId = m.organization_id as string;
        if (!byOrg[orgId]) byOrg[orgId] = [];
        const profile = profileMap[m.user_id as string];
        byOrg[orgId].push({
          ...m,
          display_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
        });
      }

      // Fetch this-month trip counts per org
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: tripRows } = await supabase
        .from('trips')
        .select('organization_id')
        .gte('created_at', monthStart);
      const tripCounts: Record<string, number> = {};
      for (const t of (tripRows ?? [])) {
        const oid = t.organization_id as string;
        tripCounts[oid] = (tripCounts[oid] ?? 0) + 1;
      }

      // Fetch audit logs for all orgs
      const { data: auditRows } = await supabase
        .from('verification_audit_logs')
        .select('*')
        .order('created_at', { ascending: true });
      const auditByOrg: Record<string, AuditEntry[]> = {};
      for (const a of (auditRows ?? [])) {
        const oid = a.org_id as string;
        if (!auditByOrg[oid]) auditByOrg[oid] = [];
        auditByOrg[oid].push({
          id:         a.id as string,
          timestamp:  a.created_at as string,
          actor:      (a.changed_by as string) ?? 'system',
          actor_type: a.changed_by ? 'admin' : 'system',
          event_type: mapAuditEventType(a.previous_status as string | null, a.new_status as string),
          title:      auditTitle(a.previous_status as string | null, a.new_status as string),
          detail:     (a.notes as string) ?? undefined,
        });
      }

      // Fetch feature flags for all orgs
      const { data: flagRows } = await supabase
        .from('org_feature_flags')
        .select('org_id, flag_id, enabled');
      const featureFlagMap: Record<string, Record<string, boolean>> = {};
      for (const f of (flagRows ?? [])) {
        const oid = f.org_id as string;
        if (!featureFlagMap[oid]) featureFlagMap[oid] = {};
        featureFlagMap[oid][f.flag_id as string] = f.enabled as boolean;
      }

      const docsByOrg = await fetchKycDocumentsByOrg();

      const mapped = (orgs ?? []).map((o) =>
        mapOrg(
          o as Record<string, unknown>,
          byOrg[o.id] ?? [],
          tripCounts,
          featureFlagMap,
          auditByOrg,
          docsByOrg[o.id as string] ?? [],
        ),
      );
      setApplications(mapped);
      if (mapped.length > 0 && !selectedId) setSelectedId(mapped[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadData(); }, []);

  const selectedApp = applications.find(a => a.id === selectedId) ?? null;

  const approveApp = useCallback(async (id: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ verification_status: 'verified', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const rejectApp = useCallback(async (id: string, reason: string, notes: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          verification_status: 'rejected',
          rejection_reasons: [reason, notes].filter(Boolean),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const escalateApp = useCallback(async (id: string, _reason: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ verification_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const suspendUser = useCallback(async (_orgId: string, userId: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase
        .from('organization_members')
        .update({ status: 'suspended' })
        .eq('user_id', userId);
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const toggleFeatureFlag = useCallback(async (orgId: string, flagId: string) => {
    const org = applications.find(a => a.id === orgId);
    if (!org) return;
    const flag = org.feature_flags.find(f => f.id === flagId);
    if (!flag) return;
    const newEnabled = !flag.enabled;
    // Optimistic update
    setApplications(prev => prev.map(a =>
      a.id !== orgId ? a : {
        ...a,
        feature_flags: a.feature_flags.map(f => f.id === flagId ? { ...f, enabled: newEnabled } : f),
      },
    ));
    await supabase
      .from('org_feature_flags')
      .upsert({ org_id: orgId, flag_id: flagId, enabled: newEnabled, updated_at: new Date().toISOString() },
        { onConflict: 'org_id,flag_id' });
  }, [applications]);

  const value: AdminContextValue = {
    applications,
    selectedId,
    selectedApp,
    selectedOrg: selectedApp,
    selectApplication: setSelectedId,
    setSelectedOrgById: setSelectedId,
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refreshData: loadData,
    isActing,
    approveApp,
    rejectApp,
    escalateApp,
    suspendUser,
    toggleFeatureFlag,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
