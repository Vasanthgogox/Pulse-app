/**
 * ClientProfileModal — full-screen enriched client profile.
 * Shows hero, admin registry, tax identity, warehouses, and route contracts.
 * Web desktop: 2-column layout. Mobile: stacked.
 */
import { EntityAvatar } from '@/components/EntityAvatar';
import Theme from '@/constants/Theme';
import type { TripRow } from '@/features/trips/services/trips.service';
import { formatINR } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClientRow } from '../services/clients.service';
import type { ClientContract } from '../services/clientContracts.service';
import type { ClientWarehouse } from '../services/clientWarehouses.service';
import { ClientProfileEditModal } from './ClientProfileEditModal';

// ---- accent constants from design ----
const INDIGO = '#3730a3';
const GREEN = '#16a34a';

export interface ClientProfileModalProps {
  visible: boolean;
  client: ClientRow;
  warehouses: ClientWarehouse[];
  contracts: ClientContract[];
  trips: TripRow[];
  organizationId: string;
  isIntegrated: boolean;
  clientRatingAvg: number | null;
  onClose: () => void;
  onWarehousesChange: (warehouses: ClientWarehouse[]) => void;
  onContractsChange: (contracts: ClientContract[]) => void;
}

function profileReadiness(
  client: ClientRow,
  warehouses: ClientWarehouse[],
  contracts: ClientContract[],
): number {
  let score = 0;
  if ((client.name || client.contact_person || '').trim()) score += 20;
  if ((client.phone ?? '').trim()) score += 20;
  if ((client.gstin ?? '').trim()) score += 20;
  if (warehouses.length > 0) score += 20;
  if (contracts.length > 0) score += 20;
  return score;
}

function rateTypeLabel(rt: ClientContract['rate_type']): string {
  const map: Record<string, string> = {
    per_trip: '/trip',
    per_ton: '/ton',
    per_kg: '/kg',
    per_km: '/km',
    fixed: ' fixed',
  };
  return map[rt] ?? '';
}

