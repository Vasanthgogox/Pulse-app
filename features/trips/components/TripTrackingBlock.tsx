/**
 * Trip detail — Tracking tab: telemetry card + mission log from trip timestamps.
 * Uses Theme only. Single source: trip (no extra reads).
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { formatTime } from '@/lib/format';
import type { TripRow } from '../services/trips.service';

export interface TripTrackingBlockProps {
  trip: TripRow;
  /** Resolved driver name when trip.driver_id is set */
  driverName?: string;
  /** Resolved vehicle label (e.g. "MH-01-1234 · 32FT") when trip.vehicle_id is set */
  vehicleLabel?: string;
  /** Driver rating for this trip (Supplier→Driver); shown next to driver name when set */
  driverRating?: number | null;
  /** Reassignment events to merge into mission log (e.g. from assignment audit), with sortKey = ISO timestamp */
  reassignmentEntries?: Array<{ time: string; status: string; loc: string; sortKey: string }>;
}

interface LogEntry {
  time: string;
  status: string;
  loc: string;
  /** ISO timestamp for merging/sorting with reassignment entries */
  sortKey: string;
}

/**
 * Builds mission log entries to align with driver app 4 steps (Accepted → Pickup → Transit → Complete).
 * Driver "Confirm arrival" sets status=in_progress (no started_at); "Start delivery" sets started_at.
 * So: PICKUP appears when status is in_progress (use updated_at if no started_at, else started_at).
 */
function buildMissionLog(trip: TripRow): LogEntry[] {
  const entries: LogEntry[] = [];
  const statusLower = (trip.status ?? '').toLowerCase();
  const inProgress = statusLower === 'in_progress';

  if (trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: 'ASSIGNED',
      loc: trip.pickup_area || '—',
      sortKey: trip.created_at,
    });
  }
  if (inProgress) {
    const pickupTime = trip.started_at ?? trip.updated_at ?? trip.created_at ?? '';
    if (pickupTime) {
      entries.push({
        time: formatTime(pickupTime),
        status: 'PICKUP',
        loc: trip.pickup_area || '—',
        sortKey: pickupTime,
      });
    }
    if (trip.started_at) {
      entries.push({
        time: formatTime(trip.started_at),
        status: 'IN-TRANSIT',
        loc: trip.pickup_area || '—',
        sortKey: trip.started_at,
      });
    }
  }
  if (trip.completed_at) {
    entries.push({
      time: formatTime(trip.completed_at),
      status: 'DELIVERED',
      loc: trip.drop_location || '—',
      sortKey: trip.completed_at,
    });
  }
  if (entries.length === 0 && trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: 'ASSIGNED',
      loc: trip.pickup_area || '—',
      sortKey: trip.created_at,
    });
  }
  return entries;
}

/** 0–100% from trip state: assigned → pickup → transit → delivered */
function getTripProgressPct(trip: TripRow): number {
  if (trip.completed_at) return 100;
  if (trip.started_at) return 66; // in-transit
  const statusLower = (trip.status ?? '').toLowerCase();
  if (statusLower === 'in_progress') return 33; // pickup confirmed (driver tapped Confirm arrival)
  if (trip.driver_id || trip.status) return 33; // assigned
  return 0;
}

const NEON_COLOR = Theme.teslaRed;

