/**
 * Persistent "submit for verification" reminder — shown from the tab layout
 * whenever the current org's verification_status is 'unverified'. Calm tone
 * for the first 7 days after org creation, escalating to the shared
 * expiry critical/expired tone once the 7-day soft deadline passes.
 * Dismissible per-session; reappears on next app open until the org is no
 * longer 'unverified'. Tapping navigates to the existing KYC panel.
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, ShieldAlert, X, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import Theme from '@/constants/Theme';
import {
  daysUntilExpiry,
  getExpiryAlertLevel,
  getExpiryToneColors,
} from '@/features/compliance/utils/expiry.util';
import { useOrgVerificationBannerQuery } from '@/lib/queries/useOrgVerificationBannerQuery';

const SOFT_DEADLINE_DAYS = 7;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function OrgVerificationReminderBanner({ orgId }: { orgId: string | null }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const { data } = useOrgVerificationBannerQuery(orgId);

  if (dismissed || !data || data.verification_status !== 'unverified') return null;

  const deadlineIso = addDaysIso(data.created_at, SOFT_DEADLINE_DAYS);
  const daysLeft = daysUntilExpiry(deadlineIso);
  const overdue = daysLeft != null && daysLeft < 0;

  const tone = overdue
    ? getExpiryToneColors(getExpiryAlertLevel(daysLeft))
    : { fg: Theme.scoreGoodFg ?? '#1D4ED8', bg: Theme.scoreGoodBg ?? '#DBEAFE', border: 'rgba(29,78,216,0.16)' };

  const title = overdue ? 'Verification overdue' : 'Verify your business';
  const eyebrow = overdue ? 'ACTION REQUIRED' : 'GET VERIFIED';
  const sub = overdue
    ? 'Your 7-day window has passed — submit now to avoid restrictions.'
    : daysLeft != null
      ? `${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'} left to complete KYC and unlock full access.`
      : 'Complete your business KYC to unlock full access.';

  const Icon = overdue ? ShieldAlert : ShieldCheck;

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { borderColor: tone.border }]}>
        <Pressable
          style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}
          onPress={() => router.push('/workspace?panel=kyc' as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
          accessibilityLabel="Verify your business"
        >
          <View style={[styles.iconChip, { backgroundColor: tone.bg }]}>
            <Icon size={17} color={tone.fg} strokeWidth={2.25} />
          </View>

          <View style={styles.body}>
            <Text style={[styles.eyebrow, { color: tone.fg }]}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
          </View>

          <ChevronRight size={16} color={Theme.textMuted} style={styles.chevron} />
        </Pressable>

        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.closeBtn}
        >
          <X size={13} color={Theme.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 20px rgba(15, 23, 42, 0.06)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      },
    }),
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardPressed: {
    opacity: 0.94,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark ?? Theme.textPrimary,
  },
  sub: {
    fontSize: 11.5,
    color: Theme.textMuted,
    lineHeight: 15,
  },
  chevron: { flexShrink: 0 },
  closeBtn: {
    padding: 4,
    marginLeft: 2,
    flexShrink: 0,
  },
});
