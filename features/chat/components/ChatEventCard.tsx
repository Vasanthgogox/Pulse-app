import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  CreditCard,
  Truck,
  MapPin,
  Package,
  XCircle,
  Navigation,
  Clock,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";

// ── System event card (trip status changes) ───────────────────────────────────

const STATUS_ICON_MAP: Record<string, { Icon: React.ComponentType<any>; color: string; bg: string }> = {
  assigned:    { Icon: Truck,         color: "#3b82f6", bg: "#eff6ff" },
  in_progress: { Icon: Navigation,    color: "#8b5cf6", bg: "#f5f3ff" },
  picked_up:   { Icon: MapPin,        color: "#f59e0b", bg: "#fffbeb" },
  in_transit:  { Icon: Truck,         color: "#06b6d4", bg: "#ecfeff" },
  at_drop:     { Icon: MapPin,        color: "#10b981", bg: "#ecfdf5" },
  completed:   { Icon: CheckCircle,   color: "#22c55e", bg: "#f0fdf4" },
  cancelled:   { Icon: XCircle,       color: "#ef4444", bg: "#fef2f2" },
  default:     { Icon: Clock,         color: "#94a3b8", bg: "#f8fafc" },
};

function inferStatusFromContent(content: string): keyof typeof STATUS_ICON_MAP {
  const c = content.toLowerCase();
  if (c.includes("accepted") || c.includes("heading to pickup")) return "in_progress";
  if (c.includes("pickup point") || c.includes("reached the pickup")) return "picked_up";
  if (c.includes("in transit") || c.includes("departed")) return "in_transit";
  if (c.includes("reached the destination")) return "at_drop";
  if (c.includes("completed")) return "completed";
  if (c.includes("cancelled")) return "cancelled";
  if (c.includes("assigned")) return "assigned";
  return "default";
}

