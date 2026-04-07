import type { PODExtraction, PODExtractionLegacy, ConfidenceField } from '@/types/pod';
import { getLoadingDuration, getUnloadingDuration, getInTransitDuration } from './dateTimeFormat';

/** Line item description can be string or { value } from OCR; always return a string for display. */
export function lineItemDescription(desc: unknown): string {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object' && 'value' in desc) return String((desc as { value?: unknown }).value ?? '');
  return String(desc);
}

const FINANCIAL_NUMERIC_KEYS = new Set([
  'unloading_charges', 'loading_charges', 'shortage_amount', 'damage_amount',
  'leakage_amount', 'total_amount',
]);

export function recomputeTotalFromExtraction(extraction: PODExtraction): number {
  const f = extraction.financials ?? {};
  const unloading = Number((f.unloading_charges as ConfidenceField<number>)?.value) || 0;
  const loading = Number((f.loading_charges as ConfidenceField<number>)?.value) || 0;
  const shortage = Number((f.shortage_amount as ConfidenceField<number>)?.value) || 0;
  const damage = Number((f.damage_amount as ConfidenceField<number>)?.value) || 0;
  return unloading + loading + shortage + damage;
}

export function getTotalAmount(extraction: PODExtraction | PODExtractionLegacy): number | null {
  if ('financials' in extraction && extraction.financials?.total_amount != null) {
    return Number((extraction.financials.total_amount as ConfidenceField<number>).value) ?? null;
  }
  if ('total_amount' in extraction && extraction.total_amount != null) {
    return Number((extraction.total_amount as ConfidenceField<number>).value) ?? null;
  }
  return null;
}

/** Financial keys that trigger an alert when non-zero or set — full focus on charges, debits, damage, shortage. */
const FINANCIALS_ALERT_KEYS = [
  'unloading_charges', 'loading_charges', 'shortage_amount', 'damage_amount', 'leakage_amount',
  'total_amount', 'debit_reason_code', 'debit_type',
] as const;

const FINANCIALS_ALERT_LABELS: Record<string, string> = {
  unloading_charges: 'Unloading', loading_charges: 'Loading',
  shortage_amount: 'Shortage', damage_amount: 'Damage', leakage_amount: 'Spillage/Leakage',
  total_amount: 'Total', debit_reason_code: 'Debit reason', debit_type: 'Debit type',
};

function formatAmount(v: number | string): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return String(v).trim();
  if (n === 0) return '0';
  if (n >= 1000) return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return `₹${n}`;
}

/** Returns a short summary with amounts when extraction has charges, debits, damage, or shortage — "how much and what". */
export function getFinancialsAlert(
  extraction: PODExtraction | PODExtractionLegacy | undefined
): { show: boolean; message: string } {
  if (!extraction || !('financials' in extraction) || !extraction.financials) return { show: false, message: '' };
  const f = extraction.financials;
  const items: string[] = [];
  for (const key of FINANCIALS_ALERT_KEYS) {
    const field = f[key as keyof typeof f];
    if (!field || typeof field !== 'object' || !('value' in field)) continue;
    const v = (field as ConfidenceField<number | string>).value;
    if (v == null) continue;
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    const isNumericKey = ['unloading_charges', 'loading_charges', 'shortage_amount', 'damage_amount', 'leakage_amount', 'total_amount'].includes(key);
    const hasValue = typeof v === 'string' ? String(v).trim() !== '' : !Number.isNaN(num) && (num !== 0 || !isNumericKey);
    if (hasValue) {
      const label = FINANCIALS_ALERT_LABELS[key] ?? key;
      const display = isNumericKey && (typeof v === 'number' || !Number.isNaN(num)) ? `${label}: ${formatAmount(v)}` : `${label}: ${String(v).trim()}`;
      items.push(display);
    }
  }
  if (items.length === 0) return { show: false, message: '' };
  return { show: true, message: `${items.join('; ')} — verify amounts.` };
}

/** True if extraction has any damage, shortage, spillage, or debit — for prominent review alert. */
export function getDamageDebitAlert(
  extraction: PODExtraction | PODExtractionLegacy | undefined
): { show: boolean; message: string } {
  if (!extraction) return { show: false, message: '' };
  const parts: string[] = [];
  if ('financials' in extraction && extraction.financials) {
    const f = extraction.financials;
    const damage = Number((f.damage_amount as ConfidenceField<number>)?.value) || 0;
    const shortage = Number((f.shortage_amount as ConfidenceField<number>)?.value) || 0;
    const leakage = Number((f.leakage_amount as ConfidenceField<number>)?.value) || 0;
    const debitReason = (f.debit_reason_code as ConfidenceField<string>)?.value;
    const debitType = (f.debit_type as ConfidenceField<string>)?.value;
    if (damage > 0) parts.push(`Damage: ${formatAmount(damage)}`);
    if (shortage > 0) parts.push(`Shortage: ${formatAmount(shortage)}`);
    if (leakage > 0) parts.push(`Spillage/Leakage: ${formatAmount(leakage)}`);
    if (debitReason && String(debitReason).trim()) parts.push(`Debit reason: ${String(debitReason).trim()}`);
    if (debitType && String(debitType).trim()) parts.push(`Debit type: ${String(debitType).trim()}`);
  }
  if ('inspection' in extraction && extraction.inspection) {
    const insp = extraction.inspection;
    const d = (insp.damaged_cases ?? 0) > 0 ? insp.damaged_cases : 0;
    const s = (insp.short_cases ?? 0) > 0 ? insp.short_cases : 0;
    const e = (insp.excess_cases ?? 0) > 0 ? insp.excess_cases : 0;
    if (d) parts.push(`Damaged cases: ${d}`);
    if (s) parts.push(`Short cases: ${s}`);
    if (e) parts.push(`Excess cases: ${e}`);
    const rows = insp.damage_shortage_rows ?? [];
    const hasRowIssue = rows.some(
      (r) => (Number(r.shortage_count) || 0) > 0 || (Number(r.spillage_count) || 0) > 0 || (Number(r.damage_count) || 0) > 0 || (Number(r.damage_cost) || 0) > 0
    );
    if (hasRowIssue) parts.push('Unit-level damage/shortage table present');
  }
  if (parts.length === 0) return { show: false, message: '' };
  return { show: true, message: parts.join('; ') + ' — verify.' };
}

