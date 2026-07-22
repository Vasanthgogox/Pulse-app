import { ContentErrorState } from '@/components/ContentErrorState';
import { logger } from '@/lib/logger';
import {
  isStaleWebChunkError,
  recoverStaleWebDeploy,
} from '@/lib/webDeployRecovery';
import React, { Component, type ReactNode } from 'react';
import { View } from 'react-native';

type Props = { children: ReactNode };

type State = {
  hasError: boolean;
  errorMessage: string | null;
  componentStack: string | null;
  recoveringDeploy: boolean;
};

/**
 * App-wide error boundary. Wraps the provider tree in app/_layout.tsx so a crash
 * in any provider or the layout shell renders a recoverable error screen instead
 * of a blank white-screen. This covers the gap left by Expo Router's route-level
 * ErrorBoundary, which only catches errors thrown inside the rendered route tree.
 *
 * Modeled on NetworkTabErrorBoundary. Errors are funneled through `logger.error`,
 * which forwards to the crash reporter (Sentry) in production.
 *
 * Stale Netlify chunks are recovered here (not only in Expo Router ErrorBoundary):
 * this boundary wraps the tree and otherwise swallows the reload path.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: null,
    componentStack: null,
    recoveringDeploy: false,
  };

  private retryKey = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error?.message ?? null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleWebChunkError(error) && recoverStaleWebDeploy()) {
      this.setState({ recoveringDeploy: true });
      return;
    }
    this.setState({ componentStack: info.componentStack ?? null });
    logger.error('[AppErrorBoundary] render error', {
      message: error?.message ?? String(error),
      name: error?.name ?? typeof error,
      stack: error?.stack ?? null,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    const msg = this.state.errorMessage;
    if (msg && isStaleWebChunkError(new Error(msg)) && recoverStaleWebDeploy()) {
      return;
    }
    this.retryKey += 1;
    this.setState({
      hasError: false,
      errorMessage: null,
      componentStack: null,
      recoveringDeploy: false,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.state.recoveringDeploy) {
        return <View style={{ flex: 1 }} />;
      }
      const staleDeploy =
        this.state.errorMessage != null &&
        isStaleWebChunkError(new Error(this.state.errorMessage));
      const technicalDetails = [this.state.errorMessage, this.state.componentStack]
        .filter(Boolean)
        .join('\n\n');

      return (
        <View style={{ flex: 1 }}>
          <ContentErrorState
            variant={staleDeploy ? 'update' : 'generic'}
            technicalDetails={technicalDetails || null}
            onRetry={this.handleRetry}
          />
        </View>
      );
    }
    return <React.Fragment key={this.retryKey}>{this.props.children}</React.Fragment>;
  }
}
