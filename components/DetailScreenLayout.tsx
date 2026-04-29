import type { ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { useSafeBack } from '@/lib/useSafeBack';

interface DetailScreenLayoutProps {
  title: string;
  onBack?: () => void;
  startDate?: string;
  endDate?: string;
  onStartDatePress?: () => void;
  onEndDatePress?: () => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filterValue?: string;
  onFilterPress?: () => void;
  netBalance?: string;
  netBalanceColor?: 'red' | 'green' | 'default';
  entriesLabel?: string;
  entriesCount?: string;
  youGaveLabel?: string;
  youGaveAmount?: string;
  youGotLabel?: string;
  youGotAmount?: string;
  children: ReactNode;
  onDownloadPress?: () => void;
  onSharePress?: () => void;
  /** Pull-to-refresh. */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

export function DetailScreenLayout({
  title,
  onBack,
  startDate,
  endDate,
  onStartDatePress,
  onEndDatePress,
  searchPlaceholder = 'Search Entries',
  searchValue = '',
  onSearchChange,
  filterValue = 'All',
  onFilterPress,
  netBalance,
  netBalanceColor = 'default',
  entriesLabel = 'ENTRIES',
  entriesCount,
  youGaveLabel = 'YOU GAVE',
  youGaveAmount,
  youGotLabel = 'YOU GOT',
  youGotAmount,
  children,
  onDownloadPress,
  onSharePress,
  onRefresh,
  refreshing = false,
}: DetailScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const safeBack = useSafeBack();

  const handleBack = onBack || safeBack;

  return (
    <View style={styles.container}>
      {/* Dark blue header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={Theme.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Date selection section */}
      {(startDate || endDate || onStartDatePress || onEndDatePress) && (
        <View style={styles.dateSection}>
          {onStartDatePress && (
            <TouchableOpacity style={styles.dateButton} onPress={onStartDatePress}>
              <FontAwesome name="calendar" size={16} color={Theme.textSecondary} style={styles.dateIcon} />
              <Text style={styles.dateButtonText}>{startDate || 'Start Date'}</Text>
            </TouchableOpacity>
          )}
          {onEndDatePress && (
            <TouchableOpacity style={styles.dateButton} onPress={onEndDatePress}>
              <FontAwesome name="calendar" size={16} color={Theme.textSecondary} style={styles.dateIcon} />
              <Text style={styles.dateButtonText}>{endDate || 'End Date'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <FontAwesome name="search" size={18} color={Theme.iconMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={Theme.textMuted}
            value={searchValue}
            onChangeText={onSearchChange}
            editable={!!onSearchChange}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
        {onFilterPress && (
          <TouchableOpacity style={styles.filterButton} onPress={onFilterPress}>
            <Text style={styles.filterText}>{filterValue}</Text>
            <FontAwesome name="chevron-down" size={14} color={Theme.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: 100 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          ) : undefined
        }
      >
        {/* Net Balance section */}
        {netBalance != null && (
          <View style={styles.netBalanceSection}>
            <Text style={styles.netBalanceLabel}>Net Balance</Text>
            <Text style={[styles.netBalanceAmount, netBalanceColor === 'red' ? styles.netBalanceRed : netBalanceColor === 'green' ? styles.netBalanceGreen : {}]}>
              {netBalance}
            </Text>
          </View>
        )}

        {/* Entries summary section */}
        {(entriesCount || youGaveAmount || youGotAmount) && (
          <View style={styles.entriesSection}>
            <View style={styles.entriesHeader}>
              <Text style={styles.entriesLabel}>{entriesLabel}</Text>
              <View style={styles.entriesRight}>
                <Text style={styles.entriesRightLabel}>{youGaveLabel}</Text>
                <Text style={styles.entriesRightLabel}>{youGotLabel}</Text>
              </View>
            </View>
            <View style={styles.entriesBody}>
              {entriesCount != null && <Text style={styles.entriesCount}>{entriesCount}</Text>}
              <View style={styles.entriesAmounts}>
                {youGaveAmount != null && <Text style={styles.youGaveAmount}>{youGaveAmount}</Text>}
                {youGotAmount != null && <Text style={styles.youGotAmount}>{youGotAmount}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* Transaction list */}
        {children}
      </ScrollView>

      {/* Bottom action bar */}
      {(onDownloadPress || onSharePress) && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom }]}>
          {onDownloadPress && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownloadPress}>
              <FontAwesome name="download" size={18} color={Theme.textOnPrimary} style={styles.actionIcon} />
              <Text style={styles.actionButtonText}>Download</Text>
            </TouchableOpacity>
          )}
          {onSharePress && (
            <TouchableOpacity style={styles.shareButton} onPress={onSharePress}>
              <FontAwesome name="share" size={18} color={Theme.textOnPrimary} style={styles.actionIcon} />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    backgroundColor: Theme.primary,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textOnPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  dateSection: {
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dateIcon: {
    marginRight: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: Theme.textPrimary,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  filterText: {
    fontSize: 16,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  netBalanceSection: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  netBalanceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  netBalanceAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  netBalanceRed: {
    color: Theme.negative,
  },
  netBalanceGreen: {
    color: Theme.positive,
  },
  entriesSection: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  entriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entriesLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
  },
  entriesRight: {
    flexDirection: 'row',
    gap: 16,
  },
  entriesRightLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
  },
  entriesBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entriesCount: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  entriesAmounts: {
    flexDirection: 'row',
    gap: 16,
  },
  youGaveAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.negative,
  },
  youGotAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.positive,
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    gap: 12,
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.buttonSecondary,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  actionIcon: {
    marginRight: 4,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
});

