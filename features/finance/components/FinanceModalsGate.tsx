/**
 * Loads FinanceModals chunk only when a modal or entity overlay is open.
 */
import { lazy, Suspense } from "react";
import type { FinanceModalsProps } from "./FinanceModals";

const FinanceModals = lazy(() =>
  import("./FinanceModals").then((m) => ({ default: m.FinanceModals })),
);

export type { FinanceModalsProps } from "./FinanceModals";

type FinanceModalsGateProps = FinanceModalsProps & {
  active: boolean;
};

export function FinanceModalsGate({ active, ...props }: FinanceModalsGateProps) {
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <FinanceModals {...props} />
    </Suspense>
  );
}
