/**
 * Full-screen calm loading splash — use during auth gates, route lazy loads, and font boot.
 * Prefer over bare ActivityIndicator so waits feel intentional, not broken.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { tGlobal, useLanguage } from '@/contexts/LanguageContext';
import { MotiView } from 'moti';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('@/assets/images/splash-icon.png');

export type AppLoadingSplashVariant =
  | 'preparing'
  | 'session'
  | 'verify'
  | 'generic';

export interface AppLoadingSplashProps {
  variant?: AppLoadingSplashVariant;
  /** Overrides variant default message(s). */
  message?: string;
  style?: StyleProp<ViewStyle>;
  /** Accent for progress dots (e.g. driver theme). */
  accentColor?: string;
  /** Use when rendered outside LanguageProvider (e.g. root font gate). */
  useGlobalI18n?: boolean;
}

function useSplashCopy(
  variant: AppLoadingSplashVariant,
  message: string | undefined,
  translate: (key: string) => string,
) {
  const preparingMessages = useMemo(
    () => [
      translate('splashPreparingWorkspace'),
      translate('splashAlmostReady'),
      translate('splashCalmTagline'),
    ],
    [translate],
  );

  const [preparingIndex, setPreparingIndex] = useState(0);

  useEffect(() => {
    if (variant !== 'preparing' || message != null) return;
    const id = setInterval(() => {
      setPreparingIndex((i) => (i + 1) % preparingMessages.length);
    }, 2800);
    return () => clearInterval(id);
  }, [variant, message, preparingMessages.length]);

  const resolvedMessage = useMemo(() => {
    if (message != null && message !== '') return message;
    switch (variant) {
      case 'session':
        return translate('splashRestoringSession');
      case 'verify':
        return translate('splashVerifyingAccount');
      case 'preparing':
        return preparingMessages[preparingIndex] ?? translate('loading');
      default:
        return translate('loading');
    }
  }, [message, variant, translate, preparingMessages, preparingIndex]);

  return resolvedMessage;
}

function AppLoadingSplashView({
  variant = 'generic',
  message,
  style,
  accentColor = Theme.primary,
  translate,
}: AppLoadingSplashProps & { translate: (key: string) => string }) {
  const insets = useSafeAreaInsets();
  const resolvedMessage = useSplashCopy(variant, message, translate);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={resolvedMessage}
    >
      <MotiView
        from={{ opacity: 0.88, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: 'timing',
          duration: 1400,
          loop: true,
          repeatReverse: true,
        }}
        style={styles.logoWrap}
      >
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </MotiView>

      <MotiView
        key={resolvedMessage}
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 400 }}
        style={styles.messageWrap}
      >
        <Text style={styles.title}>{resolvedMessage}</Text>
        <Text style={styles.subtitle}>{translate('splashCalmFooter')}</Text>
      </MotiView>

      <View style={styles.dotsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            transition={{
              type: 'timing',
              duration: 700,
              delay: i * 180,
              loop: true,
              repeatReverse: true,
            }}
            style={[styles.dot, { backgroundColor: accentColor }]}
          />
        ))}
      </View>
    </View>
  );
}

export function AppLoadingSplash(props: AppLoadingSplashProps) {
  if (props.useGlobalI18n) {
    return <AppLoadingSplashView {...props} translate={tGlobal} />;
  }
  return <AppLoadingSplashWithLanguage {...props} />;
}

function AppLoadingSplashWithLanguage(props: AppLoadingSplashProps) {
  const { t } = useLanguage();
  return <AppLoadingSplashView {...props} translate={t} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  logoWrap: {
    marginBottom: Layout.spacingExtraLarge,
  },
  logo: {
    width: 72,
    height: 72,
  },
  messageWrap: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Theme.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: Layout.spacingMedium,
    fontSize: 14,
    fontWeight: '400',
    color: Theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Layout.sectionSpacing,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.5,
  },
});
