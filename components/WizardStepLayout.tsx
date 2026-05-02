import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';

interface WizardStepLayoutProps {
  title: string;
  stepLabel: string;
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onClose: () => void;
  footerLeftLabel: string;
  footerRightLabel: string;
  onFooterLeft: () => void;
  onFooterRight: () => void;
  footerRightDisabled?: boolean;
  /** Optional testID for the footer right button (e.g. invite-submit-btn for E2E). */
  footerRightTestID?: string;
  children: ReactNode;
}

export function WizardStepLayout({
  title,
  stepLabel,
  stepIndex,
  stepCount,
  onBack,
  onClose,
  footerLeftLabel,
  footerRightLabel,
  onFooterLeft,
  onFooterRight,
  footerRightDisabled,
  footerRightTestID,
  children,
}: WizardStepLayoutProps) {
  const insets = useSafeAreaInsets();
  void stepLabel;
  void onClose;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16, paddingBottom: 14 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={onBack} accessibilityLabel="Back">
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
        </View>
        <View style={styles.headerMetaRow}>
          <View style={styles.dots}>
            {Array.from({ length: stepCount }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIndex && styles.dotActive,
                  i < stepIndex && styles.dotDone,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {children}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.footerLeft} onPress={onFooterLeft}>
          <Text style={styles.footerLeftText}>{footerLeftLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID={footerRightTestID}
          style={[styles.footerRight, footerRightDisabled && styles.footerRightDisabled]}
          onPress={onFooterRight}
          disabled={footerRightDisabled}
        >
          <Text style={styles.footerRightText}>{footerRightLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 16,
    backgroundColor: Theme.screenBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingLeft: 48,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surfaceBorder,
  },
  dotActive: {
    width: 24,
    backgroundColor: Theme.teslaRed,
  },
  dotDone: {
    backgroundColor: Theme.textMutedDemo,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  footerLeft: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    minHeight: 48,
    justifyContent: 'center',
  },
  footerLeftText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerRight: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: Theme.buttonMatteBlack,
    minHeight: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  footerRightDisabled: {
    opacity: 0.5,
  },
  footerRightText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonMatteBlackText,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
});
