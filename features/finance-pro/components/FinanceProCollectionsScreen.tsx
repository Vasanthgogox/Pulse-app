import { ROUTES } from "@/lib/routes";
import {
  FinanceProAgeBoard,
  FinanceProDataTable,
  FinanceProPageHero,
  FinanceProStack,
  type FinanceProTableColumn,
} from "./FinanceProCanvas";
import { FinanceProInvestigation } from "./FinanceProInvestigation";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import {
  formatCount,
  formatFinanceInr,
  formatPct,
} from "./financeProFormat";
import {
  EMPTY_CANVAS_SELECTION,
  OBLIGATION_AGE_BUCKETS,
  OBLIGATION_AGE_LABELS,
  type CanvasSelection,
  type ClientCollectionRow,
  type TripFinancialFact,
} from "../model/financeProTypes";
import {
  clearCanvasSelection,
  filterModelByCanvas,
  toggleAgeBucketSelection,
  toggleClientSelection,
} from "../model/canvasContext.util";
import { buildInvestigationBrief } from "../model/investigation.util";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import Theme from "@/constants/Theme";

function ageMixLabel(row: ClientCollectionRow): string {
  const parts = OBLIGATION_AGE_BUCKETS.filter((k) => row.ageMix[k] > 0).map(
    (k) => OBLIGATION_AGE_LABELS[k],
  );
  return parts.length ? parts.join(" · ") : "—";
}