export function ClientProfileModal({
  visible,
  client,
  warehouses,
  contracts,
  trips,
  organizationId,
  isIntegrated,
  clientRatingAvg,
  onClose,
  onWarehousesChange,
  onContractsChange,
}: ClientProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && windowWidth >= 900;
  const [showEdit, setShowEdit] = useState(false);

  const clientName = (client.name || client.contact_person || '').trim() || 'Client';
  const shortId = (client.display_id ?? client.id?.slice(0, 8) ?? '').toUpperCase();
  const readiness = profileReadiness(client, warehouses, contracts);
  const totalSales = trips.reduce((sum, t) => sum + Number(t.client_price ?? 0), 0);
  const networkTrust = clientRatingAvg != null ? Math.round(clientRatingAvg * 20) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityLabel="Close profile"
            >
              <FontAwesome name="times" size={18} color={Theme.textOnPrimary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>CLIENT PROFILE</Text>
              <Text style={styles.headerSub}>#{shortId}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setShowEdit(true)}
            activeOpacity={0.85}
            accessibilityLabel="Edit client profile"
          >
            <FontAwesome name="pencil" size={13} color={INDIGO} />
            <Text style={styles.editBtnText}>EDIT</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.avatarCircle}>
              <EntityAvatar
                name={clientName}
                avatarUrl={client.avatar_url}
                avatarSeed={client.avatar_seed}
                entityType="client"
                isIntegrated={isIntegrated}
                size={72}
                showIntegrationBadge={false}
              />
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName} numberOfLines={2}>{clientName}</Text>
              <View style={styles.heroPills}>
                <View style={[styles.pill, { backgroundColor: GREEN + '22', borderColor: GREEN + '44' }]}>
                  <Text style={[styles.pillText, { color: GREEN }]}>ACTIVE PROFILE</Text>
                </View>
                {isIntegrated && (
                  <View style={[styles.pill, { backgroundColor: INDIGO + '18', borderColor: INDIGO + '40' }]}>
                    <Text style={[styles.pillText, { color: INDIGO }]}>INTEGRATED NODE</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Readiness bar */}
          <View style={styles.readinessWrap}>
            <View style={styles.readinessLabelRow}>
              <Text style={styles.readinessLabel}>PROFILE READINESS</Text>
              <Text style={styles.readinessPercent}>{readiness}%</Text>
            </View>
            <View style={styles.readinessTrack}>
              <View style={[styles.readinessFill, { width: `${readiness}%` as `${number}%` }]} />
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>BUSINESS VOLUME</Text>
              <Text style={styles.statValue}>{formatINR(totalSales)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>NETWORK TRUST</Text>
              <Text style={styles.statValue}>
                {networkTrust != null ? `${networkTrust}%` : '—'}
              </Text>
            </View>
          </View>

          {/* Two-column layout on wide screens */}
          <View style={[styles.columns, isWide && styles.columnsWide]}>
            {/* Left column */}
            <View style={[styles.column, isWide && styles.columnLeft]}>
              {/* Admin Registry */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ADMIN REGISTRY</Text>
                <ContactPillCard
                  icon="user-o"
                  label="Contact Person"
                  value={client.contact_person}
                />
                <ContactPillCard
                  icon="envelope-o"
                  label="Email"
                  value={client.email}
                />
                <ContactPillCard
                  icon="phone"
                  label="Phone"
                  value={client.phone}
                />
              </View>

              {/* Tax Identity */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>TAX IDENTITY</Text>
                <View style={styles.taxRow}>
                  <Text style={styles.taxLabel}>GSTIN</Text>
                  <Text style={[styles.taxValue, !(client.gstin ?? '').trim() && styles.taxValueMissing]}>
                    {(client.gstin ?? '').trim() || 'NOT CONFIGURED'}
                  </Text>
                </View>
                {(client.pan_number ?? '').trim() ? (
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>PAN</Text>
                    <Text style={styles.taxValue}>{client.pan_number}</Text>
                  </View>
                ) : null}
                {(client.address ?? '').trim() ? (
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>BILLING ADDRESS</Text>
                    <Text style={styles.taxValue}>{client.address}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Right column */}
            <View style={[styles.column, isWide && styles.columnRight]}>
              {/* Operations Hubs */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>OPERATIONS HUBS</Text>
                {warehouses.length === 0 ? (
                  <Text style={styles.emptyHint}>No warehouses registered yet.</Text>
                ) : (
                  <View style={styles.warehouseGrid}>
                    {warehouses.map((wh) => (
                      <View key={wh.id} style={styles.warehouseCard}>
                        <View style={styles.warehouseIconWrap}>
                          <FontAwesome name="building-o" size={16} color={INDIGO} />
                        </View>
                        <View style={styles.warehouseInfo}>
                          <Text style={styles.warehouseName} numberOfLines={1}>{wh.name}</Text>
                          {(wh.city || wh.state) ? (
                            <Text style={styles.warehouseSub} numberOfLines={1}>
                              {[wh.city, wh.state].filter(Boolean).join(', ')}
                            </Text>
                          ) : null}
                          {wh.local_gstin ? (
                            <Text style={styles.warehouseGst} numberOfLines={1}>
                              GST: {wh.local_gstin}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Route Contracts */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ACTIVE ROUTE CONTRACTS</Text>
                {contracts.length === 0 ? (
                  <Text style={styles.emptyHint}>No active contracts defined.</Text>
                ) : (
                  <View style={styles.contractTable}>
                    <View style={styles.contractTableHeader}>
                      <Text style={[styles.contractCol, styles.contractColPickup, styles.contractHeaderText]}>
                        PICKUP NODE
                      </Text>
                      <Text style={[styles.contractCol, styles.contractColDest, styles.contractHeaderText]}>
                        DESTINATION
                      </Text>
                      <Text style={[styles.contractCol, styles.contractColPrice, styles.contractHeaderText]}>
                        CONTRACT PRICE
                      </Text>
                    </View>
                    {contracts.map((c) => (
                      <View key={c.id} style={styles.contractTableRow}>
                        <Text
                          style={[styles.contractCol, styles.contractColPickup, styles.contractCellText]}
                          numberOfLines={2}
                        >
                          {c.pickup_area}
                        </Text>
                        <Text
                          style={[styles.contractCol, styles.contractColDest, styles.contractCellText]}
                          numberOfLines={2}
                        >
                          {c.drop_location}
                        </Text>
                        <Text
                          style={[styles.contractCol, styles.contractColPrice, styles.contractPriceText]}
                          numberOfLines={1}
                        >
                          {c.rate != null ? `${formatINR(c.rate)}${rateTypeLabel(c.rate_type)}` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>

      {showEdit && (
        <ClientProfileEditModal
          visible={showEdit}
          client={client}
          warehouses={warehouses}
          contracts={contracts}
          organizationId={organizationId}
          onClose={() => setShowEdit(false)}
          onWarehousesChange={onWarehousesChange}
          onContractsChange={onContractsChange}
        />
      )}
    </Modal>
  );
}

function ContactPillCard({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string | null | undefined;
}) {
  const hasValue = (value ?? '').trim().length > 0;
  return (
    <View style={styles.contactPill}>
      <View style={styles.contactPillIcon}>
        <FontAwesome name={icon} size={14} color={hasValue ? INDIGO : Theme.textMuted} />
      </View>
      <View style={styles.contactPillText}>
        <Text style={styles.contactPillLabel}>{label}</Text>
        <Text
          style={[styles.contactPillValue, !hasValue && styles.contactPillValueMissing]}
          numberOfLines={1}
        >
          {hasValue ? value : 'Not provided'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Theme.textOnPrimary,
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: INDIGO,
    letterSpacing: 0.5,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  readinessWrap: {
    marginBottom: 16,
  },
  readinessLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  readinessLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.8,
  },
  readinessPercent: {
    fontSize: 10,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: 0.5,
  },
  readinessTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
    overflow: 'hidden',
  },
  readinessFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 12,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  columns: {
    flexDirection: 'column',
    gap: 0,
  },
  columnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  column: {
    flex: 1,
  },
  columnLeft: {
    flex: 1,
  },
  columnRight: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  contactPillIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: INDIGO + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactPillText: {
    flex: 1,
    minWidth: 0,
  },
  contactPillLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  contactPillValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  contactPillValueMissing: {
    color: Theme.textMuted,
    fontStyle: 'italic',
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    gap: 8,
  },
  taxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    flexShrink: 0,
    paddingTop: 1,
  },
  taxValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  taxValueMissing: {
    color: Theme.negative,
    fontStyle: 'italic',
  },
  warehouseGrid: {
    gap: 8,
  },
  warehouseCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 10,
    gap: 10,
  },
  warehouseIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: INDIGO + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  warehouseInfo: {
    flex: 1,
    minWidth: 0,
  },
  warehouseName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  warehouseSub: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  warehouseGst: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  contractTable: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    overflow: 'hidden',
  },
  contractTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  contractTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
  },
  contractCol: {
    fontSize: 11,
  },
  contractColPickup: {
    flex: 3,
    paddingRight: 6,
  },
  contractColDest: {
    flex: 3,
    paddingRight: 6,
  },
  contractColPrice: {
    flex: 2,
    textAlign: 'right',
  },
  contractHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  contractCellText: {
    color: Theme.textPrimary,
    fontWeight: '500',
  },
  contractPriceText: {
    color: GREEN,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyHint: {
    fontSize: 12,
    color: Theme.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
