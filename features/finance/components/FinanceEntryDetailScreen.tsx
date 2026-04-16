/**
 * FinanceEntryDetailScreen — dedicated full-page detail for a single ledger entry.
 *
 * Premium cinematic hero (icon chip + bold italic title, huge amount with direction pill,
 * meta pill row) over a white body that reuses `LedgerExpandedCardFromData` so the
 * compact, information-dense reconciliation UI below stays unchanged.
 *
 * Safe area respected on every device.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LedgerExpandedCardFromData, type FinancialRowData } from "./FinancialRow";

export interface FinanceEntryDetailScreenProps {
  data: FinancialRowData;
  onBack: () => void;
  onDownloadPress?: () => void;
  onOpenCompareVerify?: () => void;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

function formatHeroDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`.toUpperCase();
  } catch {
    return "—";
  }
}

function relativeAging(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const entry = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    entry.setHours(0, 0, 0, 0);
    const days = Math.floor(
      (today.getTime() - entry.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (days < 0) return `IN ${-days}D`;
    if (days === 0) return "TODAY";
    if (days === 1) return "1D AGO";
    if (days <= 30) return `${days}D AGO`;
    if (days <= 365) return `${Math.floor(days / 30)}MO AGO`;
    return `${Math.floor(days / 365)}Y AGO`;
  } catch {
    return "";
  }
}

function tripKind(data: FinancialRowData): "ASSET" | "AGGREGATE" | null {
  const detail = data.tripDetail;
  if (!detail) return null;
  const hasSupplier =
    detail.supplier_id != null && String(detail.supplier_id).trim() !== "";
  return hasSupplier ? "AGGREGATE" : "ASSET";
}

export function FinanceEntryDetailScreen({
  data,
  onBack,
  onDownloadPress,
  onOpenCompareVerify,
}: FinanceEntryDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const paymentIn = data.in ?? 0;
  const paymentOut = data.out ?? 0;
  const isIn = paymentIn > 0;
  const isOut = paymentOut > 0;
  const amount = isIn ? paymentIn : isOut ? paymentOut : 0;
  const direction: "in" | "out" | null = isIn ? "in" : isOut ? "out" : null;
  const partyName = (data.name ?? "—").toString().toUpperCase();
  const typeLabel = (data.transactionTypeLabel ?? data.category ?? "CASH ENTRY")
    .toString()
    .toUpperCase();
  const dateStr = formatHeroDate(data.transaction_date);
  const aging = relativeAging(data.transaction_date);
  const kind = useMemo(() => tripKind(data), [data]);
  const tripDisplay = data.tripDetail?.trip_number ?? data.msn ?? null;

  const directionColor =
    direction === "in"
      ? Theme.driverEmerald
      : direction === "out"
        ? "#FCA5A5"
        : Theme.textOnDarkMuted;
  const directionLabel =
    direction === "in" ? "MONEY IN" : direction === "out" ? "MONEY OUT" : "NO AMOUNT";
  const directionIcon =
    direction === "in" ? "arrow-down" : direction === "out" ? "arrow-up" : "circle-o";

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <View
        style={[
          styles.hero,
          { paddingTop: insets.top + 14 },
        ]}
      >
        {/* Glow accent */}
        <View style={styles.heroGlow} pointerEvents="none" />

        {/* Top row: back / aging / more */}
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconChipBtn}
            activeOpacity={0.85}
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome name="chevron-left" size={12} color={Theme.textOnDark} />
          </TouchableOpacity>
          {aging ? (
            <View style={styles.heroAgingPill}>
              <View style={styles.heroAgingDot} />
              <Text style={styles.heroAgingText}>{aging}</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.iconChipBtnSpacer} />
        </View>

        {/* Title row: icon chip + bold italic caps title */}
        <View style={styles.heroTitleRow}>
          <View style={styles.heroIconChip}>
            <FontAwesome
              name={
                direction === "in"
                  ? "arrow-down"
                  : direction === "out"
                    ? "arrow-up"
                    : "inbox"
              }
              size={18}
              color={Theme.textOnDark}
            />
          </View>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {typeLabel}
          </Text>
        </View>

        {/* Subtitle: party */}
        <Text style={styles.heroParty} numberOfLines={2}>
          {partyName}
        </Text>

        {/* Amount + direction pill */}
        <View style={styles.heroAmountBlock}>
          <Text
            style={[
              styles.heroAmount,
              direction === "in"
                ? styles.heroAmountIn
                : direction === "out"
                  ? styles.heroAmountOut
                  : styles.heroAmountNeutral,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {direction === "in" ? "+" : direction === "out" ? "−" : ""}₹{formatNum(amount)}
          </Text>
          <View
            style={[
              styles.directionPill,
              direction === "in"
                ? styles.directionPillIn
                : direction === "out"
                  ? styles.directionPillOut
                  : styles.directionPillNeutral,
            ]}
          >
            <FontAwesome name={directionIcon} size={9} color={directionColor} />
            <Text style={[styles.directionPillText, { color: directionColor }]}>
              {directionLabel}
            </Text>
          </View>
        </View>

        {/* Meta pill strip */}
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaPill}>
            <FontAwesome name="calendar" size={9} color={Theme.textOnDarkMuted} />
            <Text style={styles.heroMetaPillText}>{dateStr}</Text>
          </View>
          {tripDisplay ? (
            <View style={styles.heroMetaPill}>
              <FontAwesome name="truck" size={9} color={Theme.textOnDarkMuted} />
              <Text style={styles.heroMetaPillText} numberOfLines={1}>
                {tripDisplay}
              </Text>
            </View>
          ) : null}
          {kind ? (
            <View
              style={[
                styles.heroKindPill,
                kind === "AGGREGATE"
                  ? styles.heroKindPillAggregate
                  : styles.heroKindPillAsset,
              ]}
            >
              <View
                style={[
                  styles.heroKindDot,
                  kind === "AGGREGATE"
                    ? styles.heroKindDotAggregate
                    : styles.heroKindDotAsset,
                ]}
              />
              <Text
                style={[
                  styles.heroKindPillText,
                  kind === "AGGREGATE"
                    ? styles.heroKindPillTextAggregate
                    : styles.heroKindPillTextAsset,
                ]}
              >
                {kind}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Timeline kicker */}
      <View style={styles.sectionKickerWrap}>
        <View style={styles.sectionKickerDot} />
        <Text style={styles.sectionKicker}>TIMELINE RECORDS</Text>
        <View style={styles.sectionKickerLine} />
      </View>

      {/* Body — reuses LedgerExpandedCardFromData (compact small-font). */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LedgerExpandedCardFromData
          data={data}
          onDownloadPress={onDownloadPress}
          onOpenCompareVerify={onOpenCompareVerify}
        />
      </ScrollView>
    </View>
  );
}

const HERO_BG = "#0B1020";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  hero: {
    backgroundColor: HERO_BG,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  heroGlow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: "rgba(99,102,241,0.28)",
    opacity: 0.55,
    ...Platform.select({
      web: { filter: "blur(80px)" },
      default: {},
    }),
  } as any,
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  iconChipBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconChipBtnSpacer: {
    width: 34,
    height: 34,
  },
  heroAgingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroAgingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#6EE7B7",
  },
  heroAgingText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
  },
  heroIconChip: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -0.3,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  heroParty: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 14,
  },
  heroAmountBlock: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroAmount: {
    flexShrink: 1,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontStyle: "italic",
  },
  heroAmountIn: {
    color: Theme.textOnDark,
  },
  heroAmountOut: {
    color: Theme.textOnDark,
  },
  heroAmountNeutral: {
    color: Theme.textOnDark,
  },
  directionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  directionPillIn: {
    backgroundColor: "rgba(16,185,129,0.14)",
    borderColor: "rgba(16,185,129,0.40)",
  },
  directionPillOut: {
    backgroundColor: "rgba(239,68,68,0.14)",
    borderColor: "rgba(239,68,68,0.40)",
  },
  directionPillNeutral: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  directionPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 16,
  },
  heroMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    maxWidth: "100%",
  },
  heroMetaPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroKindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroKindPillAsset: {
    backgroundColor: "rgba(16,185,129,0.14)",
    borderColor: "rgba(16,185,129,0.40)",
  },
  heroKindPillAggregate: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderColor: "rgba(99,102,241,0.45)",
  },
  heroKindDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  heroKindDotAsset: {
    backgroundColor: Theme.driverEmerald,
  },
  heroKindDotAggregate: {
    backgroundColor: "#A5B4FC",
  },
  heroKindPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroKindPillTextAsset: {
    color: Theme.driverEmerald,
  },
  heroKindPillTextAggregate: {
    color: "#C7D2FE",
  },
  sectionKickerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionKickerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  sectionKickerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.surfaceBorder,
    marginLeft: 4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 2,
    paddingHorizontal: 0,
  },
});