export function FinanceProCollectionsScreen() {
  const router = useRouter();
  const [selection, setSelection] = useState<CanvasSelection>(EMPTY_CANVAS_SELECTION);

  return (
    <FinanceProWorkspaceFrame title="Collections" hideTitle>
      {(base) => {
        const model = filterModelByCanvas(base, selection);
        const brief = buildInvestigationBrief(model, selection);
        const selectedClient = selection.clientId
          ? model.clientRows.find((r) => r.id === selection.clientId) ??
            base.clientRows.find((r) => r.id === selection.clientId) ??
            null
          : null;
        const customerRows = [...model.clientRows]
          .filter((r) => r.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding);
        const tripRows = [...model.openTrips].sort(
          (a, b) => (b.daysOld ?? 0) - (a.daysOld ?? 0),
        );
        const columns: FinanceProTableColumn<ClientCollectionRow>[] = [
          { key: "c", label: "Customer", flex: 1.5, minWidth: 150, render: (r) => r.name },
          {
            key: "o",
            label: "Outstanding",
            flex: 1.1,
            minWidth: 120,
            align: "right",
            render: (r) => formatFinanceInr(r.outstanding),
          },
          {
            key: "a",
            label: "Age",
            flex: 1.1,
            minWidth: 110,
            render: (r) => ageMixLabel(r),
          },
          {
            key: "t",
            label: "Open trips",
            flex: 0.8,
            minWidth: 88,
            align: "right",
            render: (r) => formatCount(r.openTrips),
          },
          {
            key: "old",
            label: "Oldest trip",
            flex: 0.8,
            minWidth: 88,
            align: "right",
            render: (r) =>
              r.oldestObligationDays == null ? "—" : `${r.oldestObligationDays}d`,
          },
          {
            key: "b",
            label: "Billed",
            flex: 1,
            minWidth: 110,
            align: "right",
            render: (r) => formatFinanceInr(r.billed),
          },
          {
            key: "cash",
            label: "Cash attributed",
            flex: 1.1,
            minWidth: 120,
            align: "right",
            render: (r) => formatFinanceInr(r.attributedReceipts),
          },
          {
            key: "s",
            label: "Share",
            flex: 0.7,
            minWidth: 72,
            align: "right",
            render: (r) => formatPct(r.shareOfOutstanding),
          },
          {
            key: "act",
            label: "Action",
            flex: 1,
            minWidth: 110,
            variant: "muted",
            render: (r) =>
              r.isLedgerOnly ? (
                "—"
              ) : (
                <Pressable
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    router.push(ROUTES.financeProClient(r.id));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open 360 ${r.name}`}
                  {...(Platform.OS === "web"
                    ? {
                        dataSet: { fpStop: "" },
                        onClick: (event: { stopPropagation: () => void }) => {
                          event.stopPropagation();
                          router.push(ROUTES.financeProClient(r.id));
                        },
                      }
                    : null)}
                >
                  <Text style={{ fontWeight: "800", color: Theme.primary, fontSize: 13 }}>
                    Open 360
                  </Text>
                </Pressable>
              ),
          },
        ];
        const tripColumns: FinanceProTableColumn<TripFinancialFact>[] = [
          { key: "t", label: "Trip", flex: 1.1, minWidth: 130, render: (r) => r.tripLabel },
          {
            key: "c",
            label: "Customer",
            flex: 1.2,
            minWidth: 130,
            render: (r) => r.clientName,
          },
          {
            key: "v",
            label: "Value",
            flex: 0.9,
            minWidth: 100,
            align: "right",
            render: (r) => formatFinanceInr(r.sales),
          },
          {
            key: "open",
            label: "Open",
            flex: 0.9,
            minWidth: 100,
            align: "right",
            render: (r) => formatFinanceInr(r.remainingDue),
          },
          {
            key: "age",
            label: "Age",
            flex: 0.7,
            minWidth: 72,
            align: "right",
            render: (r) => (r.daysOld == null ? "—" : `${r.daysOld}d`),
          },
          {
            key: "p",
            label: "POD",
            flex: 0.7,
            minWidth: 88,
            render: (r) => (r.podReceived ? "Received" : "Pending"),
          },
          {
            key: "i",
            label: "Invoice",
            flex: 0.8,
            minWidth: 96,
            render: (r) => (r.invoiced ? "Issued" : "Not billed"),
          },
        ];

        return (
          <FinanceProStack>
            <FinanceProPageHero
              eyebrow="Collections"
              value={formatFinanceInr(model.outstanding)}
              caption={
                brief.active && brief.label
                  ? `${brief.label} · ${formatCount(brief.clientCount)} customers · ${formatCount(brief.openTripCount)} open trips`
                  : "Open trip-linked exposure · who should I collect from?"
              }
            />

            <FinanceProAgeBoard
              totals={model.ageTotals}
              selected={selection.ageBucket}
              onSelect={(bucket) =>
                setSelection((s) => toggleAgeBucketSelection(s, bucket))
              }
            />

            <FinanceProDataTable
              title="Decision table"
              searchPlaceholder="Search customers…"
              context={
                brief.active ? (
                  <FinanceProInvestigation
                    brief={brief}
                    onClear={() => setSelection(clearCanvasSelection())}
                    story={
                      selectedClient
                        ? `${selectedClient.name} · ${formatFinanceInr(selectedClient.outstanding)} · ${formatPct(selectedClient.shareOfOutstanding)} of book · ${formatCount(selectedClient.openTrips)} open trips`
                        : null
                    }
                    actionLabel={
                      selectedClient && !selectedClient.isLedgerOnly
                        ? "Open 360"
                        : undefined
                    }
                    onAction={
                      selectedClient && !selectedClient.isLedgerOnly
                        ? () => router.push(ROUTES.financeProClient(selectedClient.id))
                        : undefined
                    }
                  />
                ) : undefined
              }
              columns={columns}
              rows={customerRows}
              keyExtractor={(r) => r.id}
              selectedKey={selection.clientId}
              onRowPress={(row) => {
                setSelection((s) => toggleClientSelection(s, row.id, row.name));
              }}
              empty="No customers in this investigation."
            />

            <FinanceProDataTable
              title="Trip detail"
              kicker={
                selectedClient
                  ? `${selectedClient.name} · ${formatCount(tripRows.length)} trips`
                  : "All open trips — select a customer above to filter"
              }
              searchPlaceholder="Search trips…"
              columns={tripColumns}
              rows={tripRows}
              keyExtractor={(r) => r.tripId}
              onRowPress={(row) => router.push(ROUTES.financeProTrip(row.tripId))}
              empty={
                selectedClient
                  ? `No trips for ${selectedClient.name} in this view.`
                  : "No open trips in this view."
              }
            />
          </FinanceProStack>
        );
      }}
    </FinanceProWorkspaceFrame>
  );
}
