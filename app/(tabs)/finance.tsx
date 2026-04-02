/**
 * Finance tab — thin route. All logic and UI live in features/finance (FinanceScreen).
 * Compare with finance.tsx.reference for the pre-refactor single-file version.
 */
import { FinanceScreen } from "@/features/finance";

export default function Finance() {
  return <FinanceScreen />;
}
