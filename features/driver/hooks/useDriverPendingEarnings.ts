import { buildDriverTripSettlementView } from '@/features/driver/tripSettlement/driverTripSettlement.util';
import { buildDriverTripNumberMap } from '@/features/driver/utils/driverTripSequence.util';
import { tripEarningsForDriver } from '@/features/drivers/utils/driverUtils.util';
import * as driversService from '@/services/driversService';
import * as tripsService from '@/services/tripsService';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

export type PendingEarningsTripItem = {
  trip: tripsService.TripRow;
  displayId: string;
  rawDate: string;
  time: string;
  from: string;
  to: string;
  provider: string;
  amount: number;
  expectedAmount: number;
  statusLabel: string;
  isFleetOwnerTrip: boolean;
};

export function useDriverPendingEarnings() {
  const { profile } = useAuth();
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);

    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ])
      .then(([driversRes, invRes]) => {
        const drivers = driversRes.drivers ?? [];
        setLinkedDrivers(drivers);
        setInvites(invRes.invites ?? []);
        if (drivers.length === 0) {
          setTrips([]);
          setLedgerEntries([]);
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
          return;
        }
        const driverIds = drivers.map((d) => d.id);
        return Promise.all([
          tripsService.getTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
        });
      })
      .catch(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
  }, [load]);

  const completedTrips = useMemo(() => {
    return trips
      .filter((t) => isCompleted(t.status))
      .sort((a, b) => {
        const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
        return db - da;
      });
  }, [trips]);

  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(trips),
    [trips],
  );

  const receivedByTripId = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const e of ledgerEntries) {
      const tid = e.trip_id?.trim() || null;
      if (tid && e.type === 'settlement') {
        byTrip[tid] = (byTrip[tid] ?? 0) + (Number(e.amount) || 0);
      }
    }
    return byTrip;
  }, [ledgerEntries]);

  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    return linkedDrivers
      .filter((d) => !d.left_at)
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || ''),
        );
        const inviteName =
          (inv as { from_org_name?: string | null } | undefined)?.from_org_name?.trim() ||
          null;
        const dbOrgName =
          (d.organizations as { name?: string } | null | undefined)?.name?.trim() || null;
        return {
          driverId: d.id,
          orgId: d.organization_id,
          orgName: inviteName ?? dbOrgName ?? 'Fleet',
        };
      });
  }, [linkedDrivers, invites]);

  const employerOrgIdSet = useMemo(() => {
    const set = new Set<string>();
    linkedDrivers.forEach((d) => {
      if (d.left_at) return;
      if (
        (d.payable_amount != null && d.payable_amount > 0) ||
        (d.commission_percent != null && d.commission_percent > 0) ||
        (d.commission_per_km != null && d.commission_per_km > 0)
      ) {
        const orgId = String(d.organization_id ?? '');
        if (orgId) set.add(orgId);
      }
    });
    return set;
  }, [linkedDrivers]);

  const pendingItems = useMemo((): PendingEarningsTripItem[] => {
    const pendingTrips = completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) === 0);

    return pendingTrips.map((trip) => {
      const isFleetOwnerTrip = employerOrgIdSet.has(String(trip.organization_id ?? ''));
      const fleetOrgName =
        salaryRequestOrgOptions.find(
          (o) =>
            String(o.orgId ?? '') === String(trip.organization_id ?? '') &&
            String(o.driverId ?? '') === String(trip.driver_id ?? ''),
        )?.orgName ??
        salaryRequestOrgOptions.find(
          (o) => String(o.orgId ?? '') === String(trip.organization_id ?? ''),
        )?.orgName ??
        null;

      const provider = isFleetOwnerTrip
        ? (fleetOrgName ?? 'Fleet')
        : (fleetOrgName ?? (trip.client_name?.trim() || 'Direct trip'));

      const view = buildDriverTripSettlementView({
        trip,
        ledgerEntries,
        fleetOrgName: provider,
        driverTripNumberById,
        tripCompleted: true,
      });

      const rawDate = trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '';

      return {
        trip,
        displayId: view.displayId,
        rawDate,
        time: rawDate
          ? new Date(rawDate).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : '—',
        from: view.from,
        to: view.to,
        provider,
        amount: view.amount || tripEarningsForDriver(trip),
        expectedAmount: view.expectedAmount,
        statusLabel: view.statusLabel || 'To collect',
        isFleetOwnerTrip,
      };
    });
  }, [
    completedTrips,
    receivedByTripId,
    employerOrgIdSet,
    salaryRequestOrgOptions,
    ledgerEntries,
    driverTripNumberById,
  ]);

  const pendingTotal = useMemo(
    () => pendingItems.reduce((sum, item) => sum + item.amount, 0),
    [pendingItems],
  );

  return {
    loading,
    refreshing,
    refresh,
    pendingItems,
    pendingTotal,
    tripCount: pendingItems.length,
  };
}
