/**
 * Party directory — pick a customer, supplier, driver, or vehicle → profile hub.
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
  PARTY_KIND_ENTITY_LABEL,
  PARTY_KIND_META,
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
import { ArrowLeft, Search } from "lucide-react-native";
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

  const clientsQ = useClientsQuery(kind === "customers" ? orgId : null);
  const suppliersQ = useSuppliersQuery(kind === "suppliers" ? orgId : null);
  const driversQ = useDriversQuery(kind === "drivers" ? orgId : null);
  const vehiclesQ = useVehiclesQuery(kind === "vehicles" ? orgId : null);

  const loading =
    (kind === "customers" && clientsQ.isLoading) ||
    (kind === "suppliers" && suppliersQ.isLoading) ||
    (kind === "drivers" && driversQ.isLoading) ||
    (kind === "vehicles" && vehiclesQ.isLoading);

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
          match(
            (s.name ?? s.company_name ?? "").trim(),
            s.phone?.trim() ?? "",
          ),
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

  if (!orgId || loading) {
    return <CenteredLoadingView />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>
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
          <Text style={styles.empty}>{meta.empty}</Text>
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
                    ? Array.from({
                        length: gridColumns - row.length,
                      }).map((_, i) => (
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
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
  backText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 17 },
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
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    padding: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Layout.screenPaddingHorizontal },
  empty: {
    padding: 24,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
