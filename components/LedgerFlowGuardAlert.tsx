/**
 * Themed alert when Cash IN/OUT does not match a locked party (client / supplier / driver).
 */
import Theme from "@/constants/Theme";
import type { LedgerFlowGuardAlertContent } from "@/lib/ledgerPartySmartTagPolicy";
import { ArrowDownLeft, ArrowUpRight, Info, ShieldAlert } from "lucide-react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

export type LedgerFlowGuardAlertProps = {
  visible: boolean;
  content: LedgerFlowGuardAlertContent | null;
  onDismiss: () => void;
};

function FlowPill({
  label,
  tone,
}: {
  label: string;
  tone: "in" | "out" | "neutral";
}) {
  const isIn = tone === "in";
  const isOut = tone === "out";
  return (
    <View
      style={[
        styles.flowPill,
        isIn && styles.flowPillIn,
        isOut && styles.flowPillOut,
        tone === "neutral" && styles.flowPillNeutral,
      ]}
    >
      {isIn ? (
        <ArrowDownLeft size={11} color={Theme.darkGreen} strokeWidth={2.4} />
      ) : isOut ? (
        <ArrowUpRight size={11} color={Theme.teslaRed} strokeWidth={2.4} />
      ) : null}
      <Text
        style={[
          styles.flowPillText,
          isIn && styles.flowPillTextIn,
          isOut && styles.flowPillTextOut,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function LedgerFlowGuardAlert({
  visible,
  content,
  onDismiss,
}: LedgerFlowGuardAlertProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 420;

  if (!content) {
    return null;
  }

  const entityLabel =
    content.entityLabel === "CLIENT"
      ? "Client"
      : content.entityLabel === "SUPPLIER"
        ? "Supplier"
        : "Driver";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[styles.card, isCompact && styles.cardCompact]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <View style={styles.iconWrap}>
            <ShieldAlert size={26} color={Theme.pulseIndigo} strokeWidth={2.2} />
          </View>

          <Text style={styles.title}>{content.title}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.entityBadge}>
              <Text style={styles.entityBadgeText}>{entityLabel}</Text>
            </View>
            <FlowPill
              label={content.attemptedFlow === "in" ? "Cash IN" : "Cash OUT"}
              tone={content.attemptedFlow}
            />
            <Text style={styles.badgeArrow}>→</Text>
            <FlowPill
              label={content.correctFlow === "in" ? "Cash IN" : "Cash OUT"}
              tone={content.correctFlow}
            />
          </View>

          <Text style={styles.headline}>{content.headline}</Text>

          <View style={styles.bulletList}>
            {content.bullets.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>

          {content.tip ? (
            <View style={styles.tipBox}>
              <Info size={14} color={Theme.pulseIndigo} strokeWidth={2.2} />
              <Text style={styles.tipText}>{content.tip}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardCompact: {
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  iconWrap: {
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.pulseIndigoWash,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 14,
  },
  entityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  entityBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  badgeArrow: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textMutedDemo,
  },
  flowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  flowPillIn: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    borderColor: "rgba(22, 163, 74, 0.28)",
  },
  flowPillOut: {
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderColor: "rgba(220, 38, 38, 0.22)",
  },
  flowPillNeutral: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  flowPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  flowPillTextIn: {
    color: Theme.darkGreen,
  },
  flowPillTextOut: {
    color: Theme.teslaRed,
  },
  headline: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
    textAlign: "left",
    marginBottom: 12,
  },
  bulletList: {
    gap: 10,
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: Theme.buttonPrimary,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 19,
    textAlign: "left",
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    marginBottom: 16,
  },
  tipText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
    textAlign: "left",
  },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
});
