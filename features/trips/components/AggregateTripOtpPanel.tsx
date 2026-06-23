/**
 * Aggregate trip OTP status — shared between trip detail layouts (inline + assignment sheet).
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type AggregateOtpUiState =
  | "not_required"
  | "otp_pending"
  | "verified"
  | null;

export interface AggregateTripOtpPanelProps {
  /** `sheet` = inside light-gray assignment modal; `inline` = voyage / workspace card */
  variant?: "inline" | "sheet";
  tripNumber: string;
  aggregateOtpState: AggregateOtpUiState;
  canGenerateAggregateOtp: boolean;
  otpLockedByTripProgress: boolean;
  tripOtp?: { code?: string | null; expires_at?: string | null } | null;
  onResendOtp: () => void | Promise<void>;
  otpResending: boolean;
}

export function AggregateTripOtpPanel({
  variant = "inline",
  tripNumber,
  aggregateOtpState,
  canGenerateAggregateOtp,
  otpLockedByTripProgress,
  tripOtp,
  onResendOtp,
  otpResending,
}: AggregateTripOtpPanelProps) {
  const s = variant === "sheet" ? sheetStyles : inlineStyles;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <FontAwesome name="shield" size={14} color={variant === "sheet" ? "#4D3636" : "#64748b"} />
        <Text style={s.title}>Driver OTP · {tripNumber}</Text>
      </View>
      {aggregateOtpState === "verified" ? (
        <View style={[s.badge, s.badgeOk]}>
          <Text style={[s.badgeText, s.badgeTextOk]}>Driver verified</Text>
        </View>
      ) : null}

      <Text style={s.sub}>
        {!canGenerateAggregateOtp
          ? "OTP is issued after both driver and vehicle are assigned."
          : aggregateOtpState === "verified"
            ? "Driver confirmed assignment from the driver app."
            : tripOtp?.expires_at
              ? `Active OTP · expires ${new Date(tripOtp.expires_at).toLocaleString("en-IN")}`
              : otpLockedByTripProgress
                ? "Journey started — OTP claim window closed for new codes."
                : "Share the OTP with the driver so they can claim this trip."}
      </Text>

      {aggregateOtpState !== "verified" && tripOtp?.code ? (
        <View style={s.codeRow}>
          <Text style={s.codeLabel}>Code</Text>
          <Text style={s.codeValue}>{tripOtp.code}</Text>
        </View>
      ) : null}

      <View style={s.actions}>
        {aggregateOtpState === "verified" ? (
          <Text style={s.statusMuted}>Verified</Text>
        ) : null}
        {canGenerateAggregateOtp &&
        aggregateOtpState !== "verified" &&
        !otpLockedByTripProgress ? (
          <TouchableOpacity
            style={s.resendBtn}
            onPress={() => void onResendOtp()}
            disabled={otpResending}
            activeOpacity={0.85}
          >
            <Text style={s.resendText}>
              {otpResending ? "Sending…" : "Resend OTP"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {!canGenerateAggregateOtp && aggregateOtpState !== "verified" ? (
          <View style={s.disabledNote}>
            <Text style={s.disabledNoteText}>Assign driver + vehicle to enable OTP</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOk: {
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgeTextOk: {
    color: "#15803d",
  },
  sub: {
    fontSize: 11,
    color: "#6b7280",
    lineHeight: 16,
    fontWeight: "600",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  codeValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 1.2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  statusMuted: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803d",
    textTransform: "uppercase",
  },
  resendBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  resendText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  disabledNote: {
    paddingVertical: 6,
  },
  disabledNoteText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

const sheetStyles = StyleSheet.create({
  card: {
    marginTop: 4,
    marginHorizontal: 2,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.22)",
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: "#312e81",
    letterSpacing: 0.2,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOk: {
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgeTextOk: {
    color: "#15803d",
  },
  sub: {
    fontSize: 11,
    color: "#475569",
    lineHeight: 17,
    fontWeight: "600",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  codeValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  statusMuted: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803d",
    textTransform: "uppercase",
  },
  resendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  resendText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  disabledNote: {
    paddingVertical: 4,
  },
  disabledNoteText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
  },
});
