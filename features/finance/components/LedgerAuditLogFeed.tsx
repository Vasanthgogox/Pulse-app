/**
 * Notification-style audit feed for expanded ledger / finance entry / trip-ledger detail.
 * Replaces legacy LEDGER DETAILS / ASSOCIATED TRIP panels.
 */
import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import { formatINR } from "@/lib/format";
import {
  buildLedgerAuditFeed,
  type LedgerAuditEventKind,
  type LedgerAuditFeedEvent,
} from "@/lib/finance/buildLedgerAuditFeed.util";
import { useTripAssignmentAuditHistoryQuery } from "@/lib/queries/useTripsQuery";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const METRONIC = {
  border: "#EFF2F5",
  muted: "#A1A5B7",
  unreadDot: "#50CD89",
} as const;

type AuditFilterTab = "all" | "payment" | "trip" | "assignment";

const AUDIT_TABS: { id: AuditFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "payment", label: "Payment" },
  { id: "trip", label: "Trip" },
  { id: "assignment", label: "Assignment" },
];

const PAYMENT_KINDS: LedgerAuditEventKind[] = ["payment_in", "payment_out"];
const TRIP_KINDS: LedgerAuditEventKind[] = [
  "trip_created",
  "balance",
  "reconciliation",
];
const ASSIGNMENT_KINDS: LedgerAuditEventKind[] = ["assignment", "reassignment"];

function matchesAuditTab(
  event: LedgerAuditFeedEvent,
  tab: AuditFilterTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "payment") return PAYMENT_KINDS.includes(event.kind);
  if (tab === "trip") return TRIP_KINDS.includes(event.kind);
  if (tab === "assignment") return ASSIGNMENT_KINDS.includes(event.kind);
  return true;
}

function tabHasUnread(
  events: LedgerAuditFeedEvent[],
  tab: AuditFilterTab,
): boolean {
  return events.some((e) => e.isUnread && matchesAuditTab(e, tab));
}

function formatHeroDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const mon = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}`;
  } catch {
    return "—";
  }
}

function heroRoute(data: FinancialRowData): string {
  const d = data.tripDetail;
  if (!d) return "";
  return [d.pickup_area, d.drop_location].filter(Boolean).join(" → ");
}

function eventAvatarEntity(
  data: FinancialRowData,
  event: LedgerAuditFeedEvent,
): "client" | "supplier" | "driver" | "vehicle" {
  if (event.kind === "assignment" || event.kind === "reassignment") {
    return "driver";
  }
  if (event.kind === "trip_created") return "client";
  return data.ledgerPartyType ?? "client";
}

function primaryActionLabel(event: LedgerAuditFeedEvent): string {
  if (PAYMENT_KINDS.includes(event.kind)) return "View payment";
  if (event.kind === "reconciliation") return "Compare";
  return "View trip";
}

function LedgerAuditHero({ data }: { data: FinancialRowData }) {
  const typeLabel =
    data.transactionTypeLabel?.trim() ||
    data.desc?.trim() ||
    "Ledger entry";
  const route = heroRoute(data);
  const inAmt = Number(data.in ?? 0);
  const outAmt = Number(data.out ?? 0);
  const isIn = inAmt > 0;
  const amount = isIn ? inAmt : outAmt;
  const tripRef =
    (data.tripDetail?.trip_number ?? data.msn ?? "").trim() || null;

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroLeft}>
          {tripRef ? (
            <Text style={styles.heroTripRef} numberOfLines={1}>
              {tripRef}
            </Text>
          ) : null}
          <Text style={styles.heroTitle} numberOfLines={2}>
            {typeLabel}
          </Text>
          <Text style={styles.heroDate}>
            {formatHeroDate(data.transaction_date)}
          </Text>
        </View>
        <View style={styles.heroRight}>
          {route ? (
            <Text style={styles.heroRoute} numberOfLines={2}>
              {route}
            </Text>
          ) : null}
          {amount > 0 ? (
            <Text
              style={[
                styles.heroAmount,
                isIn ? styles.heroAmountIn : styles.heroAmountOut,
              ]}
              numberOfLines={1}
            >
              {isIn ? "+" : "−"} {formatINR(amount)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatTxHistoryDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const mon = d
      .toLocaleString("en-IN", { month: "short" })
      .toUpperCase();
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}`;
  } catch {
    return "—";
  }
}

function TransactionHistoryRow({
  tx,
  isHighlighted,
}: {
  tx: NonNullable<FinancialRowData["sameTripTransactions"]>[number];
  isHighlighted?: boolean;
}) {
  const isIn = tx.in > 0;
  const amount = isIn ? tx.in : tx.out;
  return (
    <View
      style={[
        styles.txHistoryRow,
        isHighlighted && styles.txHistoryRowHighlighted,
      ]}
    >
      <View style={styles.txHistoryIconWrap}>
        <FontAwesome
          name={isIn ? "arrow-down" : "arrow-up"}
          size={12}
          color={isIn ? Theme.darkGreen : Theme.teslaRed}
        />
      </View>
      <View style={styles.txHistoryBody}>
        <Text style={styles.txHistoryTitle} numberOfLines={1}>
          {tx.typeLabel}
        </Text>
        <Text style={styles.txHistorySubtitle} numberOfLines={1}>
          {formatTxHistoryDate(tx.date)} · {tx.party}
        </Text>
      </View>
      <Text
        style={[
          styles.txHistoryAmount,
          isIn ? styles.txHistoryAmountIn : styles.txHistoryAmountOut,
        ]}
        numberOfLines={1}
      >
        {isIn ? "+" : "−"} {formatINR(amount)}
      </Text>
    </View>
  );
}

