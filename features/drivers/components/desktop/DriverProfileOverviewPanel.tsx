import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { hubStyles as styles } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { PartyProfileIntelSections } from "@/features/party/components/PartyProfileIntelSections";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { driverToPublicEntity } from "@/features/public-profile/mappers";
import { formatINRChip } from "@/lib/format";
import { useMemo } from "react";
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

export function DriverProfileOverviewPanel({ driver, tripCount, vehicleLabel }: Props) {
  const compact = useProfileHubCompact();
  const rowProps = { compact };
  const publicEntity = useMemo(() => driverToPublicEntity(driver), [driver]);

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
    <View style={[styles.detailsBody, compact && mobile.detailsBodyCompact]}>
      {compact ? <PartyProfileIntelSections entity={publicEntity} /> : null}
      <View style={[styles.splitRow, compact && mobile.splitColumn]}>
        <View style={[styles.sidebar, compact && mobile.sidebarFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Highlights
            </Text>
            <HighlightRow label="Full name" value={driver.name?.trim() || "—"} {...rowProps} />
            <HighlightRow label="Phone" value={driver.phone?.trim() || "—"} {...rowProps} />
            <HighlightRow label="Email" value={driver.email?.trim() || "—"} {...rowProps} />
            <HighlightRow
              label="Licence"
              value={driver.license_number?.trim() || "—"}
              {...rowProps}
            />
            <HighlightRow
              label="Status"
              value={(driver.status ?? "active").toUpperCase()}
              {...rowProps}
            />
            <HighlightRow
              label="Assigned vehicle"
              value={vehicleLabel ?? "—"}
              last
              {...rowProps}
            />
          </View>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Emergency
            </Text>
            <HighlightRow
              label="Contact name"
              value={driver.emergency_name?.trim() || "—"}
              {...rowProps}
            />
            <HighlightRow
              label="Contact phone"
              value={driver.emergency_contact?.trim() || "—"}
              last
              {...rowProps}
            />
          </View>
        </View>
        <View style={[styles.mainCol, compact && mobile.mainColFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Driver profile
            </Text>
            <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
              Compensation
            </Text>
            <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
              {compParts.length > 0
                ? compParts.join(" · ")
                : "No salary or commission terms saved yet. Set payable amount and commission in driver settings."}
            </Text>
            <Text
              style={[
                styles.sectionHeading,
                styles.sectionHeadingSpaced,
                compact && mobile.sectionHeadingCompact,
                compact && mobile.sectionHeadingSpacedCompact,
              ]}
            >
              Operations
            </Text>
            <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
              {tripCount > 0
                ? `${tripCount} trips recorded for this driver in your workspace. Use Finance and Trips for ledger and execution history.`
                : "No trips assigned yet. Deploy this driver from trip allocation or indent award."}
            </Text>
            {driver.left_at ? (
              <>
                <Text
                  style={[
                    styles.sectionHeading,
                    styles.sectionHeadingSpaced,
                    compact && mobile.sectionHeadingCompact,
                    compact && mobile.sectionHeadingSpacedCompact,
                  ]}
                >
                  Fleet history
                </Text>
                <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
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
