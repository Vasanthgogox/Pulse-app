/**
 * Earn Credits — placeholder only (Phase 2.2). No referral/verification
 * backend exists yet, so every card reads "Coming Soon" and nothing here
 * calls any RPC. Purely educational: teaches the model (verify, invite,
 * complete profile → credits) before any of it actually works, so the
 * concept isn't introduced for the first time alongside a broken button.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useRouter } from "expo-router";
import { ArrowLeft, Building2, CheckCircle2, UserPlus } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EARN_CARDS = [
  {
    icon: CheckCircle2,
    title: "Verify Business",
    reward: "+500 Credits",
  },
  {
    icon: UserPlus,
    title: "Invite Fleet Owner",
    reward: "+250 Credits",
  },
  {
    icon: Building2,
    title: "Complete Company Profile",
    reward: "+100 Credits",
  },
];

export default function ReachEarnCreditsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
        <Text style={styles.intro}>
          Credits pay for Reach campaigns. Here's how you'll be able to earn them.
        </Text>

        {EARN_CARDS.map((card) => (
          <View key={card.title} style={styles.card}>
            <View style={styles.cardIcon}>
              <card.icon size={18} color={Theme.primary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardReward}>{card.reward}</Text>
            </View>
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </View>
          </View>
        ))}
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
  content: { padding: Layout.screenPaddingHorizontal, gap: 10 },
  intro: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 17, marginBottom: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  cardTextCol: { flex: 1, gap: 1 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  cardReward: { fontSize: 12, fontWeight: "700", color: Theme.accentGold },
  comingSoonPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surface,
  },
  comingSoonText: { fontSize: 9, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
});
