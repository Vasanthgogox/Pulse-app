export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'approved' | 'rejected' | 'error' | 'cancelled';

export interface ConfidenceField<T = string> {
  value: T;
  confidence: number;
}

/** Header section (AG1897-style POD) */
export interface PODHeader {
  /** Raw value from OCR (e.g. "AG 1897", "AG1897"). Use for display. */
  /** Identity key: digits-only of lr_number. Backend sets this; use for grouping/APIs/ledger. */
  pod_number_canonical?: string;
  date?: ConfidenceField;
  lr_number?: ConfidenceField;
  invoice_number?: ConfidenceField;
  original_gir_no?: ConfidenceField;
  gir_number?: ConfidenceField;
  arrival_date_time?: ConfidenceField;
  unload_start_date_time?: ConfidenceField;
  unload_end_date_time?: ConfidenceField;
  release_date_time?: ConfidenceField;
  eway_bill_number?: ConfidenceField;
  loading_in_time?: ConfidenceField;
  loading_out_time?: ConfidenceField;
  unloading_in_time?: ConfidenceField;
  unloading_out_time?: ConfidenceField;
}

/** Transport section — not used; kept for backward compat with existing data only. */
export interface PODTransport {
  [key: string]: ConfidenceField | ConfidenceField<number> | undefined;
}

/** Company / parties */
export interface PODParties {
  consignor_name_address?: ConfidenceField;
  consignee_name_address?: ConfidenceField;
  gstin?: ConfidenceField;
  pan?: ConfidenceField;
  gst_paid_by?: ConfidenceField;
}

/** Financial section */
export interface PODFinancials {
  unloading_charges?: ConfidenceField<number>;
  loading_charges?: ConfidenceField<number>;
  shortage_amount?: ConfidenceField<number>;
  damage_amount?: ConfidenceField<number>;
  leakage_amount?: ConfidenceField<number>;
  total_amount?: ConfidenceField<number>;
  loading_cost?: ConfidenceField<number>;
  unloading_cost?: ConfidenceField<number>;
  damage_cost?: ConfidenceField<number>;
  shortage_cost?: ConfidenceField<number>;
  debit_reason_code?: ConfidenceField;
  debit_type?: ConfidenceField;
}

/** One row of damage/shortage/spillage table (unit type: case, box, pallet, container, skid) */
export interface DamageShortageRow {
  unit_type?: string;
  quantity?: number;
  shortage_count?: number;
  spillage_count?: number;
  damage_count?: number;
  damage_cost?: number;
}

/** Inspection / condition */
export interface PODInspection {
  goods_inspection_report?: ConfidenceField;
  bpil_copy_data?: ConfidenceField;
  lscr_copy_data?: ConfidenceField;
  damaged_cases?: number;
  short_cases?: number;
  excess_cases?: number;
  /** When document has a damage/shortage table by unit type */
  damage_shortage_rows?: DamageShortageRow[];
  actual_vs_standard_time?: ConfidenceField;
  tolerance_hours?: ConfidenceField<number>;
}

/** Line item (material / SKU row) */
export interface LineItem {
  description: string;
  quantity: number;
  units?: number;
  cases?: number;
  amount: number;
  rate?: number;
  confidence: number;
}

/** Production extraction schema (AG1897 / GOGOX style) */
export interface PODExtraction {
  header?: PODHeader;
  transport?: PODTransport;
  parties?: PODParties;
  financials?: PODFinancials;
  inspection?: PODInspection;
  line_items: LineItem[];
  /** Set when document total vs sum(charges) mismatch > threshold */
  validationError?: string;
}

/** Legacy flat shape (for backward compatibility with persisted data) */
export interface PODExtractionLegacy {
  pod_date?: ConfidenceField;
  lr_number?: ConfidenceField;
  invoice_reference?: ConfidenceField;
  unloading_charges?: ConfidenceField<number>;
  unloading_debit?: ConfidenceField<number>;
  detention_charges?: ConfidenceField<number>;
  debits?: { type: string; amount: number; confidence: number }[];
  line_items: LineItem[];
  total_amount?: ConfidenceField<number>;
}

export function isLegacyExtraction(e: PODExtraction | PODExtractionLegacy): e is PODExtractionLegacy {
  return e != null && 'pod_date' in e && !('header' in e);
}

/** Trip-level shared metadata (one truck, one from/to, same times). Used when OCR returns trip + pods. */
export interface TripExtraction {
  transport?: PODTransport;
  parties?: PODParties;
  /** Loading in = gate arrival; loading out = release. */
  arrival_date_time?: ConfidenceField;
  release_date_time?: ConfidenceField;
  unload_start_date_time?: ConfidenceField;
  unload_end_date_time?: ConfidenceField;
}

/** Per-POD data only (no transport/parties/timing when trip exists). Backend merges trip into each to get full PODExtraction. */
export interface PodOnlyExtraction {
  header?: Pick<PODHeader, 'lr_number' | 'date' | 'invoice_number' | 'gir_number' | 'eway_bill_number'>;
  financials?: PODFinancials;
  inspection?: PODInspection;
  line_items: LineItem[];
}

/** OCR can return trip + pods (enterprise pattern). Backend expands to MultiPODExtraction by merging trip into each pod. */
export interface TripPodsExtraction {
  trip?: TripExtraction;
  pods: PodOnlyExtraction[];
}

/** Multi-POD response from OCR when one file contains multiple PODs (e.g. AG1315, AG1316, AG1317). */
export interface MultiPODExtraction {
  pods: (PODExtraction | PODExtractionLegacy)[];
  /** Set when extraction was from trip+pods and backend detected mismatch (e.g. different truck across PODs). */
  consolidationWarning?: string;
  /** Set when backend detects structural issues: duplicate POD IDs merged, or 3+ PODs on single truck. */
  segmentationWarning?: string;
}

export function isMultiPODExtraction(
  e: PODExtraction | PODExtractionLegacy | MultiPODExtraction | undefined
): e is MultiPODExtraction {
  return e != null && typeof e === 'object' && 'pods' in e && Array.isArray((e as MultiPODExtraction).pods);
}

/** Return a flat array of extractions (one per POD). Handles single extraction, legacy, and multi-POD shape. */
export function getExtractionsList(
  extraction: PODExtraction | PODExtractionLegacy | MultiPODExtraction | undefined
): (PODExtraction | PODExtractionLegacy)[] {
  if (!extraction) return [];
  if (isMultiPODExtraction(extraction)) return extraction.pods;
  return [extraction];
}

export interface PODDocument {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: DocumentStatus;
  uploadedAt: Date;
  processedAt?: Date;
  extraction?: PODExtraction | PODExtractionLegacy | MultiPODExtraction;
  previewUrl?: string;
  model?: string;
  processingTime?: number;
  /** Reason for failure when status is 'error' (e.g. from OCR API) */
  errorMessage?: string;
  /** In-memory only: original file for API OCR (not persisted) */
  file?: File;
}

export type ExportFormat = 'csv' | 'json' | 'pdf';
