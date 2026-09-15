/**
 * Extracted from components/AddTransactionModal.tsx so consumers that only
 * need the data (not the UI) don't pull in the whole component tree —
 * importing the modal drags in lucide-react-native/react-native-svg, which
 * has no native-module mock in the Jest environment and fails any test that
 * imports it transitively (hit by features/tripCompliance's bulk-payment
 * validation, which only needed this array).
 */
export const PAYMENT_MODES = [
  { id: 'CASH', name: 'Cash' },
  { id: 'UPI', name: 'UPI' },
  { id: 'BANK', name: 'Bank Transfer' },
  { id: 'CHEQUE', name: 'Cheque' },
  { id: 'FUEL_CARD', name: 'Fuel Card' },
  { id: 'FASTAG', name: 'FASTag' },
  { id: 'CREDIT', name: 'Credit' },
] as const;
