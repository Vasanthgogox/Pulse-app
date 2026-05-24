/**
 * Job Request Card — trip assignment UI for driver (connectivity + OTP flow).
 * Visual layout aligned with driver `DriverInviteModal` (emerald hero, offer tiles, footer).
 */
import {
  HeroAssignerBlock,
  HeroKindBadge,
  RouteInlineRow,
  sheetStyles,
  TRIP_SHEET_TOP_RADIUS,
  TripDetailsStrip,
} from "@/components/driver/DriverTripSheetLayout";
import Theme from "@/constants/Theme";
import type { JobCardAssignerPayload } from "@/lib/driverAssignerDisplay";
import { LinearGradient } from "expo-linear-gradient";
import {
  Sparkles,
  Wallet,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";

const HOLD_DURATION_MS = 1500;
const HOLD_BTN_HEIGHT = 38;
const OTP_LENGTH = 6;
const HOLD_PRESS_RETENTION = 100;

const EMERALD = Theme.driverEmerald;
const EMERALD_DARK = Theme.driverEmeraldDark;
const MINT = "rgba(167,243,208,0.92)";

const holdBtnWebStyle = {
  touchAction: "none" as "none" | "auto" | "manipulation",
  userSelect: "none" as "none" | "auto" | "text" | "contain" | "all",
};

export interface JobRequestCardProps {
  pickup: string;
  dropoff: string;
  distance: string;
  eta: string;
  earnings: string;
  onAccept: () => void;
  onDecline: () => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  requireOtp?: boolean;
  disabled?: boolean;
  accentColor?: string;
  earningsAmountColor?: string;
  primaryTextColor?: string;
  mutedTextColor?: string;
  holdTrackColor?: string;
  errorMessage?: string | null;
  otpMode?: boolean;
  otpValue?: string;
  onOtpChange?: (value: string) => void;
  onOtpSubmit?: () => void;
  otpSubmitting?: boolean;
  otpError?: string | null;
  onOtpCancel?: () => void;
  edgeToEdge?: boolean;
  variant?: "card" | "page";
  assignmentId?: string;
  assignedBy?: JobCardAssignerPayload | null;
  assignedByLine?: string | null;
  OtpInputComponent?: ComponentType<TextInputProps>;
  onOtpFocus?: () => void;
  otpKeyboardInset?: number;
}

export function JobRequestCard({
  pickup,
  dropoff,
  distance,
  eta,
  earnings,
  onAccept,
  onDecline,
  onToggleCollapse,
  collapsed = false,
  requireOtp = false,
  disabled = false,
  accentColor = EMERALD,
  primaryTextColor = Theme.textPrimaryDark,
  mutedTextColor = Theme.textMuted,
  errorMessage = null,
  otpMode = false,
  otpValue = "",
  onOtpChange,
  onOtpSubmit,
  otpSubmitting = false,
  otpError = null,
  onOtpCancel,
  edgeToEdge = false,
  variant = "card",
  assignmentId,
  assignedBy = null,
  assignedByLine = null,
  OtpInputComponent: OtpInput = TextInput,
  onOtpFocus,
  otpKeyboardInset = 0,
}: JobRequestCardProps) {
  const [isAccepted, setIsAccepted] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);
  const acceptedOnceRef = useRef(false);
  const otpInputRef = useRef<TextInput | null>(null);

  const holdResetKey = useMemo(
    () =>
      assignmentId != null && String(assignmentId).length > 0
        ? `id:${String(assignmentId)}`
        : `route:${pickup}\u0001${dropoff}`,
    [assignmentId, pickup, dropoff],
  );

  useEffect(() => {
    setIsAccepted(false);
    setHoldProgress(0);
    setIsHolding(false);
    acceptedOnceRef.current = false;
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, [holdResetKey]);

  useEffect(() => {
    if (!otpMode) {
      setIsAccepted(false);
    }
  }, [otpMode]);

  const completeAccept = () => {
    if (acceptedOnceRef.current || disabled) return;
    acceptedOnceRef.current = true;
    setIsHolding(false);
    setHoldProgress(100);
    setIsAccepted(true);
    onAccept();
  };

  const startHold = () => {
    if (disabled || isAccepted) return;
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(true);
    setHoldProgress(0);
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        completeAccept();
      }
    }, 20);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
    setIsHolding(false);
  };

  const shellStyle =
    variant === "page" || edgeToEdge
      ? [
          styles.sheet,
          styles.sheetEdgeToEdge,
          Platform.OS === "ios" ? styles.sheetShadowIos : styles.sheetShadowAndroid,
        ]
      : [
          styles.sheet,
          styles.sheetInset,
          Platform.OS === "ios" ? styles.sheetShadowIos : styles.sheetShadowAndroid,
        ];

  const showHeroAssigner =
    assignedBy != null
      ? Boolean(
          assignedBy.linePrimary.trim() || assignedBy.lineSecondary.trim(),
        )
      : Boolean(assignedByLine?.trim());

  return (
    <View style={shellStyle}>
      {onToggleCollapse ? (
        <TouchableOpacity
          onPress={onToggleCollapse}
          style={styles.collapseHandle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? "Expand" : "Collapse"}
          hitSlop={12}
        >
          <Text style={[styles.collapseChevron, { color: mutedTextColor }]}>
            {collapsed ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {otpMode ? (
        <View
          style={[
            styles.otpPageWrap,
            otpKeyboardInset > 0 && { paddingBottom: otpKeyboardInset },
          ]}
        >
          <LinearGradient
            colors={[EMERALD_DARK, EMERALD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCompact}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={9} color={MINT} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>VERIFY TRIP</Text>
              </View>
              {assignedBy ? (
                <HeroKindBadge kind={assignedBy.kind} label={assignedBy.kindLabel} />
              ) : null}
            </View>
            <Text style={styles.heroTitleCompact}>Enter trip OTP</Text>
            {showHeroAssigner ? (
              <View style={styles.heroAssignerOtpWrap}>
                <HeroAssignerBlock
                  assigner={assignedBy}
                  assignedByLine={assignedByLine}
                />
              </View>
            ) : null}
          </LinearGradient>
          <View style={styles.body}>
            <Text style={[styles.otpSubtitle, { color: mutedTextColor }]}>
              Enter the 6-digit OTP shared by your dispatcher to claim this trip.
            </Text>
            <View style={sheetStyles.tripDetailsCard}>
              <RouteInlineRow
                pickup={pickup}
                dropoff={dropoff}
                primaryTextColor={primaryTextColor}
                mutedTextColor={mutedTextColor}
              />
            </View>
            <TouchableOpacity
              style={styles.otpBoxRow}
              onPress={() => otpInputRef.current?.focus()}
              activeOpacity={1}
            >
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    {
                      borderColor:
                        otpValue.length === i ? accentColor : Theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.otpBoxDigit, { color: primaryTextColor }]}>
                    {otpValue[i] ?? ""}
                  </Text>
                </View>
              ))}
            </TouchableOpacity>
            <OtpInput
              ref={otpInputRef as never}
              value={otpValue}
              onChangeText={(value) =>
                onOtpChange?.(value.replace(/\D/g, "").slice(0, OTP_LENGTH))
              }
              onFocus={onOtpFocus}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              style={styles.otpHiddenInput}
              caretHidden
              autoFocus
            />
            {otpError ? (
              <Text style={[styles.errorText, { color: Theme.negative }]}>
                {otpError}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={onOtpSubmit}
              style={[
                styles.verifyBtnWrap,
                (otpSubmitting || otpValue.length !== OTP_LENGTH) &&
                  styles.btnDisabled,
              ]}
              disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[EMERALD, EMERALD_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.verifyGradient}
              >
                <Text style={styles.verifyText}>
                  {otpSubmitting ? "Verifying…" : "Verify OTP"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            {onOtpCancel ? (
              <TouchableOpacity
                onPress={onOtpCancel}
                style={styles.declineLinkWrap}
                activeOpacity={0.7}
              >
                <Text style={[styles.declineLink, { color: mutedTextColor }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <LinearGradient
            colors={[EMERALD_DARK, EMERALD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={9} color={MINT} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>TRIP ASSIGNMENT</Text>
              </View>
              {assignedBy ? (
                <HeroKindBadge kind={assignedBy.kind} label={assignedBy.kindLabel} />
              ) : null}
            </View>
            <View style={styles.heroMainRow}>
              <View
                style={[
                  styles.heroEarningsBlock,
                  !showHeroAssigner && styles.heroEarningsBlockFull,
                ]}
              >
                <View style={styles.heroIconWrap}>
                  <Wallet size={14} color={EMERALD} strokeWidth={2.2} />
                </View>
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroAmount} numberOfLines={1}>
                    {earnings}
                  </Text>
                  <Text style={styles.heroAmountLabel}>EST. EARNINGS</Text>
                </View>
              </View>
              {showHeroAssigner ? (
                <>
                  <View style={styles.heroColDivider} />
                  <HeroAssignerBlock
                    assigner={assignedBy}
                    assignedByLine={assignedByLine}
                  />
                </>
              ) : null}
            </View>
          </LinearGradient>

          {!collapsed ? (
            <View style={styles.body}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: mutedTextColor }]}>
                  TRIP DETAILS
                </Text>
              </View>

              <TripDetailsStrip
                statLeft={distance}
                statRight={eta}
                pickup={pickup}
                dropoff={dropoff}
                primaryTextColor={primaryTextColor}
                mutedTextColor={mutedTextColor}
              />

              {errorMessage ? (
                <Text style={[styles.errorText, { color: Theme.negative }]}>
                  {errorMessage}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <View style={styles.actions}>
                  {onDecline && !isAccepted ? (
                    <TouchableOpacity
                      onPress={onDecline}
                      style={styles.declineBtn}
                      disabled={disabled}
                      activeOpacity={0.82}
                    >
                      <Text style={[styles.declineBtnText, { color: mutedTextColor }]}>
                        Decline
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <Pressable
                    onPressIn={startHold}
                    onPressOut={cancelHold}
                    onLongPress={completeAccept}
                    delayLongPress={HOLD_DURATION_MS}
                    pressRetentionOffset={HOLD_PRESS_RETENTION}
                    android_ripple={{ color: "transparent" }}
                    style={[
                      styles.holdBtn,
                      onDecline && !isAccepted ? styles.holdBtnFlex : styles.holdBtnFull,
                      disabled && styles.btnDisabled,
                      Platform.OS === "web" && holdBtnWebStyle,
                    ]}
                    disabled={disabled}
                  >
                    <LinearGradient
                      colors={[EMERALD, EMERALD_DARK]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.holdGradient}
                    >
                      <View
                        style={[
                          styles.holdFill,
                          { width: `${holdProgress}%` },
                        ]}
                      />
                      <Text style={styles.holdLabel} numberOfLines={1}>
                        {isAccepted
                          ? requireOtp
                            ? "Accepted! Enter OTP"
                            : "Accepted!"
                          : isHolding
                            ? "Keep holding…"
                            : "Hold to accept"}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.surface,
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    overflow: "hidden",
  },
  sheetInset: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sheetEdgeToEdge: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sheetShadowIos: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  sheetShadowAndroid: {
    elevation: 12,
  },
  collapseHandle: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  collapseChevron: {
    fontSize: 10,
    fontWeight: "800",
  },
  hero: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  heroCompact: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: MINT,
    textTransform: "uppercase",
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  heroEarningsBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  heroEarningsBlockFull: {
    flex: 1,
  },
  heroColDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignSelf: "center",
    flexShrink: 0,
  },
  heroAssignerOtpWrap: {
    marginTop: 2,
    paddingTop: 6,
    paddingLeft: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  heroIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  heroAmount: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.25,
    lineHeight: 18,
  },
  heroAmountLabel: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: MINT,
    textTransform: "uppercase",
  },
  heroTitleCompact: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.3,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: Theme.surface,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
  },
  footer: {
    paddingTop: 0,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "stretch",
  },
  declineBtn: {
    flex: 1,
    minHeight: HOLD_BTN_HEIGHT,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  declineBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  holdBtn: {
    minHeight: HOLD_BTN_HEIGHT,
    borderRadius: 9,
    overflow: "hidden",
  },
  holdBtnFlex: {
    flex: 1.55,
  },
  holdBtnFull: {
    flex: 1,
  },
  holdGradient: {
    flex: 1,
    minHeight: HOLD_BTN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  holdFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 12,
  },
  holdLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
    zIndex: 1,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  declineLinkWrap: {
    alignSelf: "center",
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  declineLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  otpPageWrap: {
    width: "100%",
  },
  otpSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  otpBox: {
    width: 40,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  otpBoxDigit: {
    fontSize: 18,
    fontWeight: "800",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  verifyBtnWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  verifyGradient: {
    minHeight: HOLD_BTN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  verifyText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});

export default JobRequestCard;
