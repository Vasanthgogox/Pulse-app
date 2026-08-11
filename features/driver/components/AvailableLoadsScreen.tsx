/**
 * Phase 3A — Available Loads (read-only marketplace discovery for Fleet Owners).
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  fleetOwnerLoadDisplayId,
  fleetOwnerLoadRouteLabel,
  formatFleetOwnerRateOffer,
  isLoadCompatibleWithFleet,
  type FleetOwnerOpenLoad,
} from '@/features/driver/services/fleetOwnerLoads.service';
import { useDriverFleetOwnerQuery } from '@/lib/queries/useDriverFleetOwnerQuery';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import { ChevronRight, Filter, MapPin, Truck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FilterMode = 'all' | 'compatible';

function formatPickupDate(iso: string | null): string {
  if (!iso) return 'Date TBA';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

export default function AvailableLoadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { isFleetOwner, isLoading: ownerLoading } = useDriverFleetOwnerQuery(uid);
  const { loads, isLoading, isRefetching, refetch, error } =
    useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const [filter, setFilter] = useState<FilterMode>('all');

  const fleetTypes = useMemo(
    () => vehicles.map((v) => v.vehicle_type),
    [vehicles],
  );

  const visible = useMemo(() => {
    if (filter !== 'compatible') return loads;
    return loads.filter((l) => isLoadCompatibleWithFleet(l, fleetTypes));
  }, [loads, filter, fleetTypes]);

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  if (!ownerLoading && !isFleetOwner) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg }]}>
        <DriverSubScreenHeader
          title="Available Loads"
          subtitle="Fleet Owner required"
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace(ROUTES.DRIVER_ROOT)
          }
        />
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>
            Become a Fleet Owner to browse loads
          </Text>
          <Text style={[styles.gateBody, { color: colors.textMuted }]}>
            Open marketplace demand comes from businesses. You can bid later — you
            cannot create loads in the Driver App.
          </Text>
          <Pressable
            onPress={() =>
              router.push(
                ROUTES.driverBecomeFleetOwner() as Parameters<typeof router.push>[0],
              )
            }
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.emerald, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={styles.ctaText}>Become a Fleet Owner</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Available Loads"
        subtitle="Open marketplace · read-only"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(ROUTES.DRIVER_ROOT)
        }
      />

      <View style={styles.filterRow}>
        {(
          [
            { id: 'all' as const, label: 'All open' },
            { id: 'compatible' as const, label: 'Fits my fleet' },
          ] as const
        ).map((opt) => {
          const on = filter === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setFilter(opt.id)}
              style={[
                styles.filterChip,
                {
                  borderColor: on ? colors.emerald : cardBorder,
                  backgroundColor: on
                    ? isDark
                      ? colors.emeraldMuted
                      : 'rgba(167,243,208,0.4)'
                    : colors.surface,
                },
              ]}
            >
              <Filter size={12} color={on ? colors.emerald : colors.textMuted} />
              <Text
                style={[
                  styles.filterText,
                  { color: on ? colors.emerald : colors.textMuted },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.emerald}
          />
        }
      >
        {error ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load marketplace.'}
          </Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 28 }} />
        ) : visible.length === 0 ? (
          <View
            style={[
              styles.empty,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <MapPin size={22} color={colors.emerald} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No open loads right now
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              When businesses broadcast marketplace demand, it appears here.
              Bidding arrives in the next phase.
            </Text>
          </View>
        ) : (
          visible.map((load) => (
            <LoadCard
              key={load.id}
              load={load}
              compatible={isLoadCompatibleWithFleet(load, fleetTypes)}
              cardBorder={cardBorder}
              colors={colors}
              isDark={isDark}
              onPress={() =>
                router.push(
                  ROUTES.driverAvailableLoad(load.id) as Parameters<
                    typeof router.push
                  >[0],
                )
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function LoadCard({
  load,
  compatible,
  cardBorder,
  colors,
  isDark,
  onPress,
}: {
  load: FleetOwnerOpenLoad;
  compatible: boolean;
  cardBorder: string;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  onPress: () => void;
}) {
  const rate = formatFleetOwnerRateOffer(load.rate_offer);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: cardBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.route, { color: colors.text }]} numberOfLines={2}>
          {fleetOwnerLoadRouteLabel(load)}
        </Text>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
      {rate ? (
        <Text style={[styles.rate, { color: Theme.warning }]}>{rate}</Text>
      ) : (
        <Text style={[styles.meta, { color: colors.textMuted }]}>Rate on request</Text>
      )}
      <View style={styles.metaRow}>
        <Truck size={13} color={colors.textMuted} />
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {load.vehicle_type?.trim() || 'Vehicle TBA'}
          {load.load_type ? ` · ${load.load_type}` : ''}
        </Text>
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {formatPickupDate(load.pickup_date)} · {fleetOwnerLoadDisplayId(load)}
      </Text>
      {compatible ? (
        <View
          style={[
            styles.fitPill,
            {
              backgroundColor: isDark
                ? colors.emeraldMuted
                : 'rgba(167,243,208,0.45)',
            },
          ]}
        >
          <Text style={[styles.fitText, { color: colors.emerald }]}>
            Fits my fleet
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { padding: 20, gap: 10 },
  gateTitle: { fontSize: 17, fontWeight: '800' },
  gateBody: { fontSize: 13, lineHeight: 19 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    paddingVertical: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  route: { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  rate: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, fontWeight: '600' },
  fitPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  fitText: { fontSize: 11, fontWeight: '700' },
  empty: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19 },
  cta: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  ctaText: { color: Theme.textOnPrimary, fontSize: 14, fontWeight: '700' },
  errorText: { color: Theme.negative, fontSize: 13, fontWeight: '600' },
});
