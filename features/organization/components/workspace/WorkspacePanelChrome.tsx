/**
 * White-surface detail header used by every workspace detail panel.
 * Layout matches the reference: circular back chip + bold title + small
 * uppercase eyebrow subtitle + optional right slot for chips/actions.
 */
import Theme from "@/constants/Theme";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
};

export function WorkspacePanelChrome({
  title,
  subtitle,
  onBack,
  rightSlot,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 14 }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to workspace menu"
        >
          <ArrowLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.rightSlot}>{rightSlot}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 18,
    minHeight: 64,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  rightSlot: {
    minWidth: 42,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
