import {
  EMPTY_CANVAS_SELECTION,
  OBLIGATION_AGE_LABELS,
  PIPELINE_STAGE_LABELS,
  type CanvasSelection,
  type ClientCollectionRow,
  type FinanceProModel,
  type ObligationAgeBucket,
  type OpenTripObligation,
  type PipelineStageId,
} from "./financeProTypes";
import { ratioPct } from "./collectionMath.util";
import { emptyAgeMix } from "./obligationAge.util";
import { aggregatePipelineFromFacts } from "./pipelineAggregation.util";
import { buildVintageTrend, pickupMonthKey } from "./vintageTrend.util";

export function toggleClientSelection(
  current: CanvasSelection,
  clientId: string,
  clientName: string,
): CanvasSelection {
  if (current.clientId === clientId) {
    return { ...current, clientId: null, clientName: null };
  }
  return { ...current, clientId, clientName };
}

export function toggleAgeBucketSelection(
  current: CanvasSelection,
  ageBucket: ObligationAgeBucket,
): CanvasSelection {
  if (current.ageBucket === ageBucket) {
    return { ...current, ageBucket: null };
  }
  return { ...current, ageBucket };
}

export function togglePipelineStageSelection(
  current: CanvasSelection,
  pipelineStage: PipelineStageId,
): CanvasSelection {
  if (current.pipelineStage === pipelineStage) {
    return { ...current, pipelineStage: null };
  }
  return { ...current, pipelineStage };
}

export function toggleVintageMonthSelection(
  current: CanvasSelection,
  vintageMonthKey: string,
  vintageMonthLabel: string,
): CanvasSelection {
  if (current.vintageMonthKey === vintageMonthKey) {
    return { ...current, vintageMonthKey: null, vintageMonthLabel: null };
  }
  return { ...current, vintageMonthKey, vintageMonthLabel };
}

export function clearCanvasSelection(): CanvasSelection {
  return { ...EMPTY_CANVAS_SELECTION };
}

export function formatCanvasContextLabel(selection: CanvasSelection): string | null {
  const parts: string[] = [];
  if (selection.clientName) parts.push(selection.clientName);
  if (selection.ageBucket) {
    const label = OBLIGATION_AGE_LABELS[selection.ageBucket];
    parts.push(selection.ageBucket === "current" ? label : `${label} days`);
  }
  if (selection.pipelineStage) {
    parts.push(PIPELINE_STAGE_LABELS[selection.pipelineStage]);
  }
  if (selection.vintageMonthLabel) parts.push(selection.vintageMonthLabel);
  return parts.length ? parts.join(" · ") : null;
}

export function canvasSelectionIsActive(selection: CanvasSelection): boolean {
  return Boolean(
    selection.clientId ||
      selection.ageBucket ||
      selection.pipelineStage ||
      selection.vintageMonthKey,
  );
}

export function tripMatchesPipelineStage(
  trip: OpenTripObligation,
  stage: PipelineStageId,
): boolean {
  if (stage === "completed") return trip.completed;
  if (stage === "pod_pending") {
    return trip.completed && !trip.podReceived && !trip.invoiced;
  }
  if (stage === "pod_received_not_invoiced" || stage === "ready_to_invoice") {
    return trip.completed && trip.podReceived && !trip.invoiced;
  }
  if (stage === "invoiced") return trip.invoiced;
  if (stage === "cash_attributed") return trip.sales > trip.remainingDue;
  return true;
}

function tripMatchesSelection(
  trip: OpenTripObligation,
  selection: CanvasSelection,
): boolean {
  if (selection.clientId && trip.clientId !== selection.clientId) return false;
  if (selection.ageBucket && trip.ageBucket !== selection.ageBucket) return false;
  if (
    selection.pipelineStage &&
    !tripMatchesPipelineStage(trip, selection.pipelineStage)
  ) {
    return false;
  }
  if (selection.vintageMonthKey) {
    if (pickupMonthKey(trip.pickupDate) !== selection.vintageMonthKey) return false;
  }
  return true;
}

function factMatchesSelection(
  trip: OpenTripObligation,
  selection: CanvasSelection,
): boolean {
  if (selection.clientId && trip.clientId !== selection.clientId) return false;
  if (selection.ageBucket) {
    if (!(trip.remainingDue > 0 && trip.ageBucket === selection.ageBucket)) {
      return false;
    }
  }
  if (
    selection.pipelineStage &&
    !tripMatchesPipelineStage(trip, selection.pipelineStage)
  ) {
    return false;
  }
  if (selection.vintageMonthKey) {
    if (pickupMonthKey(trip.pickupDate) !== selection.vintageMonthKey) return false;
  }
  return true;
}

