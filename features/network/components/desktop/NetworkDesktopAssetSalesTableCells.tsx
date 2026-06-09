import { PartyAvatar } from "@/components/PartyAvatar";
import { networkDesktopHubStyles as styles } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type {
  AssetDriverTableRow,
  AssetVehicleTableRow,
} from "@/features/network/utils/assetSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { Text, View } from "react-native";

function formatSignedMoney(value: number, peer?: number): string {
  const abs = Math.abs(value);
  const peerAbs = peer != null ? Math.abs(peer) : null;
  const chip = formatINRChip(abs);
  const peerChip = peerAbs != null ? formatINRChip(peerAbs) : null;
  const useFull =
    peerChip != null &&
    chip === peerChip &&
    peerAbs != null &&
    Math.abs(abs - peerAbs) > Math.max(500, peerAbs * 0.05);
  const label = useFull
    ? formatINRChip(abs).replace(/\s/g, "")
    : chip;
  return value < 0 ? `-${label}` : label;
}

export function AssetSidebarDriverAvatar({ row }: { row: AssetDriverTableRow }) {
  return (
    <PartyAvatar
      name={row.name}
      initialsColorSeed={row.driver.id}
      avatarUrl={row.driver.avatar_url}
      avatarSeed={row.driver.avatar_seed}
      entityType="driver"
      size={32}
    />
  );
}

export function AssetSidebarVehicleAvatar({ row }: { row: AssetVehicleTableRow }) {
  return (
    <PartyAvatar
      name={row.name}
      initialsColorSeed={row.vehicle.id}
      avatarUrl={row.vehicle.avatar_url}
      avatarSeed={row.vehicle.avatar_seed}
      entityType="vehicle"
      size={32}
    />
  );
}

export function AssetTableDriverCell({ row }: { row: AssetDriverTableRow }) {
  return (
    <View style={styles.salesPartnerCell}>
      <PartyAvatar
        name={row.name}
        initialsColorSeed={row.driver.id}
        avatarUrl={row.driver.avatar_url}
        avatarSeed={row.driver.avatar_seed}
        entityType="driver"
        size={34}
      />
      <View style={styles.salesPartnerTextCol}>
        <Text style={styles.salesPartnerName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.salesPartnerSub} numberOfLines={1}>
          {row.subtitle}
        </Text>
      </View>
    </View>
  );
}

export function AssetTablePerformanceCell({ row }: { row: AssetDriverTableRow }) {
  return (
    <View style={styles.salesAssetPerfCell}>
      <Text style={styles.salesAssetPerfScore}>{row.performanceScore}</Text>
      <Text style={styles.salesAssetPerfMeta} numberOfLines={1}>
        {row.onTimePct}% on-time
      </Text>
    </View>
  );
}

type AssetTripsMetricRow = { trips: number; contributionPct: number };
type AssetRevenueMetricRow = {
  revenue: number;
  revenueContributionPct: number;
};
type AssetMarginMetricRow = {
  margin: number;
  revenue: number;
  avgMarginPct: number;
};

export function AssetTableTripsCell({ row }: { row: AssetTripsMetricRow }) {
  return (
    <View style={styles.salesTripsCell}>
      <Text style={styles.salesTripsValue}>{row.trips}</Text>
      <Text style={styles.salesTripsSub}>{row.contributionPct}%</Text>
    </View>
  );
}

export function AssetTableRevenueCell({ row }: { row: AssetRevenueMetricRow }) {
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(row.revenue)}
      </Text>
      <Text style={styles.salesMoneyMeta} numberOfLines={1}>
        {row.revenueContributionPct}% share
      </Text>
    </View>
  );
}

export function AssetTableMarginCell({ row }: { row: AssetMarginMetricRow }) {
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(row.margin, row.revenue)}
      </Text>
      <Text style={styles.salesMoneyMeta} numberOfLines={1}>
        {row.avgMarginPct}% margin
      </Text>
    </View>
  );
}

export function AssetTableEarningsCell({ row }: { row: AssetDriverTableRow }) {
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(row.earnings)}
      </Text>
      <Text style={styles.salesMoneyMeta} numberOfLines={1}>
        driver pay
      </Text>
    </View>
  );
}

export function AssetTableVehicleCell({ row }: { row: AssetVehicleTableRow }) {
  return (
    <View style={styles.salesPartnerCell}>
      <PartyAvatar
        name={row.name}
        initialsColorSeed={row.vehicle.id}
        avatarUrl={row.vehicle.avatar_url}
        avatarSeed={row.vehicle.avatar_seed}
        entityType="vehicle"
        size={34}
      />
      <View style={styles.salesPartnerTextCol}>
        <Text style={styles.salesPartnerName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.salesPartnerSub} numberOfLines={1}>
          {row.subtitle}
        </Text>
        {row.primaryBadge ? (
          <View style={styles.salesVehicleBadge}>
            <Text style={styles.salesVehicleBadgeText}>{row.primaryBadge}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function AssetTableVehicleScoreCell({
  row,
}: {
  row: AssetVehicleTableRow;
}) {
  return (
    <View style={styles.salesAssetPerfCell}>
      <Text style={styles.salesAssetPerfScore}>{row.performanceScore}</Text>
      <Text style={styles.salesAssetPerfMeta} numberOfLines={1}>
        {row.utilizationPct}% util · {row.completionPct}% done
      </Text>
    </View>
  );
}

export function AssetTableUtilCell({ row }: { row: AssetVehicleTableRow }) {
  return (
    <View style={styles.salesTripsCell}>
      <Text style={styles.salesTripsValue}>{row.utilizationPct}%</Text>
      <Text style={styles.salesTripsSub}>active days</Text>
    </View>
  );
}

export function AssetTableKmCell({ row }: { row: AssetVehicleTableRow }) {
  return (
    <View style={styles.salesTripsCell}>
      <Text style={styles.salesTripsValue}>
        {row.kmDriven >= 1000
          ? `${(row.kmDriven / 1000).toFixed(1)}k`
          : row.kmDriven}
      </Text>
      <Text style={styles.salesTripsSub}>
        {row.revenuePerKm > 0 ? `₹${row.revenuePerKm}/km` : "—"}
      </Text>
    </View>
  );
}
