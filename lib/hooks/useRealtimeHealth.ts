/**
 * Polls the realtime registry every 15 seconds and returns a health snapshot.
 * Intended for the HomePageHeader sync-status dot and operational dashboard.
 *
 * Does NOT create its own Supabase connection — reads the registry's internal state.
 * Safe to call from multiple components — polling is debounced in this hook.
 */
import { getRealtimeHealth, type RealtimeHealth } from '@/lib/realtimeRegistry';
import { useEffect, useRef, useState } from 'react';

const POLL_MS = 15_000;

export function useRealtimeHealth(): RealtimeHealth {
  const [health, setHealth] = useState<RealtimeHealth>(getRealtimeHealth);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHealth(getRealtimeHealth());
    timer.current = setInterval(() => setHealth(getRealtimeHealth()), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return health;
}
