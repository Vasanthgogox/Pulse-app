import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { Pressable, Text, View } from "react-native";

import { fullPageWizardStyles as styles, WIZARD_PARTY_AVATAR_SIZE, WIZARD_PARTY_GRID_COLUMNS } from "./fullPageWizardStyles";
import { WizardEntityPartyCell } from "./WizardEntityPartyCell";
import { WizardSelectionGrid } from "./WizardSelectionGrid";

export type WizardEntityPickerItem = {
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

export interface WizardEntityPickerProps {
  title: string;
  totalCount?: number;
  items: WizardEntityPickerItem[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  emptyMessage?: string;
  footerHint?: string;
  listMaxHeight?: number;
  errorOutline?: boolean;
  /** Flat — no outer card border (parent shell already provides chrome). */
  embedded?: boolean;
  /** Grid column count (default 2 — attribution party row parity). */
  columns?: number;
}

export function WizardEntityPicker({
  title,
  totalCount,
  items,
  loading = false,
  selectedId,
  onSelect,
  onAdd,
  addLabel = "+ Add",
  emptyMessage = "Nothing to select yet.",
  footerHint,
  listMaxHeight = 420,
  errorOutline = false,
  embedded = false,
  columns = WIZARD_PARTY_GRID_COLUMNS,
}: WizardEntityPickerProps) {
  const count = totalCount ?? items.length;

  return (
    <View
      style={[
        embedded ? styles.blockFlat : styles.block,
        errorOutline && {
          borderColor: "rgba(232, 33, 39, 0.45)",
          backgroundColor: "rgba(254, 242, 242, 0.35)",
        },
      ]}
    >
      <View style={styles.wizardPickerHeader}>
        <Text style={styles.wizardPickerTitle} numberOfLines={2}>
          {title}
        </Text>
        {count > 0 ? (
          <View style={styles.wizardPickerCountBadge} accessibilityLabel={`${count} items`}>
            <Text style={styles.wizardPickerCountBadgeText}>{count}</Text>
          </View>
        ) : null}
      </View>

      <WizardSelectionGrid
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          subtitle: item.subtitle,
          avatarUrl: item.avatarUrl,
          avatarSeed: item.avatarSeed,
          entityType: item.entityType,
          initialsColorSeed: item.initialsColorSeed,
          organizationImageUrl: item.organizationImageUrl,
          organizationAvatarSeed: item.organizationAvatarSeed,
          disabled: item.disabled,
          statusLabel: item.statusLabel,
        }))}
        selectedId={selectedId}
        onSelect={onSelect}
        loading={loading}
        emptyMessage={emptyMessage}
        listMaxHeight={listMaxHeight}
        columns={columns}
        variant="partyCard"
        showListShell={!embedded}
      />

      {onAdd ? (
        <Pressable style={styles.addClientBtn} onPress={onAdd}>
          <Text style={styles.addClientBtnText}>{addLabel}</Text>
        </Pressable>
      ) : null}

      {footerHint ? (
        <Text style={styles.wizardPickerFooterHint}>{footerHint}</Text>
      ) : null}
    </View>
  );
}

export function WizardEntitySummaryCard({
  label,
  name,
  subtitle,
  avatarUrl,
  avatarSeed,
  entityType = "client",
  initialsColorSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  onPress,
}: {
  label: string;
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  initialsColorSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  onPress?: () => void;
}) {
  return (
    <WizardEntityPartyCell
      label={label}
      name={name}
      subtitle={subtitle}
      entityType={entityType}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      organizationImageUrl={organizationImageUrl}
      organizationAvatarSeed={organizationAvatarSeed}
      avatarSize={WIZARD_PARTY_AVATAR_SIZE}
      onPress={onPress}
    />
  );
}
