/**
 * Multi-stop mission list. Arrive/complete only on the current stop.
 * No skip/fail/POD.
 */
import Theme from '@/constants/Theme';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import {
  canShowArriveAction,
  canShowCompleteAction,
} from '@/features/driver/execution/resolveDriverStopTransition';
import { FLOW_EMERALD, TRIP_SHEET_BODY_PAD } from '@/components/driver/DriverTripSheetLayout';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function formatAddress(stop: DriverStopExecutionStop): string | null {
  const parts = [stop.addressLine, stop.city, stop.state, stop.pincode]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return parts.length ? parts.join(', ') : null;
}

function formatStopType(stopType: string): string {
  const t = stopType.trim().toLowerCase();
  if (t === 'pickup') return 'Pickup';
  if (t === 'drop') return 'Drop';
  return stopType.trim() || 'Stop';
}

function formatStatus(status: string): string {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function DriverMissionStopsList({
  stops,
  currentStopId,
  onArrive,
  onComplete,
  actionBusy = false,
}: {
  stops: readonly DriverStopExecutionStop[];
  currentStopId: string | null;
  onArrive?: () => void;
  onComplete?: () => void;
  actionBusy?: boolean;
}) {
  if (stops.length === 0) return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.heading}>Stops</Text>
      {stops.map((stop) => {
        const isCurrent = stop.stopId === currentStopId;
        const address = formatAddress(stop);
        const showArrive = !!onArrive && canShowArriveAction(stop, currentStopId);
        const showComplete = !!onComplete && canShowCompleteAction(stop, currentStopId);
        return (
          <View
            key={stop.stopId}
            style={[styles.row, isCurrent && styles.rowCurrent]}
          >
            <View style={styles.seqBadge}>
              <Text style={styles.seqText}>{stop.sequence}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.meta} numberOfLines={1}>
                {formatStopType(String(stop.stopType))}
                {' · '}
                {formatStatus(stop.status)}
                {isCurrent ? ' · Current' : ''}
              </Text>
              <Text style={styles.name} numberOfLines={2}>
                {stop.displayName}
              </Text>
              {address ? (
                <Text style={styles.address} numberOfLines={2}>
                  {address}
                </Text>
              ) : null}
              {showArrive || showComplete ? (
                <Pressable
                  onPress={showArrive ? onArrive : onComplete}
                  disabled={actionBusy}
                  accessibilityRole="button"
                  accessibilityLabel={showArrive ? 'Arrive at stop' : 'Complete stop'}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { opacity: actionBusy ? 0.6 : pressed ? 0.85 : 1 },
                  ]}
                >
                  {actionBusy ? (
                    <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                  ) : (
                    <Text style={styles.actionText}>
                      {showArrive ? 'Arrive' : 'Complete'}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: Theme.surface,
  },
  heading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  rowCurrent: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  seqBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceLight,
    flexShrink: 0,
  },
  seqText: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  meta: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  address: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textSecondary,
  },
  actionBtn: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FLOW_EMERALD,
    paddingHorizontal: 14,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
});
