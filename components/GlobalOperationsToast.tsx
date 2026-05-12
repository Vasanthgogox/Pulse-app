import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';
import { X } from 'lucide-react-native';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { useVehicleIdleToastAlert } from '@/lib/globalSync/useOperationsDerived';

/**
 * Persistent top toast for **vehicle idle** on desktop web until dismissed (RPC + Realtime).
 */
export function GlobalOperationsToast() {
  const layoutWidth = useWebLayoutWidth();
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);

  const idle = useVehicleIdleToastAlert();

  const isDesktopWeb = Platform.OS === 'web' && layoutWidth >= Layout.webDesktopMinWidth;
  if (!isDesktopWeb || auth?.profile?.role === 'driver' || !orgId || bootstrapStatus !== 'ready' || !idle) {
    return null;
  }

  return (
    <View style={styles.bar} accessibilityRole="alert">
      <View style={styles.barInner}>
        <Text style={styles.label}>Vehicle idle</Text>
        <Text style={styles.body} numberOfLines={2}>
          {idle.trip_number ? `${idle.trip_number} · ` : ''}
          {idle.subtitle ?? idle.title}
        </Text>
        <Pressable
          accessibilityLabel="Dismiss vehicle idle alert"
          hitSlop={12}
          onPress={() => {
            void useGlobalSyncStore.getState().acknowledgeGlobalAlert(idle.id, orgId);
          }}
          style={styles.close}
        >
          <X size={18} color={Theme.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 250,
    paddingTop: 10,
    paddingHorizontal: 16,
    pointerEvents: 'box-none',
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(254,243,199,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: { flex: 1, fontSize: 13, fontWeight: '700', color: '#92400e', lineHeight: 18 },
  close: { padding: 4 },
});
