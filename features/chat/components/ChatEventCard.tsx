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

export function ChatLedgerEventCard({
  message,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  addingToBook,
}: LedgerCardProps) {
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver = meta.receiver_org_id === currentOrgId;
  const isSender = meta.sender_org_id === currentOrgId;

  const categoryLabel = String(meta.category ?? "Payment").trim() || "Payment";
  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowColor = flow === "in" ? "#22c55e" : "#ef4444";
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

  return (
    <View style={s.ledgerCard}>
      {/* Header */}
      <View style={s.ledgerHeader}>
        <View style={[s.ledgerIcon, { backgroundColor: "#f0fdf4" }]}>
          <CreditCard size={15} color="#22c55e" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.ledgerCategory}>{categoryLabel.toUpperCase()}</Text>
          <Text style={s.ledgerOrgs} numberOfLines={1}>
            {orgLine}
          </Text>
        </View>
        <Text style={[s.ledgerAmount, { color: flowColor }]}>
          {flowPrefix}{amountLabel}
        </Text>
      </View>

      {/* Details */}
      <View style={s.ledgerDetails}>
        <Text style={s.ledgerDetail}>Mode: {paymentModeLabel}</Text>
        {meta.reference_number ? (
          <Text style={s.ledgerDetail}>Ref: {meta.reference_number}</Text>
        ) : null}
        {meta.notes ? (
          <Text style={s.ledgerDetail}>Note: {meta.notes}</Text>
        ) : null}
      </View>

      {/* Status / Actions */}
      {isAcknowledged ? (
        <View style={s.ledgerStatus}>
          <CheckCircle size={13} color="#22c55e" />
          <Text style={[s.ledgerStatusText, { color: "#22c55e" }]}>Added to book</Text>
        </View>
      ) : isDisputed ? (
        <View style={s.ledgerStatus}>
          <AlertTriangle size={13} color="#f59e0b" />
          <Text style={[s.ledgerStatusText, { color: "#f59e0b" }]}>Dispute raised</Text>
        </View>
      ) : isReceiver && !isSender ? (
        <View style={s.ledgerActions}>
          <TouchableOpacity
            style={s.addToBookBtn}
            onPress={() => onAddToBook(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            {addingToBook ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.addToBookText}>Add to my book</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.disputeBtn}
            onPress={() => onDispute(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            <Text style={s.disputeText}>Raise Dispute</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={s.ledgerTime}>{displayTime}</Text>
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

  // Ledger card
  ledgerCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#e0f2fe",
    padding: 14,
    marginVertical: 4,
    maxWidth: "88%",
    alignSelf: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    width: "88%",
  },
  ledgerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  ledgerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ledgerCategory: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  ledgerOrgs: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 1,
  },
  ledgerAmount: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.5,
    flexShrink: 0,
  },
  ledgerDetails: {
    gap: 2,
    marginBottom: 12,
    paddingLeft: 42,
  },
  ledgerDetail: {
    fontSize: 11,
    color: "#64748b",
  },
  ledgerActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  addToBookBtn: {
    flex: 1,
    backgroundColor: Theme.primary,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  addToBookText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  disputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#fbbf24",
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  disputeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b45309",
  },
  ledgerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  ledgerStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  ledgerTime: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "right",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
