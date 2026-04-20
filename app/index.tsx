import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { getLastTabRoute } from '@/lib/lastRoute';
import { DEFAULT_DRIVER_ROUTE } from '@/lib/routes';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Index() {
  const insets = useSafeAreaInsets();
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    if (!profile) return;
    if (profile.role === 'driver') {
      router.replace(DEFAULT_DRIVER_ROUTE as '/');
      return;
    }
    // Restore the last visited tab so cold-start lands where the user left off,
    // rather than always defaulting to the Cash/Finance tab.
    getLastTabRoute().then((route) => {
      router.replace(route as '/');
    });
  }, [user, profile, loading, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ActivityIndicator size="large" color={Theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
});
