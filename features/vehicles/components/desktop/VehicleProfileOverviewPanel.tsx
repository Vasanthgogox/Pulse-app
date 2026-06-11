import { hubStyles as styles } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { Text, View } from "react-native";

type Props = { vehicle: VehicleRow; tripCount: number };

function HighlightRow({
  label,
  value,
  last,
  compact,
}: {
  label: string;
  value: string;
  last?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[mobile.kvRowStacked, last && styles.kvRowLast]}>
        <Text style={mobile.kvLabelStacked}>{label}</Text>
        <Text style={mobile.kvValueStacked} numberOfLines={3}>
          {value === "—" ? "Not set" : value}
        </Text>
      </View>
    );
  }
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
  const compact = useProfileHubCompact();
  const rowProps = { compact };

  const docs = vehicle.documents;
  const docLines = [
    docs?.rc?.expiryDate ? `RC expiry: ${docs.rc.expiryDate}` : null,
    docs?.insurance?.expiryDate ? `Insurance: ${docs.insurance.expiryDate}` : null,
    docs?.fitness?.expiryDate ? `Fitness: ${docs.fitness.expiryDate}` : null,
    docs?.pollution?.expiryDate ? `PUC: ${docs.pollution.expiryDate}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.detailsBody, compact && mobile.detailsBodyCompact]}>
      <View style={[styles.splitRow, compact && mobile.splitColumn]}>
        <View style={[styles.sidebar, compact && mobile.sidebarFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Highlights
            </Text>
            <HighlightRow label="Registration" value={vehicle.vehicle_number ?? "—"} {...rowProps} />
            <HighlightRow label="Type" value={vehicle.vehicle_type ?? "—"} {...rowProps} />
            <HighlightRow label="Body" value={vehicle.vehicle_body_type ?? "—"} {...rowProps} />
            <HighlightRow label="Capacity" value={vehicle.capacity ?? "—"} {...rowProps} />
            <HighlightRow label="Axle" value={vehicle.vehicle_axle ?? "—"} {...rowProps} />
            <HighlightRow
              label="Status"
              value={(vehicle.status ?? "active").toUpperCase()}
              last
              {...rowProps}
            />
          </View>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Specifications
            </Text>
            <HighlightRow label="Brand" value={vehicle.vehicle_brand ?? "—"} {...rowProps} />
            <HighlightRow label="Model" value={vehicle.vehicle_model ?? "—"} {...rowProps} />
            <HighlightRow label="Size" value={vehicle.vehicle_size ?? "—"} {...rowProps} />
            <HighlightRow
              label="Ownership"
              value={vehicle.type === "owned" ? "Organization fleet" : "Partner / adhoc"}
              last
              {...rowProps}
            />
          </View>
        </View>
        <View style={[styles.mainCol, compact && mobile.mainColFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Vehicle profile
            </Text>
            <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
              Documents
            </Text>
            <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
              {docLines.length > 0
                ? docLines.join("\n")
                : "No compliance dates on file. Add RC, insurance, permit, and fitness expiry from vehicle settings."}
            </Text>
            <Text
              style={[
                styles.sectionHeading,
                styles.sectionHeadingSpaced,
                compact && mobile.sectionHeadingCompact,
                compact && mobile.sectionHeadingSpacedCompact,
              ]}
            >
              Utilization
            </Text>
            <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
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
