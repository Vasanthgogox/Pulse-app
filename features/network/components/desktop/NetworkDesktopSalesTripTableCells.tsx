import { networkDesktopHubStyles as styles } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { SalesTripTableRow } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { Text, View } from "react-native";

function formatSignedMoney(value: number): string {
  const chip = formatINRChip(Math.abs(value));
  return value < 0 ? `-${chip}` : chip;
}

export function SalesTripRefCell({ row }: { row: SalesTripTableRow }) {
  return (
    <View style={styles.salesTripRefCell}>
      <Text style={styles.salesTripRefText} numberOfLines={1}>
        {row.tripRef}
      </Text>
    </View>
  );
}

export function SalesTripLaneCell({ row }: { row: SalesTripTableRow }) {
  return (
    <Text style={styles.salesLaneText} numberOfLines={1}>
      {row.lane}
    </Text>
  );
}

export function SalesTripPartyCell({ name }: { name: string }) {
  return (
    <Text style={styles.salesTripPartyText} numberOfLines={1}>
      {name}
    </Text>
  );
}

export function SalesTripMoneyCell({
  value,
  meta,
}: {
  value: number;
  meta?: string;
}) {
  return (
    <View style={styles.salesMoneyCell}>
      <Text style={styles.salesMoneyValue} numberOfLines={1}>
        {formatSignedMoney(value)}
      </Text>
      {meta ? (
        <Text style={styles.salesMoneyMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

export function SalesTripMarginCell({ row }: { row: SalesTripTableRow }) {
  return (
    <SalesTripMoneyCell
      value={row.margin}
      meta={`${row.marginPct}% of sales`}
    />
  );
}

export function SalesTripStatusCell({ row }: { row: SalesTripTableRow }) {
  const normalized = row.statusLabel.toLowerCase();
  const isComplete =
    normalized.includes("complete") || normalized.includes("delivered");
  const isActive =
    normalized.includes("transit") ||
    normalized.includes("assigned") ||
    normalized.includes("progress");
  return (
    <View
      style={[
        styles.statusPill,
        isComplete
          ? styles.salesStatusLive
          : isActive
            ? styles.salesTripStatusActive
            : styles.salesTripStatusPending,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          isComplete
            ? styles.salesStatusLiveText
            : isActive
              ? styles.salesTripStatusActiveText
              : styles.salesTripStatusPendingText,
        ]}
        numberOfLines={1}
      >
        {row.statusLabel}
      </Text>
    </View>
  );
}
