import type { PODExtraction, PODExtractionLegacy } from '@/types/pod';

export function migrateLegacyToV2(legacy: PODExtractionLegacy): PODExtraction {
  return {
    header: {
      date: legacy.pod_date,
      lr_number: legacy.lr_number,
      invoice_number: legacy.invoice_reference,
    },
    transport: {},
    parties: {},
    financials: {
      unloading_charges: legacy.unloading_charges,
      shortage_amount: legacy.unloading_debit,
      total_amount: legacy.total_amount,
    },
    inspection: { damaged_cases: 0, short_cases: 0, excess_cases: 0 },
    line_items: legacy.line_items ?? [],
  };
}
