import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, ScrollView, Text, View } from "react-native";

import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

import {
  fullPageWizardStyles as styles,
  WIZARD_PARTY_AVATAR_SIZE,
  WIZARD_PARTY_GRID_COLUMNS,
} from "./fullPageWizardStyles";

export type WizardSelectionGridItem = {
  id: string;
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  initialsColorSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  disabled?: boolean;
  statusLabel?: string;
};

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export type WizardSelectionGridProps = {
  items: WizardSelectionGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  listMaxHeight?: number;
  /** Default: {@link WIZARD_PARTY_GRID_COLUMNS} for party cards. */
  columns?: number;
  compact?: boolean;
  /** `partyCard` — horizontal attribution-style tiles (avatar left, text right). */
  variant?: "centered" | "partyCard";
  /** Bordered list shell (enterprise picker chrome). */
  showListShell?: boolean;
};

export function WizardSelectionGrid({
  items,
  selectedId,
  onSelect,
  loading = false,
  emptyMessage = "Nothing to select yet.",
  listMaxHeight = 420,
  columns = WIZARD_PARTY_GRID_COLUMNS,
  compact = false,
  variant = "partyCard",
  showListShell = true,
}: WizardSelectionGridProps) {
  const isPartyCard = variant === "partyCard";

  if (loading) {
    return (
      <View style={styles.clientLoadingWrap}>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.shipperWarningCard}>
        <Text style={styles.shipperWarningText}>{emptyMessage}</Text>
      </View>
    );
  }

  const avatarSize = isPartyCard
    ? WIZARD_PARTY_AVATAR_SIZE
    : compact
      ? 38
      : 44;
  const rows = chunkRows(items, columns);

  const scroll = (
    <ScrollView
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      style={{ maxHeight: listMaxHeight, width: "100%" }}
      contentContainerStyle={
        showListShell && isPartyCard
          ? styles.selectionGridScrollContent
          : isPartyCard
            ? styles.selectionGridScrollContentFlat
            : styles.selectionGridScrollContent
      }
      showsVerticalScrollIndicator
    >
      <View style={styles.selectionGrid}>
        {rows.map((row, rowIndex) => (
          <View key={`wizard-grid-row-${rowIndex}`} style={styles.selectionGridRow}>
            {row.map((item) => {
              const selected = selectedId === item.id;
              const disabled = item.disabled === true;
              const displayName = item.name.trim() || "—";
              const meta =
                item.statusLabel ??
                item.subtitle?.trim() ??
                (disabled ? "Unavailable" : null);

              return (
                <Pressable
                  key={item.id}
                  style={styles.selectionGridCell}
                  onPress={() => {
                    if (disabled) return;
                    onSelect(item.id);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                >
                  <View
                    style={[
                      isPartyCard ? styles.partyCard : styles.selectionGridTile,
                      isPartyCard && styles.partyCardSelectable,
                      selected &&
                        !disabled &&
                        (isPartyCard
                          ? styles.partyCardSelected
                          : styles.selectionGridTileSelected),
                      disabled && styles.selectionGridTileDisabled,
                    ]}
                  >
                    <View style={styles.selectionGridAvatarWrap}>
                      <PartyAvatar
                        name={displayName}
                        initialsColorSeed={item.initialsColorSeed ?? item.id}
                        organizationImageUrl={item.organizationImageUrl ?? null}
                        organizationAvatarSeed={item.organizationAvatarSeed ?? null}
                        avatarUrl={item.avatarUrl ?? null}
                        avatarSeed={item.avatarSeed ?? null}
                        entityType={item.entityType ?? "client"}
                        size={avatarSize}
                        shape="rounded"
                      />
                      {selected && !disabled ? (
                        <View
                          style={[
                            styles.selectionGridCheck,
                            isPartyCard && styles.selectionGridCheckParty,
                          ]}
                        >
                          <FontAwesome
                            name="check"
                            size={9}
                            color={Theme.textOnPrimary}
                          />
                        </View>
                      ) : null}
                    </View>
                    {isPartyCard ? (
                      <View style={styles.partyTextWrap}>
                        <Text style={styles.partyName} numberOfLines={2}>
                          {displayName}
                        </Text>
                        {meta ? (
                          <Text
                            style={[
                              styles.partySubtitle,
                              item.statusLabel ? styles.selectionGridMetaWarn : null,
                            ]}
                            numberOfLines={1}
                          >
                            {meta}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.selectionGridName,
                            compact && styles.selectionGridNameCompact,
                            disabled && styles.selectionGridNameDisabled,
                          ]}
                          numberOfLines={2}
                        >
                          {displayName}
                        </Text>
                        {meta ? (
                          <Text
                            style={[
                              styles.selectionGridMeta,
                              item.statusLabel ? styles.selectionGridMetaWarn : null,
                            ]}
                            numberOfLines={1}
                          >
                            {meta}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
            {row.length < columns
              ? Array.from({ length: columns - row.length }).map((_, i) => (
                  <View
                    key={`wizard-grid-pad-${rowIndex}-${i}`}
                    style={styles.selectionGridCell}
                    pointerEvents="none"
                  />
                ))
              : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );

  if (showListShell && isPartyCard) {
    return <View style={styles.wizardPickerListShell}>{scroll}</View>;
  }

  return <View style={styles.selectionGridWrap}>{scroll}</View>;
}
