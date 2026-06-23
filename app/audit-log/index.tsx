/**
 * Audit Trail Screen — admin-only view of workspace mutations.
 * Shows: who changed what, when (KYC updates, member changes, branding, trip assignments).
 * Data source: workspace_audit_log table (append-only, written by DB triggers).
 */
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface AuditEntry {
  id: string;
  event_type: string;
  actor_name: string;
  actor_email: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  'kyc.update':          'KYC / Tax details updated',
  'branding.update':     'Company branding updated',
  'ownership.transfer':  'Ownership transferred',
  'member.invite':       'Team member invited',
  'member.remove':       'Team member removed',
  'member.role_change':  'Member role changed',
  'trip.assignment':     'Trip assignment changed',
  'trip.status_change':  'Trip status changed',
};

const EVENT_ICONS: Record<string, string> = {
  'kyc.update':          'id-card',
  'branding.update':     'paint-brush',
  'ownership.transfer':  'exchange',
  'member.invite':       'user-plus',
  'member.remove':       'user-times',
  'member.role_change':  'shield',
  'trip.assignment':     'truck',
  'trip.status_change':  'refresh',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function AuditLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data, error: rpcErr } = await supabase().rpc('get_audit_log_for_org', {
        p_org_id: currentOrganization.id,
        p_limit:  100,
        p_offset: 0,
      });
      if (rpcErr) throw rpcErr;
      setEntries((data ?? []) as AuditEntry[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <FontAwesome name="arrow-left" size={18} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Audit Trail</Text>
          <Text style={styles.headerSub}>Admin-only · Last 100 events</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4D3636" />
          <Text style={styles.loadingText}>Loading audit log…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <FontAwesome name="lock" size={32} color="#9ca3af" />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorSub}>Only organisation owners and admins can view the audit trail.</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <FontAwesome name="history" size={32} color="#9ca3af" />
          <Text style={styles.emptyText}>No audit events yet</Text>
          <Text style={styles.emptySub}>System mutations (KYC changes, team changes) will appear here.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4D3636" />}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((entry, index) => (
            <View key={entry.id} style={[styles.entry, index === entries.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.entryIcon}>
                <FontAwesome
                  name={(EVENT_ICONS[entry.event_type] ?? 'circle') as never}
                  size={14}
                  color="#4D3636"
                />
              </View>
              <View style={styles.entryBody}>
                <Text style={styles.entryLabel}>
                  {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                </Text>
                <Text style={styles.entryActor} numberOfLines={1}>
                  {entry.actor_name}
                  {entry.actor_email ? ` · ${entry.actor_email}` : ''}
                </Text>
                <Text style={styles.entryDate}>{formatDate(entry.created_at)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#f9fafb' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerCenter:  { flex: 1, alignItems: 'center' },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub:     { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  scroll:        { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  loadingText:   { fontSize: 14, color: '#6b7280', marginTop: 8 },
  errorText:     { fontSize: 15, fontWeight: '600', color: '#ef4444', textAlign: 'center' },
  errorSub:      { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  emptyText:     { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySub:      { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  entry:         { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  entryIcon:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  entryBody:     { flex: 1, minWidth: 0 },
  entryLabel:    { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  entryActor:    { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  entryDate:     { fontSize: 11, color: '#9ca3af' },
});
