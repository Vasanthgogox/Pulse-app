/**
 * Dense lane table for warehouse → contract nest.
 * Header + one row per lane; edit / delete actions.
 */
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import {
  clientProfileStyles as cpStyles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { formatINR } from "@/lib/format";
import { Pencil, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

function primaryRate(lane: ClientLaneRate): string {
  if (lane.rate != null) {
    return `${formatINR(lane.rate)} · ${lane.rate_type.replace(/_/g, " ")}`;
  }
  if (lane.per_mt_rate != null) {
    return `₹${lane.per_mt_rate}/MT${lane.per_km_rate != null ? ` · ₹${lane.per_km_rate}/KM` : ""}`;
  }
  if (lane.base_rate != null) {
    return `Base ${formatINR(lane.base_rate)}`;
  }
  return "—";
}

function validity(lane: ClientLaneRate): string {
  if (!lane.valid_from && !lane.valid_to) return "—";
  return `${lane.valid_from ?? "—"} → ${lane.valid_to ?? "open"}`;
}

type TableProps = {
  lanes: ClientLaneRate[];
  onEdit?: (lane: ClientLaneRate) => void;
  onDelete?: (lane: ClientLaneRate) => void;
};

export function ClientProfileLaneRateTable({ lanes, onEdit, onDelete }: TableProps) {
  if (lanes.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={cpStyles.laneTableScroll}
    >
      <View style={cpStyles.laneTable}>
        <View style={[cpStyles.laneTableRow, cpStyles.laneTableHead]}>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColFrom]}>From</Text>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColTo]}>To</Text>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColVehicle]}>Vehicle</Text>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColRate]}>Rate</Text>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColValid]}>Valid</Text>
          <Text style={[cpStyles.laneTableHeadCell, cpStyles.laneColActions]}> </Text>
        </View>
        {lanes.map((lane, idx) => (
          <View
            key={lane.id}
            style={[
              cpStyles.laneTableRow,
              idx % 2 === 1 && cpStyles.laneTableRowAlt,
            ]}
          >
            <Text style={[cpStyles.laneTableCell, cpStyles.laneColFrom]} numberOfLines={2}>
              {lane.origin_label}
            </Text>
            <Text style={[cpStyles.laneTableCell, cpStyles.laneColTo]} numberOfLines={2}>
              {lane.destination_label}
            </Text>
            <Text style={[cpStyles.laneTableCell, cpStyles.laneColVehicle]} numberOfLines={1}>
              {lane.vehicle_type ?? "—"}
              {lane.is_spot_rate ? " · SPOT" : ""}
            </Text>
            <Text style={[cpStyles.laneTableCell, cpStyles.laneColRate, cpStyles.laneTableRate]} numberOfLines={2}>
              {primaryRate(lane)}
            </Text>
            <Text style={[cpStyles.laneTableCell, cpStyles.laneColValid]} numberOfLines={1}>
              {validity(lane)}
            </Text>
            <View style={[cpStyles.laneColActions, cpStyles.laneTableActions]}>
              {onEdit ? (
                <Pressable
                  onPress={() => onEdit(lane)}
                  hitSlop={8}
                  style={cpStyles.laneActionBtn}
                  accessibilityLabel={`Edit lane ${lane.destination_label}`}
                >
                  <Pencil size={13} color={METRONIC.link} strokeWidth={2.2} />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  onPress={() => onDelete(lane)}
                  hitSlop={8}
                  style={cpStyles.laneActionBtn}
                  accessibilityLabel={`Delete lane ${lane.destination_label}`}
                >
                  <Trash2 size={13} color="#F1416C" strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
