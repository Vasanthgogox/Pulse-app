import { hubStyles as styles } from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { Text, View } from "react-native";

type Props = { vehicle: VehicleRow; tripCount: number };

function HighlightRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function VehicleProfileOverviewPanel({ vehicle, tripCount }: Props) {
  const docs = vehicle.documents;
  const docLines = [
    docs?.rc?.expiryDate ? `RC expiry: ${docs.rc.expiryDate}` : null,
    docs?.insurance?.expiryDate ? `Insurance: ${docs.insurance.expiryDate}` : null,
    docs?.fitness?.expiryDate ? `Fitness: ${docs.fitness.expiryDate}` : null,
    docs?.pollution?.expiryDate ? `PUC: ${docs.pollution.expiryDate}` : null,
  ].filter(Boolean);

  return (
    <View style={styles.detailsBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highlights</Text>
            <HighlightRow label="Registration" value={vehicle.vehicle_number ?? "—"} />
            <HighlightRow label="Type" value={vehicle.vehicle_type ?? "—"} />
            <HighlightRow label="Body" value={vehicle.vehicle_body_type ?? "—"} />
            <HighlightRow label="Capacity" value={vehicle.capacity ?? "—"} />
            <HighlightRow label="Axle" value={vehicle.vehicle_axle ?? "—"} />
            <HighlightRow
              label="Status"
              value={(vehicle.status ?? "active").toUpperCase()}
              last
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Specifications</Text>
            <HighlightRow label="Brand" value={vehicle.vehicle_brand ?? "—"} />
            <HighlightRow label="Model" value={vehicle.vehicle_model ?? "—"} />
            <HighlightRow label="Size" value={vehicle.vehicle_size ?? "—"} />
            <HighlightRow
              label="Ownership"
              value={vehicle.type === "owned" ? "Organization fleet" : "Partner / adhoc"}
              last
            />
          </View>
        </View>
        <View style={styles.mainCol}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vehicle profile</Text>
            <Text style={styles.sectionHeading}>Documents</Text>
            <Text style={styles.aboutBody}>
              {docLines.length > 0
                ? docLines.join("\n")
                : "No compliance dates on file. Add RC, insurance, permit, and fitness expiry from vehicle settings."}
            </Text>
            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
              Utilization
            </Text>
            <Text style={styles.aboutBody}>
              {tripCount > 0
                ? `${tripCount} trips executed on this registration. Track fuel, toll, and ledger from the vehicle finance view.`
                : "No trips logged for this vehicle yet."}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
