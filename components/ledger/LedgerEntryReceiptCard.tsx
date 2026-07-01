import LottieView from "lottie-react-native";
import { memo, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import { formatINR } from "@/lib/format";
import { LEDGER_RECON_LOTTIE } from "@/lib/ledgerReconLottieAssets";

export type LedgerEntryReceiptHeroAnimation = "success" | "in" | "out" | false;

function ReceiptLottieGlyph({
  source,
  size = 52,
  loop = false,
  speed = 1,
}: {
  source: object;
  size?: number;
  loop?: boolean;
  speed?: number;
}) {
  const scale = 1.55;
  const renderSize = Math.round(size * scale);
  const offset = (size - renderSize) / 2;
  return (
    <View style={[styles.lottieSlot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop={loop}
        speed={speed}
        resizeMode="contain"
        style={{
          width: renderSize,
          height: renderSize,
          position: "absolute",
          left: offset,
          top: offset,
        }}
      />
    </View>
  );
}

export interface LedgerEntryReceiptDetailRow {
  label: string;
  value: string;
  multiline?: boolean;
}

export interface LedgerEntryReceiptCardProps {
  statusLabel: string;
  title: string;
  amount: number;
  isIn: boolean;
  details: LedgerEntryReceiptDetailRow[];
  primaryAction?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
  /** Wider max width on desktop web. */
  desktop?: boolean;
  /** Hero checkmark / payment glyph; `false` hides animation. */
  heroAnimation?: LedgerEntryReceiptHeroAnimation;
}

export const LedgerEntryReceiptDetailTable = memo(function LedgerEntryReceiptDetailTable({
  rows,
}: {
  rows: LedgerEntryReceiptDetailRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.detailCard}>
      {rows.map((row, idx) => (
        <View
          key={row.label}
          style={[styles.detailRow, idx < rows.length - 1 && styles.detailRowBorder]}
        >
          <Text style={styles.detailLabel}>{row.label}</Text>
          <Text
            style={[styles.detailValue, row.multiline && styles.detailValueMultiline]}
            numberOfLines={row.multiline ? 4 : 2}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
});

export const LedgerEntryReceiptCard = memo(function LedgerEntryReceiptCard(
  props: LedgerEntryReceiptCardProps,
) {
  const amountColor = props.isIn ? LEDGER_RECEIPT.amountIn : LEDGER_RECEIPT.amountOut;
  const heroAnimation = props.heroAnimation ?? "success";
  const heroLottie = useMemo(() => {
    if (!heroAnimation) return null;
    if (heroAnimation === "success") return LEDGER_RECON_LOTTIE.success;
    if (heroAnimation === "in") return LEDGER_RECON_LOTTIE.cashIn;
    return LEDGER_RECON_LOTTIE.cashOut;
  }, [heroAnimation]);

  return (
    <View
      style={[
        styles.card,
        props.desktop && styles.cardDesktop,
        props.style,
      ]}
    >
      <View style={styles.hero}>
        {heroLottie ? (
          <ReceiptLottieGlyph
            source={heroLottie}
            size={heroAnimation === "success" ? 56 : 48}
            loop={heroAnimation !== "success"}
            speed={heroAnimation === "success" ? 1 : 0.85}
          />
        ) : null}
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{props.statusLabel}</Text>
        </View>
        <Text style={styles.headline}>{props.title}</Text>
        <Text style={[styles.amount, { color: amountColor }]}>
          {props.isIn ? "+" : "−"}
          {formatINR(props.amount)}
        </Text>
      </View>

      <LedgerEntryReceiptDetailTable rows={props.details} />

      {props.secondaryAction || props.primaryAction ? (
        <View style={styles.actions}>
          {props.secondaryAction ? (
            <Pressable
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
              onPress={props.secondaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={props.secondaryAction.label}
            >
              <Text style={styles.ghostBtnText}>{props.secondaryAction.label}</Text>
            </Pressable>
          ) : null}
          {props.primaryAction ? (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
              onPress={props.primaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={props.primaryAction.label}
            >
              <Text style={styles.primaryBtnText}>{props.primaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: LEDGER_RECEIPT.cardBg,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: LEDGER_RECEIPT.border,
    gap: 16,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    shadowColor: LEDGER_RECEIPT.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardDesktop: {
    maxWidth: 440,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    borderRadius: 22,
  },
  hero: {
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  lottieSlot: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: LEDGER_RECEIPT.statusBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LEDGER_RECEIPT.statusBorder,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: LEDGER_RECEIPT.statusText,
  },
  headline: {
    fontSize: 16,
    fontWeight: "600",
    color: LEDGER_RECEIPT.title,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  amount: {
    fontSize: 34,
    fontWeight: "600",
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  detailCard: {
    backgroundColor: LEDGER_RECEIPT.detailBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LEDGER_RECEIPT.border,
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
    minWidth: 0,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LEDGER_RECEIPT.border,
  },
  detailLabel: {
    width: 100,
    fontSize: 9,
    fontWeight: "600",
    color: LEDGER_RECEIPT.label,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingTop: 2,
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "800",
    color: LEDGER_RECEIPT.value,
    textAlign: "left",
    lineHeight: 16,
  },
  detailValueMultiline: {
    fontWeight: "700",
    lineHeight: 17,
  },
  actions: {
    gap: 10,
    paddingTop: 2,
    width: "100%",
    alignSelf: "stretch",
  },
  ghostBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: LEDGER_RECEIPT.subtle,
  },
  primaryBtn: {
    backgroundColor: LEDGER_RECEIPT.primaryBtn,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    width: "100%",
    alignSelf: "stretch",
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: LEDGER_RECEIPT.primaryBtnText,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.88,
  },
});
