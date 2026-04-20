/**
 * Client Feed screen — "From Your Clients".
 *
 * Primary entry point for the distributed-bookkeeping UX described in the PRD.
 * Lists ledger entries that integrated clients have logged against this org,
 * classified against the local ledger (New / Similar / Mismatch / Actioned).
 *
 * Why not inside the Ledger?
 *   Ledger = your truth. This feed = external input. Mixing them kills clarity.
 *   (PRD §6) This screen is deliberately its own surface.
 */
import Theme from "@/constants/Theme";
import { TeslaHeader } from "@/components/TeslaHeader";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getClientFeedStatusMap,
  type ClientFeedLocalStatus,
} from "../lib/clientFeedLocalStatus";
import {
  fetchClientFeed,
  type ClientFeedBundle,
  type ClientFeedEntry,
  type ClientFeedMatchKind,
} from "../services/clientFeedService";
import { ClientFeedEntryDetailModal } from "./ClientFeedEntryDetailModal";

type FilterKey = "ALL" | ClientFeedMatchKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "DUPLICATE", label: "Similar" },
  { key: "MISMATCH", label: "Mismatch" },
  { key: "ACTIONED", label: "Actioned" },
];

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const d = (iso ?? "").slice(0, 10);
  if (!d) return "—";
  const [, m, day] = d.split("-");
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m}`;
}

function initialsFor(name: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ClientFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useOptionalAuth();
  const organization = useOptionalOrganization();
  const orgId = organization?.currentOrganization?.id ?? null;

  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [bundle, setBundle] = useState<ClientFeedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClientFeedEntry | null>(null);

  const { data: localLedger = [], refetch: refetchLedger } =
    useTransactionsQuery(orgId);

  const loadFeed = useCallback(
    async (soft = false) => {
      if (!orgId) {
        setBundle(null);
        setLoading(false);
        return;
      }
      if (!soft) setLoading(true);
      setErrorMsg(null);
      try {
        const localStatusByEntryId: Record<string, ClientFeedLocalStatus> =
          await getClientFeedStatusMap(orgId);
        const { error, bundle: bun } = await fetchClientFeed({
          orgId,
          localLedger,
          localStatusByEntryId,
        });
        if (error) {
          setErrorMsg(error.message);
          return;
        }
        setBundle(bun);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Couldn't load feed.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, localLedger],
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchLedger();
    await loadFeed(true);
  }, [loadFeed, refetchLedger]);

  const handleActionComplete = useCallback(async () => {
    await refetchLedger();
    await loadFeed(true);
  }, [loadFeed, refetchLedger]);

  const filteredEntries = useMemo(() => {
    if (!bundle) return [];
    if (filter === "ALL") return bundle.entries;
    return bundle.entries.filter((e) => e.match === filter);
  }, [bundle, filter]);

  if (!auth || !organization) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <TeslaHeader
        title="From Clients"
        subtitle="Auto-filled from your client's records"
        showBack
        onBack={() => router.back()}
        hideRightIcons
      />

      {/* Filter chip row */}
      <View style={styles.filterRow}>
        <FlatList
          data={FILTERS}
          horizontal
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const count =
              item.key === "ALL"
                ? bundle?.entries.length ?? 0
                : bundle?.counts[item.key] ?? 0;
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setFilter(item.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipLabel, active && styles.chipLabelActive]}
                >
                  {item.label}
                </Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text
                    style={[
                      styles.chipCountText,
                      active && styles.chipCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={Theme.textPrimaryDark} />
        </View>
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <FontAwesome
            name="exclamation-circle"
            size={20}
            color={Theme.warning}
          />
          <Text style={styles.emptyTitle}>Couldn't load feed</Text>
          <Text style={styles.emptyBody}>{errorMsg}</Text>
        </View>
      ) : !bundle || bundle.entries.length === 0 ? (
        <EmptyIntro />
      ) : filteredEntries.length === 0 ? (
        <EmptyForFilter filter={filter} />
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24 + insets.bottom,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.primary}
            />
          }
          renderItem={({ item }) => (
            <FeedRow entry={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <ClientFeedEntryDetailModal
        visible={!!selected}
        entry={selected}
        orgId={orgId ?? ""}
        onClose={() => setSelected(null)}
        onActionComplete={handleActionComplete}
      />
    </View>
  );
}

/** Single row in the feed. */
function FeedRow({
  entry,
  onPress,
}: {
  entry: ClientFeedEntry;
  onPress: () => void;
}) {
  const badge = matchBadge(entry);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowAvatar}>
        <Text style={styles.rowAvatarText}>{initialsFor(entry.clientName)}</Text>
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowMainHeader}>
          <Text style={styles.rowParty} numberOfLines={1}>
            {entry.clientName}
          </Text>
          <Text style={styles.rowAmount}>
            + {formatINR(entry.amount)}
          </Text>
        </View>
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowMeta}>
            {formatDate(entry.transactionDate)}
          </Text>
          <View style={styles.rowMetaDot} />
          <Text style={styles.rowMeta}>{entry.type}</Text>
          {entry.tripId ? (
            <>
              <View style={styles.rowMetaDot} />
              <Text style={styles.rowMeta}>
                TRIP {entry.tripId.slice(0, 8).toUpperCase()}
              </Text>
            </>
          ) : null}
        </View>
        <View style={styles.rowBadgeRow}>
          <View style={[styles.rowBadge, { backgroundColor: badge.bg }]}>
            <FontAwesome name={badge.icon} size={9} color={badge.fg} />
            <Text style={[styles.rowBadgeText, { color: badge.fg }]}>
              {badge.label}
            </Text>
          </View>
          <FontAwesome
            name="chevron-right"
            size={12}
            color={Theme.textMuted}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function matchBadge(entry: ClientFeedEntry): {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  fg: string;
  bg: string;
} {
  if (entry.match === "ACTIONED" && entry.localStatus) {
    switch (entry.localStatus.kind) {
      case "ADDED":
        return {
          icon: "check-circle",
          label: "ADDED",
          fg: Theme.driverEmerald,
          bg: "rgba(16,185,129,0.12)",
        };
      case "LINKED":
        return {
          icon: "link",
          label: "LINKED",
          fg: Theme.driverEmerald,
          bg: "rgba(16,185,129,0.12)",
        };
      case "DISPUTED":
        return {
          icon: "exclamation-circle",
          label: "DISPUTED",
          fg: Theme.warning,
          bg: "rgba(180,83,9,0.12)",
        };
      case "IGNORED":
      default:
        return {
          icon: "ban",
          label: "IGNORED",
          fg: Theme.textMuted,
          bg: Theme.surfaceGray,
        };
    }
  }
  switch (entry.match) {
    case "NEW":
      return {
        icon: "plus-circle",
        label: "ADD TO BOOKS",
        fg: Theme.textPrimaryDark,
        bg: Theme.surfaceGray,
      };
    case "DUPLICATE":
      return {
        icon: "link",
        label: "LINK",
        fg: Theme.driverEmerald,
        bg: "rgba(16,185,129,0.1)",
      };
    case "MISMATCH":
      return {
        icon: "exclamation",
        label: "REVIEW",
        fg: Theme.warning,
        bg: "rgba(180,83,9,0.1)",
      };
    default:
      return {
        icon: "circle",
        label: "",
        fg: Theme.textMuted,
        bg: Theme.surfaceGray,
      };
  }
}

/** Shown when an org has no feed at all (no integrated clients, or nothing logged yet). */
function EmptyIntro() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <FontAwesome name="inbox" size={22} color={Theme.textPrimaryDark} />
      </View>
      <Text style={styles.emptyTitle}>Nothing from clients yet</Text>
      <Text style={styles.emptyBody}>
        When an integrated client records a payment, advance, or expense for
        you, it shows up here. One tap to add it to your books.
      </Text>
    </View>
  );
}

function EmptyForFilter({ filter }: { filter: FilterKey }) {
  const label =
    filter === "NEW"
      ? "No new updates"
      : filter === "DUPLICATE"
        ? "No matching entries"
        : filter === "MISMATCH"
          ? "No mismatches"
          : filter === "ACTIONED"
            ? "Nothing actioned yet"
            : "Nothing to show";
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  filterRow: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: 0.3,
  },
  chipLabelActive: {
    color: Theme.textOnDark,
  },
  chipCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCountActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  chipCountText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimary,
  },
  chipCountTextActive: {
    color: Theme.textOnDark,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 48,
    alignItems: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimary,
    letterSpacing: 0.4,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  rowMainHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowParty: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimary,
  },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  rowMeta: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  rowMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Theme.textMuted,
  },
  rowBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  rowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rowBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
