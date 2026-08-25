import { memo, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { CheckCircle2 } from "lucide-react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  getDriverProfileDisplayBatch,
  type DriverRow,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";
import {
  enrichDriverMatchesWithFleetAvatars,
  isDriverMatchInOrgFleet,
  normalizeIndianMobileLast10,
} from "@/features/trips/utils/driverPhoneLookup.util";

type MatchAvatarMeta = {
  avatarUrl: string | null;
  avatarSeed: string | null;
};

export type DriverPhoneRecommendationsProps = {
  matches: readonly ExistingDriverMatch[];
  loading: boolean;
  selectedUserId: string | null;
  onSelect: (match: ExistingDriverMatch) => void;
  phoneComplete: boolean;
  /** Tighter typography for mobile / dense forms. */
  compact?: boolean;
  /** Web desktop: recommendations beside the phone field. */
  layout?: "stack" | "aside";
  /** Override empty-state body copy (e.g. desktop: name field is below). */
  emptyHint?: string;
  /**
   * Org fleet roster — used to resolve avatars (phone RPC omits them; profiles
   * SELECT is RLS-self-only). Prefer rows with `user_id` / matching phone.
   */
  fleetDrivers?: readonly DriverRow[];
};

const AVATAR_SIZE = 36;
const AVATAR_SIZE_COMPACT = 32;
/** Stable default — inline `= []` is a new array every render and loops setState. */
const EMPTY_FLEET_DRIVERS: readonly DriverRow[] = [];

export const DriverPhoneRecommendations = memo(function DriverPhoneRecommendations({
  matches,
  loading,
  selectedUserId,
  onSelect,
  phoneComplete,
  compact = false,
  layout = "stack",
  emptyHint,
  fleetDrivers = EMPTY_FLEET_DRIVERS,
}: DriverPhoneRecommendationsProps) {
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, MatchAvatarMeta>>(
    {},
  );

  const enrichedMatches = useMemo(
    () => enrichDriverMatchesWithFleetAvatars(matches, fleetDrivers),
    [matches, fleetDrivers],
  );

  useEffect(() => {
    let cancelled = false;
    if (enrichedMatches.length === 0) {
      setAvatarByUserId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const loadAvatars = async () => {
      const seed: Record<string, MatchAvatarMeta> = {};
      const needsRpc: { userId: string; driverId: string }[] = [];

      for (const match of enrichedMatches) {
        const directUrl = (match.avatar_url ?? "").trim();
        const directSeed = (match.avatar_seed ?? "").trim();
        if (directUrl || directSeed) {
          seed[match.user_id] = {
            avatarUrl: directUrl || null,
            avatarSeed: directSeed || null,
          };
          continue;
        }

        const phone10 = normalizeIndianMobileLast10(match.phone);
        const fleet =
          fleetDrivers.find((d) => d.user_id && d.user_id === match.user_id) ??
          (phone10.length >= 10
            ? fleetDrivers.find(
                (d) => normalizeIndianMobileLast10(d.phone ?? "") === phone10,
              )
            : undefined);
        if (fleet?.id) {
          needsRpc.push({ userId: match.user_id, driverId: fleet.id });
        }
      }

      if (needsRpc.length > 0) {
        const batch = await getDriverProfileDisplayBatch(
          needsRpc.map((row) => row.driverId),
        );
        for (const row of needsRpc) {
          const profile = batch[row.driverId];
          if (!profile) continue;
          const avatarUrl = (profile.avatarUrl ?? "").trim() || null;
          const avatarSeed = (profile.avatarSeed ?? "").trim() || null;
          if (avatarUrl || avatarSeed) {
            seed[row.userId] = { avatarUrl, avatarSeed };
          }
        }
      }

      if (cancelled) return;
      setAvatarByUserId((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(seed);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every(
            (key) =>
              prev[key]?.avatarUrl === seed[key]?.avatarUrl &&
              prev[key]?.avatarSeed === seed[key]?.avatarSeed,
          )
        ) {
          return prev;
        }
        return seed;
      });
    };

    void loadAvatars();
    return () => {
      cancelled = true;
    };
  }, [enrichedMatches, fleetDrivers]);

  if (!phoneComplete) return null;

  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const wrapStyle = [
    styles.wrap,
    layout === "aside" && styles.wrapAside,
    compact && styles.wrapCompact,
  ];
  const rowStyle = (active: boolean) => [
    styles.row,
    layout === "aside" && styles.rowAside,
    compact && styles.rowCompact,
    active && styles.rowActive,
    webCursor,
  ];
  const avatarSize = compact || layout === "aside" ? AVATAR_SIZE_COMPACT : AVATAR_SIZE;

  if (loading) {
    return (
      <View style={wrapStyle}>
        <ActivityIndicator size="small" color={Theme.primary} />
        <Text style={[styles.loadingText, compact && styles.loadingTextCompact]}>
          Looking up driver on Pulse…
        </Text>
      </View>
    );
  }

  if (enrichedMatches.length === 0) {
    return (
      <View
        style={[
          styles.emptyWrap,
          layout === "aside" && styles.emptyWrapAside,
          compact && styles.emptyWrapCompact,
        ]}
      >
        <Text style={[styles.emptyTitle, compact && styles.emptyTitleCompact]}>
          No driver profile for this number
        </Text>
        <Text style={[styles.emptySub, compact && styles.emptySubCompact]}>
          {emptyHint ??
            "Enter the driver name on the next step, or invite them to Pulse first."}
        </Text>
      </View>
    );
  }

  return (
    <View style={wrapStyle}>
      <Text style={[styles.sectionLabel, compact && styles.sectionLabelCompact]}>
        {enrichedMatches.length === 1 ? "Recommended driver" : "Select driver"}
      </Text>
      <View
        style={
          layout === "aside" && enrichedMatches.length > 1 ? styles.gridAside : undefined
        }
      >
        {enrichedMatches.map((m) => {
          const active = selectedUserId === m.user_id;
          const label = m.full_name?.trim() || "Driver";
          const meta = avatarByUserId[m.user_id];
          const inYourFleet = isDriverMatchInOrgFleet(m, fleetDrivers);
          const statusLabel = inYourFleet ? "In your fleet" : "Driver is in app";
          return (
            <Pressable
              key={m.user_id}
              style={rowStyle(active)}
              onPress={() => onSelect(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.avatarSlot, { width: avatarSize, height: avatarSize }]}>
                <PartyAvatar
                  name={label}
                  entityType="driver"
                  avatarUrl={meta?.avatarUrl ?? m.avatar_url ?? null}
                  avatarSeed={meta?.avatarSeed ?? m.avatar_seed ?? null}
                  size={avatarSize}
                  shape="circle"
                />
              </View>
              <View style={styles.rowText}>
                <Text
                  style={[
                    styles.name,
                    compact && styles.nameCompact,
                    active && styles.nameActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    compact && styles.metaCompact,
                    active && styles.metaActive,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
              {active ? (
                <CheckCircle2 size={compact ? 14 : 16} color={Theme.buttonPrimaryText} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {!selectedUserId ? (
        <Text style={[styles.hint, compact && styles.hintCompact]}>
          {Platform.OS === "web" ? "Click" : "Tap"} a name to use it for this trip
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  wrapAside: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
  },
  wrapCompact: {
    marginTop: 6,
    gap: 6,
  },
  gridAside: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  emptyWrap: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 6,
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  emptyWrapAside: {
    marginTop: 0,
    marginBottom: 0,
    flex: 1,
    minHeight: 52,
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minWidth: 0,
    ...Platform.select({
      // TODO(types): flexBasis uses a web CSS min() string that RN's ViewStyle
      // type does not model; double-cast to keep the web-only value.
      web: { flexGrow: 1, flexBasis: "min(100%, 280px)" } as unknown as ViewStyle,
      default: {},
    }),
  },
  rowAside: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    borderRadius: 10,
  },
  rowCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 8,
  },
  rowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  avatarSlot: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  nameActive: {
    color: Theme.buttonPrimaryText,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  metaActive: {
    /** Soft primary fill (`buttonPrimary`) — keep dark ink for contrast. */
    color: Theme.textSecondary,
  },
  hint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  hintCompact: {
    fontSize: 10,
  },
  loadingTextCompact: {
    fontSize: 11,
  },
  emptyWrapCompact: {
    padding: 8,
    marginTop: 6,
  },
  emptyTitleCompact: {
    fontSize: 12,
  },
  emptySubCompact: {
    fontSize: 11,
  },
  sectionLabelCompact: {
    fontSize: 9,
  },
  nameCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  metaCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
});
