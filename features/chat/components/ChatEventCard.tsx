import React, { useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Truck,
  MapPin,
  XCircle,
  Clock,
  Send,
  Package,
} from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import Theme from "@/constants/Theme";
import {
  partyAvatarBackgroundColor,
  partyAvatarInitialsTextColor,
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import {
  getLedgerBookPendingSnapshot,
  subscribeLedgerBookPending,
} from "@/lib/ledgerBookPendingStore";

// ── System event card (trip status changes) ───────────────────────────────────

type StatusIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const STATUS_ICON_MAP: Record<
  string,
  {
    Icon: StatusIconComponent;
    color: string;
    bg: string;
    /** Short label for meta line (matches payment card middle segment). */
    sheetLabel: string;
    /** Bold right column (payment “amount” slot). */
    rightWord: string;
    rightColor: string;
  }
> = {
  assigned: {
    Icon: Truck,
    color: CHAT_ACCENT,
    bg: CHAT_ACCENT_SOFT,
    sheetLabel: "Assigned",
    rightWord: "NEW",
    rightColor: "#4338ca",
  },
  in_progress: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "In progress",
    rightWord: "ACTIVE",
    rightColor: "#4338ca",
  },
  picked_up: {
    Icon: MapPin,
    color: "#f59e0b",
    bg: "#fffbeb",
    sheetLabel: "Pickup",
    rightWord: "LOAD",
    rightColor: "#b45309",
  },
  in_transit: {
    Icon: Truck,
    color: "#06b6d4",
    bg: "#ecfeff",
    sheetLabel: "In transit",
    rightWord: "LEG",
    rightColor: "#0e7490",
  },
  at_drop: {
    Icon: MapPin,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "At drop",
    rightWord: "DROP",
    rightColor: "#047857",
  },
  completed: {
    Icon: CheckCircle,
    color: "#22c55e",
    bg: "#f0fdf4",
    sheetLabel: "Completed",
    rightWord: "DONE",
    rightColor: "#047857",
  },
  cancelled: {
    Icon: XCircle,
    color: "#ef4444",
    bg: "#fef2f2",
    sheetLabel: "Cancelled",
    rightWord: "VOID",
    rightColor: "#be123c",
  },
  pending: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f1f5f9",
    sheetLabel: "Pending",
    rightWord: "WAIT",
    rightColor: "#64748b",
  },
  started: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "Started",
    rightWord: "START",
    rightColor: "#4338ca",
  },
  delivered: {
    Icon: Package,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "Delivered",
    rightWord: "POD",
    rightColor: "#047857",
  },
  default: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f8fafc",
    sheetLabel: "Update",
    rightWord: "INFO",
    rightColor: "#475569",
  },
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

/** WhatsApp-style “protocol / milestone” system ribbon (completed + protocol copy). */
function shouldUsePulseProtocolSystemCard(
  content: string,
  statusKey: keyof typeof STATUS_ICON_MAP,
): boolean {
  const c = (content ?? "").toLowerCase();
  if (statusKey === "completed" || statusKey === "delivered") return true;
  return (
    c.includes("protocol") ||
    c.includes("threshold") ||
    c.includes("destination threshold") ||
    c.includes("trip protocol")
  );
}

export function getStatusEventSheetVisuals(statusKey: string) {
  const row = STATUS_ICON_MAP[statusKey as keyof typeof STATUS_ICON_MAP];
  return row ?? STATUS_ICON_MAP.default;
}

// ── Ledger event card (payment / adjustment) ──────────────────────────────────

interface LedgerCardProps {
  message: TripMessageRow;
  currentOrgId: string;
  /** Chat thread party (linked client/supplier name) — fills missing receiver on cash-in rows. */
  conversationPartyName?: string | null;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  /** Driver / embedded views: show the card UI without add-to-book or dispute actions. */
  readOnly?: boolean;
  /** Integrated indent commercial lane only — hides Add to book / Dispute row when false. */
  hideLedgerActions?: boolean;
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

export function formatTripEventSheetDate(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();
  } catch {
    return "";
  }
}

