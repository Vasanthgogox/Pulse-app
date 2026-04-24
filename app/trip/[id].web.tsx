import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useAuth } from '@/contexts/AuthContext';
import TripDetailScreen from '@/features/trips/components/trip-detail/TripDetailScreen.web';
import { ROUTES } from '@/lib/routes';
import { useSafeBack } from '@/lib/useSafeBack';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function TripDetailRoute() {
  const raw = useLocalSearchParams<{
    id: string;
    entryContext?: string;
    clientIdFromContext?: string;
    clientNameFromContext?: string;
  }>();
  const safeBack = useSafeBack();
  const router = useRouter();
  const { user, loading } = useAuth();

  // Auth guard — redirect to sign-in instead of falling through to index
  // (which would redirect drivers to /(driver) based on profile.role)
  useEffect(() => {
    if (!loading && !user) {
      router.replace(ROUTES.SIGN_IN_DIRECT);
    }
  }, [loading, user, router]);

  if (loading) {
    return <CenteredLoadingView message="Loading…" />;
  }

  if (!user) {
    // Render nothing while the useEffect fires the redirect
    return <AuthRedirectScreen onSignIn={() => router.replace(ROUTES.SIGN_IN_DIRECT)} />;
  }

  const tripId = typeof raw.id === 'string' ? raw.id : raw.id?.[0] ?? '';
  const entryContext =
    typeof raw.entryContext === 'string' &&
    (raw.entryContext === 'supplier' ||
      raw.entryContext === 'vehicle' ||
      raw.entryContext === 'client')
      ? (raw.entryContext as 'supplier' | 'vehicle' | 'client')
      : undefined;
  const clientIdFromContext =
    typeof raw.clientIdFromContext === 'string' ? raw.clientIdFromContext : undefined;
  const clientNameFromContext =
    typeof raw.clientNameFromContext === 'string' ? raw.clientNameFromContext : undefined;

  return (
    <TripDetailScreen
      tripId={tripId}
      entryContext={entryContext}
      clientIdFromContext={clientIdFromContext}
      clientNameFromContext={clientNameFromContext}
      onBack={safeBack}
    />
  );
}

function AuthRedirectScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View style={styles.wrap}>
      <FontAwesome name="lock" size={36} color="#9ca3af" />
      <Text style={styles.title}>Session Expired</Text>
      <Text style={styles.sub}>Your session has ended. Please sign in to continue.</Text>
      <TouchableOpacity style={styles.btn} onPress={onSignIn} activeOpacity={0.8}>
        <Text style={styles.btnText}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  sub: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
