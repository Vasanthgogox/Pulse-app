import { pipelineStageById } from "./buildFinanceProModel";
import {
  canvasSelectionIsActive,
  filterModelByCanvas,
} from "./canvasContext.util";
import {
  buildAttentionStories,
  buildInvestigationBrief,
  intelligenceStoryLines,
  type AttentionStory,
  type InvestigationBrief,
} from "./investigation.util";
import type {
  CanvasSelection,
  ClientCollectionRow,
  FinanceProModel,
  TripFinancialFact,
} from "./financeProTypes";

/**
 * Command investigation projection. Other Finance Pro pages keep using
 * filterModelByCanvas directly. Does not mutate `base`.
 */
export function projectCommandModel(
  base: FinanceProModel,
  selection: CanvasSelection,
  now: Date = new Date(),
): FinanceProModel {
  if (!canvasSelectionIsActive(selection)) return base;

  const filtered = filterModelByCanvas(base, selection, now);
  const tripIds = new Set(filtered.tripFacts.map((t) => t.tripId));
  const issuedInvoiceDocuments = filtered.issuedInvoiceDocuments.filter((doc) =>
    doc.tripIds.some((id) => tripIds.has(id)),
  );

  return {
    ...filtered,
    issuedInvoiceDocuments,
    issuedThisMonthCount: 0,
    issuedThisMonthValue: 0,
    issuedLast30Count: 0,
    issuedLast30Value: 0,
    attention: [],
  };
}

export function commandStoryLines(
  model: FinanceProModel,
  selection: CanvasSelection,
): string[] {
  return intelligenceStoryLines(model, selection, model.outstanding);
}

export type CommandPresentation = {
  model: FinanceProModel;
  brief: InvestigationBrief;
  attention: AttentionStory[];
  story: string | null;
  outstanding: number;
  billed: number;
  collectionPct: number;
  clientsWithBalance: number;
  openTripCount: number;
  podBlockedValue: number;
  podBlockedCount: number;
  readyValue: number;
  readyCount: number;
  ageTotals: FinanceProModel["ageTotals"];
  pipeline: FinanceProModel["pipeline"];
  vintage: FinanceProModel["vintage"];
  evidenceClients: ClientCollectionRow[];
  evidenceTrips: TripFinancialFact[];
  showTripEvidence: boolean;
};

export function buildCommandPresentation(
  base: FinanceProModel,
  selection: CanvasSelection,
  now: Date = new Date(),
): CommandPresentation {
  const model = projectCommandModel(base, selection, now);
  const brief = buildInvestigationBrief(model, selection);
  const attention = buildAttentionStories(model);
  const storyLines = commandStoryLines(model, selection);
  const pod = pipelineStageById(model.pipeline, "pod_pending");
  const ready = pipelineStageById(model.pipeline, "ready_to_invoice");
  const showTripEvidence = canvasSelectionIsActive(selection);
  return {
    model,
    brief,
    attention,
    story: storyLines[0] ?? null,
    outstanding: model.outstanding,
    billed: model.billed,
    collectionPct: model.collectionPct,
    clientsWithBalance: model.clientsWithBalance,
    openTripCount: model.openTrips.length,
    podBlockedValue: pod.value,
    podBlockedCount: pod.count,
    readyValue: ready.value,
    readyCount: ready.count,
    ageTotals: model.ageTotals,
    pipeline: model.pipeline,
    vintage: model.vintage,
    evidenceClients: [...model.clientRows]
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding),
    evidenceTrips: model.openTrips.length ? model.openTrips : model.tripFacts,
    showTripEvidence,
  };
}
