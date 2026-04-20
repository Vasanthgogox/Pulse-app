import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const DEFAULT_PAGE_SIZE = 15;
const END_THRESHOLD_PX = 220;

export type UsePaginatedScrollOptions = {
  pageSize?: number;
  /** When this changes, the visible window resets to the first page. */
  resetKey?: string | number;
  /** When false, the full list is returned and scroll loading is disabled. */
  enabled?: boolean;
};

/**
 * Vertical list/table pagination: show the first `pageSize` rows, then extend
 * by `pageSize` when the user scrolls near the bottom of the parent ScrollView.
 */
export function usePaginatedScroll<T>(
  source: readonly T[],
  options?: UsePaginatedScrollOptions,
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const resetKey = options?.resetKey ?? "";
  const enabled = options?.enabled !== false;

  const [count, setCount] = useState(pageSize);
  const armRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    setCount(pageSize);
    armRef.current = true;
  }, [enabled, pageSize, resetKey]);

  const visible = useMemo(() => {
    if (!enabled) return source as T[];
    return source.slice(0, Math.min(count, source.length)) as T[];
  }, [enabled, source, count]);

  const hasMore = enabled && visible.length < source.length;

  const loadMore = useCallback(() => {
    if (!enabled) return;
    setCount((c) => Math.min(c + pageSize, source.length));
  }, [enabled, pageSize, source.length]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (contentSize.height <= layoutMeasurement.height + 4) return;
      const y = layoutMeasurement.height + contentOffset.y;
      const nearBottom = y >= contentSize.height - END_THRESHOLD_PX;
      if (nearBottom) {
        if (armRef.current) {
          armRef.current = false;
          setCount((c) => {
            if (c >= source.length) return c;
            return Math.min(c + pageSize, source.length);
          });
        }
      } else {
        armRef.current = true;
      }
    },
    [enabled, pageSize, source.length],
  );

  return { visible, hasMore, loadMore, onScroll };
}
