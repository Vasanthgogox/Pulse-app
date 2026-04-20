import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
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
    if (Platform.OS === 'web') {
      // For web, if user is logged in, let Expo Router handle the current URL naturally.
      // Do not force a redirect to a specific default route.
      return;
    }
    if (!profile) return;
    if (profile.role === 'driver') {
      router.replace('/(driver)');
    } else {
      router.replace('/(tabs)/finance');
    }
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
