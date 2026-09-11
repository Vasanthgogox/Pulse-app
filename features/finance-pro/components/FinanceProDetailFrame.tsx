/**
 * Finance Pro detail routes open as a floating investigation pop
 * (blur scrim + Metronic card), matching Core registry drawers.
 */
import Theme from "@/constants/Theme";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceProCompactScope } from "./FinanceProCanvas";
import { METRONIC, METRONIC_HEX_BACKGROUND } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useFinanceProModel } from "../hooks/useFinanceProModel";
import type { FinanceProModel } from "../model/financeProTypes";
import { FINANCE_PRO_STACK_BREAKPOINT } from "./financeProLayout";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const FINANCE_PRO_DETAIL_SCREEN_OPTIONS =
  Platform.OS === "web"
    ? { headerShown: false }
    : {
        headerShown: false,
        presentation: "transparentModal" as const,
        animation: "fade" as const,
        contentStyle: { backgroundColor: "transparent" as const },
      };

export function FinanceProDetailFrame({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: (model: FinanceProModel) => ReactNode;
}) {
  const { orgId, model, loading, documentsLoading, error } = useFinanceProModel();

  if (!orgId) {
    return (
      <FinanceProDetailSheet title={title} eyebrow={eyebrow}>
        <Text style={styles.emptyText}>Select a workspace to load this view.</Text>
      </FinanceProDetailSheet>
    );
  }

  if (loading || documentsLoading) {
    return (
      <FinanceProDetailSheet title={title} eyebrow={eyebrow}>
        <CenteredLoadingView message="Loading finance intelligence…" />
      </FinanceProDetailSheet>
    );
  }

  return (
    <FinanceProDetailSheet title={title} eyebrow={eyebrow}>
      {error ? (
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Could not load ledger inputs."}
        </Text>
      ) : null}
      {children(model)}
    </FinanceProDetailSheet>
  );
}

function FinanceProDetailSheet({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width < FINANCE_PRO_STACK_BREAKPOINT;
  const sheetMax = Math.max(
    320,
    height - (compact ? 24 : 48) - insets.top - insets.bottom,
  );

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.FINANCE_PRO as never);
  };

  return (
    <FinanceProCompactScope>
      <View style={styles.root} accessibilityViewIsModal>
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close detail"
      />
      <View
        style={[
          styles.sheet,
          compact ? styles.sheetCompact : styles.sheetDesktop,
          {
            maxHeight: sheetMax,
            marginTop: compact ? Math.max(16, insets.top + 8) : 32,
            marginBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.headWash} pointerEvents="none" />
          <View style={styles.headCopy}>
            {eyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Pressable
            onPress={close}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <X size={16} color={METRONIC.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <ScrollView
          style={[styles.scroll, { maxHeight: Math.max(240, sheetMax - 64) }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
      </View>
    </FinanceProCompactScope>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: Platform.OS === "web" ? "flex-start" : "center",
    backgroundColor: Platform.OS === "web" ? METRONIC.bodyBg : "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(16px) saturate(130%)",
          WebkitBackdropFilter: "blur(16px) saturate(130%)",
        } as unknown as ViewStyle)
      : null),
  },
  sheet: {
    width: "100%",
    minHeight: 360,
    flexGrow: 1,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: METRONIC.border,
    overflow: "hidden",
    zIndex: 2,
    ...(Platform.OS === "web"
      ? ({
          boxShadow:
            "0 12px 40px rgba(24, 28, 50, 0.14), 0 4px 12px rgba(24, 28, 50, 0.06)",
        } as unknown as ViewStyle)
      : {
          shadowColor: "#181C32",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 16,
        }),
  },
  sheetDesktop: {
    maxWidth: 960,
    marginHorizontal: 24,
    borderRadius: 16,
  },
  sheetCompact: {
    maxWidth: 720,
    marginHorizontal: 12,
    borderRadius: 16,
    alignSelf: "center",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    overflow: "hidden",
    ...METRONIC_HEX_BACKGROUND,
  },
  headWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  headCopy: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: METRONIC.muted,
  },
  title: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
  },
  close: {
    zIndex: 1,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: METRONIC.bodyBg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  error: {
    color: Theme.teslaRed ?? "#b91c1c",
    fontSize: 13,
    marginBottom: 12,
  },
  emptyText: {
    color: METRONIC.subtle,
    fontSize: 14,
  },
});
