/** Format number as INR. */
export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Number only for ledger table cells (no ₹), e.g. "6,000" — matches client ledger. */
export function formatLedgerAmount(value: number): string {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}
