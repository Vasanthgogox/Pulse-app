import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { hubStyles as styles } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { formatINRChip } from "@/lib/format";
import { Text, View } from "react-native";

type Props = {
  driver: DriverRow;
  tripCount: number;
  vehicleLabel: string | null;
};

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

export function DriverProfileOverviewPanel({ driver, tripCount, vehicleLabel }: Props) {
  const compParts = [
    driver.payable_amount != null && driver.payable_amount > 0
      ? `Salary ${formatINRChip(driver.payable_amount)}`
      : null,
    driver.commission_percent != null && driver.commission_percent > 0
      ? `${driver.commission_percent}% commission`
      : null,
    driver.commission_per_km != null && driver.commission_per_km > 0
      ? `₹${driver.commission_per_km}/km`
      : null,
  ].filter(Boolean);

  return (
    <View style={styles.detailsBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highlights</Text>
            <HighlightRow label="Full name" value={driver.name?.trim() || "—"} />
            <HighlightRow label="Phone" value={driver.phone?.trim() || "—"} />
            <HighlightRow label="Email" value={driver.email?.trim() || "—"} />
            <HighlightRow label="Licence" value={driver.license_number?.trim() || "—"} />
            <HighlightRow
              label="Status"
              value={(driver.status ?? "active").toUpperCase()}
            />
            <HighlightRow label="Assigned vehicle" value={vehicleLabel ?? "—"} last />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Emergency</Text>
            <HighlightRow label="Contact name" value={driver.emergency_name?.trim() || "—"} />
            <HighlightRow
              label="Contact phone"
              value={driver.emergency_contact?.trim() || "—"}
              last
            />
          </View>
        </View>
        <View style={styles.mainCol}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Driver profile</Text>
            <Text style={styles.sectionHeading}>Compensation</Text>
            <Text style={styles.aboutBody}>
              {compParts.length > 0
                ? compParts.join(" · ")
                : "No salary or commission terms saved yet. Set payable amount and commission in driver settings."}
            </Text>
            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
              Operations
            </Text>
            <Text style={styles.aboutBody}>
              {tripCount > 0
                ? `${tripCount} trips recorded for this driver in your workspace. Use Finance and Trips for ledger and execution history.`
                : "No trips assigned yet. Deploy this driver from trip allocation or indent award."}
            </Text>
            {driver.left_at ? (
              <>
                <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
                  Fleet history
                </Text>
                <Text style={styles.aboutBody}>
                  Driver left fleet on {new Date(driver.left_at).toLocaleDateString("en-IN")}.
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
