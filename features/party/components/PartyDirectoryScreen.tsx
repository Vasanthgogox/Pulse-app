/**
 * Party directory — tabbed customers / suppliers / drivers / vehicles (Metronic Teams grid).
 * No profile hero — compact chrome + tab strip + card grid only.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Layout from "@/constants/Layout";
import { PartyDirectoryPartyCard } from "@/features/party/components/PartyDirectoryPartyCard";
import {
  HUB_PURPLE_VIVID,
  partyDirectoryStyles as styles,
  PARTY_GRID_COLUMNS,
  PARTY_GRID_COLUMNS_DESKTOP,
} from "@/features/party/components/partyDirectory.styles";
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
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRONIC } from "@/components/profile/workspaceHubMenu.styles";

type PartyRow = {
  id: string;
  name: string;
  meta: string;
  entityType: "client" | "supplier" | "driver" | "vehicle";
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  href: string;
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
      ? PARTY_GRID_COLUMNS_DESKTOP
      : PARTY_GRID_COLUMNS;
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
      <View style={styles.pageChrome}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={15} color={METRONIC.subtle} strokeWidth={2.2} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Party Directory</Text>
        <Text style={styles.pageTitle}>Your network parties</Text>
        <Text style={styles.pageSub}>
          Shippers, carriers, drivers and fleet assets in one place
        </Text>
      </View>

      <View style={styles.tabCardStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabCardRow}
        >
          {PARTY_DIRECTORY_TAB_ORDER.map((tabKind) => {
            const active = tabKind === kind;
            const Icon = TAB_ICONS[tabKind];
            const count = tabCounts[tabKind];
            return (
              <Pressable
                key={tabKind}
                onPress={() => selectTab(tabKind)}
                style={[styles.tabCard, active && styles.tabCardActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.tabCardIconWrap,
                    active && styles.tabCardIconWrapActive,
                  ]}
                >
                  <Icon
                    size={14}
                    color={active ? HUB_PURPLE_VIVID : METRONIC.muted}
                    strokeWidth={1.9}
                  />
                </View>
                <View style={styles.tabCardTextCol}>
                  <Text
                    style={[
                      styles.tabCardLabel,
                      active && styles.tabCardLabelActive,
                    ]}
                  >
                    {PARTY_TAB_LABELS[tabKind]}
                  </Text>
                  <Text style={styles.tabCardCount}>{count} listed</Text>
                </View>
                {active ? <View style={styles.tabCardDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sectionToolbar}>
        <View style={styles.sectionToolbarLeft}>
          <Text style={styles.sectionToolbarTitle}>{meta.title}</Text>
          <Text style={styles.sectionToolbarSub}>{meta.subtitle}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{rows.length}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={14} color={METRONIC.muted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          placeholderTextColor={METRONIC.muted}
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
            <Text style={styles.emptyBody}>{meta.empty}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {gridRows.map((row, rowIndex) => (
              <View key={`party-row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item) => (
                  <View key={item.id} style={styles.gridCell}>
                    <PartyDirectoryPartyCard
                      entityLabel={entityLabel}
                      name={item.name}
                      meta={item.meta}
                      entityType={item.entityType}
                      avatarUrl={item.avatarUrl}
                      avatarSeed={item.avatarSeed}
                      onPress={() =>
                        router.push(item.href as Parameters<typeof router.push>[0])
                      }
                    />
                  </View>
                ))}
                {row.length < gridColumns
                  ? Array.from({ length: gridColumns - row.length }).map((_, i) => (
                      <View
                        key={`party-pad-${rowIndex}-${i}`}
                        style={styles.gridCell}
                        pointerEvents="none"
                      />
                    ))
                  : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
