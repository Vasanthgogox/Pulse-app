import type { InvoiceConfig, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { computeInvoiceTotals, type InvoiceTaxIdentityInput } from '@/features/invoicing/services/invoicing.service';
import { useMemo } from 'react';

export function useInvoiceCalc(
  selectedTrips: InvoicingTripView[],
  config: InvoiceConfig,
  identity?: InvoiceTaxIdentityInput,
) {
  const tripAmounts = useMemo(
    () => selectedTrips.map((t) => t.amount),
    [selectedTrips],
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        tripAmounts,
        {
          includeGst: config.includeGst,
          gstRate: config.gstRate,
          includeFuel: config.includeFuel,
          fuelRate: config.fuelRate,
          additionalCharges: config.additionalCharges,
        },
        identity,
      ),
    [
      tripAmounts,
      config.includeGst,
      config.gstRate,
      config.includeFuel,
      config.fuelRate,
      config.additionalCharges,
      identity,
    ],
  );

  const baseFreightTotal = useMemo(
    () => selectedTrips.reduce((acc, t) => acc + t.amount, 0),
    [selectedTrips],
  );

  const additionalTotal = useMemo(
    () => config.additionalCharges.reduce((acc, t) => acc + (t.amount || 0), 0),
    [config.additionalCharges],
  );

  const fuelSurcharge = useMemo(
    () => (config.includeFuel ? baseFreightTotal * (config.fuelRate / 100) : 0),
    [baseFreightTotal, config.includeFuel, config.fuelRate],
  );

  const sgstRate = totals.igst > 0 ? 0 : totals.gstRate / 2;
  const cgstRate = totals.igst > 0 ? 0 : totals.gstRate / 2;

  return {
    baseFreightTotal,
    additionalTotal,
    fuelSurcharge,
    subtotal: totals.subtotal,
    sgstRate,
    cgstRate,
    sgst: totals.sgst,
    cgst: totals.cgst,
    igst: totals.igst,
    totalAmount: totals.totalAmount,
    tax: totals.tax,
  };
}

export type InvoiceCalcResult = ReturnType<typeof useInvoiceCalc>;
