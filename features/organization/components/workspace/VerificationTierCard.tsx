/**
 * VerificationTierCard
 *
 * Displays the 3-tier verification progress with live Realtime updates.
 * Each tier shows its constituent pillars with status chips.
 * Tier 1 unlocks on OCR + Pillar 1 (automated). Tier 2 requires bank
 * validation + biometric (user-triggered) + admin approval.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle,
  ChevronRight,
  Clock,
  FileSearch,
  Fingerprint,
  Landmark,
  Lock,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react-native';

import Theme from '@/constants/Theme';
import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space } from '@/design-system/spacing';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  getVerificationJobStatus,
  getTierCapabilities,
  subscribeToVerificationUpdates,
  type PillarStatus,
  type TierCapabilities,
  type VerificationJobStatus,
  type VerificationTier,
} from '@/features/organization/services/verificationTier.service';

const TIER_CONFIG: Record<VerificationTier, { label: string; color: string; accent: string }> = {
  TIER_0_SANDBOX: { label: 'Sandbox',            color: colors.textMuted, accent: Theme.surfaceBorder },
  TIER_1_PARTIAL: { label: 'Partial Activation', color: '#F59E0B',        accent: '#FEF3C7'           },
  TIER_2_FULL:    { label: 'Full Activation',    color: Theme.success,    accent: '#DCFCE7'           },
};

// ── Pillar status chip ────────────────────────────────────────────────────────

function PillarChip({ status }: { status: PillarStatus }) {
  const map: Record<PillarStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    PASSED:        { label: 'Passed',          bg: '#DCFCE7',     text: Theme.success,          icon: <CheckCircle size={10} color={Theme.success} /> },
    FAILED:        { label: 'Failed',          bg: '#FEE2E2',     text: Theme.destructive,      icon: <XCircle size={10} color={Theme.destructive} /> },
    MANUAL_REVIEW: { label: 'Under Review',    bg: '#FEF3C7',     text: '#D97706',              icon: <Clock size={10} color="#D97706" /> },
    PROCESSING:    { label: 'Processing',      bg: Theme.surface, text: colors.textSecondary,   icon: <ActivityIndicator size={10} color={colors.textSecondary} /> },
    QUEUED:        { label: 'Queued',          bg: Theme.surface, text: colors.textMuted,       icon: <Clock size={10} color={colors.textMuted} /> },
    NOT_STARTED:   { label: 'Action Required', bg: Theme.surface, text: colors.textMuted,       icon: <Lock size={10} color={colors.textMuted} /> },
  };
  const c = map[status] ?? map.NOT_STARTED;
  return (
    <View style={[chipStyles.root, { backgroundColor: c.bg }]}>
      {c.icon}
      <Text style={[chipStyles.label, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  root:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  label: { fontSize: 10, fontWeight: '600' },
});

// ── Single pillar row ─────────────────────────────────────────────────────────

function PillarRow({
  icon, label, status, onAction, actionLabel,
}: {
  icon:         React.ReactNode;
  label:        string;
  status:       PillarStatus;
  onAction?:    () => void;
  actionLabel?: string;
}) {
  return (
    <View style={rowStyles.root}>
      <View style={rowStyles.iconSlot}>{icon}</View>
      <Text style={rowStyles.label}>{label}</Text>
      <View style={rowStyles.right}>
        <PillarChip status={status} />
        {onAction && status === 'NOT_STARTED' ? (
          <Pressable style={rowStyles.action} onPress={onAction}>
            <Text style={rowStyles.actionText}>{actionLabel ?? 'Start'}</Text>
            <ChevronRight size={11} color={Theme.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  root:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.surfaceBorder },
  iconSlot:   { width: 28, alignItems: 'center', marginRight: space[2] },
  label:      { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  right:      { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { fontSize: 11, fontWeight: '600', color: Theme.primary },
});

// ── Tier section ──────────────────────────────────────────────────────────────

function TierSection({
  tier, currentTier, children, unlockAt,
}: {
  tier:        VerificationTier;
  currentTier: VerificationTier;
  children:    React.ReactNode;
  unlockAt?:   string | null;
}) {
  const cfg      = TIER_CONFIG[tier];
  const isActive = currentTier === tier;
  const isDone   = currentTier === 'TIER_2_FULL';
  const tierNum  = tier === 'TIER_0_SANDBOX' ? 0 : tier === 'TIER_1_PARTIAL' ? 1 : 2;

  return (
    <View style={[sectionStyles.root, isActive && sectionStyles.active]}>
      <View style={sectionStyles.header}>
        <View style={[sectionStyles.badge, { backgroundColor: isActive ? cfg.accent : Theme.surface }]}>
          <Text style={[sectionStyles.badgeText, { color: isActive ? cfg.color : colors.textMuted }]}>
            T{tierNum}
          </Text>
        </View>
        <View style={sectionStyles.titleBlock}>
          <Text style={sectionStyles.title}>{cfg.label}</Text>
          {unlockAt ? (
            <Text style={sectionStyles.unlockDate}>
              Unlocked {new Date(unlockAt).toLocaleDateString('en-IN')}
            </Text>
          ) : null}
        </View>
        {isActive ? (
          <View style={[sectionStyles.activeBadge, { borderColor: cfg.color }]}>
            <Text style={[sectionStyles.activeBadgeText, { color: cfg.color }]}>Current</Text>
          </View>
        ) : null}
      </View>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  root:           { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.surfaceBorder, marginBottom: space[3], overflow: 'hidden' },
  active:         { borderColor: Theme.primary + '40' },
  header:         { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], backgroundColor: Theme.surface },
  badge:          { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText:      { fontSize: 12, fontWeight: '700' },
  titleBlock:     { flex: 1 },
  title:          { fontSize: 13, fontWeight: '700', color: Theme.primaryText },
  unlockDate:     { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  activeBadge:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  activeBadgeText:{ fontSize: 10, fontWeight: '600' },
  body:           { paddingHorizontal: space[4], paddingBottom: space[1] },
});

// ── Capability strip ──────────────────────────────────────────────────────────

function CapabilityStrip({ caps }: { caps: TierCapabilities | null }) {
  if (!caps) return null;

  const items = [
    { label: 'Bid',          unlocked: caps.can_bid            },
    { label: 'Post Trips',   unlocked: caps.can_post_trips     },
    { label: 'Matching',     unlocked: caps.can_join_matching  },
    { label: 'Full Escrow',  unlocked: caps.can_clear_escrow   },
  ];

  return (
    <View style={capStyles.root}>
      {items.map(item => (
        <View key={item.label} style={capStyles.item}>
          {item.unlocked
            ? <CheckCircle size={12} color={Theme.success} />
            : <Lock size={12} color={colors.textMuted} />}
          <Text style={[capStyles.label, !item.unlocked && capStyles.locked]}>
            {item.label}
          </Text>
        </View>
      ))}
      {caps.transaction_cap !== null ? (
        <View style={capStyles.cap}>
          <Text style={capStyles.capText}>
            Cap: ₹{(caps.transaction_cap / 100).toLocaleString('en-IN')}
          </Text>
        </View>
      ) : caps.can_clear_escrow ? (
        <View style={capStyles.cap}>
          <Text style={[capStyles.capText, { color: Theme.success }]}>Unlimited GTV</Text>
        </View>
      ) : null}
    </View>
  );
}

const capStyles = StyleSheet.create({
  root:     { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.surfaceBorder, marginTop: space[2] },
  item:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label:    { fontSize: 11, fontWeight: '500', color: colors.textPrimary },
  locked:   { color: colors.textMuted },
  cap:      { marginLeft: 'auto' },
  capText:  { fontSize: 11, fontWeight: '600', color: '#D97706' },
});

// ── Main card ─────────────────────────────────────────────────────────────────

export function VerificationTierCard({
  onStartPennyDrop,
  onStartBiometric,
}: {
  onStartPennyDrop?: () => void;
  onStartBiometric?: () => void;
}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? '';

  const [jobStatus, setJobStatus] = useState<VerificationJobStatus | null>(null);
  const [caps,      setCaps]      = useState<TierCapabilities | null>(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [jobRes, capsRes] = await Promise.all([
      getVerificationJobStatus(orgId),
      getTierCapabilities(orgId),
    ]);
    if (jobRes.data)  setJobStatus(jobRes.data);
    if (capsRes.data) setCaps(capsRes.data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates via Realtime
  useEffect(() => {
    if (!orgId) return;
    return subscribeToVerificationUpdates(orgId, () => void load());
  }, [orgId, load]);

  if (loading) {
    return (
      <View style={cardStyles.loader}>
        <ActivityIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  const tier = jobStatus?.verification_tier ?? 'TIER_0_SANDBOX';

  return (
    <View style={cardStyles.root}>
      <View style={cardStyles.header}>
        <ShieldCheck size={16} color={Theme.primary} />
        <Text style={cardStyles.title}>Verification Status</Text>
        {jobStatus?.status === 'processing' ? (
          <ActivityIndicator size="small" color={Theme.primary} style={{ marginLeft: 'auto' }} />
        ) : null}
      </View>

      <CapabilityStrip caps={caps} />

      {/* Tier 0 — Sandbox */}
      <TierSection tier="TIER_0_SANDBOX" currentTier={tier}>
        <PillarRow
          icon={<CheckCircle size={14} color={Theme.success} />}
          label="Phone & Identity Verified"
          status="PASSED"
        />
      </TierSection>

      {/* Tier 1 — Partial Activation (automated) */}
      <TierSection tier="TIER_1_PARTIAL" currentTier={tier}>
        <PillarRow
          icon={<FileSearch size={14} color={colors.textSecondary} />}
          label="Document OCR Congruence"
          status={jobStatus?.ocr_status ?? 'QUEUED'}
        />
        <PillarRow
          icon={<ShieldCheck size={14} color={colors.textSecondary} />}
          label="GST & PAN Registry Check"
          status={jobStatus?.pillar_1_tax_status ?? 'QUEUED'}
        />
        {jobStatus?.pillar_2_mca_status && jobStatus.pillar_2_mca_status !== 'NOT_STARTED' ? (
          <PillarRow
            icon={<Landmark size={14} color={colors.textSecondary} />}
            label="MCA Corporate Structure"
            status={jobStatus.pillar_2_mca_status}
          />
        ) : null}
        {(jobStatus?.status === 'QUEUED' || jobStatus?.status === 'PROCESSING') ? (
          <View style={cardStyles.processingNote}>
            <Sparkles size={11} color={Theme.primary} />
            <Text style={cardStyles.processingNoteText}>
              Background checks running. You'll be notified when complete.
            </Text>
          </View>
        ) : null}
      </TierSection>

      {/* Tier 2 — Full Activation (user-triggered + admin) */}
      <TierSection tier="TIER_2_FULL" currentTier={tier}>
        <PillarRow
          icon={<Landmark size={14} color={colors.textSecondary} />}
          label="Bank Account Validation (₹1 Penny Drop)"
          status={jobStatus?.penny_drop_status ?? 'NOT_STARTED'}
          onAction={onStartPennyDrop}
          actionLabel="Add Bank →"
        />
        <PillarRow
          icon={<Fingerprint size={14} color={colors.textSecondary} />}
          label="Biometric Liveness Check"
          status={jobStatus?.biometric_status ?? 'NOT_STARTED'}
          onAction={onStartBiometric}
          actionLabel="Start →"
        />
        <PillarRow
          icon={<ShieldCheck size={14} color={colors.textSecondary} />}
          label="Admin Approval"
          status={
            jobStatus?.penny_drop_status === 'PASSED' && jobStatus?.biometric_status === 'PASSED'
              ? 'QUEUED'
              : 'NOT_STARTED'
          }
        />
      </TierSection>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  root:   { backgroundColor: Theme.screenBackground },
  loader: { padding: space[5], alignItems: 'center' },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            space[2],
    paddingBottom:  space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    marginBottom:   space[3],
  },
  title:  { fontSize: 13, fontWeight: '700', color: Theme.primaryText },
  processingNote: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           space[2],
    paddingVertical: space[3],
    marginTop:     space[1],
  },
  processingNoteText: { fontSize: 11, color: colors.textSecondary, flex: 1, lineHeight: 16 },
});
