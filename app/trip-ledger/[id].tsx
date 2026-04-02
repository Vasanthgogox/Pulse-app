/**
 * Trip Ledger Detail — full-page P&L + Record cash in / Add expense (same content as former inline expand).
 * Opened when tapping a trip row from entity overlay (Receivables/Payables by trip).
 */
import { TripLedgerDetailScreen } from "@/features/finance/components/TripLedgerDetailScreen";
import { useLocalSearchParams } from "expo-router";
import { useSafeBack } from "@/lib/useSafeBack";

export default function TripLedgerDetailRoute() {
  const raw = useLocalSearchParams<{
    id: string;
    entityType?: string;
    entityId?: string;
    partyName?: string;
  }>();
  const safeBack = useSafeBack();
  const id = typeof raw.id === "string" ? raw.id : raw.id?.[0] ?? "";
  const entityType =
    typeof raw.entityType === "string" &&
    ["CLIENT", "SUPPLIER", "DRIVER", "VEHICLE"].includes(raw.entityType)
      ? (raw.entityType as import("@/features/finance/components/TripLedgerDetailScreen").TripLedgerEntityType)
      : undefined;
  const entityId = typeof raw.entityId === "string" ? raw.entityId : undefined;
  const partyName = typeof raw.partyName === "string" ? raw.partyName : undefined;

  return (
    <TripLedgerDetailScreen
      tripId={id}
      entityType={entityType ?? undefined}
      entityId={entityId ?? undefined}
      partyName={partyName ?? undefined}
      onBack={safeBack}
    />
  );
}
