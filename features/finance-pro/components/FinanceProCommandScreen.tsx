import { ROUTES } from "@/lib/routes";
import {
  FinanceProAgeBoard,
  FinanceProAttentionGrid,
  FinanceProDataTable,
  FinanceProKpiCard,
  FinanceProKpiRow,
  FinanceProMonthStrip,
  FinanceProPanel,
  FinanceProPipelineFlow,
  FinanceProQuietAction,
  FinanceProStack,
  FinanceProWidgetRow,
  type FinanceProTableColumn,
} from "./FinanceProCanvas";
import { FinanceProInvestigation } from "./FinanceProInvestigation";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";
import {
  formatCount,
  formatFinanceInr,
  formatPct,
} from "./financeProFormat";
import {
  EMPTY_CANVAS_SELECTION,
  type CanvasSelection,
  type ClientCollectionRow,
  type TripFinancialFact,
} from "../model/financeProTypes";
import {
  clearCanvasSelection,
  toggleAgeBucketSelection,
  toggleClientSelection,
  togglePipelineStageSelection,
  toggleVintageMonthSelection,
} from "../model/canvasContext.util";
import { buildCommandPresentation } from "../model/commandInvestigation.util";
import { TrendBarChart, type TrendPoint } from "@/components/analytics";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

export function FinanceProCommandScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const [selection, setSelection] = useState<CanvasSelection>(EMPTY_CANVAS_SELECTION);
  const [trendWidth, setTrendWidth] = useState(420);

  return (
    <FinanceProWorkspaceFrame title="Command" hideTitle>
      {(base) => {
        const command = buildCommandPresentation(base, selection);
        const {
          model: view,
          brief,
          attention,
          story,
        } = command;
        const trend: TrendPoint[] = view.vintage.map((v) => ({
          label: v.label,
          revenue: v.billed,
          expense: v.attributedReceipts,
          profit: v.outstanding,
          margin: 0,
          tripCount: v.tripCount,
        }));
        const clientCols: FinanceProTableColumn<ClientCollectionRow>[] = [
          { key: "n", label: "Customer", flex: 1.6, minWidth: 160, render: (r) => r.name },
          {
            key: "o",
            label: "Outstanding",
            flex: 1,
            minWidth: 110,
            align: "right",
            render: (r) => formatFinanceInr(r.outstanding),
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
            label: "Oldest",
            flex: 0.7,
            minWidth: 80,
            align: "right",
            render: (r) =>
              r.oldestObligationDays == null ? "—" : `${r.oldestObligationDays}d`,
          },
          {
            key: "s",
            label: "Share",
            flex: 0.7,
            minWidth: 72,
            align: "right",
            render: (r) => formatPct(r.shareOfOutstanding),
          },
        ];
        const tripCols: FinanceProTableColumn<TripFinancialFact>[] = [
          { key: "t", label: "Trip", flex: 1, minWidth: 120, render: (r) => r.tripLabel },
          { key: "c", label: "Customer", flex: 1.2, minWidth: 120, render: (r) => r.clientName },
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
        const showTrips = command.showTripEvidence;

        return (
          <FinanceProStack>
            <FinanceProKpiRow>
              <FinanceProKpiCard
                label="Outstanding"
                value={formatFinanceInr(command.outstanding)}
                sub={`${formatCount(command.clientsWithBalance)} customers · ${formatPct(command.collectionPct)} collected`}
              />
              <FinanceProKpiCard
                label="POD blocked"
                value={formatFinanceInr(command.podBlockedValue)}
                sub={`${formatCount(command.podBlockedCount)} trips`}
                onPress={() =>
                  setSelection((s) => togglePipelineStageSelection(s, "pod_pending"))
                }
              />
              <FinanceProKpiCard
                label="Ready to bill"
                value={formatFinanceInr(command.readyValue)}
                sub={`${formatCount(command.readyCount)} trips`}
                onPress={() =>
                  setSelection((s) => togglePipelineStageSelection(s, "ready_to_invoice"))
                }
              />
              <FinanceProKpiCard
                label="Open trips"
                value={formatCount(command.openTripCount)}
                sub={`${formatFinanceInr(command.billed)} billed`}
              />
            </FinanceProKpiRow>

            <FinanceProInvestigation
              brief={brief}
              onClear={() => setSelection(clearCanvasSelection())}
              story={story}
            />

            <FinanceProAgeBoard
              totals={command.ageTotals}
              selected={selection.ageBucket}
              onSelect={(bucket) =>
                setSelection((s) => toggleAgeBucketSelection(s, bucket))
              }
            />

            <FinanceProWidgetRow columns="2-1">
              <FinanceProPanel
                title="Financial movement"
                kicker="Billed vs attributed receipts"
              >
                <FinanceProMonthStrip
                  months={command.vintage}
                  selectedKey={selection.vintageMonthKey}
                  onSelect={(key) => {
                    const month = command.vintage.find((v) => v.key === key);
                    if (!month) return;
                    setSelection((s) =>
                      toggleVintageMonthSelection(s, month.key, month.label),
                    );
                  }}
                />
                <View
                  onLayout={(e) => {
                    const w = Math.floor(e.nativeEvent.layout.width);
                    if (w > 0 && w !== trendWidth) setTrendWidth(w);
                  }}
                >
                  {trend.some((t) => t.revenue || t.expense) ? (
                    <TrendBarChart
                      data={trend}
                      width={Math.max(trendWidth, 240)}
                      primaryField="revenue"
                      secondaryField="expense"
                    />
                  ) : null}
                </View>
              </FinanceProPanel>
              <FinanceProPanel title="Needs attention" kicker="Largest open names">
                <FinanceProAttentionGrid
                  columns={1}
                  stories={attention.slice(0, 3).map((item) => ({
                    id: item.id,
                    badge: item.badge,
                    title: item.title,
                    amount: formatFinanceInr(item.amount),
                    facts: item.facts,
                  }))}
                  onPress={(id) => {
                    const item = attention.find((s) => s.id === id);
                    if (!item) return;
                    const row = item.clientId
                      ? command.model.clientRows.find((r) => r.id === item.clientId)
                      : null;
                    setSelection({
                      ...EMPTY_CANVAS_SELECTION,
                      clientId: row?.id ?? null,
                      clientName: row?.name ?? null,
                      pipelineStage: item.pipelineStage,
                    });
                  }}
                />
              </FinanceProPanel>
            </FinanceProWidgetRow>

            <FinanceProPanel title="Billing pipeline" kicker="Click a stage">
              <FinanceProPipelineFlow
                pipeline={command.pipeline}
                selected={selection.pipelineStage}
                onSelect={(id) =>
                  setSelection((s) => togglePipelineStageSelection(s, id))
                }
              />
              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <FinanceProQuietAction
                  label="Open Pulse Invoice"
                  onPress={() => router.push(FINANCE_PRO_LAUNCH.pulseInvoice(pathname))}
                />
                <FinanceProQuietAction
                  label="Open Pulse POD"
                  onPress={() => router.push(FINANCE_PRO_LAUNCH.pulsePod(pathname))}
                />
              </View>
            </FinanceProPanel>

            {showTrips ? (
              <FinanceProDataTable
                title="Evidence"
                searchPlaceholder="Search trips, customers…"
                columns={tripCols}
                rows={command.evidenceTrips}
                keyExtractor={(r) => r.tripId}
                onRowPress={(row) => router.push(ROUTES.financeProTrip(row.tripId))}
                empty="No trips in this investigation."
              />
            ) : (
              <FinanceProDataTable
                title="Evidence"
                searchPlaceholder="Search customers…"
                columns={clientCols}
                rows={command.evidenceClients}
                keyExtractor={(r) => r.id}
                onRowPress={(row) => {
                  setSelection((s) => toggleClientSelection(s, row.id, row.name));
                }}
                empty="No customers with open trip-linked exposure."
              />
            )}
          </FinanceProStack>
        );
      }}
    </FinanceProWorkspaceFrame>
  );
}
