import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { BusinessPulseScreen } from "@/features/business-pulse/components/BusinessPulseScreen";
import {
  PULSE_PAGE_BG,
  pulseEnterpriseStyles as ent,
} from "@/features/business-pulse/components/pulseEnterpriseStyles";
import { PulseFilterProvider } from "@/features/business-pulse/state/pulseFilterStore";

export default function BusinessPulseRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <PulseFilterProvider>
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={16} color="#181C32" strokeWidth={2.2} />
          </Pressable>
          <View style={styles.topBarMain}>
            <Text style={styles.pageTitle}>Business Pulse</Text>
            <View style={styles.breadcrumbRow}>
              <Text style={styles.breadcrumb}>Workspace</Text>
              <ChevronRight size={11} color="#A1A5B7" strokeWidth={2.2} />
              <Text style={styles.breadcrumbActive}>Intelligence</Text>
            </View>
          </View>
          <View style={ent.datePill}>
            <Calendar size={12} color="#A1A5B7" strokeWidth={2} />
            <Text style={ent.datePillText}>Live scope</Text>
          </View>
        </View>
        <SurfaceAccessGate surface="finance.business_pulse">
          <BusinessPulseScreen embedded topInset={0} />
        </SurfaceAccessGate>
      </View>
    </PulseFilterProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PULSE_PAGE_BG,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" as unknown as undefined,
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  topBarMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#181C32",
    letterSpacing: -0.2,
  },
  breadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  breadcrumb: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  breadcrumbActive: {
    fontSize: 11,
    fontWeight: "600",
    color: "#181C32",
  },
});
