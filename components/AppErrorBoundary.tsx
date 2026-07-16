import { ContentErrorState } from '@/components/ContentErrorState';
import { logger } from '@/lib/logger';
import React, { Component, type ReactNode } from 'react';
import { View } from 'react-native';

type Props = { children: ReactNode };

type State = {
  hasError: boolean;
  errorMessage: string | null;
  componentStack: string | null;
};

/**
 * App-wide error boundary. Wraps the provider tree in app/_layout.tsx so a crash
 * in any provider or the layout shell renders a recoverable error screen instead
 * of a blank white-screen. This covers the gap left by Expo Router's route-level
 * ErrorBoundary, which only catches errors thrown inside the rendered route tree.
 *
 * Modeled on NetworkTabErrorBoundary. Errors are funneled through `logger.error`,
 * which forwards to the crash reporter (Sentry) in production.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null, componentStack: null };

  private retryKey = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error?.message ?? null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    logger.error('[AppErrorBoundary] render error', {
      error,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    this.retryKey += 1;
    this.setState({ hasError: false, errorMessage: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      const technicalDetails = [this.state.errorMessage, this.state.componentStack]
        .filter(Boolean)
        .join('\n\n');

      return (
        <View style={{ flex: 1 }}>
          <ContentErrorState
            variant="generic"
            technicalDetails={technicalDetails || null}
            onRetry={this.handleRetry}
          />
        </View>
      );
    }
    return <React.Fragment key={this.retryKey}>{this.props.children}</React.Fragment>;
  }
}