export function TripTrackingBlock({ trip, driverName, vehicleLabel, driverRating, reassignmentEntries }: TripTrackingBlockProps) {
  const missionLog = useMemo(() => {
    const fromTrip = buildMissionLog(trip);
    const fromReassign = (reassignmentEntries ?? []).map((e) => ({
      time: e.time,
      status: e.status,
      loc: e.loc,
      sortKey: e.sortKey,
    }));
    const merged = [...fromTrip, ...fromReassign].sort(
      (a, b) => new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime()
    );
    return merged;
  }, [
    trip.created_at,
    trip.updated_at,
    trip.status,
    trip.started_at,
    trip.completed_at,
    trip.pickup_area,
    trip.drop_location,
    reassignmentEntries,
  ]);
  const progressPct = useMemo(
    () => getTripProgressPct(trip),
    [trip.status, trip.started_at, trip.completed_at, trip.driver_id]
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.telemetryCard}>
        <View style={styles.compassDeco} pointerEvents="none">
          <FontAwesome name="compass" size={64} color={Theme.textOnDark} style={styles.compassIcon} />
        </View>
        <Text style={styles.telemetryLabel}>TELEMETRY LINK</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeText} numberOfLines={1}>{trip.pickup_area}</Text>
          <FontAwesome name="arrow-right" size={14} color={NEON_COLOR} style={styles.routeArrow} />
          <Text style={styles.routeText} numberOfLines={1}>{trip.drop_location}</Text>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack} collapsable={false}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            <View style={[styles.progressDot, styles.progressDotNeon]} />
            <FontAwesome
              name="truck"
              size={14}
              color={Theme.textOnDark}
              style={[styles.progressTruck, { left: `${progressPct}%` }, styles.progressTruckForward]}
            />
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>{trip.supplier_id ? 'Source' : 'Assigned Pilot'}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {trip.supplier_id
                ? 'Partner trip'
                : [
                    driverName ??
                      ((trip.driver_display_name ?? '').trim() || (trip.driver_id ? '—' : 'Not assigned')),
                    driverRating != null && driverRating > 0 ? ` · ${driverRating} ★` : null,
                  ]
                    .filter(Boolean)
                    .join('')}
            </Text>
          </View>
          <View style={styles.metaCellRight}>
            <Text style={styles.metaLabel}>Vehicle</Text>
            <Text style={[styles.metaValue, styles.metaValueRight]} numberOfLines={1}>
              {trip.supplier_id
                ? (vehicleLabel ?? '—')
                : (vehicleLabel ?? (trip.vehicle_id ? '—' : 'Not assigned'))}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.logTitle}>MISSION LOG ENTRIES</Text>
      <View style={styles.logList}>
        {missionLog.map((log, i) => (
          <View key={i} style={styles.logItem}>
            <View style={styles.logLeft}>
              <FontAwesome
                name="map-marker"
                size={12}
                color={i === 0 ? Theme.teslaRed : Theme.borderMedium}
              />
              {i !== missionLog.length - 1 && <View style={styles.logLine} />}
            </View>
            <View style={styles.logContent}>
              <View style={styles.logHead}>
                <Text style={styles.logStatus}>{log.status}</Text>
                <Text style={styles.logTime}>{log.time}</Text>
              </View>
              <View style={styles.locRow}>
                <FontAwesome name="map-marker" size={10} color={Theme.teslaRed} style={styles.locIcon} />
                <Text style={styles.locText}>{log.loc}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'stretch' },
  telemetryCard: {
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: 'visible',
  },
  compassDeco: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 0.15,
  },
  compassIcon: { opacity: 1 },
  telemetryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  routeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    flex: 1,
    letterSpacing: -0.5,
  },
  routeArrow: { marginHorizontal: 8 },
  progressRow: {
    marginBottom: 14,
    overflow: 'visible',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: NEON_COLOR,
    shadowColor: NEON_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
    elevation: 6,
  },
  progressDot: {
    position: 'absolute',
    left: 0,
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: NEON_COLOR,
  },
  progressDotNeon: {
    shadowColor: NEON_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  progressTruck: {
    position: 'absolute',
    top: -14,
    marginLeft: -7,
  },
  /** Face truck toward drop (right); default icon faces left so it looked like moving backward */
  progressTruckForward: {
    transform: [{ scaleX: -1 }],
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
    gap: 12,
  },
  metaCell: { flex: 1, minWidth: 0 },
  metaCellRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  metaLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  metaValueRight: {
    textAlign: 'right',
  },
  logTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 0,
  },
  logList: {},
  logItem: { flexDirection: 'row', marginBottom: 8 },
  logLeft: { alignItems: 'center', width: 20 },
  logLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: Theme.surfaceLight,
    marginTop: 4,
  },
  logContent: { flex: 1, marginLeft: 12 },
  logHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  logTime: { fontSize: 9, fontWeight: '700', color: Theme.textMutedDemo },
  locRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locIcon: { marginRight: 6 },
  locText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
});
