export {
  getOcrMetrics,
  getOcrJobForPodAttachment,
  linkExpenseEntryOcrJob,
} from "@/features/ocr/services/ocrJob.service";
export {
  enqueueOcrJob,
  enqueueAndProcessOcrJob,
  processOcrJob,
  scheduleOcrJobProcessing,
  scheduleOcrRescan,
  loadPersistedOcrJob,
  loadPersistedOcrJobById,
  requestOcrRescan,
  odometerResultFromJob,
  expenseResultFromJob,
  OcrQuotaExceededError,
  shouldAutoApplyField,
  type EnqueueOcrJobResult,
  type OcrProgressPhase,
} from "@/features/ocr/services/ocrJobProcessor.service";
export { PulseScanEngine } from "@/features/ocr/services/pulseScanEngine.service";
export { checkOcrScanQuota, assertOcrScanQuota } from "@/features/ocr/services/ocrQuota.service";
export {
  persistVehicleOdometerEventFromJob,
  listVehicleOdometerEventsForTrip,
} from "@/features/ocr/services/vehicleOdometerEvent.service";
export type {
  OcrJobRow,
  OcrJobStatus,
  OcrMetricsSummary,
  EnqueueOcrJobInput,
  ExpenseOcrKind,
  VehicleOdometerEventRow,
} from "@/features/ocr/types/ocr.types";
export {
  OCR_ENGINE_VERSION,
  OCR_ENGINE_NAME,
  OCR_PROMPT_VERSION,
  OCR_CONFIDENCE_THRESHOLD,
  OCR_CONFIDENCE_AUTO_ACCEPT,
  OCR_CONFIDENCE_SUGGEST_MIN,
  engineVersionForSource,
  promptVersionForSource,
} from "@/features/ocr/constants/ocr.constants";
export {
  PULSE_SCAN_TYPES,
  PULSE_SCAN_ENGINE_VERSION,
  type PulseScanType,
} from "@/features/ocr/constants/pulseScanEngine.constants";
export { canRequestOcrRescan } from "@/features/ocr/utils/ocrRescan.util";
export {
  ocrReviewActionForConfidence,
  ocrReviewDecision,
  type OcrReviewAction,
} from "@/features/ocr/utils/ocrConfidenceReview.util";
