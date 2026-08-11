/**
 * Phase 3A — load detail (read-only). Bidding deferred to 3B.
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
} from '@/features/driver/services/fleetOwnerLoads.service';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AvailableLoadDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const params = useLocalSearchParams<{ indentId?: string | string[] }>();
  const raw = Array.isArray(params.indentId) ? params.indentId[0] : params.indentId;
  const indentId = raw?.trim() || '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { loads, isLoading, error } = useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);

  const load = useMemo(
    () => loads.find((l) => l.id === indentId) ?? null,
    [loads, indentId],
  );
  const compatible = useMemo(
    () =>
      load
        ? isLoadCompatibleWithFleet(
            load,
            vehicles.map((v) => v.vehicle_type),
          )
        : false,
    [load, vehicles],
  );

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const rate = load ? formatFleetOwnerRateOffer(load.rate_offer) : null;

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Load detail"
        subtitle="Marketplace · view only"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(ROUTES.driverAvailableLoads())
        }
      />

      {isLoading ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 40 }} />
      ) : error || !load ? (
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>
            Load unavailable
          </Text>
          <Text style={[styles.gateBody, { color: colors.textMuted }]}>
            {error instanceof Error
              ? error.message
              : 'It may have closed or been awarded.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 12,
          }}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Text style={[styles.eyebrow, { color: colors.emerald }]}>
              {fleetOwnerLoadDisplayId(load)} · OPEN
            </Text>
            <Text style={[styles.route, { color: colors.text }]}>
              {fleetOwnerLoadRouteLabel(load)}
            </Text>
            <Text style={[styles.rate, { color: Theme.warning }]}>
              {rate ?? 'Rate on request'}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {[
                load.vehicle_type?.trim() || 'Vehicle TBA',
                load.load_type?.trim() || null,
                load.pickup_date
                  ? new Date(load.pickup_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {load.creator_organization_name ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Posted by {load.creator_organization_name}
              </Text>
            ) : null}
            {compatible ? (
              <Text style={[styles.fit, { color: colors.emerald }]}>
                Compatible with a vehicle in My Fleet
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Text style={[styles.section, { color: colors.text }]}>Next step</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Bidding opens in Phase 3B. Winning still requires the business to
              award the load — the Driver App never creates trips or indents.
            </Text>
            <Pressable
              disabled
              style={[
                styles.bidDisabled,
                {
                  backgroundColor: isDark
                    ? colors.surfaceElevated
                    : Theme.surfaceGray,
                },
              ]}
            >
              <Text style={[styles.bidDisabledText, { color: colors.textMuted }]}>
                Bid · coming soon
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { padding: 20, gap: 8 },
  gateTitle: { fontSize: 17, fontWeight: '800' },
  gateBody: { fontSize: 13, lineHeight: 19 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  route: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  rate: { fontSize: 24, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '600' },
  fit: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  bidDisabled: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidDisabledText: { fontSize: 14, fontWeight: '700' },
});
