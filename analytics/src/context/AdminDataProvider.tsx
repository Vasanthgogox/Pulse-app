import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Organization, AdminContextValue, AccountFilter,
  OrgUser, UsageMetric, FeatureFlag,
  BillingTier, BusinessApplication, AppStatus,
  AuditEntry, AutomatedCheck, BusinessDocument,
} from '@/types/admin';
import { supabase } from '@/lib/supabase';

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminDataProvider');
  return ctx;
}

// ─── Map DB row → Organization ────────────────────────────────────────────────

function mapOrg(row: Record<string, unknown>, members: Record<string, unknown>[]): Organization {
  const status = mapStatus(row.verification_status as string);

  const users: OrgUser[] = members.map((m) => ({
    id:        m.user_id as string,
    name:      (m as Record<string, unknown>).display_name as string ?? 'Unknown',
    email:     (m as Record<string, unknown>).email as string ?? '',
    role:      capitalize((m.role as string) ?? 'member') as OrgUser['role'],
    status:    m.status === 'active' ? 'Active' : 'Suspended',
    lastLogin: null,
  }));

  const usage: UsageMetric[] = [
    {
      id: 'trips', label: 'Trips this month',
      pct: Math.min(100, ((row.trip_count as number) ?? 0) / 2),
      detail: `${(row.trip_count as number) ?? 0} trips`,
      variant: 'default',
    },
  ];

  const flags: FeatureFlag[] = [
    { id: 'load_board',  label: 'Load Board',    description: 'Access to marketplace load board', enabled: true },
    { id: 'analytics',   label: 'Analytics',     description: 'Finance & fleet analytics',         enabled: false },
    { id: 'ai_dispatch', label: 'AI Dispatch',   description: 'AI-powered dispatch suggestions',   enabled: false },
  ];

  return {
    id:                   row.id as string,
    company_name:         (row.name as string) ?? 'Unnamed',
    trade_name:           undefined,
    entity_type:          mapEntityType(row.registration_type as string),
    gstin:                (row.gstin as string) ?? '—',
    pan:                  (row.business_pan as string) ?? '—',
    cin:                  undefined,
    registration_number:  (row.gstin as string) ?? '—',
    registration_date:    (row.created_at as string) ?? '',
    directors:            [],
    registered_address:   (row.address_pincode as string) ? `Pincode: ${row.address_pincode}` : '—',
    pincode:              (row.address_pincode as string) ?? '',
    city:                 '—',
    state:                '—',
    contact_name:         '—',
    contact_email:        '—',
    contact_phone:        (row.phone as string) ?? '—',
    submission_date:      (row.submitted_at as string) ?? (row.created_at as string) ?? '',
    status,
    risk_score:           'Low',
    risk_factors:         [],
    assigned_to:          'System',
    rejection_reason:     undefined,
    rejection_notes:      undefined,
    escalation_reason:    undefined,
    automated_checks:     mapChecks(row),
    documents:            [] as BusinessDocument[],
    audit_trail:          [] as AuditEntry[],
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

function mapChecks(row: Record<string, unknown>): AutomatedCheck[] {
  return [
    {
      id: 'gstin', label: 'GSTIN Registry',
      status: row.gstin ? 'Passed' : 'Pending',
      detail: row.gstin ? `GSTIN: ${row.gstin}` : 'Not submitted',
    },
    {
      id: 'pan', label: 'PAN Verification',
      status: row.business_pan ? 'Passed' : 'Pending',
      detail: row.business_pan ? `PAN: ${row.business_pan}` : 'Not submitted',
    },
    {
      id: 'address', label: 'Address Proof',
      status: row.address_proof_path ? 'Passed' : 'Pending',
      detail: row.address_proof_type as string ?? 'Not uploaded',
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

      const mapped = (orgs ?? []).map((o) => mapOrg(o as Record<string, unknown>, byOrg[o.id] ?? []));
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

  const toggleFeatureFlag = useCallback(async (_orgId: string, _flagId: string) => {
    // Feature flags not yet in DB — no-op for now
  }, []);

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
