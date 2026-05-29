import { memo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';

import { DRIVER_SIGNUP } from './signUpDriverTheme';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';

const DEVICE_WIDTH = 430;
const DEVICE_HEIGHT = 900;
const DEVICE_BORDER = 12;

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
  const styles = createStyles(theme);

  const device = (
    <View
      style={[
        styles.device,
        isDesktop && styles.deviceFramed,
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

      {!hideProgress && stepLabels.length > 0 ? (
        <View
          style={[
            styles.progressFooter,
            { paddingBottom: Math.max(insets.bottom, isDesktop ? 24 : 16) },
          ]}
        >
          {stepLabels.map((label, i) => {
            const active = i <= stepIndex;
            return (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.progressBar, active && styles.progressBarActive]} />
                <Text style={[styles.progressLabel, active && styles.progressLabelActive]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  if (isDesktop) {
    return (
      <View
        style={[
          styles.outer,
          Platform.OS === 'web' ? (WEB_APP_VIEWPORT_STYLE as object) : null,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {device}
      </View>
    );
  }

  return (
    <View style={Platform.OS === 'web' ? [styles.webFill, WEB_APP_VIEWPORT_STYLE as object] : undefined}>
      {device}
    </View>
  );
});

function createStyles(theme: SignUpShellTheme) {
  return StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.canvas,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Platform.OS === 'web' ? 32 : 0,
    },
    device: {
      flex: 1,
      width: '100%',
      backgroundColor: theme.bg,
      overflow: 'hidden',
    },
    webFill: {
      flex: 1,
      width: '100%',
    },
    deviceFramed: {
      flex: 0,
      flexDirection: 'column',
      width: DEVICE_WIDTH,
      maxWidth: '100%',
      height: DEVICE_HEIGHT,
      ...(Platform.OS === 'web'
        ? { minHeight: DEVICE_HEIGHT }
        : { maxHeight: '100%' }),
      borderRadius: PULSE_SIGNUP_RADIUS.device,
      borderWidth: DEVICE_BORDER,
      borderColor: theme.deviceBorder,
      ...Platform.select({
        web: {
          boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
        } as object,
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.18,
          shadowRadius: 32,
        },
        android: { elevation: 12 },
      }),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
      backgroundColor: theme.bg,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minWidth: 64,
      paddingVertical: 8,
      marginLeft: -8,
    },
    backText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.muted,
    },
    brand: {
      fontSize: 22,
      fontWeight: '900',
      fontStyle: 'italic',
      letterSpacing: -0.6,
      color: theme.primary,
    },
    headerSpacer: {
      minWidth: 64,
    },
    body: {
      flex: 1,
      minHeight: 0,
    },
    progressFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 16,
      paddingHorizontal: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    progressItem: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      paddingHorizontal: 2,
    },
    progressBar: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: '#e5e7eb',
    },
    progressBarActive: {
      backgroundColor: theme.primary,
    },
    progressLabel: {
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.placeholder,
      textAlign: 'center',
    },
    progressLabelActive: {
      color: theme.primary,
    },
  });
}

export { DRIVER_SIGNUP, PULSE_SIGNUP };
