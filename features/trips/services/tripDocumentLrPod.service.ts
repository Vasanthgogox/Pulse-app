/**
 * Batch LR/POD index from trip_documents — replaces retired trip_lrs reads.
 * One IN query (chunked), mapped in memory. No compatibility table/view.
 */
import { supabase } from "@/lib/supabase";
import { expandLR } from "@/lib/utils/lr";
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";

const TRIP_ID_CHUNK = 200;

export type TripDocumentLrPodRow = {
  trip_id: string;
  document_type: string;
  document_number?: string | null;
};

export type TripLrPodIndex = {
  lrNumbers: string[];
  hasPodDocument: boolean;
};

function lrNumberFromDocument(documentNumber: string | null | undefined): string[] {
  const parsed = parseLrFieldValues(documentNumber).lrNumber;
  return parsed ? expandLR(parsed) : [];
}

export function indexLrPodDocuments(
  rows: TripDocumentLrPodRow[],
): Map<string, TripLrPodIndex> {
  const byTrip = new Map<string, TripLrPodIndex>();
  for (const row of rows) {
    const tripId = String(row.trip_id ?? "").trim();
    if (!tripId) continue;
    const current = byTrip.get(tripId) ?? {
      lrNumbers: [],
      hasPodDocument: false,
    };
    const type = String(row.document_type ?? "").toLowerCase();
    if (type === "lr") {
      current.lrNumbers.push(...lrNumberFromDocument(row.document_number));
    } else if (type === "pod") {
      current.hasPodDocument = true;
    }
    byTrip.set(tripId, current);
  }
  for (const index of byTrip.values()) {
    index.lrNumbers = Array.from(new Set(index.lrNumbers.filter(Boolean)));
  }
  return byTrip;
}

export function tripPodIsReceived(trip: {
  pod_received_at?: string | null;
  pod_status?: unknown;
}): boolean {
  if (trip.pod_received_at) return true;
  return String(trip.pod_status ?? "").toLowerCase() === "received";
}

export function receivedLrNumbersForTrip(
  lrNumbers: string[],
  opts: { tripReceived: boolean; hasPodDocument: boolean },
): string[] {
  if (opts.tripReceived || opts.hasPodDocument) {
    return [...lrNumbers];
  }
  return [];
}

function chunkIds(ids: string[]): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += TRIP_ID_CHUNK) {
    chunks.push(unique.slice(i, i + TRIP_ID_CHUNK));
  }
  return chunks;
}

/** One bulk read of LR + POD metadata for many trips. */
export async function loadLrPodIndexByTripIds(
  tripIds: string[],
): Promise<Map<string, TripLrPodIndex>> {
  const chunks = chunkIds(tripIds);
  if (chunks.length === 0) return new Map();

  const rows: TripDocumentLrPodRow[] = [];
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase()
        .from("trip_documents")
        .select("trip_id, document_type, document_number")
        .in("trip_id", chunk)
        .in("document_type", ["lr", "pod"]);
      if (error) {
        console.warn("[tripDocumentLrPod] trip_documents fetch:", error.message);
        return [] as TripDocumentLrPodRow[];
      }
      return (data ?? []) as TripDocumentLrPodRow[];
    }),
  );
  for (const part of results) rows.push(...part);
  return indexLrPodDocuments(rows);
}
