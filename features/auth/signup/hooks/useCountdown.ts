import { useCallback, useEffect, useRef } from 'react';

/**
 * Reusable interval-based countdown. Handles cleanup on unmount automatically.
 * Returns a `start(secs, setter)` to kick off any countdown and a `stop()` to cancel early.
 */
export function useCountdown() {
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (ref.current) clearInterval(ref.current); }, []);

  const stop = useCallback(() => {
    if (ref.current) { clearInterval(ref.current); ref.current = null; }
  }, []);

  const start = useCallback(
    (secs: number, setter: React.Dispatch<React.SetStateAction<number>>) => {
      stop();
      setter(secs);
      ref.current = setInterval(() => {
        setter(prev => {
          if (prev <= 1) { clearInterval(ref.current!); ref.current = null; return 0; }
          return prev - 1;
        });
      }, 1000);
    },
    [stop],
  );

  return { start, stop };
}
