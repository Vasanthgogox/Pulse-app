import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { useFinanceProModel } from "../hooks/useFinanceProModel";
import { FinanceProAlign } from "./FinanceProAlign";
import { FINANCE_PRO_CANVAS_BG } from "./FinanceProCanvas";
import type { FinanceProModel } from "../model/financeProTypes";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function FinanceProWorkspaceFrame({
  children,
  title,
  subtitle,
  headerRight,
  hideTitle,
}: {
  children: (model: FinanceProModel) => ReactNode;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  hideTitle?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { orgId, model, loading, error } = useFinanceProModel();

  if (!orgId) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Select a workspace to load Finance Pro.</Text>
      </View>
    );
  }

  if (loading) {
    return <CenteredLoadingView message="Loading finance intelligence…" />;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 40 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <FinanceProAlign>
        {hideTitle && !headerRight ? null : (
          <View style={styles.header}>
            {hideTitle ? (
              <View />
            ) : (
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            )}
            {headerRight}
          </View>
        )}
        {error ? (
          <Text style={styles.error}>
            {error instanceof Error ? error.message : "Could not load ledger inputs."}
          </Text>
        ) : null}
        {children(model)}
      </FinanceProAlign>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: FINANCE_PRO_CANVAS_BG,
  },
  content: {
    paddingTop: 16,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  headerCopy: {
    flexShrink: 1,
    minWidth: 160,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: METRONIC.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  error: {
    color: Theme.teslaRed ?? "#b91c1c",
    fontSize: 13,
    marginBottom: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: FINANCE_PRO_CANVAS_BG,
  },
  emptyText: {
    color: METRONIC.subtle,
    fontSize: 14,
  },
});
