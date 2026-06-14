import { canRequestOcrRescan } from "@/features/ocr/utils/ocrRescan.util";
import { OCR_ENGINE_VERSION } from "@/features/ocr/constants/ocr.constants";
import type { OcrJobRow } from "@/features/ocr/types/ocr.types";

function completedJob(confidence: number | null, engineVersion: string): OcrJobRow {
  return {
    id: "job-1",
    organization_id: "org-1",
    document_fingerprint: "abc",
    source_kind: "odometer",
    source_subtype: "start",
    trip_id: null,
    trip_document_id: null,
    pod_attachment_id: null,
    storage_path: null,
    status: "completed",
    engine_name: "pulse-scan-engine",
    engine_version: engineVersion,
    prompt_version: "odometer-prompt-v1",
    ocr_model: "gemini",
    confidence_score: confidence,
    result_json: {},
    raw_model_json: null,
    error_message: null,
    is_duplicate: false,
    duplicate_of_job_id: null,
    force_rescan: false,
    processing_started_at: null,
    processing_completed_at: null,
    processing_duration_ms: 1000,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("canRequestOcrRescan", () => {
  it("allows explicit user rescan", () => {
    expect(
      canRequestOcrRescan(completedJob(0.9, OCR_ENGINE_VERSION.odometer), {
        userRequested: true,
        currentEngineVersion: OCR_ENGINE_VERSION.odometer,
      }),
    ).toBe(true);
  });

  it("allows rescan when confidence is below threshold", () => {
    expect(
      canRequestOcrRescan(completedJob(0.4, OCR_ENGINE_VERSION.odometer), {
        userRequested: false,
        currentEngineVersion: OCR_ENGINE_VERSION.odometer,
      }),
    ).toBe(true);
  });

  it("allows rescan when engine version changed", () => {
    expect(
      canRequestOcrRescan(completedJob(0.9, "odometer-v0"), {
        userRequested: false,
        currentEngineVersion: OCR_ENGINE_VERSION.odometer,
      }),
    ).toBe(true);
  });

  it("blocks rescan for high-confidence completed job", () => {
    expect(
      canRequestOcrRescan(completedJob(0.9, OCR_ENGINE_VERSION.odometer), {
        userRequested: false,
        currentEngineVersion: OCR_ENGINE_VERSION.odometer,
      }),
    ).toBe(false);
  });
});
