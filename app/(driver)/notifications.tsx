/**
 * Lists trips awaiting accept / OTP (same sources as dashboard incoming list).
 * Tapping a row returns to the dashboard with that trip selected.
 */
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { getPendingOtpTrips } from '@/features/trips';
import { getLatestAssignmentAuditByTripIds } from '@/features/trips/services/trip-assignment-audit.service';
import { computeDriverCommissionForTrip } from '@/features/finance/aggregation/aggregateDrivers';
import { formatINR } from '@/lib/format';
import {
  isAggregateTrip,
  isAssignedNotStarted,
  isRosterTrip,
} from '@/lib/driverUtils';
import { supabase } from '@/lib/supabase';
import * as driversService from '@/services/driversService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';
const DRIVER_NOTIFICATION_FOCUS_TRIP_KEY = 'driver_notification_focus_trip_id';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuidFragment(s: string): boolean {
  const t = String(s ?? '').trim();
  if (!t) return false;
  if (UUID_V4_RE.test(t)) return true;
  if (/^[0-9a-f]{6,12}$/i.test(t)) return true;
  return false;
}

function resolveAssignerUserId(
  trip: tripsService.TripRow,
  auditActorByTripId: Record<string, string>,
): string {
  const meta = trip as tripsService.TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const audit = (auditActorByTripId[String(trip.id)] ?? '').trim();
  const assignedByUserId = String(meta.assigned_by_user_id ?? '').trim();
  const createdByUserId = String(trip.created_by_user_id ?? '').trim();
  const assignedBy = String(meta.assigned_by ?? '').trim();
  const createdBy = String(trip.created_by ?? '').trim();

  if (audit) return audit;
  if (assignedByUserId) return assignedByUserId;
  if (createdByUserId) return createdByUserId;
  if (assignedBy && UUID_V4_RE.test(assignedBy)) return assignedBy;
  if (createdBy && UUID_V4_RE.test(createdBy)) return createdBy;
  return '';
}

function humanizeAssignerDisplayName(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (looksLikeUuidFragment(t)) return '';
  const lower = t.toLowerCase();
  if (lower === 'partner') return '';
  if (/^user\s+/i.test(t)) {
    const rest = t.replace(/^user\s+/i, '').trim();
    if (looksLikeUuidFragment(rest) || /^[0-9a-f-]{6,}$/i.test(rest)) return '';
  }
  return t;
}

