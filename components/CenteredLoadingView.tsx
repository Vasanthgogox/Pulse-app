/**
 * Full-screen centered loading state that respects safe area.
 * Use on any screen that shows a spinner before content (e.g. detail pages).
 */
import Theme from '@/constants/Theme';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CenteredLoadingViewProps {
  message?: string;
  color?: string;
}

export function CenteredLoadingView({ message, color = Theme.primary }: CenteredLoadingViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.centered,
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 24,
        },
      ]}
    >
      <ActivityIndicator size="large" color={color} />
      {message != null && message !== '' && (
        <Text style={styles.message}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  centered: { justifyContent: 'center', alignItems: 'center' },
  message: { marginTop: 12, fontSize: 14, color: Theme.textSecondary },
});
