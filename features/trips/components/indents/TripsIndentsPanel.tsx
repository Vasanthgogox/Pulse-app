/**
 * Trips → Indents — lightweight secondary view inside the Trips workspace.
 *
 * Deliberately NOT a rebuild of Load Center: reuses the same `useIndentsQuery`
 * data (own-org indents, the exact rows Give Load's "My loads" tab already
 * shows) and the same stage derivation (`classifyIndentStage`), but renders a
 * small, Trips-weight list instead of Load Center's full Kanban/desktop shell —
 * per product direction, Indents must not look like another major product.
 *
 * An Indent is never rendered as a Trip here: no driver/vehicle fields, no
 * trip status pill. Once an indent converts to a trip (existing deploy flow,
 * unchanged), it simply stops appearing in this list and shows up under
 * Trips as usual — no new field marks that transition.
 */
import { memo, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HubMobileUnderlineTab } from "@/components/hub/HubMobileUnderlineTab";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import { useIndentsQuery, useIndentOfferCountsQuery } from "@/lib/queries/useIndentsQuery";
import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  classifyIndentStage,
  indentUnassignedBadgeLabel,
  isIndentStageDone,
  type IndentStage,
} from "@/features/network/utils/loadCenter.model";

type IndentChip = "ALL" | IndentStage;

const CHIPS: { id: IndentChip; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "BIDDING", label: "Bidding" },
  { id: "AWARDED", label: "Awarded" },
];

export interface TripsIndentsPanelProps {
  orgId: string | null;
  onIndentPress?: (indent: IndentRow) => void;
}

function formatRoute(indent: IndentRow): string {
  const from = (indent.pickup_area || "—").trim() || "—";
  const to = (indent.drop_location || "—").trim() || "—";
  return `${from} → ${to}`;
}

function IndentCard({
  indent,
  stage,
  onPress,
}: {
  indent: IndentRow;
  stage: IndentStage;
  onPress?: (indent: IndentRow) => void;
}) {
  const badge = indentUnassignedBadgeLabel(stage);
  const saleValue = Number(indent.client_price ?? 0);
  return (
    <View
      style={styles.card}
      testID={`indent-card-${indent.id}`}
      accessibilityRole={onPress ? "button" : undefined}
      onTouchEnd={onPress ? () => onPress(indent) : undefined}
    >
      <View style={styles.cardTopRow}>
        <View
          style={[
            styles.badge,
            badge === "AWARDED" ? styles.badgeAwarded : styles.badgeUnassigned,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              badge === "AWARDED" ? styles.badgeTextAwarded : styles.badgeTextUnassigned,
            ]}
          >
            {badge}
          </Text>
        </View>
        {stage === "BIDDING" ? (
          <Text style={styles.stageHint}>Receiving bids</Text>
        ) : null}
      </View>
      <Text style={styles.clientName} numberOfLines={1}>
        {indent.client_name || "—"}
      </Text>
      <Text style={styles.route} numberOfLines={1}>
        {formatRoute(indent)}
      </Text>
      <View style={styles.cardBottomRow}>
        <Text style={styles.loadType} numberOfLines={1}>
          {(indent.load_type || "—").toUpperCase()}
        </Text>
        {saleValue > 0 ? (
          <Text style={styles.saleValue}>{formatINR(saleValue)}</Text>
        ) : null}
      </View>
    </View>
  );
}

export const TripsIndentsPanel = memo(function TripsIndentsPanel({
  orgId,
  onIndentPress,
}: TripsIndentsPanelProps) {
  const [chip, setChip] = useState<IndentChip>("ALL");
  const { data: indents = [], isLoading, isError } = useIndentsQuery(orgId);

  const ownIndents = useMemo(
    () =>
      indents.filter(
        (i) => (i.organization_id ?? "") === (orgId ?? "") && !isIndentStageDone(i.status),
      ),
    [indents, orgId],
  );

  const indentIds = useMemo(() => ownIndents.map((i) => i.id), [ownIndents]);
  const { data: bidCounts = {} } = useIndentOfferCountsQuery(orgId, indentIds);

  const staged = useMemo(
    () =>
      ownIndents.map((indent) => ({
        indent,
        stage: classifyIndentStage(indent.status, bidCounts[indent.id] ?? 0),
      })),
    [ownIndents, bidCounts],
  );

  const filtered = useMemo(
    () => (chip === "ALL" ? staged : staged.filter((s) => s.stage === chip)),
    [staged, chip],
  );

  return (
    <View style={styles.root}>
      <View style={styles.chipRow} accessibilityRole="tablist">
        {CHIPS.map((c) => (
          <HubMobileUnderlineTab
            key={c.id}
            label={c.label}
            isActive={chip === c.id}
            compact
            onPress={() => setChip(c.id)}
            accessibilityLabel={`${c.label} indents`}
          />
        ))}
      </View>

      {isLoading ? (
        <Text style={styles.emptyText}>Loading indents…</Text>
      ) : isError ? (
        <Text style={styles.emptyText}>Could not load indents.</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.emptyText}>
          {chip === "ALL"
            ? "No indents waiting to become a trip."
            : `No ${chip.toLowerCase()} indents.`}
        </Text>
      ) : (
        <View style={styles.list}>
          {filtered.map(({ indent, stage }) => (
            <IndentCard
              key={indent.id}
              indent={indent}
              stage={stage}
              onPress={onIndentPress}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  chipRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  list: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: "center",
    fontSize: 13,
    color: Theme.textMuted,
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    padding: 12,
    backgroundColor: Theme.surface,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  badgeUnassigned: {
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderColor: Theme.textPrimaryDark,
  },
  badgeAwarded: {
    backgroundColor: Theme.positive,
    borderColor: Theme.darkGreen,
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  badgeTextUnassigned: { color: Theme.textPrimaryDark },
  badgeTextAwarded: { color: Theme.textOnPrimary },
  stageHint: { fontSize: 11, color: Theme.textMuted },
  clientName: { fontSize: 14, fontWeight: "700", color: Theme.textPrimary },
  route: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  loadType: { fontSize: 11, color: Theme.textMuted },
  saleValue: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary },
});
