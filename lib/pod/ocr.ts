import { GoogleGenAI, type Content } from '@google/genai';
import { BASE_OCR_PROMPT, buildUserPrompt } from './prompts';
import type { PODExtraction } from '@/types/pod';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const TIMEOUT_MS = 60_000;
const VALIDATION_MISMATCH_PERCENT = 1;

// We use the absolute fastest available model natively provided by Gemini
const MODELS = {
  default: 'gemini-2.5-flash',
  fallback: 'gemini-2.5-flash-lite',
};

export interface OCROutput {
  extraction: PODExtraction;
  model: string;
  processingTime: number;
}

let genAIClient: GoogleGenAI | null = null;
function getGenAIClient() {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env.');
  }
  if (!genAIClient) genAIClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return genAIClient;
}

function timeoutPromise(ms: number) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), ms));
}

function parseExtractionJson(text: string) {
  let raw = text.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON from OCR: ${msg}`);
  }
}

function num(v: any): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
  if (v != null && typeof v === 'object' && 'value' in v) return num(v.value);
  return 0;
}

function str(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'value' in v) return String(v.value ?? '');
  return String(v);
}

function digitsOnly(podNumber: any): string {
  if (podNumber == null) return '';
  const s = String(str(podNumber)).trim();
  const digits = s.replace(/\D/g, '');
  return digits || '';
}

function unwrapScalar(v: any) {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'value' in v) return v.value;
  return v;
}

function cf(value: any, confidence: any, isNum = false) {
  return {
    value: isNum ? num(value) : (value == null ? '' : String(value)),
    confidence: Number(confidence) || 0.9,
  };
}

const HEADER_KEYS = ['date', 'lr_number', 'invoice_number', 'original_gir_no', 'gir_number', 'arrival_date_time', 'unload_start_date_time', 'unload_end_date_time', 'release_date_time', 'eway_bill_number', 'loading_in_time', 'loading_out_time', 'unloading_in_time', 'unloading_out_time'];
const TRANSPORT_KEYS: string[] = [];
const PARTIES_KEYS = ['consignor_name_address', 'consignee_name_address', 'gstin', 'pan', 'gst_paid_by'];
const FINANCIALS_KEYS = ['unloading_charges', 'loading_charges', 'shortage_amount', 'damage_amount', 'leakage_amount', 'total_amount', 'debit_reason_code', 'debit_type', 'loading_cost', 'unloading_cost', 'damage_cost', 'shortage_cost'];
const FINANCIALS_NUMERIC = new Set(['unloading_charges', 'loading_charges', 'shortage_amount', 'damage_amount', 'leakage_amount', 'total_amount', 'loading_cost', 'unloading_cost', 'damage_cost', 'shortage_cost']);

function section(obj: any, keys: string[], numericKeys = new Set()) {
  if (!obj || typeof obj !== 'object') return {};
  const out: any = {};
  for (const k of keys) {
    if (obj[k] == null) continue;
    const v = obj[k];
    if (typeof v === 'object' && v !== null && 'value' in v) {
      out[k] = cf(v.value, v.confidence, numericKeys.has(k));
    } else {
      out[k] = cf(v, 0.9, numericKeys.has(k));
    }
  }
  return out;
}

function ensureLrNumberFromPodNumber(header: any, rawHeader: any) {
  if (!header || !rawHeader) return;
  const lrVal = header.lr_number?.value;
  const hasLr = lrVal != null && String(lrVal).trim() !== '';
  if (hasLr) return;
  const podVal = rawHeader.pod_number;
  const v = podVal && typeof podVal === 'object' && 'value' in podVal ? podVal.value : podVal;
  if (v != null && String(v).trim() !== '') {
    header.lr_number = cf(v, (podVal && typeof podVal === 'object' && podVal.confidence != null) ? podVal.confidence : 0.9);
  }
}

function normalizeExtraction(obj: any) {
  const hasNested = obj && (obj.header != null || obj.financials != null);
  if (hasNested) {
    const inspectionRaw = obj.inspection || {};
    const inspection: any = {
      damaged_cases: num(unwrapScalar(inspectionRaw.damaged_cases)),
      short_cases: num(unwrapScalar(inspectionRaw.short_cases)),
      excess_cases: num(unwrapScalar(inspectionRaw.excess_cases)),
      goods_inspection_report: typeof inspectionRaw.goods_inspection_report === 'object' ? inspectionRaw.goods_inspection_report : cf(inspectionRaw.goods_inspection_report, 0.9),
      actual_vs_standard_time: typeof inspectionRaw.actual_vs_standard_time === 'object' ? inspectionRaw.actual_vs_standard_time : cf(inspectionRaw.actual_vs_standard_time, 0.9),
      tolerance_hours: typeof inspectionRaw.tolerance_hours === 'object' ? inspectionRaw.tolerance_hours : cf(inspectionRaw.tolerance_hours, 0.9, true),
      bpil_copy_data: typeof inspectionRaw.bpil_copy_data === 'object' ? inspectionRaw.bpil_copy_data : cf(inspectionRaw.bpil_copy_data, 0.9),
      lscr_copy_data: typeof inspectionRaw.lscr_copy_data === 'object' ? inspectionRaw.lscr_copy_data : cf(inspectionRaw.lscr_copy_data, 0.9),
    };
    if (Array.isArray(inspectionRaw.damage_shortage_rows) && inspectionRaw.damage_shortage_rows.length > 0) {
      inspection.damage_shortage_rows = inspectionRaw.damage_shortage_rows.map((row: any) => ({
        unit_type: str(unwrapScalar(row.unit_type)) || undefined,
        quantity: unwrapScalar(row.quantity) != null ? num(unwrapScalar(row.quantity)) : undefined,
        shortage_count: unwrapScalar(row.shortage_count) != null ? num(unwrapScalar(row.shortage_count)) : undefined,
        spillage_count: unwrapScalar(row.spillage_count) != null ? num(unwrapScalar(row.spillage_count)) : undefined,
        damage_count: unwrapScalar(row.damage_count) != null ? num(unwrapScalar(row.damage_count)) : undefined,
        damage_cost: unwrapScalar(row.damage_cost) != null ? num(unwrapScalar(row.damage_cost)) : undefined,
      }));
    }

    const line_items: any[] = [];

    const extraction: any = {
      header: section(obj.header, HEADER_KEYS),
      transport: section(obj.transport, TRANSPORT_KEYS),
      parties: section(obj.parties, PARTIES_KEYS),
      financials: section(obj.financials, FINANCIALS_KEYS, FINANCIALS_NUMERIC),
      inspection,
      line_items,
    };
    if (extraction.header) {
      ensureLrNumberFromPodNumber(extraction.header, obj.header);
      extraction.header.pod_number_canonical = digitsOnly(extraction.header.lr_number?.value);
    }

    const validationError = computeValidationError(extraction);
    if (validationError) extraction.validationError = validationError;
    return extraction;
  }

  const legacyHeader: any = {
    date: obj.pod_date ? cf(obj.pod_date.value ?? obj.pod_date, obj.pod_date.confidence) : undefined,
    lr_number: obj.lr_number ? cf(obj.lr_number.value ?? obj.lr_number, obj.lr_number.confidence) : undefined,
    invoice_number: obj.invoice_reference ? cf(obj.invoice_reference.value ?? obj.invoice_reference, obj.invoice_reference.confidence) : undefined,
  };
  legacyHeader.pod_number_canonical = digitsOnly(legacyHeader.lr_number?.value);
  const legacy: any = {
    header: legacyHeader,
    transport: {},
    parties: {},
    financials: {
      unloading_charges: obj.unloading_charges ? cf(obj.unloading_charges.value, obj.unloading_charges.confidence, true) : undefined,
      shortage_amount: obj.unloading_debit ? cf(obj.unloading_debit.value, obj.unloading_debit.confidence, true) : undefined,
      total_amount: obj.total_amount ? cf(obj.total_amount.value, obj.total_amount.confidence, true) : undefined,
    },
    inspection: { damaged_cases: 0, short_cases: 0, excess_cases: 0 },
    line_items: [],
  };
  const validationError = computeValidationError(legacy);
  if (validationError) legacy.validationError = validationError;
  return legacy;
}

function computeValidationError(extraction: any) {
  const totalFromDoc = extraction.financials?.total_amount?.value != null ? num(extraction.financials.total_amount.value) : null;
  const unloading = num(extraction.financials?.unloading_charges?.value);
  const loading = num(extraction.financials?.loading_charges?.value);
  const shortage = num(extraction.financials?.shortage_amount?.value);
  const damage = num(extraction.financials?.damage_amount?.value);
  const expectedTotal = unloading + loading + shortage + damage;
  if (totalFromDoc == null || expectedTotal === 0) return null;
  const diff = Math.abs(totalFromDoc - expectedTotal);
  const pct = totalFromDoc !== 0 ? (diff / Math.abs(totalFromDoc)) * 100 : 0;
  if (pct > VALIDATION_MISMATCH_PERCENT) {
    return `Total mismatch: document total ${totalFromDoc} vs computed ${expectedTotal.toFixed(2)} (${pct.toFixed(1)}% diff). Verify amounts.`;
  }
  return null;
}

function normalizeGeminiError(err: any) {
  const msg = err?.message ?? String(err);
  if (/API key not valid|invalid.*api.*key|403/i.test(msg)) return 'Invalid or missing Gemini API key.';
  if (/quota|rate limit|429|resource exhausted/i.test(msg)) return 'OCR rate limit exceeded. Try again in a few minutes.';
  if (/timeout|deadline/i.test(msg)) return 'OCR request timed out. Try again or use a smaller file.';
  if (/blocked|safety|content/i.test(msg)) return 'Content was blocked by the OCR service.';
  return msg;
}

function normalizeTrip(trip: any) {
  if (!trip || typeof trip !== 'object') return null;
  const transport = section(trip.transport, TRANSPORT_KEYS);
  const parties = section(trip.parties, PARTIES_KEYS);
  const arrival_date_time = trip.arrival_date_time && typeof trip.arrival_date_time === 'object' && 'value' in trip.arrival_date_time ? cf(trip.arrival_date_time.value, trip.arrival_date_time.confidence) : undefined;
  const release_date_time = trip.release_date_time && typeof trip.release_date_time === 'object' && 'value' in trip.release_date_time ? cf(trip.release_date_time.value, trip.release_date_time.confidence) : undefined;
  const unload_start_date_time = trip.unload_start_date_time && typeof trip.unload_start_date_time === 'object' && 'value' in trip.unload_start_date_time ? cf(trip.unload_start_date_time.value, trip.unload_start_date_time.confidence) : undefined;
  const unload_end_date_time = trip.unload_end_date_time && typeof trip.unload_end_date_time === 'object' && 'value' in trip.unload_end_date_time ? cf(trip.unload_end_date_time.value, trip.unload_end_date_time.confidence) : undefined;
  return { transport, parties, arrival_date_time, release_date_time, unload_start_date_time, unload_end_date_time };
}

function mergeTripIntoPod(normalizedTrip: any, podOnly: any) {
  const header: any = { ...section(podOnly.header, HEADER_KEYS) };
  if (normalizedTrip.arrival_date_time) header.arrival_date_time = normalizedTrip.arrival_date_time;
  if (normalizedTrip.release_date_time) header.release_date_time = normalizedTrip.release_date_time;
  if (normalizedTrip.unload_start_date_time) header.unload_start_date_time = normalizedTrip.unload_start_date_time;
  if (normalizedTrip.unload_end_date_time) header.unload_end_date_time = normalizedTrip.unload_end_date_time;

  const inspectionRaw = podOnly.inspection || {};
  const inspection: any = {
    damaged_cases: num(unwrapScalar(inspectionRaw.damaged_cases)),
    short_cases: num(unwrapScalar(inspectionRaw.short_cases)),
    excess_cases: num(unwrapScalar(inspectionRaw.excess_cases)),
  };
  if (Array.isArray(inspectionRaw.damage_shortage_rows) && inspectionRaw.damage_shortage_rows.length > 0) {
    inspection.damage_shortage_rows = inspectionRaw.damage_shortage_rows.map((row: any) => ({
      unit_type: str(unwrapScalar(row.unit_type)) || undefined,
      quantity: unwrapScalar(row.quantity) != null ? num(unwrapScalar(row.quantity)) : undefined,
      shortage_count: unwrapScalar(row.shortage_count) != null ? num(unwrapScalar(row.shortage_count)) : undefined,
      spillage_count: unwrapScalar(row.spillage_count) != null ? num(unwrapScalar(row.spillage_count)) : undefined,
      damage_count: unwrapScalar(row.damage_count) != null ? num(unwrapScalar(row.damage_count)) : undefined,
      damage_cost: unwrapScalar(row.damage_cost) != null ? num(unwrapScalar(row.damage_cost)) : undefined,
    }));
  }
  if (inspectionRaw.goods_inspection_report != null) inspection.goods_inspection_report = typeof inspectionRaw.goods_inspection_report === 'object' ? inspectionRaw.goods_inspection_report : cf(inspectionRaw.goods_inspection_report, 0.9);
  if (inspectionRaw.actual_vs_standard_time != null) inspection.actual_vs_standard_time = typeof inspectionRaw.actual_vs_standard_time === 'object' ? inspectionRaw.actual_vs_standard_time : cf(inspectionRaw.actual_vs_standard_time, 0.9);
  if (inspectionRaw.tolerance_hours != null) inspection.tolerance_hours = typeof inspectionRaw.tolerance_hours === 'object' ? inspectionRaw.tolerance_hours : cf(inspectionRaw.tolerance_hours, 0.9, true);

  const line_items: any[] = [];

  const full: any = {
    header,
    transport: normalizedTrip.transport || {},
    parties: normalizedTrip.parties || {},
    financials: section(podOnly.financials, FINANCIALS_KEYS, FINANCIALS_NUMERIC),
    inspection,
    line_items,
  };
  if (full.header) {
    ensureLrNumberFromPodNumber(full.header, podOnly.header);
    full.header.pod_number_canonical = digitsOnly(full.header.lr_number?.value);
  }
  const validationError = computeValidationError(full);
  if (validationError) full.validationError = validationError;
  return full;
}

function tripHash(extraction: any) {
  const p = extraction.parties || {};
  const h = extraction.header || {};
  const parts = [
    str(h.arrival_date_time?.value),
    str(h.release_date_time?.value),
    str(p.consignor_name_address?.value),
    str(p.consignee_name_address?.value),
  ];
  return parts.join('|');
}

function consolidatePodsAndValidate(pods: any[], tripMismatch: boolean) {
  const seen = new Set();
  const consolidated = [];
  let duplicateCanonical = false;
  for (let i = 0; i < pods.length; i++) {
    const p = pods[i];
    const canonical = (p.header && p.header.pod_number_canonical) ? String(p.header.pod_number_canonical) : '';
    const key = canonical || `__page_${i}`;
    if (seen.has(key)) {
      if (canonical) duplicateCanonical = true;
      continue;
    }
    seen.add(key);
    consolidated.push(p);
  }
  const segmentationParts = [];
  if (duplicateCanonical) segmentationParts.push('Duplicate POD numbers detected (same canonical ID); verify segmentation.');
  if (consolidated.length >= 3) {
    segmentationParts.push('Multiple PODs on single trip; verify counts.');
  }
  return {
    pods: consolidated,
    consolidationWarning: tripMismatch ? 'Trip-level data differs across PODs; verify from/to and times.' : undefined,
    segmentationWarning: segmentationParts.length ? segmentationParts.join(' ') : undefined,
  };
}

function normalizeToPodsArray(parsed: any) {
  if (parsed && parsed.trip != null && Array.isArray(parsed.pods) && parsed.pods.length > 0) {
    const normalizedTrip = normalizeTrip(parsed.trip);
    const pods = parsed.pods.map((podOnly: any) => mergeTripIntoPod(normalizedTrip || { transport: {}, parties: {} }, podOnly)).filter(Boolean);
    if (pods.length === 0) throw new Error('OCR returned no valid PODs');
    const hashes = pods.map((p: any) => tripHash(p));
    const tripMismatch = hashes.some((h: any) => h !== hashes[0]);
    return consolidatePodsAndValidate(pods, tripMismatch);
  }
  if (parsed && Array.isArray(parsed.pods) && parsed.pods.length > 0) {
    const pods = parsed.pods.map((p: any) => normalizeExtraction(p)).filter(Boolean);
    const tripMismatch = pods.length > 1 && pods.map((p: any) => tripHash(p)).some((h: any, i: number, arr: any[]) => h !== arr[0]);
    return consolidatePodsAndValidate(pods, tripMismatch);
  }
  if (parsed && (parsed.header != null || parsed.financials != null || parsed.pod_date != null)) {
    return { pods: [normalizeExtraction(parsed)] };
  }
  throw new Error('OCR returned no valid PODs');
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function performOCR(buffer: Uint8Array | ArrayBuffer, mimeType: string, modelName: string, fileName?: string) {
  const base64Data = arrayBufferToBase64(buffer);
  const fullPrompt = BASE_OCR_PROMPT + buildUserPrompt(fileName);
  
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        { text: fullPrompt } as any,
        { inlineData: { data: base64Data, mimeType } } as any,
      ],
    },
  ];

  const response = await getGenAIClient().models.generateContent({
    model: modelName,
    contents,
    config: {
      responseMimeType: 'application/json',
      // We reduced generation tokens required by asking to omit missing fields, this drastically speeds up output!
      temperature: 0.1, // Lower temperature = faster and more deterministic JSON parsing
      topK: 10,
    } as any,
  });
  const text = response.text ?? '';
  if (!text) throw new Error('Empty response from OCR model');
  const parsed = parseExtractionJson(text);
  return normalizeToPodsArray(parsed);
}

async function runOCRWithRetrySingle(buffer: Uint8Array | ArrayBuffer, mimeType: string, fileName?: string) {
  const models = [MODELS.default, MODELS.fallback];
  let lastError;
  let lastResult;
  
  // We removed retry loops on identical models to fail-fast. If gemini-2.0-flash errors, it drops immediately to 1.5. 
  for (const model of models) {
    try {
      const extraction: any = await Promise.race([
        performOCR(buffer, mimeType, model, fileName),
        timeoutPromise(TIMEOUT_MS),
      ]);
      lastResult = { extraction, model, processingTime: 0 };
      return lastResult;
    } catch (err) {
      console.log(`[OCR] error on ${model}`, err);
      lastError = err;
    }
  }
  const normalized = normalizeGeminiError(lastError);
  throw new Error(normalized);
}

export async function runOCR(
  file: File | Blob,
  fileName: string,
  onProgress?: (progress: number) => void
): Promise<OCROutput> {
  const start = Date.now();
  if (onProgress) onProgress(10);
  
  const buffer = await file.arrayBuffer();
  const mimeType = file.type;
  
  if (onProgress) onProgress(20);

  let result: any;

  if (onProgress) onProgress(50);
  result = await runOCRWithRetrySingle(buffer, mimeType, fileName);
  
  if (onProgress) onProgress(100);

  let extractionToReturn = result.extraction;
  if(result.extraction && result.extraction.pods && result.extraction.pods.length > 0) {
      extractionToReturn = result.extraction.pods[0];
  }

  return {
      extraction: extractionToReturn as PODExtraction,
      model: result.model,
      processingTime: (Date.now() - start) / 1000
  };
}
