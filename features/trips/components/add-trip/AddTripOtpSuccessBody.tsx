/**
 * Post-create Driver OTP success card — responsive layout, copy/share, trip context.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { formatIndianVehicleNumber } from "@/lib/format";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDown,
  CheckCircle2,
  Clock,
  Copy,
  MapPinned,
  RotateCw,
  Share2,
  Truck,
  User,
} from "lucide-react-native";
import { MotiView } from "moti";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AddTripCompleteResult } from "./types";

export interface AddTripOtpSuccessBodyProps {
  createdResult: AddTripCompleteResult;
  regenerating: boolean;
  onRegenerateOtp: () => void;
}

function formatExpiryLabels(expiresAt: Date): { time: string; relative: string } {
  const time = expiresAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = expiresAt.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const ms = expiresAt.getTime() - Date.now();
  let relative = `${date} · ${time}`;
  if (ms > 0) {
    const mins = Math.round(ms / 60_000);
    if (mins < 90) relative = `Valid ~${mins} min`;
    else {
      const hrs = Math.floor(mins / 60);
      relative = `Valid ~${hrs}h ${mins % 60}m`;
    }
  } else {
    relative = "Expired";
  }
  return { time: `${date} · ${time}`, relative };
}

function OtpMetaTile({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  subValue?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.metaTile}>
      <View
        style={[styles.metaTileIcon, accent ? styles.metaTileIconAccent : styles.metaTileIconMuted]}
      >
        <Icon
          size={16}
          color={accent ? Theme.driverEmeraldDark : Theme.textMuted}
          strokeWidth={2}
        />
      </View>
      <View style={styles.metaTileText}>
        <Text style={styles.metaTileLabel}>{label}</Text>
        <Text style={[styles.metaTileValue, !value && styles.metaTileValueMuted]} numberOfLines={2}>
          {value || "—"}
        </Text>
        {subValue ? (
          <Text style={styles.metaTileSub} numberOfLines={1}>
            {subValue}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const AddTripOtpSuccessBody = memo(function AddTripOtpSuccessBody({
  createdResult,
  regenerating,
  onRegenerateOtp,
}: AddTripOtpSuccessBodyProps) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);

  const cardMaxWidth = Math.min(winW - Layout.screenPaddingHorizontal * 2, 480);
  const metaTwoCol = winW >= 400;

  useEffect(() => {
    if (!regenerating) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [regenerating, spin]);

  const spinRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const otp = createdResult.otp!;
  const ctx = createdResult.otpScreenContext;
  const expiresAt = new Date(otp.expires_at);
  const expiryLabels = formatExpiryLabels(expiresAt);

  const vehicleRaw =
    (typeof createdResult.trip.vehicle_display_number === "string"
      ? createdResult.trip.vehicle_display_number.trim()
      : "") || ctx?.vehicleNumber?.trim() || "";
  const vehicleLabel = vehicleRaw ? formatIndianVehicleNumber(vehicleRaw) : "";

  const otpPlain = String(otp.code).replace(/\D/g, "") || String(otp.code);
  const digits = useMemo(() => otpPlain.split(""), [otpPlain]);

  const digitLayout = useMemo(() => {
    const count = Math.max(digits.length, 1);
    const innerPad = 28 + 12;
    const innerW = Math.max(200, cardMaxWidth - innerPad);
    const gap = count >= 6 ? (winW < 380 ? 4 : 6) : 8;
    const cellW = Math.floor((innerW - gap * (count - 1)) / count);
    const heroSize = Math.min(34, Math.max(26, Math.round(cellW * 0.58)));
    const cellH = Math.max(cellW + 2, heroSize + 12);
    return { gap, cellW, cellH, heroSize };
  }, [cardMaxWidth, digits.length, winW]);

  const hasSummary =
    !!ctx &&
    (ctx.pickupArea.length > 0 ||
      ctx.dropLocation.length > 0 ||
      !!ctx.clientName ||
      !!ctx.tons ||
      !!ctx.supplierDisplayName ||
      !!ctx.routeLine);

  const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  const copyCode = useCallback(async () => {
    await Clipboard.setStringAsync(otpPlain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [otpPlain]);

  const shareCode = useCallback(() => {
    const driver = ctx?.driverName ? ` for ${ctx.driverName}` : "";
    const route =
      ctx?.pickupArea && ctx?.dropLocation
        ? `\n${ctx.pickupArea} → ${ctx.dropLocation}`
        : "";
    Share.share({
      message: `Trip claim OTP${driver}: ${otpPlain}${route}\nExpires ${expiryLabels.time}`,
      title: "Driver trip OTP",
    }).catch(() => {});
  }, [ctx, otpPlain, expiryLabels.time]);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["#ecfdf5", "#e0f2fe", "#f5f3ff", "#fafafa"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <MotiView
          from={{ opacity: 0, translateY: 22, scale: 0.96 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={{ type: "timing", duration: 520 }}
          style={[styles.cardWrap, { maxWidth: cardMaxWidth }]}
        >
          <View style={styles.card}>
            <LinearGradient
              colors={[
                Theme.driverEmeraldDark,
                Theme.driverEmerald,
                "rgba(16, 185, 129, 0.85)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGlowTop}
            />
            <View style={styles.cardInner}>
              <MotiView
                from={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 14, stiffness: 220 }}
              >
                <MotiView
                  animate={{ scale: [1, 1.05, 1], opacity: [1, 0.92, 1] }}
                  transition={{ type: "timing", duration: 2600, loop: true }}
                  style={styles.badgeCircleWrap}
                >
                  <LinearGradient
                    colors={[Theme.driverEmeraldDark, Theme.driverEmerald]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.badgeCircle}
                  >
                    <CheckCircle2 size={22} color={Theme.textOnPrimary} strokeWidth={2.5} />
                  </LinearGradient>
                </MotiView>
              </MotiView>

              <Text style={styles.kicker}>Driver OTP</Text>
              <Text style={styles.instruction}>Share this code with the driver</Text>
              {createdResult.successDetails?.tripNumber ? (
                <Text style={styles.tripRef} numberOfLines={1}>
                  Trip {createdResult.successDetails.tripNumber}
                </Text>
              ) : null}

              {hasSummary && ctx ? (
                <View style={styles.summaryShell}>
                  <Text style={styles.summaryKicker}>Trip summary</Text>
                  <View style={styles.summaryRouteRow}>
                    <View style={styles.routeIconCol}>
                      <MapPinned size={14} color={Theme.iconPrimary} strokeWidth={2} />
                    </View>
                    <View style={styles.summaryRouteTextCol}>
                      <Text style={styles.summaryRouteMain} numberOfLines={2}>
                        {ctx.pickupArea || "—"}
                      </Text>
                      <View style={styles.summaryArrowDivider}>
                        <ArrowDown size={11} color={Theme.textMuted} strokeWidth={2} />
                      </View>
                      <Text style={styles.summaryRouteMain} numberOfLines={2}>
                        {ctx.dropLocation || "—"}
                      </Text>
                    </View>
                  </View>
                  {ctx.routeLine ? (
                    <Text style={styles.summaryMetaLine} numberOfLines={1}>
                      {ctx.routeLine}
                    </Text>
                  ) : null}
                  <View style={styles.summaryChips}>
                    {ctx.clientName ? (
                      <View style={[styles.chip, styles.chipFlex]}>
                        <Text style={styles.chipLab}>Client</Text>
                        <Text style={styles.chipVal} numberOfLines={1}>
                          {ctx.clientName}
                        </Text>
                      </View>
                    ) : null}
                    {ctx.supplierDisplayName ? (
                      <View style={[styles.chip, styles.chipFlex]}>
                        <Text style={styles.chipLab}>Partner</Text>
                        <Text style={styles.chipVal} numberOfLines={1}>
                          {ctx.supplierDisplayName}
                        </Text>
                      </View>
                    ) : null}
                    {ctx.tons ? (
                      <View style={[styles.chip, styles.chipFlex]}>
                        <Text style={styles.chipLab}>Load</Text>
                        <Text style={styles.chipVal} numberOfLines={1}>
                          {ctx.tons} t
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {ctx?.driverName || ctx?.driverPhone ? (
                <MotiView
                  from={{ opacity: 0, translateX: -8 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: "timing", duration: 400, delay: 120 }}
                  style={styles.driverBanner}
                >
                  <View style={styles.driverIconTile}>
                    <User size={17} color={Theme.driverEmeraldDark} strokeWidth={2} />
                  </View>
                  <View style={styles.driverTextCol}>
                    <Text style={styles.driverMetaLabel}>Driver</Text>
                    {ctx.driverName ? (
                      <Text style={styles.driverNameText} numberOfLines={1}>
                        {ctx.driverName}
                      </Text>
                    ) : null}
                    {ctx.driverPhone ? (
                      <Text style={styles.driverPhoneText} numberOfLines={1}>
                        {ctx.driverPhone}
                      </Text>
                    ) : null}
                  </View>
                </MotiView>
              ) : null}

              <Pressable
                onPress={copyCode}
                style={({ pressed }) => [
                  styles.codeBand,
                  pressed && styles.codeBandPressed,
                  webCursor,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Copy OTP code"
                accessibilityHint="Copies the full code to clipboard"
              >
                <Text style={styles.tapCopyHint}>
                  {copied ? "Copied to clipboard" : "Tap code to copy"}
                </Text>
                <View
                  style={[styles.digitsRow, { gap: digitLayout.gap }]}
                  key={otp.code}
                >
                  {digits.length === 0 ? (
                    <Text style={styles.digitFallback} selectable>
                      {otp.code}
                    </Text>
                  ) : (
                    digits.map((d, i) => (
                      <MotiView
                        key={`${otp.code}-${i}`}
                        from={{ opacity: 0, translateY: 14, scale: 0.82 }}
                        animate={{ opacity: 1, translateY: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 220,
                          delay: 80 + i * 55,
                        }}
                        style={[
                          styles.digitCell,
                          {
                            width: digitLayout.cellW,
                            height: digitLayout.cellH,
                            flexShrink: 0,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.digitChar,
                            { fontSize: digitLayout.heroSize, lineHeight: digitLayout.heroSize + 4 },
                          ]}
                        >
                          {d}
                        </Text>
                      </MotiView>
                    ))
                  )}
                </View>
              </Pressable>

              <View style={styles.otpActions}>
                <Pressable
                  onPress={copyCode}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnPrimary,
                    pressed && styles.actionBtnPressed,
                    webCursor,
                  ]}
                >
                  <Copy size={16} color={Theme.textOnPrimary} strokeWidth={2} />
                  <Text style={styles.actionBtnTextPrimary}>
                    {copied ? "Copied" : "Copy code"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={shareCode}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnSecondary,
                    pressed && styles.actionBtnPressed,
                    webCursor,
                  ]}
                >
                  <Share2 size={16} color={Theme.primary} strokeWidth={2} />
                  <Text style={styles.actionBtnTextSecondary}>Share</Text>
                </Pressable>
              </View>

              <View style={[styles.metaGrid, metaTwoCol && styles.metaGridTwoCol]}>
                <OtpMetaTile
                  icon={Truck}
                  label="Vehicle"
                  value={vehicleLabel}
                  subValue={vehicleLabel ? undefined : "Set on trip if missing"}
                  accent={!!vehicleLabel}
                />
                <OtpMetaTile
                  icon={Clock}
                  label="Expires"
                  value={expiryLabels.time}
                  subValue={expiryLabels.relative}
                />
              </View>

              <TouchableOpacity
                style={[styles.regenerateBtn, regenerating && styles.regenerateBtnDisabled]}
                onPress={onRegenerateOtp}
                disabled={regenerating}
                activeOpacity={0.85}
              >
                <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                  <RotateCw size={15} color={Theme.primary} strokeWidth={2} />
                </Animated.View>
                <Text style={styles.regenerateText}>
                  {regenerating ? "Regenerating…" : "Regenerate OTP"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </MotiView>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 280,
    position: "relative",
    overflow: "hidden",
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  cardWrap: {
    alignSelf: "center",
    width: "100%",
    zIndex: 1,
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
    ...Platform.select({
      web: {
        boxShadow:
          "0 4px 6px rgba(15, 23, 42, 0.04), 0 24px 48px rgba(15, 23, 42, 0.12)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 10,
      },
    }),
  },
  cardGlowTop: {
    height: 4,
    width: "100%",
    opacity: 0.95,
  },
  cardInner: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Theme.borderLight,
  },
  badgeCircleWrap: {
    alignSelf: "center",
    marginBottom: 8,
  },
  badgeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 12px 32px rgba(4, 120, 87, 0.32)" },
      default: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
  },
  kicker: {
    alignSelf: "center",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 3,
    textAlign: "center",
  },
  instruction: {
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    marginBottom: 3,
    letterSpacing: -0.15,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  tripRef: {
    alignSelf: "center",
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 10,
    textAlign: "center",
  },
  summaryShell: {
    alignSelf: "stretch",
    marginBottom: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 8,
  },
  summaryKicker: {
    ...FinanceTxnTypography.chipLabel,
    marginBottom: 2,
  },
  summaryRouteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  routeIconCol: {
    paddingTop: 2,
    flexShrink: 0,
  },
  summaryRouteTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryArrowDivider: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    opacity: 0.85,
  },
  summaryRouteMain: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    fontStyle: "normal",
  },
  summaryMetaLine: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chipFlex: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "30%",
    maxWidth: "100%",
  },
  chipLab: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 1,
  },
  chipVal: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontStyle: "normal",
  },
  driverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "stretch",
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(4, 120, 87, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.18)",
  },
  driverIconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(4, 120, 87, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.2)",
    flexShrink: 0,
  },
  driverTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  driverMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  driverNameText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  driverPhoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  codeBand: {
    alignSelf: "stretch",
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: "rgba(4, 120, 87, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.12)",
  },
  codeBandPressed: {
    opacity: 0.88,
    backgroundColor: "rgba(4, 120, 87, 0.08)",
  },
  tapCopyHint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  digitsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    flexWrap: "nowrap",
    maxWidth: "100%",
  },
  digitCell: {
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: "rgba(4, 120, 87, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(4, 120, 87, 0.12)" },
      default: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  digitChar: {
    fontSize: 30,
    fontWeight: "800",
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  digitFallback: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 8,
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  otpActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    alignSelf: "stretch",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    minHeight: 40,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.driverEmeraldDark,
  },
  actionBtnSecondary: {
    backgroundColor: "rgba(79, 70, 229, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.25)",
  },
  actionBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  actionBtnTextPrimary: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  actionBtnTextSecondary: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  metaGrid: {
    gap: 8,
    marginBottom: 10,
    alignSelf: "stretch",
  },
  metaGridTwoCol: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metaTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    minWidth: 0,
  },
  metaTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metaTileIconAccent: {
    backgroundColor: "rgba(4, 120, 87, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.18)",
  },
  metaTileIconMuted: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  metaTileText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  metaTileLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.65,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 3,
  },
  metaTileValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
  metaTileValueMuted: {
    color: Theme.textMuted,
    fontWeight: "600",
    fontSize: 10,
  },
  metaTileSub: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  regenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
    minHeight: 42,
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  regenerateBtnDisabled: {
    opacity: 0.55,
  },
  regenerateText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.primary,
    textTransform: "uppercase",
  },
});
