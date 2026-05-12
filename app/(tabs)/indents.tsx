import { EntityRow } from "@/components/EntityRow";
import { FAB } from "@/components/FAB";
import { ListScreenLayout } from "@/components/ListScreenLayout";
import { SummaryCard } from "@/components/SummaryCard";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import {
    canAccessIndents,
    getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import { formatINR } from "@/lib/format";
import { useIndentsQuery } from "@/lib/queries/useIndentsQuery";
import { useRefreshWithFeedback } from "@/lib/useRefreshWithFeedback";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function getIndentStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "—";
  if (s === "draft") return "Draft (Editable)";
  if (s === "broadcast") return "Broadcast";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function IndentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role,
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null,
  );
  const canAccess = canAccessIndents(capabilities);
  const orgId = canAccess ? (currentOrganization?.id ?? null) : null;

  const {
    data: indents = [],
    isLoading: loading,
    refetch,
  } = useIndentsQuery(orgId);
  const { refreshing, onRefresh } = useRefreshWithFeedback(refetch);

  const filtered = search.trim()
    ? indents.filter(
        (i) =>
          getIndentDisplayNumber(i)
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (i.trip_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
          i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
          i.pickup_area?.toLowerCase().includes(search.toLowerCase()) ||
          i.drop_location?.toLowerCase().includes(search.toLowerCase()),
      )
    : indents;

  const totalValue = indents.reduce(
    (s, i) => s + Number(i.client_price || 0),
    0,
  );
  const pending = indents.filter(
    (i) => i.status !== "completed" && i.status !== "cancelled",
  ).length;

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>You don't have access to Indents.</Text>
      </View>
    );
  }

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>
        {loading ? "Loading…" : "No indents yet."}
      </Text>
    </View>
  );

  return (
    <ListScreenLayout
      title="Indents"
      searchPlaceholder="Search indent or client"
      searchValue={search}
      onSearchChange={setSearch}
      onRefresh={onRefresh}
      refreshing={refreshing}
      summaryCard={
        <SummaryCard
          title="Indents summary"
          leftAmount={String(pending)}
          leftSubLabel="Pending"
          rightAmount={formatINR(totalValue)}
          rightSubLabel="Total value"
          amountColor="green"
        />
      }
      fab={
        <FAB
          label="Add Indent"
          onPress={() =>
            router.push("/create-indent" as import("expo-router").Href)
          }
          LucideIconComponent={Package}
        />
      }
      listData={filtered}
      listKeyExtractor={(i) => i.id}
      renderListItem={({ item: i }) => (
        <EntityRow
          title={`${getIndentDisplayNumber(i)}${i.trip_number ? ` · ${i.trip_number}` : ""}`}
          subtitleLeft={i.pickup_area ?? "—"}
          subtitleRight={i.drop_location ?? "—"}
          subtitle={i.client_name ?? "—"}
          amount={formatINR(i.client_price)}
          amountLabel={getIndentStatusLabel(i.status)}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/network",
              params: { tab: "load", indentId: i.id },
            } as import("expo-router").Href)
          }
        />
      )}
      ListEmptyComponent={emptyComponent}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  loading: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  empty: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  emptyWrap: { padding: 24 },
});
