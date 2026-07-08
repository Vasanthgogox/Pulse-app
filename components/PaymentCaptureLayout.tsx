import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { useSafeBack } from '@/lib/useSafeBack';

function getInitial(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase();
}

interface PaymentCaptureLayoutProps {
  contactName: string;
  onBack?: () => void;
  onSettingsPress?: () => void;
  onCallPress?: () => void;
  onMenuPress?: () => void;
  summaryTitle?: string;
  summaryAmount?: string;
  summaryAmountColor?: 'red' | 'green' | 'default';
  youWillGiveLabel?: string;
  youWillGiveAmount?: string;
  addContactHint?: string;
  onAddContactPress?: () => void;
  onReportPress?: () => void;
  onRemindersPress?: () => void;
  onSmsPress?: () => void;
  entriesLabel?: string;
  youGaveLabel?: string;
  youGotLabel?: string;
  children: ReactNode;
  onYouGavePress?: () => void;
  onYouGotPress?: () => void;
  youGaveButtonLabel?: string;
  youGotButtonLabel?: string;
}

export function PaymentCaptureLayout({
  contactName,
  onBack,
  onSettingsPress,
  onCallPress,
  onMenuPress,
  summaryTitle,
  summaryAmount,
  summaryAmountColor = 'default',
  youWillGiveLabel = "You'll Give",
  youWillGiveAmount,
  addContactHint,
  onAddContactPress,
  onReportPress,
  onRemindersPress,
  onSmsPress,
  entriesLabel = 'ENTRIES',
  youGaveLabel = 'YOU GAVE',
  youGotLabel = 'YOU GOT',
  children,
  onYouGavePress,
  onYouGotPress,
  youGaveButtonLabel = 'YOU GAVE ₹',
  youGotButtonLabel = 'YOU GOT ₹',
}: PaymentCaptureLayoutProps) {
  const insets = useSafeAreaInsets();
  const safeBack = useSafeBack();

  const handleBack = onBack || safeBack;
  const initial = getInitial(contactName);

  const summaryAmountStyle =
    summaryAmountColor === 'red' ? styles.summaryAmountRed : summaryAmountColor === 'green' ? styles.summaryAmountGreen : styles.summaryAmountDefault;

  return (
    <View style={styles.container}>
      {/* Dark blue header with contact info */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={Theme.textOnPrimary} />
        </TouchableOpacity>

        <View style={styles.contactInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.contactDetails}>
            <Text style={styles.contactName}>{contactName}</Text>
            {onSettingsPress && (
              <TouchableOpacity onPress={onSettingsPress}>
                <Text style={styles.settingsLink}>Click here to view settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.headerActions}>
          {onCallPress && (
            <TouchableOpacity onPress={onCallPress} style={styles.headerIcon}>
              <FontAwesome name="phone" size={20} color={Theme.textOnPrimary} />
            </TouchableOpacity>
          )}
          {onMenuPress && (
            <TouchableOpacity onPress={onMenuPress} style={styles.headerIcon}>
              <FontAwesome name="ellipsis-v" size={20} color={Theme.textOnPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: 100 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Summary card */}
        {(summaryTitle || summaryAmount || youWillGiveAmount) && (
          <View style={styles.summaryCard}>
            {summaryTitle && (
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>{summaryTitle}</Text>
                <FontAwesome name="chevron-right" size={16} color={Theme.textSecondary} />
              </View>
            )}
            {summaryAmount && (
              <Text style={[styles.summaryAmount, summaryAmountStyle]}>{summaryAmount}</Text>
            )}
            {youWillGiveAmount && (
              <View style={styles.youWillGiveSection}>
                <Text style={styles.youWillGiveLabel}>{youWillGiveLabel}</Text>
                <Text style={styles.youWillGiveAmount}>{youWillGiveAmount}</Text>
              </View>
            )}
            {addContactHint && onAddContactPress && (
              <View style={styles.addContactSection}>
                <Text style={styles.addContactHint}>{addContactHint}</Text>
                <TouchableOpacity style={styles.addButton} onPress={onAddContactPress}>
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        {(onReportPress || onRemindersPress || onSmsPress || onCallPress) && (
          <View style={styles.actionButtons}>
            {onReportPress && (
              <TouchableOpacity style={styles.actionButton} onPress={onReportPress}>
                <View style={styles.actionIconContainer}>
                  <FontAwesome name="file-pdf-o" size={24} color={Theme.primary} />
                  <Text style={styles.actionIconText}>PDF</Text>
                </View>
                <Text style={styles.actionButtonLabel}>Report</Text>
              </TouchableOpacity>
            )}
            {onRemindersPress && (
              <TouchableOpacity style={styles.actionButton} onPress={onRemindersPress}>
                <FontAwesome name="comment-o" size={24} color={Theme.primary} />
                <Text style={styles.actionButtonLabel}>Reminders</Text>
              </TouchableOpacity>
            )}
            {onSmsPress && (
              <TouchableOpacity style={styles.actionButton} onPress={onSmsPress}>
                <FontAwesome name="envelope-o" size={24} color={Theme.primary} />
                <Text style={styles.actionButtonLabel}>SMS</Text>
              </TouchableOpacity>
            )}
            {onCallPress && !onReportPress && (
              <TouchableOpacity style={styles.actionButton} onPress={onCallPress}>
                <FontAwesome name="phone" size={24} color={Theme.primary} />
                <Text style={styles.actionButtonLabel}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Transaction list header */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>{entriesLabel}</Text>
          <Text style={styles.listHeaderText}>{youGaveLabel}</Text>
          <Text style={styles.listHeaderText}>{youGotLabel}</Text>
        </View>

        {/* Transaction list */}
        {children}
      </ScrollView>

      {/* Bottom action buttons */}
      {(onYouGavePress || onYouGotPress) && (
        <View style={[styles.bottomActions, { paddingBottom: insets.bottom }]}>
          {onYouGavePress && (
            <TouchableOpacity style={styles.youGaveButton} onPress={onYouGavePress}>
              <Text style={styles.bottomButtonText}>{youGaveButtonLabel}</Text>
            </TouchableOpacity>
          )}
          {onYouGotPress && (
            <TouchableOpacity style={styles.youGotButton} onPress={onYouGotPress}>
              <Text style={styles.bottomButtonText}>{youGotButtonLabel}</Text>
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
    backgroundColor: Theme.buttonPrimary,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: Theme.positive,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textOnPrimary,
    marginBottom: 2,
  },
  settingsLink: {
    fontSize: 12,
    color: Theme.textOnPrimary,
    opacity: 0.9,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIcon: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: Theme.cardWhite,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    padding: 20,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 16,
  },
  summaryAmountDefault: {
    color: Theme.textPrimary,
  },
  summaryAmountRed: {
    color: Theme.negative,
  },
  summaryAmountGreen: {
    color: Theme.positive,
  },
  youWillGiveSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.positiveMuted,
    padding: 12,
    marginTop: 8,
  },
  youWillGiveLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  youWillGiveAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.positive,
  },
  addContactSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  addContactHint: {
    fontSize: 14,
    color: Theme.textSecondary,
    flex: 1,
  },
  addButton: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.buttonPrimaryText,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
    marginBottom: 8,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionIconContainer: {
    alignItems: 'center',
    gap: 2,
  },
  actionIconText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.primary,
  },
  actionButtonLabel: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  listHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textPrimary,
    textTransform: 'uppercase',
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    gap: 12,
  },
  youGaveButton: {
    flex: 1,
    backgroundColor: Theme.negative,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youGotButton: {
    flex: 1,
    backgroundColor: Theme.positive,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
  },
});

