import { hashKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useSyncExternalStore } from "react";

const EMPTY: never[] = [];

/** Read a TanStack list from cache without mounting a refetching observer. */
export function useCachedQueryRows<T>(queryKey: readonly unknown[]): T[] {
  const qc = useQueryClient();
  const keyHash = hashKey(queryKey);
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      qc.getQueryCache().subscribe((event) => {
        if (!event?.query) return;
        if (hashKey(event.query.queryKey) !== keyHash) return;
        onStoreChange();
      }),
    [qc, keyHash],
  );
  const getSnapshot = useCallback(
    () => (qc.getQueryData(keyRef.current) as T[] | undefined) ?? (EMPTY as T[]),
    [qc, keyHash],
  );
  const getServerSnapshot = useCallback(() => EMPTY as T[], []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
