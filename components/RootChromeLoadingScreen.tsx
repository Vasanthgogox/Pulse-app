/**
 * Route `loading.tsx` for root screens that keep the desktop top tab bar visible.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import Layout from '@/constants/Layout';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RootChromeLoadingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= Layout.webDesktopMinWidth;
  const paddingTop = isDesktopWeb ? Layout.desktopTopNavOffset : insets.top;

  return (
    <View style={[styles.root, { paddingTop }]}>
      <AppLoadingSplash variant="preparing" style={styles.splash} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
  },
});
