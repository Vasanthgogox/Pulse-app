/**
 * Inline loading spinner (ActivityIndicator API).
 * Full-screen / branded loaders: `CenteredLoadingView` or `PulseLoader`.
 */
import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";

export type LoadingIndicatorProps = ActivityIndicatorProps;

export function LoadingIndicator(props: LoadingIndicatorProps) {
  return <ActivityIndicator {...props} />;
}
