import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Organization, AdminContextValue,
  OrgUser, UsageMetric, FeatureFlag,
  BillingTier, AppStatus, CheckStatus,
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

function mapOrg(
  row: Record<string, unknown>,
  members: Record<string, unknown>[],
  tripCounts: Record<string, number>,
  featureFlagMap: Record<string, Record<string, boolean>>,
  auditByOrg: Record<string, AuditEntry[]>,
  docsByOrg: Record<string, BusinessDocument[]>,
  jobsByOrg: Record<string, Record<string, unknown>>,
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
    registration_date:    (row.created_at as string) ?? '',
    directors:            [],
    registered_address:   [row.address_line, row.city, row.state].filter(Boolean).join(', ') || '—',
    pincode:              (row.pincode as string) ?? (row.address_pincode as string) ?? '',
    city:                 (row.city as string) ?? '—',
    state:                (row.state as string) ?? '—',
    contact_name:         members[0] ? ((members[0] as Record<string, unknown>).display_name as string ?? '—') : '—',
    contact_email:        members[0] ? ((members[0] as Record<string, unknown>).email as string ?? '—') : '—',
    contact_phone:        members[0] ? ((members[0] as Record<string, unknown>).phone as string ?? '—') : '—',
    submission_date:      (row.submitted_at as string) ?? (row.created_at as string) ?? '',
    status,
    risk_score:           'Low',
    risk_factors:         [],
    assigned_to:          'System',
    rejection_reason:     (row.rejection_reasons as { checklist?: string[] } | null)?.checklist?.[0] ?? undefined,
    rejection_notes:      (row.kyc_rejected_reason as string) ?? undefined,
    escalation_reason:    undefined,
    approval_notes:       status === 'Approved'
      ? [...(auditByOrg[row.id as string] ?? [])].reverse().find(e => e.event_type === 'approved')?.detail
      : undefined,
    automated_checks:     mapChecks(row, jobsByOrg[row.id as string]),
    documents:            docsByOrg[row.id as string] ?? [] as BusinessDocument[],
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

// submit_business_verification writes new_status='pending' both for a
// user's first-ever submission and a resubmission after rejection — the
// same transition escalateApp also produces today (see its TODO). notes
// is the only field that actually distinguishes them, so check it first
// rather than inferring intent from the status pair alone.
function mapAuditEventType(prev: string | null, next: string, notes: string | null): AuditEntry['event_type'] {
  if (notes === 'user_submitted') return 'submitted';
  if (next === 'verified') return 'approved';
  if (next === 'rejected') return 'rejected';
  if (next === 'pending')  return 'escalated';
  if (!prev) return 'submitted';
  return 'comment';
}

function auditTitle(prev: string | null, next: string, notes: string | null): string {
  if (notes === 'user_submitted') return 'Submitted for verification';
  if (next === 'verified') return 'Approved';
  if (next === 'rejected') return 'Rejected';
  if (next === 'pending')  return 'Escalated for review';
  if (!prev) return 'Application submitted';
  return `Status changed to ${next}`;
}

// Maps verification_jobs.<pillar>_status (pillar_status_type from
// 20261101000005) to the admin console's CheckStatus. Falls back to a
// field-presence check only when no job row exists yet (org hasn't reached
// submit_business_verification, so the async worker was never queued).
function mapPillarStatus(pillarStatus: string | undefined, fallbackPresent: boolean): CheckStatus {
  switch (pillarStatus) {
    case 'PASSED':        return 'Passed';
    case 'FAILED':        return 'Failed';
    case 'MANUAL_REVIEW': return 'Manual Review';
    case 'QUEUED':
    case 'PROCESSING':    return 'Pending';
    case 'NOT_STARTED':   return 'N/A';
    default:              return fallbackPresent ? 'Pending' : 'N/A';
  }
}

function mapChecks(row: Record<string, unknown>, job: Record<string, unknown> | undefined): AutomatedCheck[] {
  const gstNotApplicable = row.gst_not_applicable === true;
  // pillar_1_tax_status covers GSTIN + PAN together (see verification-worker/index.ts),
  // but a gst_not_applicable org has nothing to check on the GSTIN side — surface that
  // as N/A instead of an ever-pending registry check, without affecting PAN's status.
  const pillar1Status = mapPillarStatus(job?.pillar_1_tax_status as string | undefined, !!row.gstin);
  const gstinStatus: CheckStatus = gstNotApplicable ? 'N/A' : pillar1Status;
  const panStatus    = pillar1Status;
  const ocrStatus    = mapPillarStatus(job?.ocr_status as string | undefined, !!row.address_proof_path);

  return [
    {
      id: 'gstin', label: 'GSTIN Registry',
      status: gstinStatus,
      detail: gstNotApplicable
        ? 'GST not registered — declared not applicable'
        : job
        ? `GSTIN: ${row.gstin ?? '—'} · registry check ${(job.pillar_1_tax_status as string ?? 'not queued').toLowerCase()}`
        : row.gstin ? `GSTIN: ${row.gstin} · not yet submitted for verification` : 'Not submitted',
    },
    {
      id: 'pan', label: 'PAN Verification',
      status: panStatus,
      detail: job
        ? `PAN: ${row.business_pan ?? '—'} · registry check ${(job.pillar_1_tax_status as string ?? 'not queued').toLowerCase()}`
        : row.business_pan ? `PAN: ${row.business_pan} · not yet submitted for verification` : 'Not submitted',
    },
    {
      id: 'address', label: 'Address Proof / OCR Congruence',
      status: ocrStatus,
      detail: job
        ? `${(row.address_proof_type as string) ?? 'document'} · OCR ${(job.ocr_status as string ?? 'not queued').toLowerCase()}`
        : row.address_proof_path ? `${row.address_proof_type as string ?? 'Uploaded'} · not yet submitted for verification` : 'Not uploaded',
    },
  ];
}

// Maps verification_documents.document_type (from 20261111000000) to the
// admin console's DocumentType label set.
function mapDocumentType(t: string): BusinessDocument['type'] {
  switch (t) {
    case 'gst_certificate':              return 'GST Certificate';
    case 'pan_card':                     return 'PAN Card';
    case 'address_proof_lease':
    case 'address_proof_utility_bill':
    case 'address_proof_other':          return 'Address Proof';
    default:                             return 'Address Proof';
  }
}

// Maps verification_documents.status to the admin console's review-facing
// DocumentStatus. MANUAL_REVIEW/OCR_FAILED read as Flagged rather than a
// distinct state — the checklist above (mapChecks) already surfaces the
// specific OCR reason via automated_checks; this drives the doc tab badge.
function mapDocumentStatus(s: string): BusinessDocument['status'] {
  switch (s) {
    case 'OCR_PASSED':    return 'Valid';
    case 'OCR_FAILED':
    case 'MANUAL_REVIEW': return 'Flagged';
    case 'UPLOADED':
    default:              return 'Valid';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [applications, setApplications] = useState<Organization[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
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
      let profileMap: Record<string, { full_name: string; email: string; phone: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', userIds);
        for (const p of (profiles ?? [])) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone ?? null };
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
          phone: profile?.phone ?? null,
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
        const notes = (a.notes as string | null) ?? null;
        auditByOrg[oid].push({
          id:         a.id as string,
          timestamp:  a.created_at as string,
          actor:      notes === 'user_submitted' ? 'applicant' : (a.changed_by as string) ?? 'system',
          actor_type: notes === 'user_submitted' ? 'applicant' : a.changed_by ? 'admin' : 'system',
          event_type: mapAuditEventType(a.previous_status as string | null, a.new_status as string, notes),
          title:      auditTitle(a.previous_status as string | null, a.new_status as string, notes),
          detail:     notes ?? undefined,
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

      // Fetch verification documents for all orgs (GST cert, PAN card, address
      // proof — see 20261111000000_verification_documents_registry.sql).
      // Signed URLs generated directly since this console runs under
      // service_role and bypasses storage RLS.
      const { data: docRows } = await supabase
        .from('verification_documents')
        .select('*')
        .neq('status', 'REPLACED')
        .order('created_at', { ascending: false });
      const docsByOrg: Record<string, BusinessDocument[]> = {};
      for (const d of (docRows ?? [])) {
        const oid = d.org_id as string;
        const storagePath = d.storage_path as string;
        const { data: signed } = await supabase.storage
          .from('verification-documents')
          .createSignedUrl(storagePath, 3600);
        if (!docsByOrg[oid]) docsByOrg[oid] = [];
        docsByOrg[oid].push({
          id:         d.id as string,
          type:       mapDocumentType(d.document_type as string),
          file_name:  storagePath.split('/').pop() ?? storagePath,
          status:     mapDocumentStatus(d.status as string),
          uploaded_at: d.created_at as string,
          url:        signed?.signedUrl ?? '',
          mime_type:  d.mime_type as BusinessDocument['mime_type'],
          size_kb:    Math.round((d.size_bytes as number) / 1024),
        });
      }

      // Fetch verification_jobs (real OCR / tax-registry / MCA pillar results —
      // see 20261101000005_verification_tiers_async_workers.sql) so
      // Automated Pre-Checks reflects what the async worker actually found,
      // not just whether the org typed a GSTIN/PAN into the form.
      const { data: jobRows } = await supabase
        .from('verification_jobs')
        .select('*');
      const jobsByOrg: Record<string, Record<string, unknown>> = {};
      for (const j of (jobRows ?? [])) {
        jobsByOrg[j.organization_id as string] = j as Record<string, unknown>;
      }

      const mapped = (orgs ?? []).map((o) =>
        mapOrg(o as Record<string, unknown>, byOrg[o.id] ?? [], tripCounts, featureFlagMap, auditByOrg, docsByOrg, jobsByOrg),
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

  // approveApp/rejectApp go through the admin_approve_profile / admin_reject_profile
  // procedures (not raw .update()) so verified_by, marketplace_verified, frozen_at
  // unfreeze, and the verification_audit_logs entry all happen atomically — matching
  // what the mobile wizard's submit/frozen-view code expects. This console runs under
  // the service_role key with no per-admin session, so p_admin_id is passed as null;
  // the audit trail records the action without attributing it to a specific admin user.
  const approveApp = useCallback(async (id: string, notes?: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase.rpc('admin_approve_profile', {
        p_org_id:   id,
        p_admin_id: null,
        p_notes:    notes?.trim() || null,
      });
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const rejectApp = useCallback(async (id: string, reason: string, notes: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase.rpc('admin_reject_profile', {
        p_org_id:            id,
        p_admin_id:          null,
        p_rejection_reasons: { checklist: [reason], notes },
        p_notes:             notes,
      });
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
