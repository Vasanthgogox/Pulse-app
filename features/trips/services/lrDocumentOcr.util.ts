import type { OcrJobRow } from "@/features/ocr/types/ocr.types";

export type LrOcrFields = {
  lrNumber: string | null;
  lrDate: string | null;
};

function confidenceValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "object" && "value" in value) {
    return confidenceValue((value as { value: unknown }).value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function headerFromOcrPayload(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;

  const extraction = asRecord(root.extraction) ?? root;
  const nestedExtraction = asRecord(extraction.extraction) ?? extraction;
  const directHeader = asRecord(nestedExtraction.header);
  if (directHeader) return directHeader;

  const pods = nestedExtraction.pods;
  if (Array.isArray(pods) && pods.length > 0) {
    return asRecord(asRecord(pods[0])?.header);
  }
  return null;
}

export function parseLrFieldsFromOcrResult(
  resultJson: Record<string, unknown> | null | undefined,
): LrOcrFields {
  const header = headerFromOcrPayload(resultJson);
  return {
    lrNumber: confidenceValue(header?.lr_number),
    lrDate: confidenceValue(header?.date),
  };
}

export function parseLrFieldsFromOcrJob(job: Pick<OcrJobRow, "result_json"> | null): LrOcrFields {
  return parseLrFieldsFromOcrResult(job?.result_json ?? null);
}
