import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { Pressable, ScrollView, Text, View } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

const WIZARD_ENTITY_AVATAR_SIZE = 30;

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
  listMaxHeight = 320,
  errorOutline = false,
  embedded = false,
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text style={styles.blockTitle} numberOfLines={2}>
          {title}
        </Text>
        {count > 0 ? (
          <View
            style={{
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: Theme.borderLight,
              backgroundColor: Theme.screenBackground,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: Theme.primary,
              }}
            >
              {count}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.clientLoadingWrap}>
          <LoadingIndicator size="small" color={Theme.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.shipperWarningCard}>
          <Text style={styles.shipperWarningText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.clientListWrap}>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: listMaxHeight }}
          >
            {items.map((item) => {
              const selected = selectedId === item.id;
              const disabled = item.disabled === true;
              const displayName = item.name.trim() || "—";
              const meta =
                item.statusLabel ??
                item.subtitle?.trim() ??
                (disabled ? "Unavailable" : "—");
              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.clientRow,
                    selected && !disabled && styles.clientRowSelected,
                    disabled && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    if (disabled) return;
                    onSelect(item.id);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                >
                  <PartyAvatar
                    name={displayName}
                    initialsColorSeed={item.initialsColorSeed ?? item.id}
                    organizationImageUrl={item.organizationImageUrl ?? null}
                    organizationAvatarSeed={item.organizationAvatarSeed ?? null}
                    avatarUrl={item.avatarUrl ?? null}
                    avatarSeed={item.avatarSeed ?? null}
                    entityType={item.entityType ?? "client"}
                    size={WIZARD_ENTITY_AVATAR_SIZE}
                    shape="rounded"
                  />
                  <View style={styles.partyTextWrap}>
                    <Text style={styles.partyName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text
                      style={[
                        styles.blockMeta,
                        item.statusLabel ? { color: Theme.warning, fontWeight: "700" } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {meta}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {onAdd ? (
        <Pressable style={styles.addClientBtn} onPress={onAdd}>
          <Text style={styles.addClientBtnText}>{addLabel}</Text>
        </Pressable>
      ) : null}

      {footerHint ? (
        <Text style={[styles.blockMeta, { marginTop: 4 }]}>{footerHint}</Text>
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
  const content = (
    <View style={styles.shipperMarkCard}>
      <PartyAvatar
        name={name}
        initialsColorSeed={initialsColorSeed}
        organizationImageUrl={organizationImageUrl ?? null}
        organizationAvatarSeed={organizationAvatarSeed ?? null}
        avatarUrl={avatarUrl ?? null}
        avatarSeed={avatarSeed ?? null}
        entityType={entityType}
        size={WIZARD_ENTITY_AVATAR_SIZE}
        shape="rounded"
      />
      <View style={styles.partyTextWrap}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.blockMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
