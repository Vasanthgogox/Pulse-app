import { AlertCircle, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { resolveWizardClientPhone, resolveWizardContactPhone } from "@/features/clients/utils/clientContactDisplay.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";

import {
  DesktopEntityCard,
  DesktopSectionHeading,
  DesktopStatusBadge,
  entityInitials,
} from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

function normalizePartyQuery(query: string): string {
  return query.trim().toLowerCase();
}

function partyMatchesQuery(
  query: string,
  ...fields: Array<string | null | undefined>
): boolean {
  const q = normalizePartyQuery(query);
  if (!q) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(q));
}

export type DesktopPartySearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
};

/** Compact search in party picker header rows (client / partner). */
export const DesktopPartySearchField = memo(function DesktopPartySearchField({
  value,
  onChangeText,
  placeholder = "Search party",
  accessibilityLabel = "Search party",
}: DesktopPartySearchFieldProps) {
  return (
    <View style={s.desktopPartySearch}>
      <Search size={13} color={Theme.textMuted} strokeWidth={2.25} />
      <TextInput
        style={s.desktopPartySearchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        {...Platform.select({
          web: { outlineStyle: "none" } as object,
          default: {},
        })}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <X size={13} color={Theme.textMuted} strokeWidth={2.25} />
        </Pressable>
      ) : null}
    </View>
  );
});

export function filterClientsByPartyQuery(
  clients: readonly ClientRow[],
  query: string,
): ClientRow[] {
  const q = normalizePartyQuery(query);
  if (!q) return [...clients];
  return clients.filter((client) =>
    partyMatchesQuery(
      q,
      client.name,
      client.contact_person,
      client.phone,
      client.email,
      client.gstin,
    ),
  );
}

export function filterPartnersByPartyQuery(
  suppliers: readonly SupplierRow[],
  query: string,
): SupplierRow[] {
  const q = normalizePartyQuery(query);
  if (!q) return [...suppliers];
  return suppliers.filter((supplier) =>
    partyMatchesQuery(
      q,
      supplier.company_name,
      supplier.name,
      supplier.contact_person,
      supplier.phone,
      supplier.email,
    ),
  );
}

export type DesktopPickerHeaderActionsProps = {
  showChange?: boolean;
  changeExpanded?: boolean;
  onToggleChange?: () => void;
  addLabel?: string;
  onAdd?: () => void;
};