export function ChatSystemEventCard({ message }: { message: TripMessageRow }) {
  const statusKey = inferStatusFromContent(message.content);
  const { Icon, color, bg } = STATUS_ICON_MAP[statusKey] ?? STATUS_ICON_MAP.default;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  return (
    <View style={s.eventCard}>
      <View style={[s.eventIcon, { backgroundColor: bg }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={s.eventBody}>
        <Text style={s.eventContent}>{message.content}</Text>
        <Text style={s.eventTime}>{displayTime}</Text>
      </View>
    </View>
  );
}

// ── Ledger event card (payment / adjustment) ──────────────────────────────────

interface LedgerCardProps {
  message: TripMessageRow;
  currentOrgId: string;
  /** Chat thread party (linked client/supplier name) — fills missing receiver on cash-in rows. */
  conversationPartyName?: string | null;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  addingToBook?: boolean;
  /** Driver / embedded views: show the card UI without add-to-book or dispute actions. */
  readOnly?: boolean;
}

/**
 * Full metadata usually includes sender/receiver org names. Older/test RPC payloads often omit them;
 * we still persist human-readable `content` from chatLedgerBridge — parse that and use conv party name.
 */
function resolvedLedgerOrgLine(
  meta: LedgerEventMetadata,
  content: string,
  conversationPartyName?: string | null,
): string {
  let sender = (meta.sender_org_name ?? "").trim();
  let receiver = (meta.receiver_org_name ?? "").trim();
  const flow = meta.flow === "out" ? "out" : "in";
  const c = (content ?? "").trim();
  const party = (conversationPartyName ?? "").trim();

  if (!sender || !receiver) {
    if (flow === "in") {
      const needle = " received ";
      const i = c.indexOf(needle);
      if (i > 0) {
        const fromContent = c.slice(0, i).trim();
        if (!sender && fromContent) sender = fromContent;
      }
      // Cash-in line does not encode counterparty org; use whom this conversation is with.
      if (!receiver && party) receiver = party;
    } else {
      const paidIdx = c.indexOf(" paid ");
      const toIdx = c.indexOf(" to ");
      const dotIdx = c.indexOf(" · ");
      if (paidIdx > 0 && toIdx > paidIdx && dotIdx > toIdx) {
        if (!sender) sender = c.slice(0, paidIdx).trim();
        if (!receiver) receiver = c.slice(toIdx + 4, dotIdx).trim();
      }
      if (!receiver && party) receiver = party;
    }
  }

  const left = sender || "—";
  const right = receiver || "—";
  return `${left} → ${right}`;
}

function splitOrgLine(orgLine: string): { from: string; to: string } {
  const trimmed = (orgLine ?? "").trim();
  const arrow = trimmed.split(/\s*→\s*/);
  if (arrow.length >= 2) {
    return {
      from: arrow[0]?.trim() || "—",
      to: arrow.slice(1).join(" → ").trim() || "—",
    };
  }
  return { from: trimmed || "—", to: "" };
}

export function ChatLedgerEventCard({
  message,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  addingToBook,
  readOnly = false,
}: LedgerCardProps) {
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver = meta.receiver_org_id === currentOrgId;
  const isSender = meta.sender_org_id === currentOrgId;

  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowPrefix = flow === "in" ? "+" : "−";
  const isAcknowledged = !!meta.acknowledged_at;
  const isDisputed = !!meta.disputed;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const orgLine = resolvedLedgerOrgLine(meta, message.content, conversationPartyName);
  const { from: fromParty, to: toParty } = splitOrgLine(orgLine);

  const flowHeadline = flow === "in" ? "Payment received" : "Payment sent";
  const isCredit = flow === "in";
  const palette = isCredit
    ? {
        kicker: "#059669",
        headline: "#0f172a",
        amount: "#047857",
        badgeBg: "#ecfdf5",
        badgeText: "#047857",
        badgeBorder: "#d1fae5",
        iconBg: "#ecfdf5",
        iconColor: "#059669",
        iconBorder: "#d1fae5",
        pathBg: "#f8fafc",
        pathBorder: "#e2e8f0",
        pathLabel: "#94a3b8",
        pathName: "#0f172a",
        track: "#e2e8f0",
        fill: "#10b981",
        bar: "#10b981",
        systemBadge: "SYSTEM_CREDITED",
        tripTag: "TRIP_CREDIT",
      }
    : {
        kicker: "#e11d48",
        headline: "#0f172a",
        amount: "#e11d48",
        badgeBg: "#fff1f2",
        badgeText: "#be123c",
        badgeBorder: "#fecdd3",
        iconBg: "#fff1f2",
        iconColor: "#e11d48",
        iconBorder: "#fecdd3",
        pathBg: "#f8fafc",
        pathBorder: "#e2e8f0",
        pathLabel: "#94a3b8",
        pathName: "#0f172a",
        track: "#e2e8f0",
        fill: "#f43f5e",
        bar: "#f43f5e",
        systemBadge: "SYSTEM_DEBITED",
        tripTag: "TRIP_PAYMENT",
      };

  return (
    <View style={s.payOuter}>
      <View style={s.payCard}>
        <View style={s.payBody}>
          <View style={s.payHeaderRow}>
            <View style={s.payHeaderLeft}>
              <View
                style={[
                  s.payIconNode,
                  {
                    backgroundColor: palette.iconBg,
                    borderColor: palette.iconBorder,
                  },
                ]}
              >
                <CreditCard size={24} color={palette.iconColor} strokeWidth={2.2} />
              </View>
              <View style={s.payHeaderTitles}>
                <Text style={[s.payKicker, { color: palette.kicker }]}>{palette.tripTag}</Text>
                <Text style={[s.payHeadline, { color: palette.headline }]} numberOfLines={2}>
                  {flowHeadline}
                </Text>
              </View>
            </View>
            <View style={s.payHeaderRight}>
              <Text style={[s.payAmount, { color: palette.amount }]} numberOfLines={1}>
                {flowPrefix}
                {amountLabel}
              </Text>
              <View
                style={[
                  s.paySystemBadge,
                  { backgroundColor: palette.badgeBg, borderColor: palette.badgeBorder },
                ]}
              >
                <Text style={[s.paySystemBadgeText, { color: palette.badgeText }]}>{palette.systemBadge}</Text>
              </View>
            </View>
          </View>

          <View style={[s.payPathWrap, { backgroundColor: palette.pathBg, borderColor: palette.pathBorder }]}>
            <View style={s.payPathCol}>
              <Text style={[s.payPathLabel, { color: palette.pathLabel }]}>SOURCE_NODE</Text>
              <Text style={[s.payPathName, { color: palette.pathName }]} numberOfLines={2}>
                {fromParty}
              </Text>
            </View>
            <View style={s.payPathCenter}>
              <View style={[s.payProgressTrack, { backgroundColor: palette.track }]}>
                <View style={[s.payProgressFill, { backgroundColor: palette.fill }]} />
              </View>
              <ArrowRight size={18} color="#94a3b8" />
            </View>
            <View style={[s.payPathCol, s.payPathColEnd]}>
              <Text style={[s.payPathLabel, s.payPathLabelEnd, { color: palette.pathLabel }]}>TARGET_NODE</Text>
              <Text
                style={[s.payPathName, s.payPathNameEnd, { color: palette.pathName }]}
                numberOfLines={2}
              >
                {toParty || "—"}
              </Text>
            </View>
          </View>

          <View style={s.payMetaRow}>
            <View style={s.payModePill}>
              <Text style={s.payModePillText}>{paymentModeLabel}</Text>
            </View>
            <View style={s.payMetaRight}>
              {meta.reference_number ? (
                <Text style={s.payRefInline} numberOfLines={1}>
                  #{meta.reference_number}
                </Text>
              ) : null}
              <Text style={s.payTime}>{displayTime}</Text>
            </View>
          </View>

          {meta.notes ? (
            <Text style={s.payNotes} numberOfLines={3}>
              {meta.notes}
            </Text>
          ) : null}

          {isAcknowledged ? (
            <View style={s.payStatus}>
              <CheckCircle size={12} color="#059669" />
              <Text style={[s.payStatusText, { color: "#047857" }]}>Added to book</Text>
            </View>
          ) : isDisputed ? (
            <View style={s.payStatus}>
              <AlertTriangle size={12} color="#d97706" />
              <Text style={[s.payStatusText, { color: "#b45309" }]}>Dispute raised</Text>
            </View>
          ) : !readOnly && isReceiver && !isSender ? (
            <View style={s.payActions}>
              <TouchableOpacity
                style={s.addToBookBtn}
                onPress={() => onAddToBook(message)}
                disabled={addingToBook}
                activeOpacity={0.8}
              >
                {addingToBook ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.addToBookText}>Add to book</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.disputeBtn}
                onPress={() => onDispute(message)}
                disabled={addingToBook}
                activeOpacity={0.8}
              >
                <Text style={s.disputeText}>Dispute</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={[s.paySecurityBar, { backgroundColor: palette.bar }]} />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // System event
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
    marginVertical: 4,
  },
  eventIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventBody: { flex: 1, minWidth: 0 },
  eventContent: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    lineHeight: 17,
  },
  eventTime: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 3,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Ledger / trip payment card — high-contrast “protocol finance” layout
  payOuter: {
    marginVertical: 8,
    maxWidth: "88%",
    width: "88%",
    alignSelf: "center",
  },
  payCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#0f172a",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  payBody: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  payHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  payHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minWidth: 0,
  },
  payIconNode: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  payHeaderTitles: {
    flex: 1,
    minWidth: 0,
  },
  payKicker: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 4,
    fontStyle: "italic",
  },
  payHeadline: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.6,
    lineHeight: 22,
  },
  payHeaderRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
    maxWidth: "40%",
  },
  payAmount: {
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  paySystemBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
  },
  paySystemBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
  },
  payPathWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 2,
  },
  payPathCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  payPathColEnd: {
    alignItems: "flex-end",
  },
  payPathLabel: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
    fontStyle: "italic",
  },
  payPathLabelEnd: {
    textAlign: "right",
    width: "100%",
  },
  payPathName: {
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.35,
    lineHeight: 17,
  },
  payPathNameEnd: {
    textAlign: "right",
    width: "100%",
  },
  payPathCenter: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexShrink: 0,
    alignSelf: "stretch",
  },
  payProgressTrack: {
    width: 36,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  payProgressFill: {
    width: "66%",
    height: "100%",
    borderRadius: 4,
  },
  payMetaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  payModePill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  payModePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    textTransform: "capitalize",
  },
  payMetaRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  payRefInline: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    flexShrink: 1,
  },
  payNotes: {
    fontSize: 11,
    color: "#64748b",
    lineHeight: 15,
    fontWeight: "600",
  },
  payActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  payStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  payStatusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  payTime: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  paySecurityBar: {
    height: 10,
    width: "100%",
    opacity: 0.85,
  },
  addToBookBtn: {
    flex: 1,
    backgroundColor: Theme.primary,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  addToBookText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  disputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fbbf24",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  disputeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
});
