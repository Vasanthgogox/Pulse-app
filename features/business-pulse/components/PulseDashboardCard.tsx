import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

type PulseDashboardCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerLabel?: string;
  onFooterPress?: () => void;
  headerRight?: ReactNode;
  noPadding?: boolean;
};

/** Metronic-style white card — title row, body, optional footer link. */
export function PulseDashboardCard({
  title,
  subtitle,
  children,
  footerLabel,
  onFooterPress,
  headerRight,
  noPadding = false,
}: PulseDashboardCardProps) {
  return (
    <View style={ent.dashboardCard}>
      <View style={ent.dashboardCardHeader}>
        <View style={styles.titleBlock}>
          <Text style={ent.dashboardCardTitle}>{title}</Text>
          {subtitle ? <Text style={ent.dashboardCardSubtitle}>{subtitle}</Text> : null}
        </View>
        {headerRight ?? (
          <View style={styles.menuIcon}>
            <MoreHorizontal size={16} color={Theme.textMuted} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={[styles.body, noPadding && styles.bodyFlush]}>{children}</View>
      {footerLabel ? (
        <>
          <View style={ent.dashboardCardDivider} />
          <Pressable
            onPress={onFooterPress}
            style={({ pressed }) => [ent.dashboardCardFooter, pressed && { opacity: 0.75 }]}
            accessibilityRole={onFooterPress ? "button" : undefined}
          >
            <Text style={ent.dashboardCardFooterLink}>{footerLabel}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  menuIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  bodyFlush: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
});
