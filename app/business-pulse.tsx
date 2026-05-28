import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { BusinessPulseScreen } from "@/features/business-pulse/components/BusinessPulseScreen";
import { PulseFilterProvider } from "@/features/business-pulse/state/pulseFilterStore";

export default function BusinessPulseRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <PulseFilterProvider>
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
          </Pressable>
          <View style={styles.topBarCenter}>
            <Text style={styles.topEyebrow}>INTELLIGENCE</Text>
            <Text style={styles.topTitle}>Business Pulse</Text>
          </View>
          <View style={styles.topBarSpacer} />
        </View>
        <BusinessPulseScreen embedded topInset={0} />
      </View>
    </PulseFilterProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 4,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.whiteMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  topBarCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  topEyebrow: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1.2,
  },
  topTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 1,
  },
  topBarSpacer: {
    width: 36,
  },
});