/**
 * Collapsible KV highlights card — shows filled fields first, empty fields behind expand.
 * Pencil on header opens edit (party profile hubs).
 */
import { hubStyles as styles, METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { ChevronDown, Pencil } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";

export type PartyHighlightItem = {
  key: string;
  label: string;
  value: string;
};

type Props = {
  title: string;
  items: PartyHighlightItem[];
  compact?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  /** Always visible even when value is empty (e.g. legal name, status). */
  pinnedKeys?: string[];
  editLabel?: string;
};

export function isPartyHighlightEmpty(value: string): boolean {
  const t = value.trim();
  return !t || t === "—" || t.toUpperCase() === "NOT SET";
}

function HighlightRow({
  label,
  value,
  empty,
  last,
  compact,
}: {
  label: string;
  value: string;
  empty?: boolean;
  last?: boolean;
  compact?: boolean;
}) {
  const display = empty ? "Not configured" : value === "—" ? "Not set" : value;

  if (compact) {
    return (
      <View style={[mobile.kvRowStacked, last && styles.kvRowLast]}>
        <Text style={mobile.kvLabelStacked}>{label}</Text>
        <Text
          style={[mobile.kvValueStacked, empty && hl.emptyValue]}
          numberOfLines={4}
        >
          {display}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text
        style={[styles.kvValue, empty && hl.emptyValue]}
        numberOfLines={3}
      >
        {display}
      </Text>
    </View>
  );
}

function CardHeader({
  title,
  onEdit,
  editLabel = "Edit",
  compact,
}: {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.cardHeaderRow}>
      <Text
        style={[
          styles.cardTitle,
          styles.cardTitleInline,
          compact && mobile.cardTitleCompact,
        ]}
      >
        {title}
      </Text>
      {onEdit ? (
        <Pressable
          style={({ pressed }) => [
            styles.cardEditBtn,
            pressed && { opacity: 0.85 },
            Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
          ]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${editLabel} ${title}`}
        >
          <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
          <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>
            {editLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PartyHighlightsCard({
  title,
  items,
  compact,
  canEdit,
  onEdit,
  pinnedKeys = [],
  editLabel,
}: Props) {
  const [showEmpty, setShowEmpty] = useState(false);
  const pinned = useMemo(() => new Set(pinnedKeys), [pinnedKeys]);

  const { filled, empty } = useMemo(() => {
    const filledItems: PartyHighlightItem[] = [];
    const emptyItems: PartyHighlightItem[] = [];
    for (const item of items) {
      if (pinned.has(item.key) || !isPartyHighlightEmpty(item.value)) {
        filledItems.push(item);
      } else {
        emptyItems.push(item);
      }
    }
    return { filled: filledItems, empty: emptyItems };
  }, [items, pinned]);

  const displayed = showEmpty ? [...filled, ...empty] : filled;
  const emptyCount = empty.length;
  const hasExpand = emptyCount > 0;

  return (
    <View style={[styles.card, compact && mobile.cardCompact]}>
      <CardHeader
        title={title}
        onEdit={canEdit ? onEdit : undefined}
        editLabel={editLabel}
        compact={compact}
      />
      {displayed.map((item, index) => {
        const isEmpty = isPartyHighlightEmpty(item.value) && !pinned.has(item.key);
        const last = index === displayed.length - 1 && !hasExpand;
        return (
          <HighlightRow
            key={item.key}
            label={item.label}
            value={item.value}
            empty={isEmpty}
            last={last}
            compact={compact}
          />
        );
      })}
      {hasExpand ? (
        <Pressable
          style={({ pressed }) => [hl.expandBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setShowEmpty((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showEmpty }}
          accessibilityLabel={
            showEmpty
              ? `Hide ${emptyCount} empty fields`
              : `Show ${emptyCount} empty fields`
          }
        >
          <Text style={hl.expandBtnText}>
            {showEmpty
              ? "Hide empty fields"
              : `Show ${emptyCount} empty field${emptyCount === 1 ? "" : "s"}`}
          </Text>
          <ChevronDown
            size={14}
            color={METRONIC.link}
            strokeWidth={2.2}
            style={showEmpty ? hl.chevronUp : undefined}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const hl = {
  emptyValue: {
    color: METRONIC.muted,
    fontStyle: "italic" as const,
    fontWeight: "500" as const,
  },
  expandBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 4,
    paddingTop: 10,
    paddingBottom: 2,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: METRONIC.link,
  },
  chevronUp: {
    transform: [{ rotate: "180deg" }],
  },
};
