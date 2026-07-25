/**
 * Earn Credits — real referral flow (Phase 2.4 Growth Activation). Invite
 * link is the primary share mechanism; the code stays visible as a manual
 * fallback. Both parties get 500 Credits once the referred org completes
 * verification — that entire chain (record_referral_by_code →
 * platform_approve_verification → increment_credit_wallet) already exists;
 * this screen is the missing customer-facing surface for it.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useMyReferralCodeQuery,
  useReferralsForOrgQuery,
} from "@/lib/queries/useReferralsQuery";
import { buildReferralLink } from "@/features/reach/utils/referralLink";
import { shareViaWhatsAppOrFallback } from "@/features/reach/utils/whatsappShare";
import type { ReferralRow, ReferralStatus } from "@/features/reach/services/referrals.service";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Coins,
  Copy,
  Link2,
  MessageCircle,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function statusLabel(status: ReferralStatus): string {
  if (status === "credited") return "Credited";
  if (status === "milestone_met") return "Verifying";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function statusColor(status: ReferralStatus): string {
  if (status === "credited") return Theme.success;
  if (status === "rejected") return Theme.textMuted;
  return Theme.textSecondary;
}

function ReferralRowItem({ referral, myOrgId }: { referral: ReferralRow; myOrgId: string }) {
  const isReferrer = referral.referrer_org_id === myOrgId;
  const otherOrgName = isReferrer ? referral.referred_org_name : referral.referrer_org_name;
  return (
    <View style={styles.referralRow}>
      <View style={styles.referralTextCol}>
        <Text style={styles.referralOrgName} numberOfLines={1}>
          {otherOrgName ?? "Organization"}
        </Text>
        <Text style={styles.referralRole}>{isReferrer ? "You invited them" : "They invited you"}</Text>
      </View>
      <Text style={[styles.referralStatus, { color: statusColor(referral.status) }]}>
        {statusLabel(referral.status)}
      </Text>
    </View>
  );
}

export default function ReachEarnCreditsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const codeQ = useMyReferralCodeQuery(orgId);
  const referralsQ = useReferralsForOrgQuery(orgId);
  const code = codeQ.data ?? null;
  const link = code ? buildReferralLink(code) : null;

  const flashCopied = (label: string) => {
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const handleCopyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    flashCopied("Invite link copied");
  };

  const handleCopyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    flashCopied("Referral code copied");
  };

  const handleShareWhatsApp = async () => {
    if (!link) return;
    const message = `Join me on Pulse! Sign up with my invite link and we'll both get 500 Pulse Credits once your business is verified:\n${link}`;
    try {
      await shareViaWhatsAppOrFallback(message, link);
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Please try again.");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Earn Credits</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Earn 500 Credits</Text>
        <Text style={styles.intro}>
          Invite another logistics company to Pulse. When they complete verification, you'll both receive 500 Pulse Credits.
        </Text>

        {codeQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : code ? (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Your referral code</Text>
            <Text style={styles.codeValue}>{code}</Text>

            <Pressable style={styles.primaryAction} onPress={handleCopyLink}>
              <Link2 size={15} color="#fff" />
              <Text style={styles.primaryActionText}>Copy Invite Link</Text>
            </Pressable>

            <View style={styles.secondaryActionsRow}>
              <Pressable style={styles.secondaryAction} onPress={handleCopyCode}>
                <Copy size={13} color={Theme.textPrimaryDark} />
                <Text style={styles.secondaryActionText}>Copy Code</Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={handleShareWhatsApp}>
                <MessageCircle size={13} color={Theme.textPrimaryDark} />
                <Text style={styles.secondaryActionText}>WhatsApp</Text>
              </Pressable>
            </View>

            {copiedLabel ? <Text style={styles.copiedHint}>{copiedLabel}</Text> : null}
          </View>
        ) : (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyBody}>Couldn't load your referral code.</Text>
          </View>
        )}

        <View style={styles.rewardRow}>
          <Coins size={13} color={Theme.accentGold} />
          <Text style={styles.rewardText}>Referrer +500 · New company +500, both on verification</Text>
        </View>

        <Text style={styles.sectionHeader}>Recent Referral Activity</Text>
        {referralsQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : (referralsQ.data ?? []).length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No referrals yet</Text>
            <Text style={styles.emptyBody}>Share your invite link to start earning credits.</Text>
          </View>
        ) : (
          <View style={styles.referralList}>
            {(referralsQ.data ?? []).map((r) => (
              <ReferralRowItem key={r.id} referral={r} myOrgId={orgId ?? ""} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  content: { padding: Layout.screenPaddingHorizontal, gap: 10, paddingBottom: 24 },
  title: { fontSize: 19, fontWeight: "900", color: Theme.textPrimaryDark },
  intro: { fontSize: 13, fontWeight: "500", color: Theme.textSecondary, lineHeight: 19, marginBottom: 4 },
  loadingWrap: { alignItems: "center", paddingVertical: 20 },
  codeCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    gap: 10,
  },
  codeLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  codeValue: { fontSize: 24, fontWeight: "900", color: Theme.textPrimaryDark, letterSpacing: 1 },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Theme.textPrimaryDark,
    marginTop: 4,
  },
  primaryActionText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  secondaryActionsRow: { flexDirection: "row", gap: 8 },
  secondaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  secondaryActionText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  copiedHint: { fontSize: 11, fontWeight: "600", color: Theme.success, textAlign: "center" },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.accentGoldMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rewardText: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  referralList: { gap: 8 },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
  },
  referralTextCol: { flex: 1, minWidth: 0, gap: 1 },
  referralOrgName: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  referralRole: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  referralStatus: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingVertical: 24, gap: 4 },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 11, color: Theme.textMuted, textAlign: "center" },
});
