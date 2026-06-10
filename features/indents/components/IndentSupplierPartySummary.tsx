import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import { computeTripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { TripPayableReceivableSummaryCard } from "@/features/trips/components/trip-detail/adjustment/TripPayableReceivableSummaryCard";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatINR } from "@/lib/format";
import { useTransactionsQuery } from "@/lib/queries";

export type IndentSupplierPartySummaryProps = {
  orgId: string | null;
  shipperName: string;
  awardedQuoteInr: number;
  trip: TripRow | null;
  driverLabel?: string | null;
  vehicleLabel?: string | null;
  /** Trip exists but no driver/vehicle on trip or accepted quote yet. */
  allocationPending?: boolean;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export const IndentSupplierPartySummary = memo(function IndentSupplierPartySummary({
  orgId,
  shipperName,
  awardedQuoteInr,
  trip,
  driverLabel,
  vehicleLabel,
  allocationPending,
}: IndentSupplierPartySummaryProps) {
  const { data: transactions = [] } = useTransactionsQuery(
    trip?.id && orgId ? orgId : null,
  );

  const tripLedgerEntries = useMemo(() => {
    if (!trip?.id) return [] as LedgerRow[];
    return transactions.filter((tx) => tx.trip_id === trip.id);
  }, [transactions, trip?.id]);

  const financeSnapshot = useMemo(() => {
    if (!trip?.id || !orgId) return null;
    return computeTripEntryFinancialSnapshot(
      {
        id: trip.id,
        organization_id: trip.organization_id,
        indent_id: trip.indent_id ?? null,
        client_id: trip.client_id,
        supplier_id: trip.supplier_id,
        driver_id: trip.driver_id,
        client_price: trip.client_price,
        supplier_rate: trip.supplier_rate,
        driver_commission: trip.driver_commission,
        distance: trip.distance,
        is_cross_org_supplier: !!(
          orgId &&
          trip.organization_id &&
          orgId !== trip.organization_id
        ),
        subcontract_rate:
          (trip as { subcontract_rate?: number | null }).subcontract_rate ??
          null,
        trip_payout_mode: trip.trip_payout_mode ?? null,
        vehicle_id: trip.vehicle_id ?? null,
      },
      tripLedgerEntries,
      orgId,
      null,
    );
  }, [trip, orgId, tripLedgerEntries]);

  const tripStatus = (trip?.status ?? "").trim().toUpperCase() || "—";
  const tripRef = trip
    ? getTripOperationalDisplay({
        trip_number: trip.trip_number ?? null,
        display_trip_id: trip.display_trip_id ?? null,
      })
    : "—";

  const driverName = (driverLabel ?? "").trim() || "Not assigned";
  const vehicleName = (vehicleLabel ?? "").trim() || "Not assigned";

  const lines = financeSnapshot?.lines;
  const tripType = financeSnapshot?.trip_type ?? "market";

  const revisedReceivable =
    lines?.client_sale ?? awardedQuoteInr ?? Number(trip?.supplier_rate ?? 0);
  const collected = lines?.client_received ?? 0;
  const receivableDue = lines?.client_due ?? Math.max(0, revisedReceivable - collected);

  const showDriverPayable =
    tripType === "asset" &&
    Boolean(
      trip?.driver_id ||
        (lines?.driver_to_pay ?? 0) > 0 ||
        (lines?.driver_paid ?? 0) > 0,
    );

  const showSubcontractPayable = (lines?.supplier_cost ?? 0) > 0;

  if (!trip) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionTitle}>Payment summary</Text>
        <View style={styles.panel}>
          <SummaryRow label="Shipper" value={shipperName} />
          <SummaryRow label="Your quote" value={formatINR(awardedQuoteInr)} />
          <Text style={styles.hint}>
            Trip not created yet — payment lines appear after deploy.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Trip summary</Text>
      <View style={styles.panel}>
        <View style={styles.summaryGrid}>
          <SummaryRow label="Trip" value={tripRef} />
          <SummaryRow label="Status" value={tripStatus} />
          <SummaryRow label="Driver" value={driverName} />
          <SummaryRow label="Vehicle" value={vehicleName} />
        </View>
        {allocationPending ? (
          <Text style={styles.hint}>
            Status is Assigned because the trip was created from your awarded
            bid. Driver and vehicle appear here after you deploy from Allocate
            Vehicle.
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Payment summary</Text>
      <TripPayableReceivableSummaryCard
        showReceivable={revisedReceivable > 0}
        clientName={shipperName}
        clientAvatarSeed={trip.organization_id ?? shipperName}
        revisedReceivable={revisedReceivable}
        collectedAmount={collected}
        receivableDue={receivableDue}
        showPayable={showDriverPayable || showSubcontractPayable}
        payablePartyName={
          showDriverPayable && driverName !== "Not assigned"
            ? driverName
            : showDriverPayable
              ? "Driver"
              : "Subcontract"
        }
        payableAvatarSeed={
          showDriverPayable ? trip.driver_id ?? driverName : undefined
        }
        payableEntityType={showDriverPayable ? "driver" : "supplier"}
        payableLaneLabel={showDriverPayable ? "Driver payable" : "Payable"}
        revisedPayable={
          showDriverPayable
            ? (lines?.driver_to_pay ?? 0)
            : (lines?.supplier_cost ?? 0)
        }
        paidAmount={
          showDriverPayable
            ? (lines?.driver_paid ?? 0)
            : (lines?.supplier_paid ?? 0)
        }
        payableDue={
          showDriverPayable
            ? (lines?.driver_due ?? 0)
            : (lines?.supplier_due ?? 0)
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 10,
  },
  sectionTitle: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 8,
    color: Theme.textMutedDemo,
    letterSpacing: 0.45,
  },
  panel: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    padding: 10,
    backgroundColor: Theme.screenBackground,
    gap: 6,
  },
  summaryGrid: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabel: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 8,
    color: Theme.textMuted,
    flexShrink: 0,
    minWidth: 52,
  },
  summaryValue: {
    ...indentReviewHubText.fieldValue,
    flex: 1,
    textAlign: "right",
    color: Theme.textPrimaryDark,
  },
  hint: {
    ...indentReviewHubText.bodyMuted,
    marginTop: 4,
  },
});
