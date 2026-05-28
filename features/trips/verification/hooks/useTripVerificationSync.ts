import { useEffect } from "react";
import { useIsOnline } from "@/contexts/NetworkContext";
import { flushVerificationOutbox } from "../offline/sync";

/**
 * Keeps verification outbox opportunistically synced when connection returns.
 * Non-blocking and safe to mount on driver/business trip surfaces.
 */
export function useTripVerificationSync() {
  const isOnline = useIsOnline();

  useEffect(() => {
    if (!isOnline) return;
    void flushVerificationOutbox();
  }, [isOnline]);
}
