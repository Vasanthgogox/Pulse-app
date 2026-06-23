/**
 * In-hub overlay sheet — language / region pickers without widening workspace card.
 */
import Theme from "@/constants/Theme";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

type Props = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  headerExtra?: ReactNode;
};

export function WorkspaceHubInlineSheet({
  title,
  subtitle,
  onClose,
  children,
  headerExtra,
}: Props) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={styles.sheet}>
        <View style={styles.accentBar} />
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {headerExtra}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
    ...Platform.select({
      web: {
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      } as ViewStyle,
      default: {},
    }),
  },
  sheet: {
    flex: 1,
    maxHeight: "92%",
    marginTop: 40,
    backgroundColor: "#f5f7fb",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 -8px 32px rgba(24, 28, 50, 0.12)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 16,
      },
    }),
  },
  accentBar: {
    height: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginTop: 2,
  },
  backBtnPressed: { opacity: 0.85 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
});
