import { PartyAvatar } from "@/components/PartyAvatar";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import { networkDesktopHubStyles as styles } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { SalesTableRow } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINR, formatINRChip } from "@/lib/format";
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
    ? formatINR(abs).replace(/\s/g, "")
    : chip;
  return value < 0 ? `-${label}` : label;
}

export function SalesSidebarPartnerAvatar({ row }: { row: SalesTableRow }) {
  const entityType = row.role === "SUPPLIER" ? "supplier" : "client";
  return (
    <PartyAvatar
      name={row.name}
      initialsColorSeed={row.connection.id}
      avatarUrl={row.connection.avatar_url}
      avatarSeed={row.connection.avatar_seed}
      entityType={entityType}
      size={32}
    />
  );
}

export function SalesTablePartnerCell({ row }: { row: SalesTableRow }) {
  const entityType = row.role === "SUPPLIER" ? "supplier" : "client";
  return (
    <View style={styles.salesPartnerCell}>
      <PartyAvatar
        name={row.name}
        initialsColorSeed={row.connection.id}
        avatarUrl={row.connection.avatar_url}
        avatarSeed={row.connection.avatar_seed}
        entityType={entityType}
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

export function SalesTableRatingCell({ row }: { row: SalesTableRow }) {
  const hasRating =
    row.globalRatingAvg != null && Number.isFinite(row.globalRatingAvg);
  const ratingLabel = hasRating
    ? row.globalRatingAvg!.toFixed(1)
    : "—";
  return (
    <View style={styles.salesRatingCell}>
      <View style={styles.salesRatingTopRow}>
        <NetworkDesktopSalesStars filledStars={row.filledStars} size={10} />
        <Text style={styles.salesRatingMeta} numberOfLines={1}>
          {ratingLabel}
        </Text>
      </View>
      <Text style={styles.salesRatingSub} numberOfLines={1}>
        {row.globalTripCount > 0
          ? `${row.globalTripCount} trips`
          : "No trips"}
      </Text>
    </View>
  );
}

export function SalesTableRevenueCell({ row }: { row: SalesTableRow }) {
  const kind = row.role === "CLIENT" ? "Sales" : "Cost";
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(row.revenue)}
      </Text>
      <Text style={styles.salesMoneyMeta} numberOfLines={1}>
        {row.revenueContributionPct}% {kind.toLowerCase()}
      </Text>
    </View>
  );
}

export function SalesTableMarginCell({ row }: { row: SalesTableRow }) {
  if (row.role === "SUPPLIER") {
    return (
      <View style={styles.salesMoneyCell}>
        <Text style={styles.salesMoneyValue} numberOfLines={1}>
          —
        </Text>
        <Text style={styles.salesMoneyMeta} numberOfLines={1}>
          Margin on clients
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(row.margin, row.revenue)}
      </Text>
      <Text style={styles.salesMoneyMeta} numberOfLines={1}>
        {row.avgMarginPct}% of sales
      </Text>
    </View>
  );
}

export function SalesTableTripsCell({ row }: { row: SalesTableRow }) {
  return (
    <View style={styles.salesTripsCell}>
      <Text style={styles.salesTripsValue}>{row.trips}</Text>
      <Text style={styles.salesTripsSub}>{row.contributionPct}%</Text>
    </View>
  );
}
