/**
 * Job Request Card — trip assignment UI for driver (connectivity + OTP flow).
 * Earnings header, pickup/drop-off, distance/ETA pill, hold-to-accept button.
 * No close button; no swipe left/right.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
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

const CARD_PADDING = 24;
const CARD_PADDING_BOTTOM = 20;
const CARD_MARGIN_H = 16;
const CARD_RADIUS = 32;
const EARNINGS_ICON_SIZE = 40;
const EARNINGS_ICON_INNER = 20;
const EARNINGS_AMOUNT_FONT = 24;
const EARNINGS_LABEL_FONT = 11;
const PICKUP_DROP_ICON_SIZE = 24;
const PICKUP_DOT_SIZE = 8;
const ADDRESS_LABEL_FONT = 10;
const ADDRESS_FONT = 16;
const PILL_PADDING_V = 12;
const PILL_PADDING_H = 16;
const PILL_RADIUS = 12;
const PILL_FONT = 16;
const HOLD_DURATION_MS = 1500;
const HOLD_BTN_HEIGHT = 56;
const HOLD_BTN_RADIUS = 14;
const OTP_LENGTH = 6;
/** Generous so finger drift / scroll handoff does not end the hold (native + sheet). */
const HOLD_PRESS_RETENTION = 100;

/** Reduces spurious onPressOut on mobile web (scroll/selection) during long-press. */
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
  /** Optional: collapse/expand toggle (UI only). */
  onToggleCollapse?: () => void;
  /** Optional: whether the card is currently collapsed (for chevron + disabling swipe). */
  collapsed?: boolean;
  /** Optional: show "Accept & enter OTP" style (same card, different copy after accept) */
  requireOtp?: boolean;
  /** Optional: disable while accept/decline in progress */
  disabled?: boolean;
  /** Optional: accent color for earnings icon and progress (default Theme.positive) */
  accentColor?: string;
  /** Large currency line above "ESTIMATED EARNINGS". Default Theme.textPrimaryDark; use Theme.textOnPrimary on dark surfaces */
  earningsAmountColor?: string;
  /** Primary body text: addresses, OTP title/digits (not the light distance/ETA pill). Default Theme.textPrimaryDark */
  primaryTextColor?: string;
  /** Muted labels: PICKUP/DROP-OFF, ESTIMATED EARNINGS, icons. Default Theme.textMuted */
  mutedTextColor?: string;
  /** Hold-to-accept bar background. Default Theme.textPrimaryDark */
  holdTrackColor?: string;
  /** Optional: error message to show above swipe bar (e.g. accept failed) */
  errorMessage?: string | null;
  /** Optional: show OTP entry as next step inside same card */
  otpMode?: boolean;
  otpValue?: string;
  onOtpChange?: (value: string) => void;
  onOtpSubmit?: () => void;
  otpSubmitting?: boolean;
  otpError?: string | null;
  onOtpCancel?: () => void;
  /** When true, remove horizontal margins so the card can be used inside an edge-to-edge bottom sheet. */
  edgeToEdge?: boolean;
  /**
   * Visual mode.
   * - "card": default rounded card frame (used in standalone lists)
   * - "page": frameless page inside the existing bottom sheet container
   */
  variant?: "card" | "page";
  /**
   * Stable id for the assignment. Hold-to-accept resets when this or pickup/dropoff
   * changes, not when distance/eta/earnings strings refresh (e.g. after route load).
   */
  assignmentId?: string;
  /**
   * Dispatcher / org display, e.g. "Alex Kumar · ACME Logistics" (same logic as Notifications).
   */
  assignedByLine?: string | null;
  /** Bottom sheet map mode: use BottomSheetTextInput for keyboard sync. */
  OtpInputComponent?: ComponentType<TextInputProps>;
  /** Called when the hidden OTP field receives focus (e.g. expand sheet). */
  onOtpFocus?: () => void;
  /** Extra bottom padding when the software keyboard is open (web / native). */
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
  accentColor = Theme.positive,
  earningsAmountColor = Theme.textPrimaryDark,
  primaryTextColor = Theme.textPrimaryDark,
  mutedTextColor = Theme.textMuted,
  holdTrackColor = Theme.textPrimaryDark,
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

  return (
    <View
      style={[
        variant === "page"
          ? styles.page
          : [
              styles.card,
              Platform.OS === "ios"
                ? styles.cardShadowIos
                : styles.cardShadowAndroid,
              { marginHorizontal: edgeToEdge ? 0 : CARD_MARGIN_H },
            ],
      ]}
    >
      {onToggleCollapse ? (
        <TouchableOpacity
          onPress={onToggleCollapse}
          style={styles.collapseHandle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? "Expand" : "Collapse"}
          hitSlop={12}
        >
          <FontAwesome
            name={collapsed ? "chevron-up" : "chevron-down"}
            size={16}
            color={mutedTextColor}
          />
        </TouchableOpacity>
      ) : null}
      {otpMode ? (
        <View
          style={[
            styles.otpPageWrap,
            otpKeyboardInset > 0 && { paddingBottom: otpKeyboardInset },
          ]}
        >
          <Text
            style={[styles.otpPageTitle, { color: primaryTextColor }]}
          >
            Enter trip OTP
          </Text>
          <Text style={[styles.otpPageSubtitle, { color: mutedTextColor }]}>
            Enter the 6-digit OTP shared by your dispatcher to claim this
            trip.
          </Text>
          {assignedByLine?.trim() ? (
            <View style={styles.assignerCompact}>
              <Text
                style={[styles.assignerLabelCompact, { color: mutedTextColor }]}
              >
                ASSIGNED BY
              </Text>
              <Text
                style={[styles.assignerValueCompact, { color: primaryTextColor }]}
                numberOfLines={2}
              >
                {assignedByLine.trim()}
              </Text>
            </View>
          ) : null}
          <Text
            style={[styles.otpPageRoute, { color: primaryTextColor }]}
            numberOfLines={2}
          >
            {pickup || "Pickup"} to {dropoff || "Drop-off"}
          </Text>
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
                    backgroundColor: Theme.surfaceLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.otpBoxDigit,
                    { color: primaryTextColor },
                  ]}
                >
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
              styles.otpSubmitBtn,
              { backgroundColor: accentColor },
              (otpSubmitting || otpValue.length !== OTP_LENGTH) &&
                styles.holdBtnDisabled,
            ]}
            disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
            activeOpacity={0.85}
          >
            {otpSubmitting ? (
              <Text style={styles.otpSubmitText}>Verifying...</Text>
            ) : (
              <>
                <FontAwesome
                  name="check"
                  size={16}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.otpSubmitText}>Verify OTP</Text>
              </>
            )}
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
      ) : (
        <>
          {/* Header: earnings only (no close button) */}
          <View style={styles.header}>
            <View style={styles.earningsRow}>
              <View
                style={[
                  styles.earningsIconWrap,
                  { backgroundColor: `${accentColor}20` },
                ]}
              >
                <FontAwesome
                  name="money"
                  size={EARNINGS_ICON_INNER}
                  color={accentColor}
                />
              </View>
              <View style={styles.earningsTextWrap}>
                <Text
                  style={[
                    styles.earningsAmount,
                    { color: earningsAmountColor },
                  ]}
                  numberOfLines={1}
                >
                  {earnings}
                </Text>
                <Text
                  style={[styles.earningsLabel, { color: mutedTextColor }]}
                >
                  ESTIMATED EARNINGS
                </Text>
              </View>
            </View>
          </View>
          {!collapsed && assignedByLine?.trim() ? (
            <View style={styles.assignerSection}>
              <Text style={[styles.assignerLabel, { color: mutedTextColor }]}>
                ASSIGNED BY
              </Text>
              <Text
                style={[styles.assignerValue, { color: primaryTextColor }]}
                numberOfLines={3}
              >
                {assignedByLine.trim()}
              </Text>
            </View>
          ) : null}

          {!collapsed ? (
            <>
              {/* Distance + ETA pill */}
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: Theme.surfaceLight,
                    borderColor: Theme.border,
                  },
                ]}
              >
                <View style={styles.pillItem}>
                  <FontAwesome
                    name="paper-plane"
                    size={16}
                    color={Theme.textMuted}
                  />
                  <Text
                    style={[styles.pillText, { color: Theme.textPrimaryDark }]}
                  >
                    {distance}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pillDivider,
                    { backgroundColor: Theme.border },
                  ]}
                />
                <View style={styles.pillItem}>
                  <FontAwesome
                    name="clock-o"
                    size={16}
                    color={Theme.textMuted}
                  />
                  <Text
                    style={[styles.pillText, { color: Theme.textPrimaryDark }]}
                  >
                    {eta}
                  </Text>
                </View>
              </View>
              <View style={styles.routeWrap}>
                <View style={styles.routeRow}>
                  <View
                    style={[
                      styles.routeIconWrap,
                      {
                        backgroundColor: Theme.surfaceLight,
                        borderColor: Theme.border,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.pickupDot,
                        { backgroundColor: Theme.textPrimaryDark },
                      ]}
                    />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <Text
                      style={[styles.routeLabel, { color: mutedTextColor }]}
                    >
                      PICKUP
                    </Text>
                    <Text
                      style={[
                        styles.routeAddress,
                        { color: primaryTextColor },
                      ]}
                      numberOfLines={2}
                    >
                      {pickup || "—"}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.connectorLine,
                    { backgroundColor: Theme.border },
                  ]}
                />
                <View style={styles.routeRow}>
                  <View
                    style={[
                      styles.routeIconWrap,
                      { backgroundColor: `${accentColor}20` },
                    ]}
                  >
                    <FontAwesome
                      name="map-marker"
                      size={14}
                      color={accentColor}
                    />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <Text
                      style={[styles.routeLabel, { color: mutedTextColor }]}
                    >
                      DROP-OFF
                    </Text>
                    <Text
                      style={[
                        styles.routeAddress,
                        { color: primaryTextColor },
                      ]}
                      numberOfLines={2}
                    >
                      {dropoff || "—"}
                    </Text>
                  </View>
                </View>
              </View>
              {errorMessage ? (
                <Text style={[styles.errorText, { color: Theme.negative }]}>
                  {errorMessage}
                </Text>
              ) : null}
              {/* Hold to accept */}
              <Pressable
                onPressIn={startHold}
                onPressOut={cancelHold}
                onLongPress={completeAccept}
                delayLongPress={HOLD_DURATION_MS}
                pressRetentionOffset={HOLD_PRESS_RETENTION}
                android_ripple={{ color: "transparent" }}
                style={[
                  styles.holdBtnWrap,
                  disabled && styles.holdBtnDisabled,
                  Platform.OS === "web" && holdBtnWebStyle,
                ]}
                disabled={disabled}
              >
                <View
                  style={[
                    styles.holdTrack,
                    { backgroundColor: holdTrackColor },
                  ]}
                >
                  <View
                    style={[
                      styles.holdFill,
                      {
                        width: `${holdProgress}%`,
                        backgroundColor: "rgba(255,255,255,0.18)",
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[styles.holdLabel, { color: Theme.textOnPrimary }]}
                  numberOfLines={1}
                >
                  {isAccepted
                    ? requireOtp
                      ? "Accepted! Enter OTP"
                      : "Accepted!"
                    : "Hold to accept"}
                </Text>
              </Pressable>
              {onDecline && !isAccepted && (
                <TouchableOpacity
                  onPress={onDecline}
                  style={styles.declineLinkWrap}
                  disabled={disabled}
                  activeOpacity={0.7}
                  accessibilityLabel="Decline"
                >
                  <Text
                    style={[styles.declineLink, { color: mutedTextColor }]}
                  >
                    Decline
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: CARD_MARGIN_H,
    marginBottom: 8,
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderRadius: 24,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  /** Frameless container so the bottom sheet itself becomes the only "panel". */
  page: {
    marginHorizontal: 0,
    marginBottom: 0,
    paddingTop: 8,
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    overflow: "visible",
    borderWidth: 0,
  },
  collapseHandle: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignSelf: "center",
    width: 44,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  cardShadowIos: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  cardShadowAndroid: {
    elevation: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  earningsIconWrap: {
    width: EARNINGS_ICON_SIZE,
    height: EARNINGS_ICON_SIZE,
    borderRadius: EARNINGS_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  earningsAmount: {
    fontSize: 24,
    fontWeight: "900",
  },
  earningsTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  earningsLabel: {
    fontSize: EARNINGS_LABEL_FONT,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  assignerSection: {
    marginBottom: 12,
    marginTop: -2,
    paddingBottom: 2,
  },
  assignerLabel: {
    fontSize: ADDRESS_LABEL_FONT,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  assignerValue: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    flexShrink: 1,
  },
  assignerCompact: {
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  assignerLabelCompact: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  assignerValueCompact: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  routeWrap: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  routeIconWrap: {
    width: PICKUP_DROP_ICON_SIZE,
    height: PICKUP_DROP_ICON_SIZE,
    borderRadius: PICKUP_DROP_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  pickupDot: {
    width: PICKUP_DOT_SIZE,
    height: PICKUP_DOT_SIZE,
    borderRadius: PICKUP_DOT_SIZE / 2,
  },
  routeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  routeLabel: {
    fontSize: ADDRESS_LABEL_FONT,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  routeAddress: {
    fontSize: ADDRESS_FONT,
    fontWeight: "600",
    marginTop: 2,
    flexShrink: 1,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 4,
  },
  connectorLine: {
    width: 2,
    height: 16,
    marginLeft: 11,
    marginVertical: 4,
    borderRadius: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: PILL_PADDING_V,
    paddingHorizontal: PILL_PADDING_H,
    borderRadius: 18,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
  },
  pillItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  pillDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 12,
  },
  pillText: {
    fontSize: PILL_FONT,
    fontWeight: "600",
  },
  otpScroll: {
    width: "100%",
  },
  otpScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 12,
  },
  otpPageWrap: {
    width: "100%",
    paddingTop: 4,
    alignItems: "center",
  },
  otpPageTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  otpPageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 14,
  },
  otpPageRoute: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
    marginBottom: 16,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    marginBottom: 14,
  },
  otpBox: {
    width: 42,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxDigit: {
    fontSize: 20,
    fontWeight: "700",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpSubmitBtn: {
    width: "100%",
    minHeight: HOLD_BTN_HEIGHT,
    borderRadius: HOLD_BTN_RADIUS,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  otpSubmitText: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  holdBtnWrap: {
    height: HOLD_BTN_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    marginTop: 12,
  },
  holdBtnDisabled: {
    opacity: 0.7,
  },
  holdTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  holdFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 18,
  },
  holdLabel: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
    zIndex: 1,
  },
  declineLinkWrap: {
    alignSelf: "center",
    paddingTop: 10,
    paddingBottom: 2,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  declineLink: {
    fontSize: 14,
    fontWeight: "800",
  },
});

export default JobRequestCard;
