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
import { useLayoutEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  preloadChatProviderModules,
  preloadChatScreenModule,
} from '@/lib/preloadChatWarmup';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

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
  const [loaded, setLoaded] = useState<Loaded>(null);

  useLayoutEffect(() => {
    if (loaded) return;
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      void preloadChatProviderModules().then(([trip, integrated]) => {
        if (cancelled) return;
        setLoaded({
          Trip: trip.TripChatProvider as unknown as TripChatProviderShape,
          Integrated: integrated.IntegratedChatProvider as unknown as IntegratedChatProviderShape,
        });
      });
    };
    // Eager load on chat-adjacent routes or when the chat modal is opening.
    if (isActive || requireProviders) {
      void preloadChatScreenModule();
      load();
    } else {
      scheduleIdleWork(load);
    }
    return () => {
      cancelled = true;
    };
  }, [isActive, requireProviders, loaded]);

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
