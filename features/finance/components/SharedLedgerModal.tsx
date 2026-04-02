/**
 * Shared Ledger modal — full-screen modal with header + close + SharedLedgerContent.
 * Fetches verified balances and connections when visible; passes to content for O(n) row build.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import {
  getVerifiedBalances,
  getSharedLedgerConnections,
  getOpenDisputesByOrg,
} from '@/services/sharedLedgerService';
import { SharedLedgerContent } from './SharedLedgerContent';
import type { SharedLedgerContentProps, SharedLedgerPartyRow } from './SharedLedgerContent';
import { DisputeAuditSheet } from './DisputeAuditSheet';

export type { SharedLedgerContentProps, SharedLedgerPartyRow } from './SharedLedgerContent';

export interface SharedLedgerModalProps extends SharedLedgerContentProps {
  visible: boolean;
  onClose: () => void;
  organizationId: string | null;
  /** Optional: when user taps a MISMATCH row, modal opens dispute sheet. If not provided, no dispute UI. */
  onOpenDispute?: (row: SharedLedgerPartyRow, partnerOrgId: string | null) => void;
}

export function SharedLedgerModal({
  visible,
  onClose,
  organizationId,
  ledgerTransactions,
  clients,
  suppliers,
  tripCountByParty = {},
  onOpenDispute,
}: SharedLedgerModalProps) {
  const [verifiedBalances, setVerifiedBalances] = useState<
    { partnerKey: string; balance: number }[]
  >([]);
  const [integratedPartnerKeys, setIntegratedPartnerKeys] = useState<Set<string>>(new Set());
  const [disputesByPartner, setDisputesByPartner] = useState<
    Record<string, { status: string }[]>
  >({});
  const [contactIdToPartnerOrgId, setContactIdToPartnerOrgId] = useState<Record<string, string>>({});
  const [sharedDataLoading, setSharedDataLoading] = useState(false);
  const [showDisputeSheet, setShowDisputeSheet] = useState(false);
  const [disputeRow, setDisputeRow] = useState<SharedLedgerPartyRow | null>(null);
  const [disputePartnerOrgId, setDisputePartnerOrgId] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const insets = useSafeAreaInsets();

  const fetchSharedData = useCallback(async () => {
    if (!organizationId) return;
    setSharedDataLoading(true);
    const [balancesRes, connectionsRes, disputesRes] = await Promise.all([
      getVerifiedBalances(organizationId),
      getSharedLedgerConnections(organizationId),
      getOpenDisputesByOrg(organizationId),
    ]);
    setSharedDataLoading(false);
    if (!balancesRes.error) setVerifiedBalances(balancesRes.balances);
    const partnerOrgToContactId = new Map<string, string>();
    const contactIdToPartnerOrg: Record<string, string> = {};
    if (!connectionsRes.error) {
      const keys = new Set<string>();
      for (const c of connectionsRes.connections) {
        if (c.contact_id) {
          keys.add(c.contact_id);
          partnerOrgToContactId.set(c.partner_org_id, c.contact_id);
          contactIdToPartnerOrg[c.contact_id] = c.partner_org_id;
        } else {
          keys.add(c.partner_org_id);
        }
      }
      setIntegratedPartnerKeys(keys);
      setContactIdToPartnerOrgId(contactIdToPartnerOrg);
    }
    if (!disputesRes.error) {
      const byPartner: Record<string, { status: string }[]> = {};
      for (const d of disputesRes.disputes) {
        const key = partnerOrgToContactId.get(d.partner_org_id) ?? d.partner_org_id;
        if (!byPartner[key]) byPartner[key] = [];
        byPartner[key].push({ status: d.status });
      }
      setDisputesByPartner(byPartner);
    }
  }, [organizationId]);

  useEffect(() => {
    if (visible && organizationId && !fetchedRef.current) {
      fetchedRef.current = true;
      setSharedDataLoading(true);
      fetchSharedData();
    }
    if (!visible) fetchedRef.current = false;
  }, [visible, organizationId, fetchSharedData]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Shared Ledger</Text>
          <Text style={styles.headerSubtitle}>Compare & verify — clients & suppliers</Text>
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 16 }]}
            onPress={onClose}
            hitSlop={12}
          >
            <FontAwesome name="times" size={20} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        </View>
        {sharedDataLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading shared data…</Text>
          </View>
        ) : (
          <SharedLedgerContent
            ledgerTransactions={ledgerTransactions}
            clients={clients}
            suppliers={suppliers}
            tripCountByParty={tripCountByParty}
            verifiedBalances={verifiedBalances}
            integratedPartnerKeys={integratedPartnerKeys}
            disputesByPartner={disputesByPartner}
            onRowPress={
              onOpenDispute
                ? (row) => onOpenDispute(row, contactIdToPartnerOrgId[row.id] ?? null)
                : (row) => {
                    if (row.canRaiseDispute) {
                      setDisputeRow(row);
                      setDisputePartnerOrgId(contactIdToPartnerOrgId[row.id] ?? null);
                      setShowDisputeSheet(true);
                    }
                  }
            }
            onLayerChange={(layer) => {
              if (layer === 'SHARED' && verifiedBalances.length === 0 && organizationId) {
                fetchSharedData();
              }
            }}
            embedded={false}
          />
        )}

        <DisputeAuditSheet
          visible={showDisputeSheet}
          onClose={() => {
            setShowDisputeSheet(false);
            setDisputeRow(null);
            setDisputePartnerOrgId(null);
          }}
          onSuccess={() => {
            fetchSharedData();
            setShowDisputeSheet(false);
            setDisputeRow(null);
            setDisputePartnerOrgId(null);
          }}
          organizationId={organizationId}
          partnerKey={disputeRow?.id ?? ''}
          partnerName={disputeRow?.name ?? ''}
          partnerType={disputeRow?.type ?? 'CLIENT'}
          internalDue={disputeRow?.internalDue ?? 0}
          verifiedDue={disputeRow?.verifiedDue ?? null}
          partnerOrgId={disputePartnerOrgId}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    marginTop: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    padding: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
  },
});