function LedgerAuditSummaryBar({
  data,
  onSelectEntry,
}: {
  data: FinancialRowData;
  onSelectEntry?: (entryId: string) => void;
}) {
  const party = data.ledgerPartyType;
  const summary = data.tripPaymentSummary;
  const sale = Number(data.tripDetail?.client_price ?? 0);
  const cost = Number(data.tripDetail?.supplier_rate ?? 0);
  const paid = summary?.paid ?? Number(data.out ?? 0);
  const received = summary?.received ?? Number(data.in ?? 0);

  const showSupplier =
    party === "supplier" || (party === null && cost > 0);
  const showClient = party === "client" || (party === null && sale > 0);

  if (!showSupplier && !showClient) return null;

  const sameTripTx = data.sameTripTransactions ?? [];
  const hasTxHistory = sameTripTx.length > 0;

  const metricsRow = showSupplier ? (
    <View style={styles.summaryMetricsRow}>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>SUPPLIER COST</Text>
        <Text style={styles.summaryValue}>{formatINR(cost)}</Text>
      </View>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>PAID</Text>
        <Text style={[styles.summaryValue, styles.summaryValueGreen]}>
          {formatINR(paid)}
        </Text>
      </View>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>DUE</Text>
        <Text style={[styles.summaryValue, styles.summaryValueRed]}>
          {formatINR(Math.max(0, cost - paid))}
        </Text>
      </View>
    </View>
  ) : (
    <View style={styles.summaryMetricsRow}>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>SALE</Text>
        <Text style={styles.summaryValue}>{formatINR(sale)}</Text>
      </View>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>RECEIVED</Text>
        <Text style={[styles.summaryValue, styles.summaryValueGreen]}>
          {formatINR(received)}
        </Text>
      </View>
      <View style={styles.summaryCell}>
        <Text style={styles.summaryLabel}>DUE</Text>
        <Text style={[styles.summaryValue, styles.summaryValueRed]}>
          {formatINR(Math.max(0, sale - received))}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.summaryBar}>
      {metricsRow}
      {hasTxHistory ? (
        <>
          <View style={styles.summaryDivider} />
          <Text style={styles.summaryTxTitle}>Transaction History</Text>
          <View style={styles.txHistoryList}>
            {sameTripTx.map((tx) => (
              <Pressable
                key={tx.id}
                onPress={
                  onSelectEntry && tx.id !== data.id
                    ? () => onSelectEntry(tx.id)
                    : undefined
                }
                disabled={!onSelectEntry || tx.id === data.id}
              >
                <TransactionHistoryRow
                  tx={tx}
                  isHighlighted={tx.id === data.id}
                />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export type LedgerAuditLogFeedProps = {
  data: FinancialRowData;
  showHero?: boolean;
  onDownloadPress?: () => void;
  onOpenCompareVerify?: () => void;
  /** Switch focused ledger entry (trip-ledger page). */
  onSelectEntry?: (entryId: string) => void;
};

export function LedgerAuditLogFeed({
  data,
  showHero = true,
  onDownloadPress,
  onOpenCompareVerify,
  onSelectEntry,
}: LedgerAuditLogFeedProps) {
  const [filterTab, setFilterTab] = useState<AuditFilterTab>("all");
  const tripId = data.tripId?.trim() || null;
  const { data: assignmentRows = [], isPending: assignmentLoading } =
    useTripAssignmentAuditHistoryQuery(tripId);

  const allEvents = useMemo(
    () => buildLedgerAuditFeed({ data, assignmentRows }),
    [data, assignmentRows],
  );

  const filteredEvents = useMemo(
    () => allEvents.filter((e) => matchesAuditTab(e, filterTab)),
    [allEvents, filterTab],
  );

  const handlePrimaryAction = (event: LedgerAuditFeedEvent) => {
    if (PAYMENT_KINDS.includes(event.kind)) {
      const entryId = event.id.replace(/^payment-(current-)?/, "");
      if (entryId && onSelectEntry) {
        onSelectEntry(entryId);
        return;
      }
    }
    if (event.kind === "reconciliation" && onOpenCompareVerify) {
      onOpenCompareVerify();
    }
  };

  return (
    <View style={styles.root}>
      {showHero ? <LedgerAuditHero data={data} /> : null}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Audit log</Text>
        </View>

        <View style={styles.tabBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {AUDIT_TABS.map((tab) => {
              const selected = filterTab === tab.id;
              const hasUnread = tabHasUnread(allEvents, tab.id);
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setFilterTab(tab.id)}
                  style={styles.tabItem}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.tabLabelRow}>
                    <Text
                      style={[styles.tabText, selected && styles.tabTextActive]}
                    >
                      {tab.label}
                    </Text>
                    {hasUnread ? <View style={styles.tabUnreadDot} /> : null}
                  </View>
                  {selected ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {assignmentLoading && allEvents.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading trip activity…</Text>
          </View>
        ) : null}

        {filteredEvents.length > 0 ? (
          <View style={styles.feedList}>
            {filteredEvents.map((event) => {
              const entityType = eventAvatarEntity(data, event);
              const paymentEntryId = event.id.replace(/^payment-(current-)?/, "");
              const showGhost =
                PAYMENT_KINDS.includes(event.kind) &&
                Boolean(onSelectEntry) &&
                paymentEntryId &&
                !event.isCurrentEntry;

              return (
                <AlertRegistrySignalCard
                  key={event.id}
                  variant="feed"
                  avatar={{
                    name: event.actorName,
                    entityType,
                    avatarUrl: data.profileImageUrl,
                    avatarSeed: data.avatarSeed,
                    organizationImageUrl: data.organizationImageUrl,
                    organizationAvatarSeed: data.organizationAvatarSeed,
                  }}
                  actorName={event.actorName}
                  actionText={event.actionText}
                  highlightText={event.highlightText}
                  trailingText={event.trailingText}
                  detailTitle={event.detailTitle}
                  detailSubtitle={event.detailSubtitle}
                  timeLabel={event.timeLabel}
                  contextLabel={event.contextLabel}
                  statusPill={
                    event.statusLabel
                      ? {
                          label: event.statusLabel,
                          tone: event.statusTone ?? "neutral",
                        }
                      : undefined
                  }
                  isUnread={event.isUnread}
                  footer={
                    <RegistryCardActions compact>
                      {showGhost ? (
                        <RegistryGhostButton
                          label="Details"
                          compact
                          onPress={() => onSelectEntry!(paymentEntryId)}
                        />
                      ) : null}
                      <RegistryPrimaryButton
                        label={primaryActionLabel(event)}
                        compact
                        backgroundColor={CHAT_ACCENT}
                        onPress={() => handlePrimaryAction(event)}
                      />
                    </RegistryCardActions>
                  }
                />
              );
            })}
          </View>
        ) : !assignmentLoading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No activity in this tab</Text>
            <Text style={styles.emptyBody}>
              Payments, assignments, and trip changes will appear here.
            </Text>
          </View>
        ) : null}
      </View>

      <LedgerAuditSummaryBar data={data} onSelectEntry={onSelectEntry} />

      {onOpenCompareVerify || onDownloadPress ? (
        <View style={styles.actionsRow}>
          {onOpenCompareVerify ? (
            <Pressable onPress={onOpenCompareVerify} hitSlop={8}>
              <Text style={styles.actionLink}>Compare & verify</Text>
            </Pressable>
          ) : null}
          {onDownloadPress ? (
            <Pressable onPress={onDownloadPress} hitSlop={8}>
              <Text style={styles.actionLink}>Download protocol</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  heroCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  heroLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "46%",
    gap: 4,
  },
  heroTripRef: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  heroDate: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginTop: 2,
  },
  heroRoute: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "right",
    lineHeight: 14,
  },
  heroAmount: {
    fontSize: 14,
    fontWeight: "700",
    fontStyle: "italic",
  },
  heroAmountIn: { color: Theme.darkGreen },
  heroAmountOut: { color: Theme.teslaRed },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    paddingHorizontal: 8,
  },
  tabScrollContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    paddingBottom: 0,
  },
  tabItem: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    minWidth: 52,
    alignItems: "center",
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  tabTextActive: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tabUnreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: METRONIC.unreadDot,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.textPrimaryDark,
  },
  feedList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
  },
  summaryBar: {
    borderRadius: 14,
    backgroundColor: CHAT_ACCENT,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 0,
  },
  summaryMetricsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
    marginVertical: 12,
  },
  summaryTxTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  txHistoryList: {
    gap: 4,
  },
  txHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: Theme.darkBackground,
    gap: 10,
  },
  txHistoryRowHighlighted: {
    borderColor: "rgba(255,255,255,0.28)",
  },
  txHistoryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  txHistoryBody: {
    flex: 1,
    minWidth: 0,
  },
  txHistoryTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    marginBottom: 1,
  },
  txHistorySubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  txHistoryAmount: {
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 0,
  },
  txHistoryAmountIn: {
    color: Theme.darkGreen,
  },
  txHistoryAmountOut: {
    color: Theme.teslaRed,
  },
  summaryCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.65)",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  summaryValueGreen: { color: Theme.positive },
  summaryValueRed: { color: Theme.negative },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
  },
  loadingText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    paddingHorizontal: 4,
  },
  actionLink: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
  },
});
