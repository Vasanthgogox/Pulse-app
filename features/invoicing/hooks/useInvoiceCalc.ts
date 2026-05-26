import type { InvoiceConfig, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { useMemo } from 'react';

export function useInvoiceCalc(selectedTrips: InvoicingTripView[], config: InvoiceConfig) {
  const baseFreightTotal = useMemo(
    () => selectedTrips.reduce((acc, t) => acc + t.amount, 0),
    [selectedTrips]
  );

  const additionalTotal = useMemo(
    () => config.additionalCharges.reduce((acc, t) => acc + (t.amount || 0), 0),
    [config.additionalCharges]
  );

  const fuelSurcharge = useMemo(
    () => (config.includeFuel ? baseFreightTotal * (config.fuelRate / 100) : 0),
    [baseFreightTotal, config.includeFuel, config.fuelRate]
  );

  const subtotal = baseFreightTotal + additionalTotal + fuelSurcharge;

  const sgstRate = config.includeGst ? config.gstRate / 2 : 0;
  const cgstRate = config.includeGst ? config.gstRate / 2 : 0;

  const sgst = useMemo(() => subtotal * (sgstRate / 100), [subtotal, sgstRate]);
  const cgst = useMemo(() => subtotal * (cgstRate / 100), [subtotal, cgstRate]);

  const totalAmount = subtotal + sgst + cgst;

  return {
    baseFreightTotal,
    additionalTotal,
    fuelSurcharge,
    subtotal,
    sgstRate,
    cgstRate,
    sgst,
    cgst,
    totalAmount,
  };
}

export type InvoiceCalcResult = ReturnType<typeof useInvoiceCalc>;