export function filterModelByCanvas(
  model: FinanceProModel,
  selection: CanvasSelection,
  now: Date = new Date(),
): FinanceProModel {
  const hasClient = Boolean(selection.clientId);
  const hasBucket = Boolean(selection.ageBucket);
  const hasStage = Boolean(selection.pipelineStage);
  const hasMonth = Boolean(selection.vintageMonthKey);
  if (!hasClient && !hasBucket && !hasStage && !hasMonth) return model;

  const tripFacts = model.tripFacts.filter((t) =>
    factMatchesSelection(t, selection),
  );
  const openTrips = model.openTrips.filter((t) =>
    tripMatchesSelection(t, selection),
  );

  const remainingByClient = new Map<string, number>();
  const openCountByClient = new Map<string, number>();
  const billedByClient = new Map<string, number>();
  const receiptsByClient = new Map<string, number>();
  const ageMixByClient = new Map<string, Record<ObligationAgeBucket, number>>();
  const ageTotals = emptyAgeMix();
  let unagedOutstanding = 0;
  let outstanding = 0;
  let billed = 0;
  let attributedReceipts = 0;

  for (const trip of tripFacts) {
    const sliceBilled = trip.sales;
    const sliceReceipts = Math.max(0, trip.sales - trip.remainingDue);
    billed += sliceBilled;
    attributedReceipts += sliceReceipts;
    billedByClient.set(
      trip.clientId,
      (billedByClient.get(trip.clientId) ?? 0) + sliceBilled,
    );
    receiptsByClient.set(
      trip.clientId,
      (receiptsByClient.get(trip.clientId) ?? 0) + sliceReceipts,
    );
  }

  for (const trip of openTrips) {
    outstanding += trip.remainingDue;
    if (trip.ageBucket) {
      ageTotals[trip.ageBucket] += trip.remainingDue;
    } else {
      unagedOutstanding += trip.remainingDue;
    }
    remainingByClient.set(
      trip.clientId,
      (remainingByClient.get(trip.clientId) ?? 0) + trip.remainingDue,
    );
    openCountByClient.set(
      trip.clientId,
      (openCountByClient.get(trip.clientId) ?? 0) + 1,
    );
    const mix = ageMixByClient.get(trip.clientId) ?? emptyAgeMix();
    if (trip.ageBucket) mix[trip.ageBucket] += trip.remainingDue;
    ageMixByClient.set(trip.clientId, mix);
  }

  const sourceRows = hasClient
    ? model.clientRows.filter((r) => r.id === selection.clientId)
    : model.clientRows;

  const clientRows: ClientCollectionRow[] = sourceRows.map((row) => {
    const nextOutstanding = remainingByClient.get(row.id) ?? 0;
    const mix = ageMixByClient.get(row.id) ?? emptyAgeMix();
    const oldest = openTrips
      .filter((t) => t.clientId === row.id && t.daysOld != null)
      .reduce<number | null>(
        (acc, t) =>
          acc == null ? t.daysOld : Math.max(acc, t.daysOld as number),
        null,
      );
    return {
      ...row,
      billed: billedByClient.get(row.id) ?? 0,
      attributedReceipts: receiptsByClient.get(row.id) ?? 0,
      outstanding: nextOutstanding,
      openTrips: openCountByClient.get(row.id) ?? 0,
      oldestObligationDays: oldest,
      ageMix: mix,
      shareOfOutstanding: 0,
    };
  });

  const collectionPct = ratioPct(attributedReceipts, billed);

  for (const row of clientRows) {
    row.shareOfOutstanding = ratioPct(row.outstanding, outstanding);
  }

  const pipeline = aggregatePipelineFromFacts(
    tripFacts,
    attributedReceipts,
    clientRows,
  );
  const vintage = buildVintageTrend(tripFacts, now);

  return {
    ...model,
    billed,
    attributedReceipts,
    outstanding,
    collectionPct,
    clientsWithBalance: clientRows.filter((r) => r.outstanding > 0).length,
    clientRows,
    tripFacts,
    openTrips,
    ageTotals,
    unagedOutstanding,
    pipeline,
    vintage,
    concentration: [...clientRows]
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5),
  };
}
