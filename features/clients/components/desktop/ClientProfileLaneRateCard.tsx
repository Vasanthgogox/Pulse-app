/**
 * Contract lane row — labeled columns so From / To / rate stay separate.
 */
import type { ClientLaneRate, ClientWarehouseExtended } from '@/features/clients/types/clientManagement.types';
import { clientProfileStyles as cpStyles, METRONIC } from '@/features/clients/components/desktop/clientProfileHub.styles';
import { formatINR } from '@/lib/format';
import { Text, View } from 'react-native';

type Props = {
  lane: ClientLaneRate;
  originWarehouse?: ClientWarehouseExtended | null;
  /** Compact labeled layout for warehouse tree nesting. */
  dense?: boolean;
};

function primaryRate(lane: ClientLaneRate): string {
  if (lane.rate != null) {
    return `${formatINR(lane.rate)} · ${lane.rate_type.replace(/_/g, ' ')}`;
  }
  if (lane.per_mt_rate != null) {
    return `₹${lane.per_mt_rate}/MT${lane.per_km_rate != null ? ` · ₹${lane.per_km_rate}/KM` : ''}`;
  }
  if (lane.base_rate != null) {
    return `Base ${formatINR(lane.base_rate)}`;
  }
  return '—';
}

function Field({ label, value, flex = 1 }: { label: string; value: string; flex?: number }) {
  return (
    <View style={[cpStyles.laneField, { flex }]}>
      <Text style={cpStyles.laneFieldLabel}>{label}</Text>
      <Text style={cpStyles.laneFieldValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

export function ClientProfileLaneRateCard({ lane, dense = false }: Props) {
  const rateLabel = primaryRate(lane);
  const validity =
    lane.valid_from || lane.valid_to
      ? `${lane.valid_from ?? '—'} → ${lane.valid_to ?? 'open'}`
      : '—';

  if (dense) {
    return (
      <View style={cpStyles.laneDenseRow}>
        <Field label="From" value={lane.origin_label} flex={1.2} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="To" value={lane.destination_label} flex={1.4} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Vehicle" value={lane.vehicle_type ?? '—'} flex={0.7} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Rate" value={rateLabel} flex={0.9} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Valid" value={validity} flex={0.9} />
        {lane.is_spot_rate ? (
          <View style={cpStyles.laneDenseSpot}>
            <Text style={cpStyles.laneDenseSpotText}>SPOT</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={cpStyles.laneCard}>
      <View style={cpStyles.laneDenseRow}>
        <Field label="From" value={lane.origin_label} flex={1.2} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="To" value={lane.destination_label} flex={1.4} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Vehicle" value={lane.vehicle_type ?? '—'} flex={0.7} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Rate" value={rateLabel} flex={0.9} />
        <View style={cpStyles.laneFieldDivider} />
        <Field label="Valid" value={validity} flex={0.9} />
      </View>
    </View>
  );
}