/** Get common display values for table/export from either extraction shape */
export function getDisplayValues(extraction: PODExtraction | PODExtractionLegacy): {
  podNumber: string;
  date: string;
  lrNumber: string;
  invoiceRef: string;
  unloadingCharges: string | number;
  totalAmount: string | number;
} {
  if ('header' in extraction && extraction.header) {
    const h = extraction.header as Record<string, { value?: unknown } | undefined>;
    const f = extraction.financials ?? {};
    const lr = (h.lr_number?.value ?? h.pod_number?.value ?? '') as string;
    return {
      podNumber: lr,
      date: (h.date?.value ?? '') as string,
      lrNumber: lr,
      invoiceRef: (h.invoice_number?.value ?? '') as string,
      unloadingCharges: (f.unloading_charges as ConfidenceField<number>)?.value ?? '',
      totalAmount: (f.total_amount as ConfidenceField<number>)?.value ?? '',
    };
  }
  const leg = extraction as PODExtractionLegacy;
  return {
    podNumber: '',
    date: (leg.pod_date?.value ?? '') as string,
    lrNumber: (leg.lr_number?.value ?? '') as string,
    invoiceRef: (leg.invoice_reference?.value ?? '') as string,
    unloadingCharges: leg.unloading_charges?.value ?? '',
    totalAmount: leg.total_amount?.value ?? '',
  };
}

/** Flatten extraction for CSV/PDF: array of { label, value, confidence } */
export function getFlattenedRows(extraction: PODExtraction | PODExtractionLegacy): { label: string; value: unknown; confidence?: number }[] {
  const rows: { label: string; value: unknown; confidence?: number }[] = [];
  const sectionLabels: Record<string, string> = {
    date: 'Date',
    lr_number: 'LR Number',
    invoice_number: 'Invoice Number',
    gir_number: 'GIR Number',
    arrival_date_time: 'Loading In Time',
    release_date_time: 'Loading Out Time',
    unload_start_date_time: 'Unloading In Time',
    unload_end_date_time: 'Unloading Out Time',
    eway_bill_number: 'eWay Bill Number',
    unloading_charges: 'Unloading Charges',
    loading_charges: 'Loading Charges',
    shortage_amount: 'Shortage Amount',
    damage_amount: 'Damage Amount',
    leakage_amount: 'Leakage Amount',
    total_amount: 'Total Amount',
    debit_reason_code: 'Debit Reason Code',
    debit_type: 'Debit Type',
    invoice_reference: 'Invoice Ref',
    pod_date: 'POD Date',
    unloading_debit: 'Unloading Debit',
    detention_charges: 'Detention Charges',
  };

  const HIDDEN_HEADER_KEYS = new Set(['pod_number']);
  if ('header' in extraction && extraction.header) {
    for (const [k, v] of Object.entries(extraction.header)) {
      if (HIDDEN_HEADER_KEYS.has(k)) continue;
      if (v && typeof v === 'object' && 'value' in v) rows.push({ label: sectionLabels[k] ?? k, value: (v as ConfidenceField).value, confidence: (v as ConfidenceField).confidence });
    }
    const header = extraction.header;
    const loadingDur = getLoadingDuration(header);
    const unloadingDur = getUnloadingDuration(header);
    const inTransitDur = getInTransitDuration(header);
    if (loadingDur != null) rows.push({ label: 'Loading duration (In → Out)', value: loadingDur });
    if (unloadingDur != null) rows.push({ label: 'Unloading duration (In → Out)', value: unloadingDur });
    if (inTransitDur != null) rows.push({ label: 'In-transit (Loading Out → Unloading In)', value: inTransitDur });
  }
  const HIDDEN_FINANCIAL_KEYS = new Set(['gst_percent', 'amount_to_pay', 'other_charges']);
  if ('financials' in extraction && extraction.financials) {
    for (const [k, v] of Object.entries(extraction.financials)) {
      if (HIDDEN_FINANCIAL_KEYS.has(k)) continue;
      if (v && typeof v === 'object' && 'value' in v) rows.push({ label: sectionLabels[k] ?? k, value: (v as ConfidenceField).value, confidence: (v as ConfidenceField).confidence });
    }
  }

  if (!('header' in extraction) && extraction) {
    const leg = extraction as PODExtractionLegacy;
    if (leg.pod_date) rows.push({ label: 'POD Date', value: leg.pod_date.value, confidence: leg.pod_date.confidence });
    if (leg.lr_number) rows.push({ label: 'LR Number', value: leg.lr_number.value, confidence: leg.lr_number.confidence });
    if (leg.invoice_reference) rows.push({ label: 'Invoice Ref', value: leg.invoice_reference.value, confidence: leg.invoice_reference.confidence });
    if (leg.unloading_charges) rows.push({ label: 'Unloading Charges', value: leg.unloading_charges.value, confidence: leg.unloading_charges.confidence });
    if (leg.total_amount) rows.push({ label: 'Total Amount', value: leg.total_amount.value, confidence: leg.total_amount.confidence });
  }
  return rows;
}
