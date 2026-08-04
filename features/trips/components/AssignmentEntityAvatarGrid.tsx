/**
 * Avatar + name grid (3 per row) for asset driver/vehicle selection flows.
 * Matches Network "Your connections" mobile grid tiles.
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  WizardEntityPicker,
  type WizardEntityPickerItem,
  WIZARD_PARTY_GRID_COLUMNS,
} from "@/components/full-page-wizard";
import { PartyEntityAvatarGlow } from "@/components/PartyEntityAvatarGlow";
import { NETWORK_HUB_GRID_GAP_PX } from "@/features/network/constants/networkHubGrid";
import { partyAccentFromEntityType } from "@/lib/partyEntityAccent";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Plus } from "lucide-react-native";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

const DEFAULT_COLUMNS = 3;
const DEFAULT_AVATAR_SIZE = 52;
const COMPACT_AVATAR_SIZE = 42;

export type AssignmentEntityAvatarGridProps = {
  title: string;
  totalCount: number;
  items: AssignmentAvatarGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  errorOutline?: boolean;
  footerHint?: string;
  /** Cap internal grid scroll height (mobile allocation steps). */
  scrollMaxHeight?: number;
  /** Smaller tiles for dense forms (Create Trip desktop). */
  compact?: boolean;
  /** Override grid column count (default 3). */
  columns?: number;
  /** `wizard` — attribution-style list rows (mobile allocation flows). */
  variant?: "grid" | "wizard";
  /** Wizard list without outer card border (shell provides chrome). */
  embedded?: boolean;
};

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export type AssignmentAvatarGridItem = {
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  disabled?: boolean;
  statusLabel?: string;
};

