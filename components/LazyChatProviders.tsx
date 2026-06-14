/**
 * Lazy host for the heavy chat providers.
 *
 * `TripChatProvider` + `IntegratedChatProvider` together pull ~1.1k LOC of
 * realtime subscriptions, Zustand store, conversation hydration, and the
 * `chat.service` graph. A *static* import of either in `app/_layout.tsx`
 * forces all of that into the startup chunk — i.e. every dispatcher/driver
 * route, sign-in, sign-up, modal, and even the splash screen ship that code.
 *
 * This component:
 *   1. Renders `children` directly (no provider) until first idle, so the
 *      paint of `/sign-in` / splash / driver tab bar is unblocked.
 *   2. After idle, dynamic-imports the real providers and re-renders the
 *      tree wrapped in them.
 *
 * The `/chat` route mounts its own providers (`app/chat.tsx`) with `skipWrap`.
 */
import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';
import {
  getResolvedChatProviders,
  preloadChatProviderModules,
  preloadChatScreenModule,
} from '@/lib/preloadChatWarmup';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

const MAX_LOAD_RETRIES = 3;
const RETRY_DELAY_MS = 1_200;

/** Sentinel: provider load failed after all retries — passthrough without context. */
const FALLBACK_EMPTY = {
  Trip: ({ children }: { children: ReactNode }) => <>{children}</>,
  Integrated: ({ children }: { children: ReactNode }) => <>{children}</>,
} as const;

type TripChatProviderShape = ComponentType<{ children: ReactNode; isActive?: boolean }>;
type IntegratedChatProviderShape = ComponentType<{ children: ReactNode; isActive?: boolean }>;

type Loaded = {
  Trip: TripChatProviderShape;
  Integrated: IntegratedChatProviderShape;
} | null;

export interface LazyChatProvidersProps {
  children: ReactNode;
  /**
   * Forwarded to both providers. When false, realtime subscriptions stay
   * idle even after the provider mounts (e.g. dispatcher off chat routes).
   */
  isActive: boolean;
  /**
   * When true (e.g. `/chat`), preload provider modules but do not wrap the tree.
   * `app/chat.tsx` mounts providers for that route.
   */
  skipWrap?: boolean;
}

export function LazyChatProviders({
  children,
  isActive,
  skipWrap = false,
}: LazyChatProvidersProps) {
  const auth = useOptionalAuth();
  const loadedRef = useRef<Loaded>(null);
  const [loaded, setLoaded] = useState<Loaded>(() => {
    const cached = getResolvedChatProviders();
    if (!cached) return null;
    return {
      Trip: cached.TripChatProvider as TripChatProviderShape,
      Integrated: cached.IntegratedChatProvider as IntegratedChatProviderShape,
    };
  });
  loadedRef.current = loaded;

  useLayoutEffect(() => {
    if (!auth) return;
    if (auth.profile?.role === 'driver') return;
    if (skipWrap) {
      void preloadChatProviderModules();
      void preloadChatScreenModule();
      return;
    }
    if (loadedRef.current) return;

    let cancelled = false;
    let pendingRetry: ReturnType<typeof setTimeout> | null = null;

    const commitLoaded = (next: Loaded) => {
      if (cancelled || !next) return;
      setLoaded(next);
    };

    const attemptLoad = (attempt: number) => {
      if (cancelled) return;

      const cached = getResolvedChatProviders();
      if (cached) {
        commitLoaded({
          Trip: cached.TripChatProvider as TripChatProviderShape,
          Integrated: cached.IntegratedChatProvider as IntegratedChatProviderShape,
        });
        return;
      }

      preloadChatProviderModules()
        .then(([trip, integrated]) => {
          if (cancelled) return;
          commitLoaded({
            Trip: trip.TripChatProvider as unknown as TripChatProviderShape,
            Integrated: integrated.IntegratedChatProvider as unknown as IntegratedChatProviderShape,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (attempt < MAX_LOAD_RETRIES) {
            pendingRetry = setTimeout(() => attemptLoad(attempt + 1), RETRY_DELAY_MS);
          } else {
            if (__DEV__) console.error('[LazyChatProviders] provider load failed after retries:', err);
            commitLoaded(FALLBACK_EMPTY as unknown as Loaded);
          }
        });
    };

    const load = () => attemptLoad(0);

    if (isActive) {
      void preloadChatScreenModule();
      load();
    } else {
      scheduleIdleWork(load);
    }

    return () => {
      cancelled = true;
      if (pendingRetry) clearTimeout(pendingRetry);
    };
  }, [auth, isActive, skipWrap]);

  if (skipWrap || !loaded || !auth || auth.profile?.role === 'driver') {
    return <>{children}</>;
  }

  const { Trip, Integrated } = loaded;
  return (
    <Trip isActive={isActive}>
      <Integrated isActive={isActive}>{children}</Integrated>
    </Trip>
  );
}