export const DesktopPickerHeaderActions = memo(function DesktopPickerHeaderActions({
  showChange = false,
  changeExpanded = false,
  onToggleChange,
  addLabel,
  onAdd,
}: DesktopPickerHeaderActionsProps) {
  if (!showChange && !addLabel) return null;
  return (
    <View style={s.desktopPickerHeaderActions}>
      {showChange && onToggleChange ? (
        <Pressable
          onPress={onToggleChange}
          style={s.desktopChangeBtn}
          accessibilityRole="button"
          accessibilityLabel={changeExpanded ? "Collapse client list" : "Change selection"}
        >
          <Text style={s.desktopChangeBtnText}>
            {changeExpanded ? "Collapse" : "Change"}
          </Text>
          {changeExpanded ? (
            <ChevronUp size={11} color={Theme.primary} strokeWidth={2.5} />
          ) : (
            <ChevronDown size={11} color={Theme.primary} strokeWidth={2.5} />
          )}
        </Pressable>
      ) : null}
      {addLabel && onAdd ? (
        <Pressable onPress={onAdd} style={s.commodityAddClientBtn} accessibilityRole="button">
          <Text style={s.commodityAddClientBtnText}>{addLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

type DesktopCollapsibleScrollProps = {
  expanded: boolean;
  /** When set, list scrolls inside panel (allocation). When omitted, content flows (page scroll). */
  scrollMaxHeight?: number;
  children: ReactNode;
  contentStyle?: object;
};

export const DesktopCollapsibleScroll = memo(function DesktopCollapsibleScroll({
  expanded,
  scrollMaxHeight,
  children,
  contentStyle,
}: DesktopCollapsibleScrollProps) {
  if (!expanded) return null;

  if (scrollMaxHeight == null) {
    return <View style={[s.desktopEntityGridFlow, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[s.desktopScrollList, { maxHeight: scrollMaxHeight }]}
      contentContainerStyle={[s.desktopScrollListContent, contentStyle]}
      showsVerticalScrollIndicator
      nestedScrollEnabled
    >
      {children}
    </ScrollView>
  );
});

export type CreateTripDesktopClientGridProps = {
  clients: ClientRow[];
  clientsLoading: boolean;
  selectedClientId: string | null;
  listExpanded: boolean;
  onExpandList: () => void;
  onSelectClient: (client: ClientRow) => void;
  hasError?: boolean;
  /** Full-width entity tiles on mobile. */
  compact?: boolean;
};

export const CreateTripDesktopClientGrid = memo(function CreateTripDesktopClientGrid({
  clients,
  clientsLoading,
  selectedClientId,
  listExpanded,
  onExpandList,
  onSelectClient,
  hasError = false,
  compact = false,
}: CreateTripDesktopClientGridProps) {
  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const showList = !selectedClientId || listExpanded;
  const showSummary = Boolean(selectedClientId && !listExpanded && selectedClient);

  if (clientsLoading) {
    return <ActivityIndicator color={Theme.iconPrimary} style={{ marginVertical: 24 }} />;
  }

  return (
    <View style={s.desktopPickerStack}>
      {showSummary && selectedClient ? (
        <View style={s.desktopSelectionSummaryWrap}>
          <DesktopEntityCard
            title={selectedClient.name?.trim() || "Client"}
            subtitle={resolveWizardClientPhone(selectedClient.phone)}
            initials={entityInitials(selectedClient.name ?? "CL")}
            entityType="client"
            avatarUrl={selectedClient.avatar_url ?? null}
            avatarSeed={selectedClient.avatar_seed ?? null}
            isIntegrated={
              selectedClient.is_integrated === true ||
              Boolean(selectedClient.linked_organization_id)
            }
            selected
            onPress={onExpandList}
            trailing={
              <View style={s.desktopChangePill}>
                <Text style={s.desktopChangePillText}>Change</Text>
              </View>
            }
          />
        </View>
      ) : null}

      {showList ? (
        <View style={s.desktopClientGrid}>
          {clients.length === 0 ? (
            <Text style={s.desktopPartySearchEmpty}>No parties match your search</Text>
          ) : (
            clients.map((client) => {
            const selected = client.id === selectedClientId;
            const name = client.name?.trim() || "Client";
            return (
              <View
                key={client.id}
                style={[
                  s.desktopClientGridItem,
                  compact && s.compactEntityGridItem,
                ]}
              >
                <DesktopEntityCard
                  title={name}
                  subtitle={resolveWizardClientPhone(client.phone)}
                  initials={entityInitials(name)}
                  entityType="client"
                  avatarUrl={client.avatar_url ?? null}
                  avatarSeed={client.avatar_seed ?? null}
                  isIntegrated={
                    client.is_integrated === true ||
                    Boolean(client.linked_organization_id)
                  }
                  selected={selected}
                  onPress={() => onSelectClient(client)}
                />
              </View>
            );
          })
          )}
        </View>
      ) : null}

      {hasError ? (
        <View style={s.desktopInlineErrorRow}>
          <AlertCircle size={14} color={Theme.destructive} strokeWidth={2.5} />
          <Text style={s.desktopInlineErrorText}>Select a client from the list.</Text>
        </View>
      ) : null}
    </View>
  );
});

function partnerDisplayName(supplier: SupplierRow): string {
  return (
    supplier.company_name?.trim() ||
    supplier.name?.trim() ||
    supplier.contact_person?.trim() ||
    "Partner"
  );
}

export type CreateTripDesktopPartnerGridProps = {
  suppliers: SupplierRow[];
  suppliersLoading: boolean;
  selectedSupplierId: string | null;
  listExpanded: boolean;
  onExpandList: () => void;
  onSelectPartner: (supplier: SupplierRow) => void;
  hasError?: boolean;
  scrollMaxHeight?: number;
  compact?: boolean;
};

export const CreateTripDesktopPartnerGrid = memo(function CreateTripDesktopPartnerGrid({
  suppliers,
  suppliersLoading,
  selectedSupplierId,
  listExpanded,
  onExpandList,
  onSelectPartner,
  hasError = false,
  scrollMaxHeight,
  compact = false,
}: CreateTripDesktopPartnerGridProps) {
  const selectedPartner =
    suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const showList = !selectedSupplierId || listExpanded;
  const showSummary = Boolean(selectedSupplierId && !listExpanded && selectedPartner);

  if (suppliersLoading) {
    return <ActivityIndicator color={Theme.iconPrimary} style={{ marginVertical: 16 }} />;
  }

  const sorted = [...suppliers].sort((a, b) =>
    partnerDisplayName(a).localeCompare(partnerDisplayName(b), "en", {
      sensitivity: "base",
    }),
  );

  return (
    <View style={s.desktopPickerStack}>
      {showSummary && selectedPartner ? (
        <View style={s.desktopSelectionSummaryWrap}>
          <DesktopEntityCard
            title={partnerDisplayName(selectedPartner)}
            subtitle={resolveWizardContactPhone(selectedPartner.phone) ?? "Partner"}
            initials={entityInitials(partnerDisplayName(selectedPartner))}
            entityType="supplier"
            avatarUrl={selectedPartner.avatar_url ?? null}
            avatarSeed={selectedPartner.avatar_seed ?? null}
            organizationImageUrl={
              (selectedPartner as { organization_avatar_url?: string | null })
                .organization_avatar_url ?? null
            }
            organizationAvatarSeed={
              (selectedPartner as { organization_avatar_seed?: string | null })
                .organization_avatar_seed ?? null
            }
            selected
            onPress={onExpandList}
            trailing={
              <View style={s.desktopChangePill}>
                <Text style={s.desktopChangePillText}>Change</Text>
              </View>
            }
          />
        </View>
      ) : null}

      {showList ? (
        <DesktopCollapsibleScroll expanded scrollMaxHeight={scrollMaxHeight}>
          {sorted.length === 0 ? (
            <Text style={s.desktopPartySearchEmpty}>No parties match your search</Text>
          ) : (
            sorted.map((supplier) => {
            const selected = supplier.id === selectedSupplierId;
            const name = partnerDisplayName(supplier);
            return (
              <View
                key={supplier.id}
                style={[
                  s.desktopClientGridItem,
                  compact && s.compactEntityGridItem,
                ]}
              >
                <DesktopEntityCard
                  title={name}
                  subtitle={resolveWizardContactPhone(supplier.phone) ?? "Partner"}
                  initials={entityInitials(name)}
                  entityType="supplier"
                  avatarUrl={supplier.avatar_url ?? null}
                  avatarSeed={supplier.avatar_seed ?? null}
                  organizationImageUrl={
                    (supplier as { organization_avatar_url?: string | null })
                      .organization_avatar_url ?? null
                  }
                  organizationAvatarSeed={
                    (supplier as { organization_avatar_seed?: string | null })
                      .organization_avatar_seed ?? null
                  }
                  selected={selected}
                  onPress={() => onSelectPartner(supplier)}
                />
              </View>
            );
          })
          )}
        </DesktopCollapsibleScroll>
      ) : null}

      {hasError ? (
        <Text style={s.desktopInlineErrorText}>Select a transport partner.</Text>
      ) : null}
    </View>
  );
});

export type CreateTripDesktopEntityListProps = {
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    initials: string;
    disabled?: boolean;
    statusLabel?: string;
    statusTone?: "available" | "busy";
    entityType?: "client" | "supplier" | "driver" | "vehicle";
    avatarUrl?: string | null;
    avatarSeed?: string | null;
    organizationImageUrl?: string | null;
    organizationAvatarSeed?: string | null;
  }>;
  selectedId: string | null;
  listExpanded: boolean;
  onExpandList: () => void;
  onSelect: (id: string) => void;
  scrollMaxHeight?: number;
  /** Omit nested scroll — let the page ScrollView own vertical scroll. */
  compact?: boolean;
};

export const CreateTripDesktopEntityList = memo(function CreateTripDesktopEntityList({
  items,
  selectedId,
  listExpanded,
  onExpandList,
  onSelect,
  scrollMaxHeight,
  compact = false,
}: CreateTripDesktopEntityListProps) {
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const showList = !selectedId || listExpanded;
  const showSummary = Boolean(selectedId && !listExpanded && selectedItem);
  const listMaxHeight = compact ? undefined : (scrollMaxHeight ?? 280);

  return (
    <View style={s.desktopPickerStack}>
      {showSummary && selectedItem ? (
        <View style={s.desktopSelectionSummaryWrap}>
          <DesktopEntityCard
            title={selectedItem.title}
            subtitle={selectedItem.subtitle}
            initials={selectedItem.initials}
            entityType={selectedItem.entityType}
            avatarUrl={selectedItem.avatarUrl}
            avatarSeed={selectedItem.avatarSeed}
            organizationImageUrl={selectedItem.organizationImageUrl}
            organizationAvatarSeed={selectedItem.organizationAvatarSeed}
            selected
            onPress={onExpandList}
            trailing={
              selectedItem.statusLabel ? (
                <DesktopStatusBadge
                  label={selectedItem.statusLabel}
                  tone={selectedItem.statusTone ?? "available"}
                />
              ) : (
                <View style={s.desktopChangePill}>
                  <Text style={s.desktopChangePillText}>Change</Text>
                </View>
              )
            }
          />
        </View>
      ) : null}

      {showList ? (
        <DesktopCollapsibleScroll
          expanded
          scrollMaxHeight={listMaxHeight}
          contentStyle={{ gap: 8 }}
        >
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <DesktopEntityCard
                key={item.id}
                title={item.title}
                subtitle={item.subtitle}
                initials={item.initials}
                entityType={item.entityType}
                avatarUrl={item.avatarUrl}
                avatarSeed={item.avatarSeed}
                organizationImageUrl={item.organizationImageUrl}
                organizationAvatarSeed={item.organizationAvatarSeed}
                selected={selected}
                disabled={item.disabled}
                onPress={() => onSelect(item.id)}
                trailing={
                  item.statusLabel ? (
                    <DesktopStatusBadge
                      label={item.statusLabel}
                      tone={item.statusTone ?? "available"}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </DesktopCollapsibleScroll>
      ) : null}
    </View>
  );
});

export type CreateTripDesktopListSectionProps = {
  heading: string;
  count: number;
  children: ReactNode;
  /** Opens add-driver / add-vehicle modal. */
  onAddPress?: () => void;
  addAccessibilityLabel?: string;
};

export const CreateTripDesktopListSection = memo(function CreateTripDesktopListSection({
  heading,
  count,
  children,
  onAddPress,
  addAccessibilityLabel,
}: CreateTripDesktopListSectionProps) {
  return (
    <View style={s.desktopListSection}>
      <View style={s.desktopListSectionHead}>
        <DesktopSectionHeading>{heading}</DesktopSectionHeading>
        <View style={s.desktopListSectionHeadRight}>
          <View style={s.desktopCountBadge}>
            <Text style={s.desktopCountBadgeText}>{count}</Text>
          </View>
          {onAddPress ? (
            <Pressable
              onPress={onAddPress}
              style={s.desktopListAddBtn}
              accessibilityRole="button"
              accessibilityLabel={addAccessibilityLabel ?? `Add ${heading}`}
              hitSlop={8}
              {...(Platform.OS === "web"
                ? ({ cursor: "pointer" } as object)
                : null)}
            >
              <Plus size={16} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
});
