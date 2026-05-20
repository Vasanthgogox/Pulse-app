/**
 * Loading UIs that respect desktop top tab bar chrome (Finance / Trips / Network / Load).
 */
import {
  AppLoadingSplash,
  type AppLoadingSplashProps,
} from '@/components/AppLoadingSplash';
import Layout from '@/constants/Layout';
import { useLayoutInsets } from '@/lib/layoutInsets';
import { StyleSheet, View } from 'react-native';

/** Inside a tab scene (`sceneStyle.paddingTop` already applied on desktop). */
export function SceneLoadingSplash({
  style,
  ...props
}: AppLoadingSplashProps) {
  return (
    <AppLoadingSplash
      {...props}
      style={[styles.sceneFill, style]}
    />
  );
}

/** Tab group or root stack `loading.tsx` — reserve space below fixed top nav on desktop web. */
export function ChromeBelowTopNavLoadingScreen({
  style,
  ...props
}: AppLoadingSplashProps) {
  const layout = useLayoutInsets();
  /** Desktop web: fixed top tab bar is outside the scene — reserve space here only. */
  const paddingTop = layout.isDesktopWeb ? Layout.desktopTopNavOffset : 0;

  return (
    <View style={[styles.shell, style]}>
      <View style={[styles.inner, paddingTop > 0 && { paddingTop }]}>
        <AppLoadingSplash {...props} style={styles.sceneFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  sceneFill: {
    flex: 1,
  },
});