export function ChatLedgerEventCard({
  message,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  readOnly = false,
  hideLedgerActions = false,
}: LedgerCardProps) {
  const addingToBook = useSyncExternalStore(
    subscribeLedgerBookPending,
    () => getLedgerBookPendingSnapshot().has(message.id),
    () => false,
  );

  if (!ledgerEventInvolvesOrg(message, currentOrgId)) return null;
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver =
    String(meta.receiver_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  const isSender =
    String(meta.sender_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  if (!isReceiver && !isSender) return null;

  const directionLabel =
    isReceiver && !isSender
      ? "Incoming payment"
      : isSender && !isReceiver
        ? "Outgoing payment"
        : "Transfer";

  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowPrefix = flow === "in" ? "+" : "−";
  const isAcknowledged = !!meta.acknowledged_at || !!meta.is_booked;
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

  const titleParty = flow === "in" ? fromParty : toParty;
  const titleDisplay = formatChatPartyName(titleParty);
  const namedOther = [fromParty, toParty].find((p) => formatChatPartyName(p));
  const avatarSeedName = titleDisplay ? titleParty : namedOther || "Payment";
  const avatarBg = partyAvatarBackgroundColor(avatarSeedName);
  const avatarFg = partyAvatarInitialsTextColor(avatarBg);
  const dateUpper = formatTripEventSheetDate(message.created_at);
  const metaMid = [paymentModeLabel, meta.category].filter(Boolean).join(" · ") || "—";
  const routeLine = `${fromParty.toUpperCase()} → ${toParty.toUpperCase()}`;

  const isCredit = flow === "in";
  const amountColor = isCredit ? "#047857" : "#be123c";

  return (
    <View style={s.ledgerWrap}>
      <View style={s.ledgerCard}>
        <View style={[s.ledgerAvatarWrap, s.ledgerAvatarWrapAlign]}>
          <View style={[s.ledgerAvatar, { backgroundColor: avatarBg }]}>
            <Text style={[s.ledgerAvatarInitials, { color: avatarFg }]}>
              {partyInitialsFromName(avatarSeedName)}
            </Text>
          </View>
          <View
            style={[
              s.ledgerAvatarDot,
              { backgroundColor: isDisputed ? "#f59e0b" : "#22c55e" },
            ]}
          />
        </View>

        <View style={s.ledgerBody}>
          {titleDisplay ? (
            <Text style={s.ledgerTitle} numberOfLines={1}>
              {titleDisplay}
            </Text>
          ) : null}
          <Text style={s.ledgerMeta} numberOfLines={1}>
            {directionLabel}
            {" · "}
            {dateUpper}
            {" · "}
            {metaMid}
          </Text>
          <Text style={s.ledgerRoute} numberOfLines={1}>
            {routeLine}
          </Text>
        </View>

        <View style={s.ledgerRight}>
          <Text style={[s.ledgerAmount, { color: amountColor }]} numberOfLines={1}>
            {flowPrefix}
            {amountLabel}
          </Text>
          <Text style={s.ledgerTimeRight} numberOfLines={1}>
            {displayTime}
          </Text>
        </View>

        <View style={s.ledgerChevronWrap}>
          <ChevronRight size={14} color="#cbd5e1" />
        </View>
      </View>

      {meta.notes ? (
        <Text style={s.ledgerNotesBelow} numberOfLines={2}>
          {meta.notes}
        </Text>
      ) : null}

      {isAcknowledged ? (
        <View style={s.ledgerFooterStatus}>
          <CheckCircle size={11} color="#059669" />
          <Text style={s.ledgerFooterStatusText}>Added to book</Text>
        </View>
      ) : isDisputed ? (
        <View style={s.ledgerFooterStatus}>
          <AlertTriangle size={11} color="#d97706" />
          <Text style={[s.ledgerFooterStatusText, { color: "#b45309" }]}>Dispute raised</Text>
        </View>
      ) : !readOnly && !hideLedgerActions && isReceiver && !isSender ? (
        <View style={s.ledgerActions}>
          <TouchableOpacity
            style={s.ledgerAddBtn}
            onPress={() => onAddToBook(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            {addingToBook ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.ledgerAddBtnText}>Add to book</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.ledgerDisputeBtn}
            onPress={() => onDispute(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            <Text style={s.ledgerDisputeBtnText}>Dispute</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Ledger row — same footprint as system updates (payment-style sheet)
  ledgerWrap: {
    alignSelf: "center",
    maxWidth: "85%",
    marginVertical: 4,
  },
  ledgerCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  ledgerAvatarWrap: {
    width: 34,
    height: 34,
    position: "relative",
    flexShrink: 0,
  },
  ledgerAvatarWrapAlign: {
    alignSelf: "center",
  },
  ledgerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  ledgerAvatarInitials: {
    fontSize: 11,
    fontWeight: "800",
  },
  ledgerAvatarDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  ledgerBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
    paddingVertical: 1,
  },
  ledgerTitle: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  ledgerMeta: {
    fontSize: 9,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.02,
  },
  ledgerRoute: {
    fontSize: 8,
    fontWeight: "400",
    color: "#94a3b8",
    fontStyle: "italic",
    letterSpacing: 0.15,
  },
  ledgerRight: {
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 3,
    paddingLeft: 12,
    marginLeft: 2,
    borderLeftWidth: 1,
    borderLeftColor: "#f1f5f9",
    minWidth: 86,
    maxWidth: "36%",
  },
  ledgerAmount: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.35,
    lineHeight: 17,
  },
  ledgerTimeRight: {
    fontSize: 8,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    opacity: 0.95,
  },
  ledgerChevronWrap: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: 4,
    marginLeft: 2,
  },
  ledgerNotesBelow: {
    marginTop: 6,
    fontSize: 10,
    color: "#64748b",
    lineHeight: 14,
    fontWeight: "600",
    paddingHorizontal: 2,
  },
  ledgerFooterStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignSelf: "flex-start",
  },
  ledgerFooterStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  ledgerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  ledgerAddBtn: {
    flex: 1,
    backgroundColor: CHAT_ACCENT,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  ledgerDisputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fbbf24",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerDisputeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  // Pulse-style system protocol ribbon (completed / milestone)
  pulseProtoWrap: {
    alignSelf: "center",
    maxWidth: "92%",
    width: "100%",
    marginVertical: 6,
  },
  pulseProtoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 4,
    borderTopColor: "#e8ecf1",
    borderRightColor: "#e8ecf1",
    borderBottomColor: "#e8ecf1",
    borderLeftColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#059669",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pulseProtoIconCol: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseProtoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseProtoLiveDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  pulseProtoDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#f1f5f9",
    marginVertical: 2,
  },
  pulseProtoBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 4,
    gap: 4,
  },
  pulseProtoTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  pulseProtoSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    lineHeight: 14,
  },
  pulseProtoRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 6,
    paddingLeft: 6,
  },
  pulseProtoBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pulseProtoBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#047857",
    letterSpacing: 0.6,
  },
  pulseProtoTime: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

export interface TripProgressEventCardProps {
  avatarSeed: string;
  avatarDotColor: string;
  title: string;
  metaLine: string;
  subLine?: string | null;
  rightPrimary: string;
  rightPrimaryColor: string;
  time: string;
}

/**
 * Same shell as the payment / ledger row: circular avatar + dot, body, vertical rule,
 * bold right column, time, chevron.
 */
export function TripProgressEventCard({
  avatarSeed,
  avatarDotColor,
  title,
  metaLine,
  subLine,
  rightPrimary,
  rightPrimaryColor,
  time,
}: TripProgressEventCardProps) {
  const avatarBg = partyAvatarBackgroundColor(avatarSeed);
  const avatarFg = partyAvatarInitialsTextColor(avatarBg);
  return (
    <View style={s.ledgerWrap}>
      <View style={s.ledgerCard}>
        <View style={[s.ledgerAvatarWrap, s.ledgerAvatarWrapAlign]}>
          <View style={[s.ledgerAvatar, { backgroundColor: avatarBg }]}>
            <Text style={[s.ledgerAvatarInitials, { color: avatarFg }]}>
              {partyInitialsFromName(avatarSeed)}
            </Text>
          </View>
          <View style={[s.ledgerAvatarDot, { backgroundColor: avatarDotColor }]} />
        </View>
        <View style={s.ledgerBody}>
          <Text style={s.ledgerTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={s.ledgerMeta} numberOfLines={2}>
            {metaLine}
          </Text>
          {subLine ? (
            <Text style={s.ledgerRoute} numberOfLines={2}>
              {subLine}
            </Text>
          ) : null}
        </View>
        <View style={s.ledgerRight}>
          <Text style={[s.ledgerAmount, { color: rightPrimaryColor }]} numberOfLines={1}>
            {rightPrimary}
          </Text>
          <Text style={s.ledgerTimeRight} numberOfLines={1}>
            {time}
          </Text>
        </View>
        <View style={s.ledgerChevronWrap}>
          <ChevronRight size={14} color="#cbd5e1" />
        </View>
      </View>
    </View>
  );
}

function systemSheetAvatarSeed(content: string): string {
  const m = (content ?? "").match(/\b(TRP[-A-Z0-9]+)\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  const trip = (content ?? "").match(/\b([A-Z]{2,4}\d{2,6})\b/);
  if (trip?.[1]) return trip[1].toUpperCase();
  return "Trip update";
}

function PulseSystemProtocolCard({
  title,
  subtitle,
  displayTime,
}: {
  title: string;
  subtitle: string;
  displayTime: string;
}) {
  return (
    <View style={s.pulseProtoWrap}>
      <View style={s.pulseProtoCard}>
        <View style={s.pulseProtoIconCol}>
          <View style={s.pulseProtoIconCircle}>
            <Activity size={18} color="#059669" strokeWidth={2.4} />
          </View>
          <View style={s.pulseProtoLiveDot} />
        </View>
        <View style={s.pulseProtoDivider} />
        <View style={s.pulseProtoBody}>
          <Text style={s.pulseProtoTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={s.pulseProtoSubtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        </View>
        <View style={s.pulseProtoRight}>
          <View style={s.pulseProtoBadge}>
            <Text style={s.pulseProtoBadgeText}>SYSTEM DONE</Text>
          </View>
          <Text style={s.pulseProtoTime} numberOfLines={1}>
            {displayTime}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ChatSystemEventCard({ message }: { message: TripMessageRow }) {
  const statusKey = inferStatusFromContent(message.content);
  const cfg = STATUS_ICON_MAP[statusKey] ?? STATUS_ICON_MAP.default;
  const dateUpper = formatTripEventSheetDate(message.created_at);

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

  const metaLine = `System update · ${dateUpper} · ${cfg.sheetLabel}`;
  const seed = systemSheetAvatarSeed(message.content);

  if (shouldUsePulseProtocolSystemCard(message.content, statusKey)) {
    const tripRef =
      (message.content ?? "").match(/\b(TRP[-A-Z0-9]+)\b/i)?.[1] ??
      (message.content ?? "").match(/\b([A-Z]{2,4}\d{2,6})\b/i)?.[1];
    const subtitle = tripRef
      ? `${tripRef} has reached a destination milestone on the shared trip channel.`
      : `Recorded ${dateUpper} · ${cfg.sheetLabel}.`;

    return (
      <PulseSystemProtocolCard
        title={message.content.trim() || "Trip protocol update"}
        subtitle={subtitle}
        displayTime={displayTime}
      />
    );
  }

  return (
    <TripProgressEventCard
      avatarSeed={seed}
      avatarDotColor={cfg.rightColor}
      title={message.content.trim() || "Trip update"}
      metaLine={metaLine}
      subLine={null}
      rightPrimary={cfg.rightWord}
      rightPrimaryColor={cfg.rightColor}
      time={displayTime}
    />
  );
}
