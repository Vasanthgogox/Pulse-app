import { ContentErrorState } from '@/components/ContentErrorState';
import React, { Component, type ReactNode } from 'react';
import { View } from 'react-native';

type Props = { children: ReactNode };

type State = {
  hasError: boolean;
  errorMessage: string | null;
  componentStack: string | null;
};

/**
 * Catches render errors on the Network tab so a flaky child doesn’t replace the whole app
 * with the root ErrorBoundary (“Connection error”).
 */
export class NetworkTabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null, componentStack: null };

  private retryKey = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error?.message ?? null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    if (__DEV__) {
      console.error('[NetworkTabErrorBoundary]', error, info.componentStack);
    }
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
            variant="network"
            technicalDetails={technicalDetails || null}
            onRetry={this.handleRetry}
          />
        </View>
      );
    }
    return <React.Fragment key={this.retryKey}>{this.props.children}</React.Fragment>;
  }
}
