/**
 * Public /r/:code landing page — pre-auth, no session required. Shows who
 * invited the visitor, then carries the code into sign-up. The referral
 * itself isn't recorded here — that happens once the new org exists,
 * via ReferralCaptureGate (components/ReferralCaptureGate.tsx), reading the
 * same AsyncStorage key this screen writes before navigating away.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { PENDING_REFERRAL_CODE_KEY } from "@/components/ReferralCaptureGate";
import { useReferrerNameByCodeQuery } from "@/lib/queries/useReferralsQuery";
import { ROUTES } from "@/lib/routes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Coins, Rocket } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReferralLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = (params.code ?? "").toUpperCase();
  const referrerQ = useReferrerNameByCodeQuery(code || null);

  const handleSignUp = async () => {
    if (code) {
      await AsyncStorage.setItem(PENDING_REFERRAL_CODE_KEY, code);
    }
    router.push(ROUTES.SIGN_UP as never);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconBadge}>
        <Rocket size={26} color={Theme.accentGold} />
      </View>

      {referrerQ.isLoading ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 16 }} />
      ) : referrerQ.data ? (
        <>
          <Text style={styles.title}>{referrerQ.data} invited you to Pulse</Text>
          <Text style={styles.body}>
            Join Pulse, complete your business verification, and you'll both receive Pulse Credits.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>You've been invited to Pulse</Text>
          <Text style={styles.body}>
            This invite link isn't valid anymore, but you can still sign up and start using Pulse.
          </Text>
        </>
      )}

      <View style={styles.rewardRow}>
        <Coins size={14} color={Theme.accentGold} />
        <Text style={styles.rewardText}>500 Credits when your business is verified</Text>
      </View>

      <Pressable style={styles.ctaBtn} onPress={handleSignUp}>
        <Text style={styles.ctaBtnText}>Sign Up</Text>
      </Pressable>

      <Pressable onPress={() => router.push(ROUTES.SIGN_IN as never)}>
        <Text style={styles.signInLink}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    backgroundColor: Theme.screenBackground,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Theme.accentGoldMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  body: { fontSize: 13, fontWeight: "500", color: Theme.textMuted, textAlign: "center", marginTop: 10, lineHeight: 19 },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.accentGoldMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 20,
  },
  rewardText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  ctaBtn: {
    marginTop: 28,
    minWidth: 220,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ctaBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  signInLink: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, marginTop: 16 },
});
