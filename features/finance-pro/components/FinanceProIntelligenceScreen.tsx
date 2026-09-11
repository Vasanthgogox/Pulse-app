import { ROUTES } from "@/lib/routes";
import {
  FinanceProAgeBoard,
  FinanceProDataTable,
  FinanceProMonthStrip,
  FinanceProPageHero,
  FinanceProPanel,
  FinanceProPipelineFlow,
  FinanceProPrimaryAction,
  FinanceProQuietAction,
  FinanceProSelectableBars,
  FinanceProStack,
  FinanceProWidgetRow,
  type FinanceProTableColumn,
} from "./FinanceProCanvas";
import { FinanceProInvestigation } from "./FinanceProInvestigation";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";
import { formatFinanceInr, formatPct } from "./financeProFormat";
import {
  EMPTY_CANVAS_SELECTION,
  type CanvasSelection,
  type TripFinancialFact,
} from "../model/financeProTypes";
import {
  clearCanvasSelection,
  filterModelByCanvas,
  toggleAgeBucketSelection,
  toggleClientSelection,
  togglePipelineStageSelection,
  toggleVintageMonthSelection,
} from "../model/canvasContext.util";
import {
  buildInvestigationBrief,
  intelligenceStoryLines,
} from "../model/investigation.util";
import { TrendBarChart, type TrendPoint } from "@/components/analytics";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import Theme from "@/constants/Theme";

export function FinanceProIntelligenceScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const [selection, setSelection] = useState<CanvasSelection>(EMPTY_CANVAS_SELECTION);
  const [trendWidth, setTrendWidth] = useState(420);

  return (
    <FinanceProWorkspaceFrame title="Intelligence" hideTitle>
      {(base) => {
        const model = filterModelByCanvas(base, selection);
        const brief = buildInvestigationBrief(model, selection);
        const story = intelligenceStoryLines(model, selection, base.outstanding);
        const customerItems = [...model.clientRows]
          .filter((r) => r.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding)
          .slice(0, 12)
          .map((r) => ({
            id: r.id,
            label: r.name,
            value: r.outstanding,
            caption: formatPct(r.shareOfOutstanding),
          }));
        const trend: TrendPoint[] = model.vintage.map((v) => ({
          label: v.label,
          revenue: v.billed,
          expense: v.attributedReceipts,
          profit: v.outstanding,
          margin: 0,
          tripCount: v.tripCount,
        }));
        const tripCols: FinanceProTableColumn<TripFinancialFact>[] = [
          { key: "t", label: "Trip", flex: 1, minWidth: 110, render: (r) => r.tripLabel },
          { key: "c", label: "Customer", flex: 1.2, minWidth: 120, render: (r) => r.clientName },
          {
            key: "v",
            label: "Value",
            flex: 0.9,
            minWidth: 96,
            align: "right",
            render: (r) => formatFinanceInr(r.sales),
          },
          {
            key: "open",
            label: "Open",
            flex: 0.9,
            minWidth: 96,
            align: "right",
            render: (r) => formatFinanceInr(r.remainingDue),
          },
          {
            key: "age",
            label: "Age",
            flex: 0.6,
            minWidth: 64,
            align: "right",
            render: (r) => (r.daysOld == null ? "—" : `${r.daysOld}d`),
          },
          {
            key: "p",
            label: "POD",
            flex: 0.7,
            minWidth: 80,
            render: (r) => (r.podReceived ? "Received" : "Pending"),
          },
          {
            key: "i",
            label: "Invoice",
            flex: 0.8,
            minWidth: 88,
            render: (r) => (r.invoiced ? "Issued" : "Not billed"),
          },
        ];
        const selectedClient = selection.clientId
          ? base.clientRows.find((r) => r.id === selection.clientId)
          : null;

        return (
          <FinanceProStack>
            <FinanceProPageHero
              eyebrow="Intelligence"
              value={formatFinanceInr(model.outstanding)}
              caption="Click a customer, age band, stage, or month. Compatible views update from loaded data."
            />

            {story.length ? (
              <FinanceProPanel title="Story">
                {story.map((line) => (
                  <Text
                    key={line}
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: Theme.textPrimary,
                      marginTop: 6,
                      lineHeight: 20,
                    }}
                  >
                    {line}
                  </Text>
                ))}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                  {selectedClient && !selectedClient.isLedgerOnly ? (
                    <FinanceProPrimaryAction
                      label="Open Client 360"
                      onPress={() =>
                        router.push(ROUTES.financeProClient(selectedClient.id))
                      }
                    />
                  ) : null}
                  {model.openTrips[0] ? (
                    <FinanceProQuietAction
                      label="Open relevant trips"
                      onPress={() =>
                        router.push(ROUTES.financeProTrip(model.openTrips[0]!.tripId))
                      }
                    />
                  ) : null}
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
            ) : null}

            <FinanceProWidgetRow columns="1-1">
              <FinanceProPanel title="Exposure by customer">
                <FinanceProSelectableBars
                  items={customerItems}
                  selectedId={selection.clientId}
                  onSelect={(id) => {
                    const row = base.clientRows.find((r) => r.id === id);
                    if (!row) return;
                    setSelection((s) => toggleClientSelection(s, row.id, row.name));
                  }}
                />
              </FinanceProPanel>
              <FinanceProPanel title="Age distribution">
                <FinanceProAgeBoard
                  totals={model.ageTotals}
                  selected={selection.ageBucket}
                  onSelect={(bucket) =>
                    setSelection((s) => toggleAgeBucketSelection(s, bucket))
                  }
                />
              </FinanceProPanel>
            </FinanceProWidgetRow>

            <FinanceProPanel title="Billing pipeline">
              <FinanceProPipelineFlow
                pipeline={model.pipeline}
                selected={selection.pipelineStage}
                onSelect={(id) =>
                  setSelection((s) => togglePipelineStageSelection(s, id))
                }
              />
            </FinanceProPanel>

            <FinanceProPanel title="Financial movement" kicker="Pickup month">
                <FinanceProMonthStrip
                  months={model.vintage}
                  selectedKey={selection.vintageMonthKey}
                  onSelect={(key) => {
                    const month = model.vintage.find((v) => v.key === key);
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
                  ) : (
                    <Text style={{ fontSize: 13, color: "#78829D" }}>
                      No vintage points in this context.
                    </Text>
                  )}
                </View>
              </FinanceProPanel>

            <FinanceProDataTable
              title="Contributing trips"
              searchPlaceholder="Search trips…"
              context={
                brief.active ? (
                  <FinanceProInvestigation
                    brief={brief}
                    onClear={() => setSelection(clearCanvasSelection())}
                  />
                ) : undefined
              }
              columns={tripCols}
              rows={model.openTrips.length ? model.openTrips : model.tripFacts}
              keyExtractor={(r) => r.tripId}
              onRowPress={(row) => router.push(ROUTES.financeProTrip(row.tripId))}
              empty="No trips in this investigation."
            />
          </FinanceProStack>
        );
      }}
    </FinanceProWorkspaceFrame>
  );
}
