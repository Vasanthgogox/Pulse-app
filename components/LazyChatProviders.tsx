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
 * Why this is safe:
 *   - Optional consumers (`useOptionalTripChat` / `useOptionalIntegratedChat`)
 *     already tolerate the missing provider — they return `undefined`.
 *   - Required consumers live inside chat routes, which are themselves lazy
 *     route chunks — the provider chunk is already in flight by the time
 *     those screens mount.
 *
 * No module-level cache: HMR can hot-swap either provider module without us
 * holding a stale reference.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  getResolvedChatProviders,
  preloadChatProviderModules,
  preloadChatScreenModule,
} from '@/lib/preloadChatWarmup';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

const MAX_LOAD_RETRIES = 3;
const RETRY_DELAY_MS = 1_200;
/** Never block chat route longer than this — render passthrough providers instead. */
const PROVIDER_LOAD_TIMEOUT_MS = 15_000;

/** Sentinel: provider load failed after all retries. Renders a passthrough wrapper
 *  so children can mount; ChatScreen's own error boundary surfaces the real error. */
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
   * When true, children are not rendered until providers are loaded (chat modal).
   * Prevents `useTripChat` errors and lets bootstrap start before ChatScreen mounts.
   */
  requireProviders?: boolean;
}

export function LazyChatProviders({
  children,
  isActive,
  requireProviders = false,
}: LazyChatProvidersProps) {
  const loadedRef = useRef<Loaded>(null);
  const [loaded, setLoaded] = useState<Loaded>(() => {
    // If providers were already resolved during an earlier preload (e.g. while
    // the user was on the Trips tab), return them synchronously so the chat
    // modal opens with zero loading delay.
    const cached = getResolvedChatProviders();
    if (!cached) return null;
    return {
      Trip: cached.TripChatProvider as TripChatProviderShape,
      Integrated: cached.IntegratedChatProvider as IntegratedChatProviderShape,
    };
  });
  loadedRef.current = loaded;

  useLayoutEffect(() => {
    if (loadedRef.current) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const attemptLoad = (attempt: number) => {
      if (cancelled) return;

      // Fast path: already resolved by an earlier preload call.
      const cached = getResolvedChatProviders();
      if (cached) {
        if (!cancelled) {
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          setLoaded({
            Trip: cached.TripChatProvider as TripChatProviderShape,
            Integrated: cached.IntegratedChatProvider as IntegratedChatProviderShape,
          });
        }
        return;
      }

      preloadChatProviderModules()
        .then(([trip, integrated]) => {
          if (cancelled) return;
          // Cancel the fallback timeout — providers loaded successfully,
          // so we must NOT replace them with FALLBACK_EMPTY later.
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          setLoaded({
            Trip: trip.TripChatProvider as unknown as TripChatProviderShape,
            Integrated: integrated.IntegratedChatProvider as unknown as IntegratedChatProviderShape,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (attempt < MAX_LOAD_RETRIES) {
            // Retry after a brief delay; chatProvidersModule cache was cleared on rejection.
            const t = setTimeout(() => attemptLoad(attempt + 1), RETRY_DELAY_MS);
            // Store timeout so cleanup can cancel it.
            pendingRetry = t;
          } else {
            if (__DEV__) console.error('[LazyChatProviders] provider load failed after retries:', err);
            // On final failure render children anyway so the app isn't permanently stuck.
            // ChatScreen's error boundary will surface the actual issue.
            setLoaded(FALLBACK_EMPTY as unknown as Loaded);
          }
        });
    };

    let pendingRetry: ReturnType<typeof setTimeout> | null = null;

    const load = () => attemptLoad(0);

    // Eager load on chat-adjacent routes or when the chat modal is opening.
    if (isActive || requireProviders) {
      void preloadChatScreenModule();
      load();
    } else {
      scheduleIdleWork(load);
    }

    if (requireProviders) {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (__DEV__) {
          console.warn(
            '[LazyChatProviders] provider load timed out — rendering chat without providers',
          );
        }
        setLoaded(FALLBACK_EMPTY as unknown as Loaded);
      }, PROVIDER_LOAD_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (pendingRetry) clearTimeout(pendingRetry);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isActive, requireProviders]);

  if (!loaded) {
    if (requireProviders) {
      return <CenteredLoadingView message="Loading chat…" />;
    }
    return <>{children}</>;
  }
  const { Trip, Integrated } = loaded;
  return (
    <Trip isActive={isActive}>
      <Integrated isActive={isActive}>{children}</Integrated>
    </Trip>
  );
}
