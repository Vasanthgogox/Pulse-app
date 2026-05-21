import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import { LazySuspenseInlineFallback, LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense, useRef, type ComponentType, type ReactNode } from "react";

type LazyRouteScreenProps = {
  loader: () => Promise<{ default: ComponentType<object> }>;
  message?: string;
  /**
   * - splash: full branded loader (cold stack entry)
   * - inline: compact spinner (tab/stack chrome already on screen)
   * - none: no fallback (prefetch expected or parent handles loading)
   */
  fallback?: "splash" | "inline" | "none";
};

function resolveFallback(
  mode: LazyRouteScreenProps["fallback"],
  message?: string,
): ReactNode {
  if (mode === "none") return <LazySuspenseNullFallback />;
  if (mode === "inline") {
    return <LazySuspenseInlineFallback message={message} />;
  }
  return (
    <SceneLoadingSplash variant="preparing" message={message ?? "Loading…"} />
  );
}

/**
 * Shows a fallback while Metro downloads a lazy route chunk.
 * Prefer `fallback="inline"` or `"none"` when tab/header chrome is already visible.
 */
export function LazyRouteScreen({
  loader,
  message,
  fallback = "splash",
}: LazyRouteScreenProps) {
  const screenRef = useRef<ComponentType<object> | null>(null);
  if (!screenRef.current) screenRef.current = lazy(loader);
  const Screen = screenRef.current;
  return (
    <Suspense fallback={resolveFallback(fallback, message)}>
      <Screen />
    </Suspense>
  );
}
