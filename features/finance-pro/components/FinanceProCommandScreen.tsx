import { ROUTES } from "@/lib/routes";
import Theme from "@/constants/Theme";
import {
  FinanceProAgeHighlights,
  FinanceProAttentionGrid,
  FinanceProChartLegend,
  FinanceProDataTable,
  FinanceProHeroStat,
  FinanceProMiniKpi,
  FinanceProMiniKpiGrid,
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
  formatFinanceChip,
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
import { TrendLineChart, type TrendPoint } from "@/components/analytics";
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
          customerCount: v.customerCount,
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
            <FinanceProInvestigation
              brief={brief}
              onClear={() => setSelection(clearCanvasSelection())}
              story={story}
            />

            <FinanceProWidgetRow columns="1-2">
              <FinanceProMiniKpiGrid>
                <FinanceProMiniKpi
                  label="POD blocked"
                  value={formatFinanceChip(command.podBlockedValue)}
                  sub={`${formatCount(command.podBlockedCount)} trips waiting`}
                  onPress={() =>
                    setSelection((s) => togglePipelineStageSelection(s, "pod_pending"))
                  }
                />
                <FinanceProMiniKpi
                  label="Ready to bill"
                  value={formatFinanceChip(command.readyValue)}
                  sub={`${formatCount(command.readyCount)} trips ready`}
                  onPress={() =>
                    setSelection((s) =>
                      togglePipelineStageSelection(s, "ready_to_invoice"),
                    )
                  }
                />
                <FinanceProMiniKpi
                  label="Open trips"
                  value={formatCount(command.openTripCount)}
                  sub={`${formatFinanceChip(command.billed)} billed`}
                />
                <FinanceProMiniKpi
                  label="60+ days"
                  value={formatFinanceChip(command.ageTotals.d60)}
                  sub="Oldest aging bucket"
                  onPress={() =>
                    setSelection((s) => toggleAgeBucketSelection(s, "d60"))
                  }
                />
              </FinanceProMiniKpiGrid>
              <FinanceProHeroStat
                label="Outstanding"
                value={formatFinanceInr(command.outstanding)}
                badge={`${formatPct(command.collectionPct)} collected`}
                caption={`${formatCount(command.clientsWithBalance)} customers with open trip-linked exposure.`}
                progressPct={command.collectionPct}
                metrics={[
                  {
                    label: "Billed",
                    value: formatFinanceInr(command.billed),
                  },
                  {
                    label: "Collected",
                    value: formatFinanceInr(command.model.attributedReceipts),
                  },
                  {
                    label: "Customers",
                    value: formatCount(command.clientsWithBalance),
                  },
                ]}
              />
            </FinanceProWidgetRow>

            <FinanceProWidgetRow columns="1-2">
              <FinanceProAgeHighlights
                totals={command.ageTotals}
                selected={selection.ageBucket}
                onSelect={(bucket) =>
                  setSelection((s) => toggleAgeBucketSelection(s, bucket))
                }
              />
              <FinanceProPanel
                title="Financial movement"
                kicker="Click a point for billed, receipts, and trips"
                action={
                  <FinanceProChartLegend
                    items={[{ label: "Billed", color: Theme.chartSeries5 }]}
                  />
                }
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
                  <TrendLineChart
                    data={trend}
                    width={Math.max(trendWidth, 240)}
                    height={236}
                    field="revenue"
                    color={Theme.chartSeries5}
                    gradientId="commandBilledGrad"
                    interactive
                    detailRows={(point) => [
                      {
                        label: "Billed",
                        value: formatFinanceInr(point.revenue),
                      },
                      {
                        label: "Receipts",
                        value: formatFinanceInr(point.expense),
                      },
                      {
                        label: "Outstanding",
                        value: formatFinanceInr(point.profit),
                      },
                      {
                        label: "Trips",
                        value: formatCount(point.tripCount),
                      },
                      {
                        label: "Customers",
                        value: formatCount(point.customerCount ?? 0),
                      },
                    ]}
                  />
                </View>
              </FinanceProPanel>
            </FinanceProWidgetRow>

            <FinanceProPanel
              title="Needs attention"
              kicker="Customers and stages that need a next action"
            >
              <FinanceProAttentionGrid
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

            <FinanceProPanel
              title="Billing pipeline"
              kicker="Value sitting in each billing stage"
              action={
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  <FinanceProQuietAction
                    label="Open Pulse Invoice"
                    onPress={() =>
                      router.push(FINANCE_PRO_LAUNCH.pulseInvoice(pathname))
                    }
                  />
                  <FinanceProQuietAction
                    label="Open Pulse POD"
                    onPress={() => router.push(FINANCE_PRO_LAUNCH.pulsePod(pathname))}
                  />
                </View>
              }
            >
              <FinanceProPipelineFlow
                pipeline={command.pipeline}
                selected={selection.pipelineStage}
                onSelect={(id) =>
                  setSelection((s) => togglePipelineStageSelection(s, id))
                }
              />
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
