/**
 * Party directory — tabbed customers / suppliers / drivers / vehicles → profile hub.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { WizardEntityPartyCell } from "@/components/full-page-wizard/WizardEntityPartyCell";
import {
  fullPageWizardStyles as wizardStyles,
  WIZARD_PARTY_GRID_COLUMNS,
  WIZARD_PARTY_GRID_COLUMNS_DESKTOP,
} from "@/components/full-page-wizard/fullPageWizardStyles";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  PARTY_DIRECTORY_TAB_ORDER,
  PARTY_KIND_ENTITY_LABEL,
  PARTY_KIND_META,
  PARTY_TAB_LABELS,
  type PartyKind,
} from "@/features/party/types/partyDirectory.types";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useClientsQuery,
  useDriversQuery,
  useSuppliersQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Building2,
  Car,
  Search,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PartyRow = {
  id: string;
  name: string;
  meta: string;
  entityType: "client" | "supplier" | "driver" | "vehicle";
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  href: string;
};

type TabTone = {
  bg: string;
  bgActive: string;
  text: string;
  border: string;
  accent: string;
};

const TAB_TONES: Record<PartyKind, TabTone> = {
  customers: {
    bg: Theme.networkBadgeClientBg,
    bgActive: "#E8EAFF",
    text: Theme.networkBadgeClientText,
    border: "rgba(67, 56, 202, 0.22)",
    accent: Theme.networkBadgeClientText,
  },
  suppliers: {
    bg: Theme.networkBadgeSupplierBg,
    bgActive: "#DCFCE7",
    text: Theme.networkBadgeSupplierText,
    border: "rgba(22, 101, 52, 0.22)",
    accent: Theme.networkBadgeSupplierText,
  },
  drivers: {
    bg: Theme.networkBadgeDriverBg,
    bgActive: "#FFEDD5",
    text: Theme.networkBadgeDriverText,
    border: "rgba(180, 83, 9, 0.22)",
    accent: Theme.networkBadgeDriverText,
  },
  vehicles: {
    bg: "#EEF2FF",
    bgActive: "#E0E7FF",
    text: Theme.primary,
    border: "rgba(79, 70, 229, 0.22)",
    accent: Theme.primary,
  },
};

const TAB_ICONS: Record<PartyKind, LucideIcon> = {
  customers: Building2,
  suppliers: Truck,
  drivers: User,
  vehicles: Car,
};

type Props = {
  kind: PartyKind;
  onBack: () => void;
};

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function PartyDirectoryScreen({ kind, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gridColumns =
    width >= Layout.wizardSteppedMaxWidth
      ? WIZARD_PARTY_GRID_COLUMNS_DESKTOP
      : WIZARD_PARTY_GRID_COLUMNS;
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [query, setQuery] = useState("");

  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);

  const tabCounts = useMemo(
    () => ({
      customers: clientsQ.data?.length ?? 0,
      suppliers: suppliersQ.data?.length ?? 0,
      drivers: (driversQ.data ?? []).filter((d) => !d.left_at && !d.tracking_only).length,
      vehicles: vehiclesQ.data?.length ?? 0,
    }),
    [clientsQ.data, driversQ.data, suppliersQ.data, vehiclesQ.data],
  );

  const loading =
    clientsQ.isLoading ||
    suppliersQ.isLoading ||
    driversQ.isLoading ||
    vehiclesQ.isLoading;

  const rows: PartyRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, meta: string) =>
      !q || name.toLowerCase().includes(q) || meta.toLowerCase().includes(q);

    if (kind === "customers") {
      return (clientsQ.data ?? [])
        .filter((c) => match(c.name ?? "", c.phone ?? ""))
        .map((c) => ({
          id: c.id,
          name: (c.name ?? c.contact_person ?? "Client").trim(),
          meta: c.phone?.trim() || c.email?.trim() || "Customer",
          entityType: "client" as const,
          avatarUrl: c.avatar_url,
          avatarSeed: c.avatar_seed,
          href: ROUTES.clientProfile(c.id),
        }));
    }
    if (kind === "suppliers") {
      return (suppliersQ.data ?? [])
        .filter((s) =>
          match((s.name ?? s.company_name ?? "").trim(), s.phone?.trim() ?? ""),
        )
        .map((s) => ({
          id: s.id,
          name: (s.name ?? s.company_name ?? s.contact_person ?? "Supplier").trim(),
          meta: s.phone?.trim() || s.gst_number?.trim() || "Supplier",
          entityType: "supplier" as const,
          avatarUrl: s.avatar_url,
          avatarSeed: s.avatar_seed,
          href: ROUTES.supplierProfile(s.id),
        }));
    }
    if (kind === "drivers") {
      return (driversQ.data ?? [])
        .filter((d) => !d.left_at && !d.tracking_only)
        .filter((d) => match((d.name ?? "").trim(), d.phone?.trim() ?? ""))
        .map((d) => ({
          id: d.id,
          name: (d.name ?? "Driver").trim(),
          meta: d.phone?.trim() || d.license_number?.trim() || "Fleet driver",
          entityType: "driver" as const,
          avatarUrl: d.avatar_url,
          avatarSeed: d.avatar_seed,
          href: ROUTES.driverProfile(d.id),
        }));
    }
    return (vehiclesQ.data ?? [])
      .filter((v) =>
        match(v.vehicle_number?.trim() ?? "", v.vehicle_type?.trim() ?? ""),
      )
      .map((v) => ({
        id: v.id,
        name: (v.vehicle_number ?? "Vehicle").trim(),
        meta: [v.vehicle_type, v.vehicle_brand].filter(Boolean).join(" · ") || "Fleet asset",
        entityType: "vehicle" as const,
        avatarUrl: v.avatar_url,
        avatarSeed: v.avatar_seed,
        href: ROUTES.vehicleProfile(v.id),
      }));
  }, [clientsQ.data, driversQ.data, kind, query, suppliersQ.data, vehiclesQ.data]);

  const meta = PARTY_KIND_META[kind];
  const entityLabel = PARTY_KIND_ENTITY_LABEL[kind];
  const activeTone = TAB_TONES[kind];
  const gridRows = useMemo(
    () => chunkRows(rows, gridColumns),
    [gridColumns, rows],
  );

  const selectTab = (next: PartyKind) => {
    if (next === kind) return;
    setQuery("");
    router.replace(ROUTES.partyDirectory(next) as Parameters<typeof router.replace>[0]);
  };

  if (!orgId || loading) {
    return <CenteredLoadingView />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.hero}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PARTY DIRECTORY</Text>
        <Text style={styles.heroTitle}>Your network parties</Text>
        <Text style={styles.heroSub}>
          Shippers, carriers, drivers and fleet assets in one place
        </Text>
      </View>

      <View style={styles.tabCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {PARTY_DIRECTORY_TAB_ORDER.map((tabKind) => {
            const active = tabKind === kind;
            const tone = TAB_TONES[tabKind];
            const Icon = TAB_ICONS[tabKind];
            const count = tabCounts[tabKind];
            return (
              <Pressable
                key={tabKind}
                onPress={() => selectTab(tabKind)}
                style={[
                  styles.tabPill,
                  {
                    backgroundColor: active ? tone.bgActive : Theme.cardWhite,
                    borderColor: active ? tone.border : Theme.borderLight,
                  },
                  active && styles.tabPillActive,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.tabIconWrap,
                    { backgroundColor: active ? tone.bg : Theme.surface },
                  ]}
                >
                  <Icon
                    size={14}
                    color={active ? tone.accent : Theme.textMuted}
                    strokeWidth={1.9}
                  />
                </View>
                <View style={styles.tabTextCol}>
                  <Text
                    style={[
                      styles.tabLabel,
                      active && { color: tone.text, fontWeight: "700" },
                    ]}
                  >
                    {PARTY_TAB_LABELS[tabKind]}
                  </Text>
                  <Text style={styles.tabCount}>{count} listed</Text>
                </View>
                {active ? (
                  <View style={[styles.tabActiveDot, { backgroundColor: tone.accent }]} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.panelHeader, { borderLeftColor: activeTone.accent }]}>
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle}>{meta.title}</Text>
          <Text style={styles.panelSub}>{meta.subtitle}</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: activeTone.bg }]}>
          <Text style={[styles.countBadgeText, { color: activeTone.text }]}>
            {rows.length}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          placeholderTextColor={Theme.textMuted}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No {meta.title.toLowerCase()} found</Text>
            <Text style={styles.empty}>{meta.empty}</Text>
          </View>
        ) : (
          <View style={wizardStyles.selectionGridWrap}>
            <View style={wizardStyles.selectionGrid}>
              {gridRows.map((row, rowIndex) => (
                <View
                  key={`party-grid-row-${rowIndex}`}
                  style={wizardStyles.selectionGridRow}
                >
                  {row.map((item) => (
                    <View
                      key={item.id}
                      style={[
                        wizardStyles.selectionGridCell,
                        Platform.OS === "web"
                          ? ({ cursor: "default" } as ViewStyle)
                          : null,
                      ]}
                    >
                      <WizardEntityPartyCell
                        label={entityLabel}
                        name={item.name}
                        subtitle={item.meta}
                        entityType={item.entityType}
                        avatarUrl={item.avatarUrl}
                        avatarSeed={item.avatarSeed}
                        onPress={() =>
                          router.push(
                            item.href as Parameters<typeof router.push>[0],
                          )
                        }
                        style={[
                          wizardStyles.partyCardSelectable,
                          Platform.OS === "web"
                            ? ({ cursor: "pointer" } as ViewStyle)
                            : null,
                        ]}
                      />
                    </View>
                  ))}
                  {row.length < gridColumns
                    ? Array.from({ length: gridColumns - row.length }).map((_, i) => (
                        <View
                          key={`party-grid-pad-${rowIndex}-${i}`}
                          style={wizardStyles.selectionGridCell}
                          pointerEvents="none"
                        />
                      ))
                    : null}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fb" },
  hero: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  backText: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.primary,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 17,
    maxWidth: 420,
  },
  tabCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(24, 28, 50, 0.05)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingHorizontal: 4,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 128,
    position: "relative",
  },
  tabPillActive: {
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(24, 28, 50, 0.06)" as unknown as undefined,
      },
      default: { elevation: 1 },
    }),
  },
  tabIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabTextCol: { flex: 1, minWidth: 0, gap: 1 },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tabCount: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tabActiveDot: {
    position: "absolute",
    bottom: 4,
    left: "50%",
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  panelHeaderText: { flex: 1, minWidth: 0, gap: 2 },
  panelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  panelSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  countBadge: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    padding: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Layout.screenPaddingHorizontal },
  emptyCard: {
    padding: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  empty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});
