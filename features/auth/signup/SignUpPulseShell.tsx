import { memo, useEffect, useRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';

import { DRIVER_SIGNUP } from './signUpDriverTheme';
import { DESKTOP_SIGNUP_CARD_WIDTH } from './signUpConstants';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';
import { createPulseSignUpTextStyles, PULSE_SIGNUP_TYPO } from './signUpTypography';

/** Min width per progress segment when the rail scrolls horizontally. */
const PROGRESS_ITEM_MIN_WIDTH = 52;

export type SignUpShellTheme = SignUpTheme;

export interface SignUpPulseShellProps {
  backLabel?: string;
  onBack: () => void;
  stepLabels: readonly string[];
  currentStepIndex: number;
  hideProgress?: boolean;
  isDesktop?: boolean;
  theme?: SignUpShellTheme;
  children: ReactNode;
}

export const SignUpPulseShell = memo(function SignUpPulseShell({
  backLabel = 'Back',
  onBack,
  stepLabels,
  currentStepIndex,
  hideProgress = false,
  isDesktop = false,
  theme = PULSE_SIGNUP,
  children,
}: SignUpPulseShellProps) {
  const insets = useSafeAreaInsets();
  const stepIndex = Math.min(Math.max(currentStepIndex, 0), stepLabels.length - 1);
  const styles = createStyles(theme, isDesktop);
  const useScrollableProgress = stepLabels.length > 5;
  const progressScrollRef = useRef<ScrollView>(null);
  const { keyboardVisible } = useKeyboardVisible();
  const showProgress = !hideProgress && stepLabels.length > 0 && !keyboardVisible;

  useEffect(() => {
    if (!useScrollableProgress) return;
    const x = Math.max(0, stepIndex * PROGRESS_ITEM_MIN_WIDTH - 72);
    progressScrollRef.current?.scrollTo({ x, animated: true });
  }, [stepIndex, useScrollableProgress]);

  const device = (
    <View
      style={[
        styles.device,
        isDesktop && styles.deviceDesktopCard,
        !isDesktop && { paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        {backLabel ? (
          <Pressable
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <ChevronLeft size={22} color={theme.muted} strokeWidth={2.5} />
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.brand}>PULSE.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.body, { paddingBottom: hideProgress ? Math.max(insets.bottom, 8) : 0 }]}>
        {children}
      </View>

      {showProgress ? (
        <View
          style={[
            styles.progressFooter,
            { paddingBottom: Math.max(insets.bottom, isDesktop ? 20 : 12) },
          ]}
        >
          {useScrollableProgress ? (
            <ScrollView
              ref={progressScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.progressScrollContent}
            >
              {stepLabels.map((label, i) => {
                const active = i <= stepIndex;
                return (
                  <View
                    key={`${label}-${i}`}
                    style={[styles.progressItem, styles.progressItemScroll]}
                  >
                    <View style={[styles.progressBar, active && styles.progressBarActive]} />
                    <Text
                      style={[styles.progressLabel, active && styles.progressLabelActive]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.progressRow}>
              {stepLabels.map((label, i) => {
                const active = i <= stepIndex;
                return (
                  <View key={`${label}-${i}`} style={styles.progressItem}>
                    <View style={[styles.progressBar, active && styles.progressBarActive]} />
                    <Text
                      style={[styles.progressLabel, active && styles.progressLabelActive]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );

  if (isDesktop) {
    return (
      <View
        style={[
          styles.outerDesktop,
          Platform.OS === 'web' ? (WEB_APP_VIEWPORT_STYLE as object) : null,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {device}
      </View>
    );
  }

  const shellRootStyle: ViewStyle | ViewStyle[] =
    Platform.OS === 'web' ? styles.webFill : styles.nativeFill;

  return (
    <View style={shellRootStyle}>
      <View style={Platform.OS === 'web' ? styles.webCenterWrap : styles.nativeFill}>
        {device}
      </View>
    </View>
  );
});

function createStyles(theme: SignUpShellTheme, isDesktop: boolean) {
  const text = createPulseSignUpTextStyles(theme);

  return StyleSheet.create({
    outerDesktop: {
      flex: 1,
      backgroundColor: theme.canvas,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 28,
    },
    device: {
      flex: 1,
      width: '100%',
      backgroundColor: theme.bg,
      overflow: 'hidden',
      minHeight: 0,
    },
    webFill: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      backgroundColor: theme.canvas,
      minHeight: 0,
    },
    webCenterWrap: {
      flex: 1,
      width: '100%',
      maxWidth: 480,
      minHeight: 0,
    },
    nativeFill: {
      flex: 1,
    },
    deviceDesktopCard: {
      flex: 0,
      flexGrow: 0,
      flexShrink: 1,
      flexDirection: 'column',
      width: DESKTOP_SIGNUP_CARD_WIDTH,
      maxWidth: '100%',
      minHeight: 660,
      maxHeight: '94%',
      borderRadius: PULSE_SIGNUP_RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      ...Platform.select({
        web: {
          boxShadow:
            '0 24px 48px rgba(15, 23, 42, 0.08), 0 8px 16px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        } as object,
        ios: {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.1,
          shadowRadius: 28,
        },
        android: { elevation: 8 },
      }),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isDesktop ? 28 : 20,
      paddingTop: isDesktop ? 16 : 4,
      paddingBottom: isDesktop ? 12 : 6,
      backgroundColor: theme.bg,
      borderBottomWidth: isDesktop ? StyleSheet.hairlineWidth : 0,
      borderBottomColor: theme.border,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minWidth: 64,
      paddingVertical: 8,
      marginLeft: -8,
    },
    backText: text.back,
    brand: {
      ...text.brand,
      flexShrink: 0,
    },
    headerSpacer: {
      minWidth: 64,
    },
    body: {
      flex: 1,
      minHeight: 0,
    },
    progressFooter: {
      paddingTop: isDesktop ? 14 : 10,
      paddingHorizontal: isDesktop ? 24 : 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 4,
    },
    progressScrollContent: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      paddingHorizontal: 4,
    },
    progressItem: {
      flex: 1,
      alignItems: 'center',
      gap: isDesktop ? 8 : 6,
      minWidth: 0,
      paddingHorizontal: 2,
    },
    progressItemScroll: {
      flex: 0,
      flexGrow: 0,
      flexShrink: 0,
      minWidth: PROGRESS_ITEM_MIN_WIDTH,
      maxWidth: 72,
      paddingHorizontal: 4,
    },
    progressBar: {
      width: '100%',
      height: isDesktop ? 3 : 4,
      borderRadius: 999,
      backgroundColor: '#e5e7eb',
    },
    progressBarActive: {
      backgroundColor: theme.primaryDark,
    },
    progressLabel: {
      ...text.progressLabel,
      ...(isDesktop ? {} : PULSE_SIGNUP_TYPO.progressLabelMobile),
      textAlign: 'center',
      width: '100%',
    },
    progressLabelActive: text.progressLabelActive,
  });
}

export { DRIVER_SIGNUP, PULSE_SIGNUP };
