import { lazy, Suspense } from "react";
import type { LedgerReportModalProps } from "@/features/finance/components/LedgerReportModal";

const LedgerReportModal = lazy(() =>
  import("@/features/finance/components/LedgerReportModal").then((m) => ({
    default: m.LedgerReportModal,
  })),
);

type Props = LedgerReportModalProps & { active: boolean };

export function TripsLedgerExportModalGate({ active, ...props }: Props) {
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <LedgerReportModal {...props} />
    </Suspense>
  );
}