export function AssignmentEntityAvatarGrid({
  title,
  totalCount,
  items,
  selectedId,
  onSelect,
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  headerActionLabel,
  onHeaderAction,
  errorOutline = false,
  footerHint,
  scrollMaxHeight = 360,
  compact = false,
  columns: columnsProp,
  variant = "grid",
  embedded = false,
}: AssignmentEntityAvatarGridProps) {
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  if (variant === "wizard") {
    const wizardItems: WizardEntityPickerItem[] = items.map((item) => ({
      id: item.id,
      name: item.title,
      subtitle: item.subtitle ?? null,
      avatarUrl: item.avatarUrl ?? null,
      avatarSeed: item.avatarSeed ?? null,
      entityType: item.entityType ?? "client",
      initialsColorSeed: item.id,
      disabled: item.disabled,
      statusLabel: item.statusLabel,
    }));

    return (
      <WizardEntityPicker
        title={title}
        totalCount={totalCount}
        items={wizardItems}
        selectedId={selectedId}
        onSelect={onSelect}
        onAdd={onHeaderAction}
        addLabel={headerActionLabel ? `+ ${headerActionLabel}` : undefined}
        emptyMessage={emptyMessage}
        footerHint={footerHint}
        listMaxHeight={scrollMaxHeight}
        errorOutline={errorOutline}
        embedded={embedded}
        columns={WIZARD_PARTY_GRID_COLUMNS}
      />
    );
  }

  const columns = columnsProp ?? DEFAULT_COLUMNS;
  const avatarSize = compact ? COMPACT_AVATAR_SIZE : DEFAULT_AVATAR_SIZE;
  const rows = chunkRows(items, columns);

  return (
    <View
      style={[
        assignmentShellStyles.assignPickerCard,
        errorOutline && assignmentShellStyles.assignPickerCardError,
      ]}
    >
      <View style={assignmentShellStyles.assignPickerHeader}>
        <View style={assignmentShellStyles.assignPickerHeaderTop}>
          <Text style={assignmentShellStyles.assignPickerTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={assignmentShellStyles.assignPickerCountBadge}>
            <Text style={assignmentShellStyles.assignPickerCountText}>
              {totalCount}
            </Text>
          </View>
        </View>
        {headerActionLabel && onHeaderAction ? (
          <Pressable
            onPress={onHeaderAction}
            style={({ pressed }) => [
              assignmentShellStyles.assignPickerHeaderAction,
              pressed && assignmentShellStyles.assignPickerHeaderActionPressed,
              webCursor,
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={headerActionLabel}
          >
            <Plus size={14} color={Theme.primary} strokeWidth={2.5} />
            <Text style={assignmentShellStyles.assignPickerHeaderActionText}>
              {headerActionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={assignmentShellStyles.assignEmptyState}>
          {emptyMessage ? (
            <Text style={assignmentShellStyles.assignEmptyText}>{emptyMessage}</Text>
          ) : null}
          {emptyActionLabel && onEmptyAction ? (
            <TouchableOpacity
              style={assignmentShellStyles.assignEmptyActionBtn}
              onPress={onEmptyAction}
              activeOpacity={0.9}
            >
              <FontAwesome name="plus" size={12} color={Theme.buttonPrimaryText} />
              <Text style={assignmentShellStyles.assignEmptyActionBtnText}>
                {emptyActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ScrollView
          style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={`assign-grid-row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item) => {
                  const selected = selectedId === item.id;
                  const disabled = item.disabled === true;
                  const entityType = item.entityType ?? "driver";
                  const accent = partyAccentFromEntityType(entityType);
                  const displayName = item.title.trim() || "—";
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.cell,
                        pressed && !disabled && styles.cellPressed,
                        webCursor,
                      ]}
                      onPress={() => {
                        if (disabled) return;
                        onSelect(item.id);
                      }}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      accessibilityLabel={
                        disabled
                          ? `${displayName}, ${item.statusLabel ?? "on trip"}`
                          : displayName
                      }
                    >
                      <View
                        style={[
                          styles.tile,
                          selected && !disabled && styles.tileSelected,
                          disabled && styles.tileDisabled,
                        ]}
                      >
                        <View style={[styles.avatarWrap, disabled && styles.avatarWrapDisabled, { width: avatarSize + 8, height: avatarSize + 8 }]}>
                          <PartyEntityAvatarGlow accent={accent} size={avatarSize}>
                            <PartyAvatar
                              name={displayName}
                              initialsColorSeed={item.id}
                              avatarUrl={item.avatarUrl}
                              avatarSeed={item.avatarSeed}
                              entityType={entityType}
                              size={avatarSize}
                            />
                          </PartyEntityAvatarGlow>
                          {selected && !disabled ? (
                            <View style={styles.selectedBadge}>
                              <FontAwesome
                                name="check"
                                size={9}
                                color={Theme.buttonPrimaryText}
                              />
                            </View>
                          ) : null}
                        </View>
                        <Text
                          style={[styles.name, compact && styles.nameCompact, disabled && styles.nameDisabled]}
                          numberOfLines={2}
                        >
                          {displayName}
                        </Text>
                        {disabled ? (
                          <Text style={styles.statusLabel} numberOfLines={1}>
                            {item.statusLabel ?? "On trip"}
                          </Text>
                        ) : item.subtitle ? (
                          <Text style={[styles.subtitle, compact && styles.subtitleCompact]} numberOfLines={2}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
                {row.length < columns
                  ? Array.from({ length: columns - row.length }).map((_, i) => (
                      <View
                        key={`assign-grid-pad-${rowIndex}-${i}`}
                        style={styles.cell}
                        pointerEvents="none"
                      />
                    ))
                  : null}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      {footerHint ? (
        <Text style={assignmentShellStyles.supplyFooterHint}>{footerHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 360,
    width: "100%",
  },
  scrollContent: {
    paddingBottom: 4,
  },
  grid: {
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  cellPressed: {
    opacity: 0.92,
  },
  tile: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  tileSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary + "0C",
  },
  tileDisabled: {
    opacity: 0.55,
  },
  avatarWrapDisabled: {
    opacity: 0.85,
  },
  avatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  selectedBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    zIndex: 3,
  },
  name: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  nameCompact: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 12,
  },
  nameDisabled: {
    color: Theme.textMuted,
  },
  statusLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.warning,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "500",
    lineHeight: 11,
    color: Theme.textMuted,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  subtitleCompact: {
    fontSize: 7,
    lineHeight: 10,
  },
});
