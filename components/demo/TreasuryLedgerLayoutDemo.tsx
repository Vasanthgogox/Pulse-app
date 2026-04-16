/**
 * Treasury / Financial Summary ledger layout demo.
 * Matches the web mock: dark top (header, tabs, summary, toolbar) + light table (ENTITY/DESC | LINK | RECEIVED | PAID).
 * Uses Theme, Layout, safe area. For comparison with the real Finance tab; see docs/LEDGER_LAYOUT_TREASURY_MOCK.md.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';

type TxnType = 'IN' | 'OUT';
type EntityType = 'Client' | 'Supplier' | 'Driver' | 'Vendor';

interface MockTxn {
  id: string;
  date: string;
  entityName: string;
  entityType: EntityType;
  category: string;
  route: string | null;
  tripRef: string | null;
  truckRef: string | null;
  type: TxnType;
  amount: number;
}

const MOCK_TXNS: MockTxn[] = [
  {
    id: 'TXN-001',
    date: '01 Mar 26, 09:00 AM',
    entityName: 'Acme Corp',
    entityType: 'Client',
    category: 'Advance Payment',
    route: 'Chennai → Mumbai',
    tripRef: 'TRP-10045',
    truckRef: null,
    type: 'IN',
    amount: 25000,
  },
  {
    id: 'TXN-002',
    date: '01 Mar 26, 14:30 PM',
    entityName: 'Fast Fleet Logistics',
    entityType: 'Supplier',
    category: 'Truck Hire',
    route: 'Chennai → Mumbai',
    tripRef: 'TRP-10045',
    truckRef: 'TN-01-AB-1234',
    type: 'OUT',
    amount: 18000,
  },
  {
    id: 'TXN-003',
    date: '02 Mar 26, 10:15 AM',
    entityName: 'Rajesh Kumar',
    entityType: 'Driver',
    category: 'Driver Allowance',
    route: 'Chennai → Mumbai',
    tripRef: 'TRP-10045',
    truckRef: 'TN-01-AB-1234',
    type: 'OUT',
    amount: 3000,
  },
  {
    id: 'TXN-004',
    date: '02 Mar 26, 18:45 PM',
    entityName: 'Reliance Pump',
    entityType: 'Vendor',
    category: 'Fuel',
    route: 'Vijayawada → Agra',
    tripRef: 'TRP-10046',
    truckRef: 'TN-01-AB-1234',
    type: 'OUT',
    amount: 17500,
  },
  {
    id: 'TXN-005',
    date: '04 Mar 26, 11:00 AM',
    entityName: "mukunt's org",
    entityType: 'Client',
    category: 'Entry',
    route: 'Vijayawada → Agra',
    tripRef: 'TRP-10046',
    truckRef: null,
    type: 'IN',
    amount: 2000,
  },
  {
    id: 'TXN-007',
    date: '05 Mar 26, 14:00 PM',
    entityName: 'Highway Tolls Ltd',
    entityType: 'Vendor',
    category: 'Toll',
    route: null,
    tripRef: null,
    truckRef: 'MH-12-PQ-5678',
    type: 'OUT',
    amount: 500,
  },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);
}

export function TreasuryLedgerLayoutDemo() {
  const insets = useSafeAreaInsets();
  const totalIn = MOCK_TXNS.filter((t) => t.type === 'IN').reduce((a, c) => a + c.amount, 0);
  const totalOut = MOCK_TXNS.filter((t) => t.type === 'OUT').reduce((a, c) => a + c.amount, 0);
  const receivable = 37000;
  const payable = 0;

  return (
    <View style={[styles.outer, { paddingTop: insets.top }]}>
      {/* Dark top section */}
      <View style={styles.darkTop}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>TREASURY</Text>
            <Text style={styles.subtitle}>FISCAL MATRIX</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn} hitSlop={8}>
              <FontAwesome name="th-large" size={20} color={Theme.textOnDarkMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} hitSlop={8}>
              <FontAwesome name="globe" size={20} color={Theme.textOnDarkMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} hitSlop={8}>
              <View style={styles.bellWrap}>
                <FontAwesome name="bell-o" size={20} color={Theme.textOnDarkMuted} />
                <View style={styles.bellDot} />
              </View>
            </TouchableOpacity>
            <View style={styles.avatar}>
              <FontAwesome name="user" size={16} color={Theme.textOnDarkMuted} />
            </View>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
          style={styles.tabsWrap}
        >
          <Text style={[styles.tab, styles.tabActive]}>Ledger</Text>
          <Text style={styles.tab}>Customers</Text>
          <Text style={styles.tab}>Suppliers</Text>
          <Text style={styles.tab}>Garage</Text>
          <Text style={styles.tab}>Drivers</Text>
        </ScrollView>

        {/* Cash summary */}
        <View style={styles.summary}>
          <View style={styles.summaryBlock}>
            <View style={styles.summaryLabelRow}>
              <FontAwesome name="arrow-circle-up" size={14} color={Theme.darkGreen} />
              <Text style={styles.summaryLabel}> TOTAL RECEIVED</Text>
            </View>
            <Text style={styles.summaryValue}>₹{formatCurrency(totalIn)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={[styles.summaryBlock, styles.summaryBlockEnd]}>
            <View style={styles.summaryLabelRow}>
              <Text style={styles.summaryLabel}> TOTAL PAID </Text>
              <FontAwesome name="arrow-circle-down" size={14} color={Theme.teslaRed} />
            </View>
            <Text style={styles.summaryValue}>₹{formatCurrency(totalOut)}</Text>
          </View>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
            <FontAwesome name="search" size={14} color={Theme.textOnDarkMuted} style={styles.searchIcon} />
            <TextInput
              placeholder="Search party, description..."
              placeholderTextColor={Theme.textOnDarkMuted}
              style={styles.searchInput}
              editable={false}
            />
          </View>
          <TouchableOpacity style={styles.pill}>
            <FontAwesome name="filter" size={14} color={Theme.textOnPrimary} />
            <Text style={styles.pillText}> RANGE </Text>
            <FontAwesome name="chevron-down" size={12} color={Theme.textOnPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill}>
            <FontAwesome name="th-large" size={14} color={Theme.textOnPrimary} />
            <Text style={styles.pillText}> ALL </Text>
            <FontAwesome name="chevron-down" size={12} color={Theme.textOnPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconPill}>
            <FontAwesome name="file-text-o" size={16} color={Theme.textOnDarkMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Light table: banner first, then headers, then rows (match screenshot order) */}
      <View style={[styles.tableWrap, { paddingBottom: 24 + insets.bottom + 80 }]}>
        <View style={styles.bannerWrap}>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              From trips: Receivable ₹{formatCurrency(receivable)} • Payable ₹{formatCurrency(payable)}
            </Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thEntity]}>ENTITY / DESC</Text>
          <Text style={[styles.th, styles.thLink]}>LINK</Text>
          <Text style={[styles.th, styles.thIn]}>RECEIVED</Text>
          <Text style={[styles.th, styles.thOut]}>PAID</Text>
        </View>

        <ScrollView style={styles.tableScroll} showsVerticalScrollIndicator={true}>
          {MOCK_TXNS.map((txn) => (
            <View key={txn.id} style={styles.row}>
              <View style={[styles.cell, styles.cellEntity]}>
                <Text style={styles.entityName} numberOfLines={1}>
                  {txn.entityName}
                </Text>
                <Text style={styles.entityCategory}>{txn.category}</Text>
                <Text style={styles.entityDate}>{txn.date}</Text>
              </View>
              <View style={[styles.cell, styles.cellLink]}>
                {txn.route ? (
                  <View style={styles.linkRow}>
                    <Text style={styles.linkRoute} numberOfLines={1}>
                      {txn.route}
                    </Text>
                    <FontAwesome name="chevron-down" size={12} color={Theme.textSecondary} />
                  </View>
                ) : (
                  <Text style={styles.linkNa}>—</Text>
                )}
                {txn.truckRef ? (
                  <View style={styles.truckBadge}>
                    <FontAwesome name="truck" size={10} color={Theme.primary} />
                    <Text style={styles.truckText}>{txn.truckRef}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.cell, styles.cellIn]}>
                {txn.type === 'IN' ? (
                  <Text style={styles.amountIn}>{formatCurrency(txn.amount)}</Text>
                ) : (
                  <Text style={styles.amountDashGray}>—</Text>
                )}
              </View>
              <View style={[styles.cell, styles.cellOut]}>
                {txn.type === 'OUT' ? (
                  <Text style={styles.amountOut}>{formatCurrency(txn.amount)}</Text>
                ) : (
                  <Text style={styles.amountDashGray}>—</Text>
                )}
                <FontAwesome name="chevron-right" size={14} color={Theme.textSecondary} style={styles.cellChevron} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Bottom nav strip (demo) */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.footerPillActive}>
          <FontAwesome name="credit-card" size={20} color={Theme.primary} />
          <Text style={styles.footerLabelActive}>FISCAL</Text>
        </View>
        <TouchableOpacity style={styles.footerPill}>
          <FontAwesome name="comment" size={20} color={Theme.textSecondary} />
          <Text style={styles.footerLabel}>OPS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerPill}>
          <FontAwesome name="list" size={20} color={Theme.textSecondary} />
          <Text style={styles.footerLabel}>TRIPS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Theme.darkBackground,
  },
  darkTop: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
    color: Theme.textOnDark,
  },
  subtitle: {
    fontSize: 10,
    color: Theme.textOnDarkMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    padding: 4,
  },
  bellWrap: {
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsWrap: {
    maxHeight: 44,
  },
  tabsScroll: {
    flexDirection: 'row',
    gap: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.darkSurface,
  },
  tab: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: Theme.textOnDarkMuted,
  },
  tabActive: {
    color: Theme.textOnDark,
    borderBottomWidth: 2,
    borderBottomColor: Theme.teslaRed,
    paddingBottom: 10,
    marginBottom: -12,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  summaryBlock: {
    flex: 1,
  },
  summaryBlockEnd: {
    alignItems: 'flex-end',
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: Theme.textOnDarkMuted,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Theme.textOnDark,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Theme.darkSurface,
    marginHorizontal: 16,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    paddingVertical: 10,
    paddingLeft: 36,
    paddingRight: 14,
    fontSize: 14,
    color: Theme.textOnDark,
    borderWidth: 1,
    borderColor: Theme.darkSurface,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: Theme.darkSurface,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textOnDark,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: Theme.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  thEntity: {
    flex: 1.2,
  },
  thLink: {
    flex: 1,
    textAlign: 'center',
  },
  thIn: {
    flex: 0.7,
    textAlign: 'right',
  },
  thOut: {
    flex: 0.9,
    textAlign: 'right',
  },
  bannerWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  banner: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  bannerText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  tableScroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    alignItems: 'stretch',
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  cellEntity: {
    flex: 1.2,
    borderRightWidth: 1,
    borderRightColor: Theme.border,
  },
  cellLink: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: Theme.border,
    alignItems: 'center',
  },
  cellIn: {
    flex: 0.7,
    borderRightWidth: 1,
    borderRightColor: Theme.border,
    alignItems: 'flex-end',
  },
  cellOut: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  entityName: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  entityCategory: {
    fontSize: 10,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  entityDate: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkRoute: {
    fontSize: 10,
    color: Theme.textSecondary,
    flex: 1,
  },
  linkNa: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  truckBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: Theme.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.border,
    alignSelf: 'center',
  },
  truckText: {
    fontSize: 9,
    color: Theme.primary,
    fontWeight: '600',
  },
  amountIn: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.darkGreen,
  },
  amountOut: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.teslaRed,
  },
  amountDashGray: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  cellChevron: {
    marginLeft: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  footerPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  footerPillActive: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Theme.fiscalTabActiveBg,
    borderRadius: 12,
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  footerLabelActive: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: Theme.primary,
    marginTop: 4,
  },
});
