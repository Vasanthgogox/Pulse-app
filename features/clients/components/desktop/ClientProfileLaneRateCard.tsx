/**
 * Contract lane card — mirrors dispatcher-portal-pro LanesTab list items.
 */
import type { ClientLaneRate, ClientWarehouseExtended } from '@/features/clients/types/clientManagement.types';
import { clientProfileStyles as cpStyles, METRONIC } from '@/features/clients/components/desktop/clientProfileHub.styles';
import { formatINR } from '@/lib/format';
import { ArrowRight, MapPin, Route, Truck } from 'lucide-react-native';
import { Text, View } from 'react-native';

type Props = {
  lane: ClientLaneRate;
  originWarehouse?: ClientWarehouseExtended | null;
};

function formatPricingModel(model: string | null | undefined): string {
  if (!model) return '—';
  return model.replace(/_/g, ' ').toUpperCase();
}

export function ClientProfileLaneRateCard({ lane, originWarehouse }: Props) {
  const zone = lane.warehouse_zone ?? originWarehouse?.warehouse_zone ?? null;
  const warehouseLabel = originWarehouse?.name ?? lane.origin_label;

  return (
    <View style={cpStyles.laneCard}>
      <View style={cpStyles.laneCardHeader}>
        <View style={cpStyles.laneCardRoute}>
          <Text style={cpStyles.laneCardOrigin} numberOfLines={1}>{lane.origin_label}</Text>
          <ArrowRight size={14} color={METRONIC.muted} strokeWidth={2} />
          <Text style={cpStyles.laneCardDest} numberOfLines={1}>{lane.destination_label}</Text>
        </View>
        {lane.pricing_model ? (
          <View style={cpStyles.laneModelPill}>
            <Text style={cpStyles.laneModelPillText}>{formatPricingModel(lane.pricing_model)}</Text>
          </View>
        ) : null}
      </View>

      <View style={cpStyles.laneCardMetaRow}>
        {lane.vehicle_type ? (
          <View style={cpStyles.laneMetaChip}>
            <Truck size={12} color={METRONIC.link} strokeWidth={2} />
            <Text style={cpStyles.laneMetaChipText}>{lane.vehicle_type}</Text>
          </View>
        ) : null}
        {lane.distance_km != null ? (
          <View style={cpStyles.laneMetaChip}>
            <Route size={12} color={METRONIC.link} strokeWidth={2} />
            <Text style={cpStyles.laneMetaChipText}>{lane.distance_km} km</Text>
          </View>
        ) : null}
        {lane.is_spot_rate ? (
          <View style={[cpStyles.laneMetaChip, cpStyles.laneSpotChip]}>
            <Text style={cpStyles.laneSpotChipText}>SPOT</Text>
          </View>
        ) : null}
      </View>

      <View style={cpStyles.laneCardDetails}>
        <Text style={cpStyles.laneDetailLine}>
          <Text style={cpStyles.laneDetailLabel}>Warehouse: </Text>
          {warehouseLabel}
          {zone ? ` (${zone})` : ''}
        </Text>
        {lane.destination_gstin ? (
          <Text style={cpStyles.laneDetailLine}>
            <Text style={cpStyles.laneDetailLabel}>Dest. GSTIN: </Text>
            {lane.destination_gstin}
          </Text>
        ) : null}
        {lane.destination_address ? (
          <View style={cpStyles.laneAddressRow}>
            <MapPin size={12} color={METRONIC.muted} strokeWidth={2} />
            <Text style={cpStyles.laneDetailLine} numberOfLines={2}>{lane.destination_address}</Text>
          </View>
        ) : null}
      </View>

      <View style={cpStyles.laneRateRow}>
        {lane.base_rate != null ? (
          <Text style={cpStyles.laneRatePrimary}>
            Base {formatINR(lane.base_rate)}
          </Text>
        ) : lane.rate != null ? (
          <Text style={cpStyles.laneRatePrimary}>
            {formatINR(lane.rate)} · {lane.rate_type.replace(/_/g, ' ')}
          </Text>
        ) : null}
        {lane.per_mt_rate != null && lane.per_km_rate != null ? (
          <Text style={cpStyles.laneRateSecondary}>
            ₹{lane.per_mt_rate}/MT × ₹{lane.per_km_rate}/KM
          </Text>
        ) : null}
      </View>

      {(lane.valid_from || lane.valid_to) ? (
        <Text style={cpStyles.laneValidity}>
          Valid {lane.valid_from ?? '—'} → {lane.valid_to ?? 'open'}
        </Text>
      ) : null}
    </View>
  );
}
