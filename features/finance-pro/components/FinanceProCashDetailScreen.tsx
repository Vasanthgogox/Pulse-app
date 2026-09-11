import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceProHandoffActions } from "./FinanceProHandoffActions";
import { FinanceProDetailFrame } from "./FinanceProDetailFrame";
import {
  FinanceProFactGrid,
  FinanceProMetric,
  FinanceProPageHero,
  FinanceProPanel,
  FinanceProStack,
  FinanceProWidgetRow,
} from "./FinanceProCanvas";
import { formatCount, formatFinanceInr } from "./financeProFormat";
import { useFinanceProLedgerRow } from "../hooks/useFinanceProLedgerRow";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { financeProRouteParam } from "./financeProRouteParam";

export function FinanceProCashDetailScreen() {
  const router = useRouter();
  const id = financeProRouteParam(useLocalSearchParams().id);
  const { row, loading, error } = useFinanceProLedgerRow(id);

  return (
    <FinanceProDetailFrame title="Cash" eyebrow="Ledger">
      {(model) => {
        if (loading) {
          return <CenteredLoadingView message="Loading transaction…" />;
        }
        if (!row) {
          return (
            <Text style={styles.note}>
              {error instanceof Error
                ? error.message
                : "Transaction not found in the current cash page or by id."}
            </Text>
          );
        }
        const inAmt = Number(row.amount_in ?? 0);
        const outAmt = Number(row.amount_out ?? 0);
        const isReceipt = inAmt > 0 && outAmt <= 0;
        const amt = Math.max(inAmt, outAmt);
        const trip = row.trip_id
          ? model.tripFacts.find((t) => t.tripId === row.trip_id)
          : undefined;
        const client =
          row.contact_type === "client" && row.contact_id
            ? model.clientRows.find((c) => c.id === row.contact_id)
            : trip
              ? model.clientRows.find((c) => c.id === trip.clientId)
              : model.clientRows.find(
                  (c) =>
                    c.name.trim().toLowerCase() === row.party_name.trim().toLowerCase(),
                );
        const attributedOnTrip =
          trip != null ? Math.max(0, trip.sales - trip.remainingDue) : 0;
        const stories: string[] = [];
        if (isReceipt && trip) {
          stories.push(
            `${formatFinanceInr(amt)} is recorded on this cash-book row against ${trip.tripLabel}.`,
          );
          if ((client?.outstanding ?? trip.remainingDue) > 0) {
            stories.push(
              `Customer still has ${formatFinanceInr(client?.outstanding ?? trip.remainingDue)} of trip-linked open exposure.`,
            );
          }
          stories.push("This row does not allocate the receipt to an invoice.");
        } else if (isReceipt && client) {
          stories.push(
            `${formatFinanceInr(amt)} is a customer receipt. It is not invoice allocation.`,
          );
          if (client.outstanding > 0) {
            stories.push(
              `${client.name} still has ${formatFinanceInr(client.outstanding)} of trip-linked open exposure.`,
            );
          }
        }

        return (
          <FinanceProStack>
            <FinanceProPageHero
              eyebrow={isReceipt ? "Customer receipt" : outAmt > 0 ? "Cash out" : "Ledger row"}
              value={formatFinanceInr(amt)}
              caption={`${row.transaction_date} · ${row.party_name}`}
            />

            <FinanceProPanel title="Transaction">
              <FinanceProFactGrid>
                <FinanceProMetric label="Date" value={row.transaction_date} />
                <FinanceProMetric label="Party" value={row.party_name} />
                <FinanceProMetric
                  label="Direction"
                  value={isReceipt ? "In" : outAmt > 0 && inAmt <= 0 ? "Out" : "Both"}
                />
                <FinanceProMetric
                  label="Trip"
                  value={trip?.tripLabel || row.trip_id || "—"}
                />
                <FinanceProMetric
                  label="Reference"
                  value={row.payment_reference || "—"}
                />
              </FinanceProFactGrid>
            </FinanceProPanel>

            <FinanceProWidgetRow columns="1-1">
              <FinanceProPanel title="Trip context">
                {trip ? (
                  <FinanceProFactGrid>
                    <FinanceProMetric
                      label="Trip value"
                      value={formatFinanceInr(trip.sales)}
                    />
                    <FinanceProMetric
                      label="Open exposure"
                      value={formatFinanceInr(trip.remainingDue)}
                    />
                    <FinanceProMetric
                      label="Invoice"
                      value={trip.invoiced ? "Issued" : "Not billed"}
                    />
                    <FinanceProMetric
                      label="POD"
                      value={trip.podReceived ? "Received" : "Pending"}
                    />
                    <FinanceProMetric
                      label="Attributed cash"
                      value={formatFinanceInr(attributedOnTrip)}
                    />
                  </FinanceProFactGrid>
                ) : (
                  <Text style={styles.note}>No trip on this ledger row.</Text>
                )}
              </FinanceProPanel>
              <FinanceProPanel title="Customer context">
                {client ? (
                  <FinanceProFactGrid>
                    <FinanceProMetric
                      label="Customer exposure"
                      value={formatFinanceInr(client.outstanding)}
                    />
                    <FinanceProMetric
                      label="Open trips"
                      value={formatCount(client.openTrips)}
                    />
                    <FinanceProMetric
                      label="Attributed cash"
                      value={formatFinanceInr(client.attributedReceipts)}
                    />
                  </FinanceProFactGrid>
                ) : (
                  <Text style={styles.note}>
                    Party {row.party_name}. No Finance Pro client row matched.
                  </Text>
                )}
              </FinanceProPanel>
            </FinanceProWidgetRow>

            {stories.length ? (
              <FinanceProPanel title="Interpretation">
                {stories.map((line) => (
                  <Text key={line} style={styles.story}>
                    {line}
                  </Text>
                ))}
              </FinanceProPanel>
            ) : null}

            <FinanceProPanel title="Actions">
              <FinanceProHandoffActions
                extras={[
                  ...(client
                    ? [
                        {
                          label: "Open Client 360",
                          onPress: () => router.push(ROUTES.financeProClient(client.id)),
                        },
                      ]
                    : []),
                  ...(row.trip_id
                    ? [
                        {
                          label: "Open trip",
                          onPress: () =>
                            router.push(ROUTES.financeProTrip(row.trip_id as string)),
                        },
                      ]
                    : []),
                ]}
              />
            </FinanceProPanel>
          </FinanceProStack>
        );
      }}
    </FinanceProDetailFrame>
  );
}

const styles = StyleSheet.create({
  story: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: Theme.textPrimary,
  },
  note: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
});
