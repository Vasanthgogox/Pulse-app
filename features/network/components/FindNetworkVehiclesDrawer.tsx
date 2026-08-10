/**
 * Find network opportunities drawer.
 * mode give = idle vehicles · mode get = advertised marketplace loads.
 * Desktop: right-side drawer. Filters: search, vehicle type, pickup, drop.
 * Opens the same story-detail page on select.
 */
import Theme from "@/constants/Theme";
import {
  OpportunityCard,
  useLoadCenterOpportunityPosts,
  type LoadCenterOpportunityMode,
} from "@/features/network/components/LoadCenterOpportunityExchange";
import type { PostRow } from "@/features/network/services/posts.service";
import { splitLocationParts } from "@/features/network/utils/storyDisplay";
import { MotiView } from "moti";
import { Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const DRAWER_WIDTH = 440;

export type FindNetworkVehiclesDrawerProps = {
  visible: boolean;
  onClose: () => void;
  orgId: string | null;
  /** give = idle vehicles · get = advertised marketplace loads */
  mode?: LoadCenterOpportunityMode;
  supplierOrgIds?: ReadonlySet<string>;
  clientOrgIds?: ReadonlySet<string>;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function postMatchesFilters(
  post: PostRow,
  filters: {
    search: string;
    vehicleType: string;
    pickup: string;
    drop: string;
  },
): boolean {
  const search = norm(filters.search);
  const vehicleFilter = norm(filters.vehicleType);
  const pickupFilter = norm(filters.pickup);
  const dropFilter = norm(filters.drop);

  const vehicle = norm(post.vehicle_type);
  const origin = norm(post.origin);
  const dest = norm(post.destination);
  const org = norm(post.org_name);
  const material = norm(post.material);
  const originCity = norm(splitLocationParts(post.origin).city);
  const destCity = norm(
    splitLocationParts(post.destination || "Anywhere").city,
  );

  if (vehicleFilter && vehicleFilter !== "all" && !vehicle.includes(vehicleFilter)) {
    return false;
  }
  if (pickupFilter && !origin.includes(pickupFilter) && !originCity.includes(pickupFilter)) {
    return false;
  }
  if (dropFilter && !dest.includes(dropFilter) && !destCity.includes(dropFilter)) {
    return false;
  }
  if (search) {
    const hay = [org, vehicle, origin, dest, material, originCity, destCity].join(
      " ",
    );
    if (!hay.includes(search)) return false;
  }
  return true;
}

export function FindNetworkVehiclesDrawer({
  visible,
  onClose,
  orgId,
  mode = "give",
  supplierOrgIds,
  clientOrgIds,
}: FindNetworkVehiclesDrawerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSideDrawer = Platform.OS === "web" && width >= 768;
  const isGet = mode === "get";

  const { posts, isLoading } = useLoadCenterOpportunityPosts(
    orgId,
    mode,
    supplierOrgIds,
    clientOrgIds,
  );

  const [search, setSearch] = useState("");
  const [vehicleType, setVehicleType] = useState("all");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setVehicleType("all");
    setPickup("");
    setDrop("");
  }, [visible, mode]);

  const vehicleTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) {
      const v = p.vehicle_type?.trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const filtered = useMemo(
    () =>
      posts.filter((p) =>
        postMatchesFilters(p, { search, vehicleType, pickup, drop }),
      ),
    [posts, search, vehicleType, pickup, drop],
  );

  const openStory = (post: PostRow) => {
    onClose();
    router.push({
      pathname: "/(modals)/story-detail",
      params: {
        postId: post.id,
        orgId: post.organization_id,
        storyType: post.type,
      },
    });
  };

  const clearFilters = () => {
    setSearch("");
    setVehicleType("all");
    setPickup("");
    setDrop("");
  };

  const hasActiveFilters =
    search.trim().length > 0 ||
    vehicleType !== "all" ||
    pickup.trim().length > 0 ||
    drop.trim().length > 0;

  const title = isGet ? "Find load" : "Find vehicles";
  const subtitle = isGet
    ? "Indents from network and advertised loads"
    : "Idle capacity from your network";
  const searchPlaceholder = isGet
    ? "Search loads, org, route…"
    : "Search vehicles, org, route…";
  const listNoun = isGet ? "load" : "vehicle";

  const body = (
    <View
      style={[
        styles.panel,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: 16 + insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor={Theme.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Vehicle type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Pressable
            onPress={() => setVehicleType("all")}
            style={[styles.chip, vehicleType === "all" && styles.chipOn]}
          >
            <Text
              style={[styles.chipText, vehicleType === "all" && styles.chipTextOn]}
            >
              All
            </Text>
          </Pressable>
          {vehicleTypes.map((type) => {
            const on = norm(vehicleType) === norm(type);
            return (
              <Pressable
                key={type}
                onPress={() => setVehicleType(type)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <TextInput
          style={styles.filterInput}
          placeholder="Search vehicle type…"
          placeholderTextColor={Theme.textMuted}
          value={vehicleType === "all" ? "" : vehicleType}
          onChangeText={(t) => setVehicleType(t.trim() ? t : "all")}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.routeFilters}>
        <View style={styles.routeField}>
          <Text style={styles.filterLabel}>Pickup</Text>
          <TextInput
            style={styles.filterInput}
            placeholder="Search pickup…"
            placeholderTextColor={Theme.textMuted}
            value={pickup}
            onChangeText={setPickup}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.routeField}>
          <Text style={styles.filterLabel}>Drop</Text>
          <TextInput
            style={styles.filterInput}
            placeholder="Search drop…"
            placeholderTextColor={Theme.textMuted}
            value={drop}
            onChangeText={setDrop}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listCount}>
          {isLoading
            ? "Loading…"
            : `${filtered.length} ${listNoun}${filtered.length === 1 ? "" : "s"}`}
        </Text>
        {hasActiveFilters ? (
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading && posts.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={Theme.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {isGet ? "No loads match" : "No vehicles match"}
          </Text>
          <Text style={styles.emptySub}>
            Try another vehicle type, pickup, or drop.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
        >
          {filtered.map((post) => (
            <OpportunityCard
              key={post.id}
              post={post}
              mode={mode}
              fillWidth
              onPress={() => openStory(post)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  if (!visible) return null;

  if (isSideDrawer) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <MotiView
            from={{ translateX: DRAWER_WIDTH }}
            animate={{ translateX: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 320, mass: 0.9 }}
            style={[styles.drawer, { width: DRAWER_WIDTH, maxWidth: "92%" as unknown as number }]}
          >
            {body}
          </MotiView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  drawer: {
    height: "100%" as unknown as number,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: { boxShadow: "-8px 0 32px rgba(15,23,42,0.18)" } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 24,
      },
    }),
  },
  panel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: "none" } as object, default: {} }),
  },
  filterBlock: { gap: 6 },
  filterLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  chipRow: { gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    maxWidth: 160,
  },
  chipOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  chipTextOn: { color: Theme.textOnDark },
  filterInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "web" ? 9 : 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    ...Platform.select({ web: { outlineStyle: "none" } as object, default: {} }),
  },
  routeFilters: {
    flexDirection: "row",
    gap: 8,
  },
  routeField: { flex: 1, minWidth: 0, gap: 6 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  clearText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 8, paddingBottom: 12 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  emptySub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
});
