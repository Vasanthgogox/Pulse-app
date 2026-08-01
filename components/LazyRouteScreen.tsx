import { ContentErrorState } from "@/components/ContentErrorState";
import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import { LazySuspenseInlineFallback, LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import {
  isStaleNativeBundleError,
  isStaleWebChunkError,
  recoverStaleNativeBundle,
  recoverStaleWebDeploy,
} from "@/lib/webDeployRecovery";
import {
  Component,
  Suspense,
  lazy,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { View } from "react-native";

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

type LazyRouteErrorBoundaryProps = {
  children: ReactNode;
  message?: string;
};

type LazyRouteErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
  errorName: string | null;
};

/** Rebuild an Error that still carries `name`, which stale-chunk matching needs. */
function toError(name: string | null, message: string): Error {
  const err = new Error(message);
  if (name) err.name = name;
  return err;
}

class LazyRouteErrorBoundary extends Component<
  LazyRouteErrorBoundaryProps,
  LazyRouteErrorBoundaryState
> {
  private remountKey = 0;

  state: LazyRouteErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    errorName: null,
  };

  static getDerivedStateFromError(error: Error): Partial<LazyRouteErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message ?? "Failed to load screen.",
      // Kept separate from the user-visible message so stale-chunk matching still
      // works on retry: Metro's AsyncRequireError puts only the failing URL in
      // `message`, and the paths below rebuild an Error from stored state.
      errorName: error?.name ?? null,
    };
  }

  componentDidCatch(error: Error) {
    if (isStaleWebChunkError(error) && recoverStaleWebDeploy()) {
      return;
    }
    if (__DEV__ && isStaleNativeBundleError(error)) {
      recoverStaleNativeBundle();
    }
  }

  private handleRetry = () => {
    const { errorMessage: msg, errorName } = this.state;
    if (
      (msg || errorName) &&
      isStaleWebChunkError(toError(errorName, msg ?? "")) &&
      recoverStaleWebDeploy()
    ) {
      return;
    }
    if (msg && __DEV__ && isStaleNativeBundleError(new Error(msg))) {
      recoverStaleNativeBundle();
      return;
    }
    this.remountKey += 1;
    this.setState({ hasError: false, errorMessage: null, errorName: null });
  };

  render() {
    if (this.state.hasError) {
      const err = toError(this.state.errorName, this.state.errorMessage ?? "");
      const staleWeb = isStaleWebChunkError(err);
      const staleBundle = isStaleNativeBundleError(err);
      if (staleWeb) {
        return <View style={{ flex: 1 }} />;
      }

      return (
        <View style={{ flex: 1 }}>
          <ContentErrorState
            variant={staleBundle ? "update" : "connection"}
            layout="full"
            title={staleBundle ? undefined : "Screen failed to load"}
            message={
              staleBundle
                ? undefined
                : this.state.errorMessage ??
                  "Check that Metro is running and your phone is on the same Wi‑Fi, then try again."
            }
            technicalDetails={__DEV__ ? this.state.errorMessage : null}
            onRetry={this.handleRetry}
          />
        </View>
      );
    }

    return <View key={this.remountKey} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

function LazyRouteChunk({ loader }: { loader: LazyRouteScreenProps["loader"] }) {
  const screenRef = useRef<ComponentType<object> | null>(null);
  if (!screenRef.current) {
    screenRef.current = lazy(loader);
  }
  const Screen = screenRef.current;
  return <Screen />;
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
  return (
    <LazyRouteErrorBoundary message={message}>
      <Suspense fallback={resolveFallback(fallback, message)}>
        <LazyRouteChunk loader={loader} />
      </Suspense>
    </LazyRouteErrorBoundary>
  );
}
