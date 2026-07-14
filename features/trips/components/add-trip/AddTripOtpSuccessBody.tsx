/**
 * Post-create Driver OTP success card — responsive layout, copy/share, trip context.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
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
          size={13}
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
    const innerPad = 24 + 8;
    const innerW = Math.max(180, cardMaxWidth - innerPad);
    const gap = count >= 6 ? (winW < 380 ? 3 : 4) : 6;
    const cellW = Math.floor((innerW - gap * (count - 1)) / count);
    const heroSize = Math.min(22, Math.max(17, Math.round(cellW * 0.48)));
    const cellH = Math.max(36, heroSize + 10);
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
        colors={["#f8fafc", "#f1f5f9", "#fafafa"]}
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
              <View style={styles.headerRow}>
                <MotiView
                  from={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 16, stiffness: 240 }}
                  style={styles.badgeCircle}
                >
                  <CheckCircle2 size={16} color={Theme.textOnPrimary} strokeWidth={2.5} />
                </MotiView>
                <View style={styles.headerCopy}>
                  <Text style={styles.kicker}>Driver OTP</Text>
                  <Text style={styles.instruction}>Share this code with the driver</Text>
                  {createdResult.successDetails?.tripNumber ? (
                    <Text style={styles.tripRef} numberOfLines={1}>
                      Trip {createdResult.successDetails.tripNumber}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.sectionDivider} />

              {hasSummary && ctx ? (
                <View style={styles.summaryShell}>
                  <View style={styles.summaryHeaderRow}>
                    <Text style={styles.summaryKicker}>Trip summary</Text>
                    {ctx.routeLine ? (
                      <Text style={styles.summaryMetaLine} numberOfLines={1}>
                        {ctx.routeLine}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.summaryRouteRow}>
                    <View style={styles.routeIconCol}>
                      <MapPinned size={12} color={Theme.iconPrimary} strokeWidth={2} />
                    </View>
                    <View style={styles.summaryRouteTextCol}>
                      <Text style={styles.summaryRouteMain} numberOfLines={1}>
                        {ctx.pickupArea || "—"}
                      </Text>
                      <View style={styles.summaryArrowDivider}>
                        <ArrowDown size={9} color={Theme.textMuted} strokeWidth={2} />
                      </View>
                      <Text style={styles.summaryRouteMain} numberOfLines={1}>
                        {ctx.dropLocation || "—"}
                      </Text>
                    </View>
                  </View>
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
                <View style={styles.driverBanner}>
                  <View style={styles.driverIconTile}>
                    <User size={13} color={Theme.driverEmeraldDark} strokeWidth={2} />
                  </View>
                  <View style={styles.driverTextCol}>
                    <Text style={styles.driverMetaLabel}>Driver</Text>
                    <View style={styles.driverNameRow}>
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
                  </View>
                </View>
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
                  <Copy size={13} color={Theme.textOnPrimary} strokeWidth={2} />
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
                  <Share2 size={13} color={Theme.primary} strokeWidth={2} />
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
                  <RotateCw size={12} color={Theme.textSecondary} strokeWidth={2} />
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
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 6,
      },
    }),
  },
  cardGlowTop: {
    height: 3,
    width: "100%",
    opacity: 1,
  },
  cardInner: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "stretch",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  badgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldDark,
    flexShrink: 0,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    alignSelf: "stretch",
  },
  kicker: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  instruction: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 14,
  },
  tripRef: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 1,
  },
  summaryShell: {
    alignSelf: "stretch",
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 6,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryKicker: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
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
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
  },
  summaryMetaLine: {
    flex: 1,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    textAlign: "right",
  },
  summaryChips: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chipFlex: {
    flexGrow: 1,
    flexShrink: 1,
  },
  chipLab: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 1,
  },
  chipVal: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  driverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(4, 120, 87, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.14)",
  },
  driverIconTile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(4, 120, 87, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  driverTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  driverNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  driverMetaLabel: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  driverNameText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  driverPhoneText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  codeBand: {
    alignSelf: "stretch",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: "rgba(4, 120, 87, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.1)",
  },
  codeBandPressed: {
    opacity: 0.88,
    backgroundColor: "rgba(4, 120, 87, 0.08)",
  },
  tapCopyHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 5,
    letterSpacing: 0.1,
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
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  digitChar: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  digitFallback: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 6,
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  otpActions: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "stretch",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    minHeight: 34,
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
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
  },
  actionBtnTextSecondary: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.1,
  },
  metaGrid: {
    gap: 6,
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
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    minWidth: 0,
  },
  metaTileIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
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
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  metaTileValue: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
    fontVariant: ["tabular-nums"],
  },
  metaTileValueMuted: {
    color: Theme.textMuted,
    fontWeight: "500",
    fontSize: 8,
  },
  metaTileSub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 1,
  },
  regenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "stretch",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 34,
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  regenerateBtnDisabled: {
    opacity: 0.55,
  },
  regenerateText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
});
