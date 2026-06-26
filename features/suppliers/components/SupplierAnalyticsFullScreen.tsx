import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Suspense, lazy } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { isPulseDesktop } from "@/components/analytics/pulse/pulseStyles";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useSupplierAnalyticsData } from "../hooks/useSupplierAnalyticsData";

const SupplierAnalyticsTab = lazy(() =>
  import("./analytics/SupplierAnalyticsTab").then((m) => ({ default: m.default })),
);

export function SupplierAnalyticsFullScreen({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = isPulseDesktop(width);
  const {
    t,
    supplier,
    displayName,
    trips,
    transactions,
    orgId,
    loading,
    error,
    refreshing,
    refresh,
  } = useSupplierAnalyticsData(supplierId);

  if (loading && !supplier) {
    return <CenteredLoadingView message={t("loading")} />;
  }

  if (error || !supplier) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerIconBtn} onPress={() => router.back()} hitSlop={8}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("supplier")}</Text>
          <View style={styles.headerIconBtn} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error ?? "Supplier not found"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        desktop && styles.wrapDesktop,
        { paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={() => router.back()} hitSlop={8}>
          <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>SUPPLIER INTELLIGENCE</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <View style={[styles.headerIconBtn, styles.headerIconBtnActive]}>
          <FontAwesome name="line-chart" size={16} color={Theme.primary} />
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, desktop && styles.scrollDesktop]}
        contentContainerStyle={[
          styles.scrollContent,
          desktop && styles.scrollContentDesktop,
          { paddingBottom: insets.bottom + (desktop ? 24 : Layout.screenPaddingHorizontal) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Theme.loaderAccent} />
        }
      >
        <Suspense fallback={<LazySuspenseNullFallback />}>
          <SupplierAnalyticsTab
            supplier={supplier}
            trips={trips}
            transactions={transactions}
            orgId={orgId}
          />
        </Suspense>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  wrapDesktop: {
    backgroundColor: METRONIC.bodyBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerEyebrow: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnActive: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  scroll: { flex: 1 },
  scrollDesktop: {
    backgroundColor: METRONIC.bodyBg,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  scrollContentDesktop: {
    paddingHorizontal: 0,
    paddingTop: 0,
    flexGrow: 1,
  },
  errorWrap: { padding: 16 },
  errorText: { fontSize: 15, color: Theme.textSecondary },
});
