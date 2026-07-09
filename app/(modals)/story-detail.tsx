import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  checkOrgsConnected,
  getStoryPreview,
  type StoryPreviewRow,
} from '@/features/network/services/posts.service';
import { ROUTES } from '@/lib/routes';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock3, MapPin, Truck } from 'lucide-react-native';
import { lazy, Suspense, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const StoryDetailScreen = lazy(() => import('@/features/network/screens/StoryDetailScreen'));

function isPreviewExpired(preview: StoryPreviewRow): boolean {
  if (!preview.is_active) return true;
  if (!preview.expires_at) return false;
  return new Date(preview.expires_at).getTime() <= Date.now();
}

function PreviewShell({
  preview,
  children,
}: {
  preview: StoryPreviewRow;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const routeLabel =
    preview.origin && preview.destination
      ? `${preview.origin.toUpperCase()} → ${preview.destination.toUpperCase()}`
      : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Truck size={26} color={Theme.brandBlueInk} strokeWidth={1.8} />
        </View>
        <Text style={styles.orgName}>{preview.org_name || 'Pulse network'}</Text>
        {routeLabel ? (
          <View style={styles.routeRow}>
            <MapPin size={14} color={Theme.textSecondary} />
            <Text style={styles.routeText}>{routeLabel}</Text>
          </View>
        ) : null}
        {preview.vehicle_type ? (
          <Text style={styles.metaText}>{preview.vehicle_type}</Text>
        ) : null}
        {preview.expires_at ? (
          <View style={styles.expiryRow}>
            <Clock3 size={12} color={Theme.textMuted} />
            <Text style={styles.expiryText}>
              Expires {new Date(preview.expires_at).toLocaleString('en-IN')}
            </Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function StoryDetailRoute() {
  const { user, status } = useAuth();
  const { currentOrganization } = useOrganization();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string; orgId?: string; storyType?: string; queue?: string }>();
  const myOrgId = currentOrganization?.id ?? '';

  const previewQ = useQuery({
    queryKey: ['q', 'posts', 'story-preview', params.postId],
    queryFn: async () => {
      const { preview } = await getStoryPreview(params.postId!);
      return preview;
    },
    enabled: Boolean(params.postId),
    staleTime: 30_000,
  });

  const connectionQ = useQuery({
    queryKey: ['q', 'posts', 'org-connected', myOrgId, previewQ.data?.organization_id],
    queryFn: async () => {
      const { connected } = await checkOrgsConnected(myOrgId, previewQ.data!.organization_id);
      return connected;
    },
    enabled: Boolean(user) && status !== 'restoring' && Boolean(myOrgId) && Boolean(previewQ.data),
    staleTime: 30_000,
  });

  const returnTo = useMemo(() => {
    const entries = Object.entries(params).filter(([, v]) => typeof v === 'string') as [string, string][];
    const qs = new URLSearchParams(Object.fromEntries(entries)).toString();
    return encodeURIComponent(`/story-detail?${qs}`);
  }, [params]);

  if (status === 'restoring' || previewQ.isLoading) {
    return <LazySuspenseInlineFallback />;
  }

  const preview = previewQ.data;

  if (!preview || isPreviewExpired(preview)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.expiredTitle}>This broadcast has expired</Text>
        <Text style={styles.expiredSub}>The load may have been awarded or the story has expired.</Text>
        <Pressable style={styles.ctaBtn} onPress={() => router.replace(ROUTES.INDEX)}>
          <Text style={styles.ctaBtnText}>Go to Pulse</Text>
        </Pressable>
      </View>
    );
  }

  if (!user) {
    return (
      <PreviewShell preview={preview}>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => router.replace(`/sign-in?returnTo=${returnTo}`)}
        >
          <Text style={styles.ctaBtnText}>Sign up / Log in to bid</Text>
        </Pressable>
      </PreviewShell>
    );
  }

  if (connectionQ.isLoading) {
    return <LazySuspenseInlineFallback />;
  }

  if (!connectionQ.data) {
    return (
      <PreviewShell preview={preview}>
        <Pressable style={styles.ctaBtn} onPress={() => router.replace(ROUTES.TABS.NETWORK)}>
          <Text style={styles.ctaBtnText}>Connect with {preview.org_name || 'this org'} to bid</Text>
        </Pressable>
      </PreviewShell>
    );
  }

  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <StoryDetailScreen />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 24,
  },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceLight,
    marginBottom: 4,
  },
  orgName: { fontSize: 15, fontWeight: '800', color: Theme.textPrimaryDark },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  routeText: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  metaText: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  expiryText: { fontSize: 11, fontWeight: '500', color: Theme.textMuted },
  expiredTitle: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark },
  expiredSub: { fontSize: 13, fontWeight: '500', color: Theme.textSecondary, textAlign: 'center' },
  ctaBtn: {
    backgroundColor: Theme.brandBlueInk,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  ctaBtnText: { fontSize: 13, fontWeight: '700', color: Theme.textOnPrimary },
});