export default function DriverNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { profile } = useAuth();

  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [pendingOtpTrips, setPendingOtpTrips] = useState<tripsService.TripRow[]>([]);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>['invites']
  >([]);
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerDisplayByTripId, setAssignerDisplayByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  const [organizationNamesById, setOrganizationNamesById] = useState<
    Record<string, string>
  >({});

  const hasCompletedInitialFetch = useRef(false);

  const fetch = useCallback(async (opts?: { pull?: boolean }) => {
    if (!profile?.uid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (opts?.pull) setRefreshing(true);
    else if (!hasCompletedInitialFetch.current) setLoading(true);
    const acceptedRaw = await AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
    setAcceptedTripId(acceptedRaw && acceptedRaw !== '' ? acceptedRaw : null);

    try {
      const [driversRes, invitesRes, pendingTripsRes] = await Promise.all([
        driversService.getLinkedDriversForCurrentUser(profile.uid),
        driversService.getDriverInvitesReceived(),
        getPendingOtpTrips(),
      ]);
      setInvites(invitesRes.invites ?? []);
      setPendingOtpTrips(
        pendingTripsRes?.error ? [] : (pendingTripsRes?.trips ?? []),
      );
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      if (drivers.length > 0) {
        const primaryDriver = drivers[0];
        setDriver(primaryDriver);
        const driverIds = drivers.map((d) => d.id);
        const tRes = await tripsService.getTripsByDriverIds(driverIds);
        setAllTrips(tRes.trips ?? []);
      } else {
        setDriver(null);
        setAllTrips([]);
        setPendingOtpTrips([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasCompletedInitialFetch.current = true;
    }
  }, [profile?.uid]);

  useFocusEffect(
    useCallback(() => {
      void fetch();
    }, [fetch]),
  );

  const incomingTrips = useMemo(
    () => allTrips.filter((t) => isAssignedNotStarted(t.status)),
    [allTrips],
  );

  const mergedIncomingTrips = useMemo(() => {
    const byId = new Map<string, tripsService.TripRow>();
    for (const trip of [...incomingTrips, ...pendingOtpTrips]) {
      if (!trip?.id) continue;
      if (!byId.has(trip.id)) byId.set(trip.id, trip);
    }
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
  }, [incomingTrips, pendingOtpTrips]);

  const assignableIncomingTrips = useMemo(
    () =>
      mergedIncomingTrips.filter((trip) => {
        if (!acceptedTripId || acceptedTripId.trim() === '') return true;
        return String(trip.id).toLowerCase() !== acceptedTripId.toLowerCase();
      }),
    [mergedIncomingTrips, acceptedTripId],
  );

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentActors = async () => {
      const tripIds = mergedIncomingTrips.map((trip) => trip.id).filter(Boolean);
      if (tripIds.length === 0) {
        if (!cancelled) setAssignmentActorByTripId({});
        return;
      }
      const { byTripId } = await getLatestAssignmentAuditByTripIds(tripIds);
      if (cancelled) return;
      const next: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = (value.changed_by ?? '').trim();
        if (actorId) next[key] = actorId;
      });
      setAssignmentActorByTripId(next);
    };
    void loadAssignmentActors();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips]);

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentSources = async () => {
      const trips = mergedIncomingTrips;
      if (trips.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerDisplayByTripId({});
          setOrganizationNamesById({});
        }
        return;
      }

      const tripIdsForRpc = trips
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id && String(id).length > 0));
      const { data: assignerRpcRows, error: assignerRpcError } = await supabase().rpc(
        'get_trip_assigner_displays_for_driver',
        { p_trip_ids: tripIdsForRpc },
      );
      if (!cancelled && !assignerRpcError && Array.isArray(assignerRpcRows)) {
        const byTrip: Record<string, string> = {};
        for (const row of assignerRpcRows as Array<{
          trip_id?: string;
          display_name?: string | null;
        }>) {
          const tid = row.trip_id != null ? String(row.trip_id) : '';
          const dn = String(row.display_name ?? '').trim();
          if (tid && dn) byTrip[tid] = dn;
        }
        setAssignerDisplayByTripId(byTrip);
      }

      const userIds = Array.from(
        new Set(
          trips
            .map((trip) => resolveAssignerUserId(trip, assignmentActorByTripId))
            .filter((id) => id.length > 0),
        ),
      );
      const organizationIds = Array.from(
        new Set(
          trips
            .flatMap((trip) => {
              const tripMeta = trip as tripsService.TripRow &
                Record<string, string | number | boolean | null | undefined>;
              return [
                (trip.organization_id ?? '').trim(),
                (
                  (tripMeta.from_organization_id as string | null | undefined) ?? ''
                ).trim(),
                ((tripMeta.from_org_id as string | null | undefined) ?? '').trim(),
              ];
            })
            .filter((id) => id.length > 0),
        ),
      );

      if (userIds.length > 0) {
        const { data, error } = await supabase()
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        if (!cancelled && !error) {
          const byId: Record<string, string> = {};
          for (const row of
            (data ?? []) as Array<{
              id: string;
              full_name?: string | null;
              email?: string | null;
            }>) {
            const fallbackEmailName =
              (row.email ?? '').trim().split('@')[0]?.trim() || 'Dispatcher';
            byId[row.id] = (row.full_name ?? '').trim() || fallbackEmailName;
          }
          setAssignerNamesByUserId(byId);
        }
      } else if (!cancelled) {
        setAssignerNamesByUserId({});
      }

      if (organizationIds.length > 0) {
        const { data, error } = await supabase()
          .from('organizations')
          .select('id, name')
          .in('id', organizationIds);
        if (!cancelled && !error) {
          const byId: Record<string, string> = {};
          for (const row of
            (data ?? []) as Array<{ id: string; name?: string | null }>) {
            byId[row.id] = (row.name ?? '').trim();
          }
          setOrganizationNamesById(byId);
        }
      } else if (!cancelled) {
        setOrganizationNamesById({});
      }
    };
    void loadAssignmentSources();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips, assignmentActorByTripId]);

  const pendingOtpTripsRequiringOtp = useMemo(
    () => pendingOtpTrips.filter((t) => !isRosterTrip(t)),
    [pendingOtpTrips],
  );

  const rowsWithMeta = useMemo(
    () =>
      assignableIncomingTrips.map((trip) => {
        const tripMeta = trip as tripsService.TripRow &
          Record<string, string | number | boolean | null | undefined>;
        const inviteForTrip =
          invites.find(
            (i) =>
              (i.from_organization_id ?? '').trim() ===
              (trip.organization_id ?? '').trim(),
          ) ?? null;
        const assignerUserId = resolveAssignerUserId(
          trip,
          assignmentActorByTripId,
        ).trim();

        const tripAssignedByUserNameCandidates = [
          tripMeta.assigned_by_name,
          tripMeta.assigned_by_user_name,
          tripMeta.created_by_name,
          tripMeta.dispatcher_name,
        ];
        const tripAssignedByOrgNameCandidates = [
          organizationNamesById[(trip.organization_id ?? '').trim()] ?? null,
          inviteForTrip?.from_org_name ?? null,
          (tripMeta.organization_name as string | null | undefined) ?? null,
          (tripMeta.org_name as string | null | undefined) ?? null,
          (tripMeta.from_org_name as string | null | undefined) ?? null,
        ];
        const resolvedFromTripFields = tripAssignedByUserNameCandidates
          .map((value) => humanizeAssignerDisplayName(String(value ?? '')))
          .find((value) => value.length > 0);
        const resolvedFromProfiles = humanizeAssignerDisplayName(
          assignerNamesByUserId[assignerUserId] ?? '',
        );
        const fromRpc = humanizeAssignerDisplayName(
          assignerDisplayByTripId[String(trip.id)] ?? '',
        );
        const assignedByUserName =
          (fromRpc.length > 0 ? fromRpc : null) ??
          resolvedFromTripFields ??
          (resolvedFromProfiles.length > 0 ? resolvedFromProfiles : null);

        const assignedByOrgName =
          tripAssignedByOrgNameCandidates
            .map((value) => String(value ?? '').trim())
            .find((value) => value.length > 0) ??
          ((trip.organization_id ?? '').trim() ===
          (driver?.organization_id ?? '').trim()
            ? 'Your fleet'
            : 'Assigning fleet');

        const assignerPersonDisplay =
          (assignedByUserName ?? '').trim() || 'Fleet dispatcher';

        const requiresOtp =
          !isRosterTrip(trip) &&
          (pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id) ||
            (isAggregateTrip(trip) && isAssignedNotStarted(trip.status)));

        const acceptedInviteForTrip =
          invites.find(
            (i) =>
              (i.from_organization_id ?? '').trim() ===
                (trip.organization_id ?? '').trim() &&
              String(i.status ?? '').toLowerCase() === 'accepted',
          ) ?? null;
        const commissionForTrip = computeDriverCommissionForTrip(trip, {
          commissionPercent: acceptedInviteForTrip?.commission_percent ?? null,
          commissionPerKm: acceptedInviteForTrip?.commission_per_km ?? null,
        });

        return {
          trip,
          assignerPersonDisplay,
          assignedByOrgName,
          requiresOtp,
          commissionForTrip,
        };
      }),
    [
      assignableIncomingTrips,
      invites,
      driver?.organization_id,
      pendingOtpTripsRequiringOtp,
      assignerNamesByUserId,
      assignerDisplayByTripId,
      organizationNamesById,
      assignmentActorByTripId,
    ],
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/');
  };

  const openTripOnDashboard = async (tripId: string) => {
    await AsyncStorage.setItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY, tripId);
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/');
  };

  const acceptTripFromNotification = async (
    trip: tripsService.TripRow,
    requiresOtp: boolean,
  ) => {
    await AsyncStorage.setItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY, trip.id);
    if (!requiresOtp) {
      await AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, trip.id);
    }
    router.replace('/(driver)/');
  };

  const onRefresh = () => {
    void fetch({ pull: true });
  };

  const hasActiveAcceptedTrip = Boolean(
    acceptedTripId && String(acceptedTripId).trim() !== '',
  );

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="Notifications" subtitle="Accept or verify with OTP" onBack={goBack} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.emerald} />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: pageBg }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
              paddingBottom: insets.bottom + 88,
            },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            {hasActiveAcceptedTrip
              ? 'You already have an active accepted trip. Remaining assignments stay here as notifications.'
              : 'Trips waiting for you to accept or verify with OTP. Open one to continue on the dashboard.'}
          </Text>
          {rowsWithMeta.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <FontAwesome name="bell-slash" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No pending trips
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                New assignments will appear here and on your dashboard.
              </Text>
            </View>
          ) : (
            rowsWithMeta.map((item) => (
              <View
                key={item.trip.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  hasActiveAcceptedTrip && styles.cardStatic,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.tripId, { color: colors.text }]}>
                    {tripsService.getTripDisplayNumber(item.trip)}
                  </Text>
                  {item.requiresOtp ? (
                    <View
                      style={[
                        styles.otpBadge,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.otpBadgeText, { color: colors.textMuted }]}
                      >
                        OTP
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.route, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item.trip.pickup_area?.trim() || 'Pickup'} →{' '}
                  {item.trip.drop_location?.trim() || 'Drop-off'}
                </Text>
                <Text style={styles.assignedLine} numberOfLines={2}>
                  <Text
                    style={[styles.assignedPrefix, { color: colors.textMuted }]}
                  >
                    Assigned by{' '}
                  </Text>
                  <Text style={[styles.assignedName, { color: colors.text }]}>
                    {item.assignerPersonDisplay}
                  </Text>
                  <Text style={[styles.assignedOrg, { color: colors.textMuted }]}>
                    {' '}
                    · {item.assignedByOrgName}
                  </Text>
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.commissionForTrip > 0
                    ? `Est. earning ${formatINR(item.commissionForTrip)}`
                    : 'Est. earning · Salary'}
                </Text>
                {hasActiveAcceptedTrip ? (
                  <View style={styles.cardFooter}>
                    <Text style={[styles.openHint, { color: colors.textMuted }]}>
                      Pending notification
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[
                        styles.openDashboardBtn,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                      onPress={() => void openTripOnDashboard(item.trip.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.openDashboardBtnText, { color: colors.textMuted }]}>
                        View details
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => void acceptTripFromNotification(item.trip, item.requiresOtp)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.acceptBtnText}>
                        {item.requiresOtp ? 'Accept & OTP' : 'Accept'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 16, gap: 12 },
  intro: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  emptyCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  cardStatic: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tripId: { fontSize: 15, fontWeight: '800' },
  otpBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  otpBadgeText: { fontSize: 11, fontWeight: '700' },
  route: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  assignedLine: { marginBottom: 6 },
  assignedPrefix: { fontSize: 12 },
  assignedName: { fontSize: 12, fontWeight: '700' },
  assignedOrg: { fontSize: 12 },
  meta: { fontSize: 12, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 10,
  },
  openHint: { fontSize: 12, fontWeight: '600' },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  openDashboardBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  openDashboardBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: Theme.textPrimaryDark,
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
});
