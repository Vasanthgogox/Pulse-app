/**
 * Polished load/error fallback — icon, human copy, retry, optional dev stack (accordion).
 */
import Theme from '@/constants/Theme';
import * as Clipboard from 'expo-clipboard';
import type { LucideIcon } from 'lucide-react-native';
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Package,
  RefreshCw,
  Rss,
  Settings,
  Terminal,
  WifiOff,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ContentErrorVariant =
  | 'network'
  | 'connection'
  | 'config'
  | 'update'
  | 'workspace'
  | 'workspaceMissing'
  | 'discover'
  | 'loads'
  | 'feed'
  | 'generic';

type VariantPreset = {
  Icon: LucideIcon;
  title: string;
  message: string;
  accent: string;
};

const VARIANT_PRESETS: Record<ContentErrorVariant, VariantPreset> = {
  network: {
    Icon: WifiOff,
    title: 'Unable to load content',
    message:
      'We encountered an unexpected issue while setting up this panel. Please check your connection.',
    accent: '#6366f1',
  },
  connection: {
    Icon: WifiOff,
    title: 'Connection error',
    message:
      "Cannot reach the server. If you're on home or office Wi‑Fi, try mobile data or a different network.",
    accent: '#6366f1',
  },
  config: {
    Icon: Settings,
    title: 'App not configured',
    message:
      'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart the dev server.',
    accent: Theme.warning,
  },
  update: {
    Icon: RefreshCw,
    title: 'Update available',
    message: 'A new version was deployed. Reload to continue.',
    accent: Theme.primary,
  },
  workspace: {
    Icon: Building2,
    title: 'Connection issue',
    message: "Couldn't load your workspace. Check your connection and try again.",
    accent: Theme.primary,
  },
  workspaceMissing: {
    Icon: Building2,
    title: 'No organization linked',
    message:
      "You're signed in, but we couldn't find an organization for this account yet.",
    accent: Theme.textSecondary,
  },
  discover: {
    Icon: Compass,
    title: 'Unable to load suggestions',
    message: "Discover couldn't refresh right now. Try again in a moment.",
    accent: Theme.aggregatePillText,
  },
  loads: {
    Icon: Package,
    title: 'Unable to load loads',
    message: 'The load board could not refresh. Check your connection or try again.',
    accent: Theme.primary,
  },
  feed: {
    Icon: Rss,
    title: "Couldn't load feed",
    message: 'Client updates are temporarily unavailable. Pull to refresh or try again.',
    accent: Theme.primary,
  },
  generic: {
    Icon: AlertCircle,
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    accent: Theme.textSecondary,
  },
};

export type ContentErrorStateProps = {
  variant: ContentErrorVariant;
  title?: string;
  message?: string;
  technicalDetails?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  /** Light panels vs root / sign-in style screens */
  tone?: 'light' | 'dark';
  /** full = centered panel; inline = compact strip; embedded = flex fill */
  layout?: 'full' | 'inline' | 'embedded';
  showTechnicalDetails?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ContentErrorState({
  variant,
  title,
  message,
  technicalDetails,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  tone = 'light',
  layout = 'embedded',
  showTechnicalDetails = __DEV__,
  style,
}: ContentErrorStateProps) {
  const preset = VARIANT_PRESETS[variant];
  const { Icon, accent } = preset;
  const resolvedTitle = title ?? preset.title;
  const resolvedMessage = message ?? preset.message;
  const [devOpen, setDevOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isDark = tone === 'dark';
  const canShowDev =
    showTechnicalDetails && Boolean(technicalDetails?.trim());
  const isInline = layout === 'inline';

  const toggleDev = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDevOpen((v) => !v);
  }, []);

  const handleCopy = useCallback(() => {
    if (!technicalDetails) return;
    void Clipboard.setStringAsync(technicalDetails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [technicalDetails]);

  const palette = useMemo(
    () =>
      isDark
        ? {
            bg: Theme.darkBackground,
            title: Theme.textOnDark,
            body: Theme.textOnDarkMuted,
            card: Theme.darkSurface,
            cardBorder: Theme.borderOnDark,
            btn: Theme.buttonPrimary,
            btnText: Theme.buttonPrimaryText,
            terminalBg: '#0D1117',
            terminalBorder: '#30363d',
            terminalLabel: '#8b949e',
            terminalText: '#f85149',
            devToggle: Theme.textOnDarkMuted,
          }
        : {
            bg: '#F8FAFC',
            title: Theme.textPrimaryDark,
            body: Theme.textSecondary,
            card: Theme.screenBackground,
            cardBorder: Theme.borderLight,
            btn: Theme.textPrimaryDark,
            btnText: Theme.textOnPrimary,
            terminalBg: '#0D1117',
            terminalBorder: '#1e293b',
            terminalLabel: '#94a3b8',
            terminalText: '#fda4af',
            devToggle: Theme.textMuted,
          },
    [isDark],
  );

  return (
    <View
      style={[
        isInline ? styles.inlineRoot : layout === 'full' ? styles.fullRoot : styles.embeddedRoot,
        !isInline && { backgroundColor: palette.bg },
        style,
      ]}
    >
      <View style={[isInline ? styles.inlineInner : styles.centerBlock, isInline && styles.inlineCard]}>
        {!isInline ? (
          <View style={styles.iconStage}>
            <View style={[styles.iconGlow, { backgroundColor: accent }]} />
            <View
              style={[
                styles.iconCard,
                { backgroundColor: palette.card, borderColor: palette.cardBorder },
              ]}
            >
              <Icon size={40} color={accent} strokeWidth={1.5} />
              <View style={styles.pulseDotWrap}>
                <View style={styles.pulseDot} />
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.inlineIconWrap, { backgroundColor: `${accent}14` }]}>
            <Icon size={18} color={accent} strokeWidth={2} />
          </View>
        )}

        <View style={isInline ? styles.inlineCopy : styles.copyBlock}>
          <Text
            style={[
              isInline ? styles.inlineTitle : styles.title,
              { color: palette.title },
            ]}
          >
            {resolvedTitle}
          </Text>
          <Text
            style={[
              isInline ? styles.inlineMessage : styles.message,
              { color: palette.body },
            ]}
          >
            {resolvedMessage}
          </Text>
        </View>

        {onRetry ? (
          <Pressable
            style={({ pressed }) => [
              isInline ? styles.inlineBtn : styles.retryBtn,
              { backgroundColor: palette.btn, opacity: pressed ? 0.92 : 1 },
              retrying && styles.retryBtnBusy,
            ]}
            onPress={onRetry}
            disabled={retrying}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
          >
            {retrying ? (
              <ActivityIndicator size="small" color={palette.btnText} />
            ) : (
              <>
                <RefreshCw size={isInline ? 14 : 18} color={palette.btnText} />
                <Text style={[styles.retryBtnText, { color: palette.btnText }]}>
                  {retrying ? 'Trying again…' : retryLabel}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {canShowDev && !isInline ? (
        <View style={styles.devSection}>
          <Pressable
            style={styles.devToggle}
            onPress={toggleDev}
            accessibilityRole="button"
            accessibilityLabel="Technical details"
          >
            <Terminal size={14} color={palette.devToggle} />
            <Text style={[styles.devToggleText, { color: palette.devToggle }]}>
              Technical Details
            </Text>
            {devOpen ? (
              <ChevronUp size={14} color={palette.devToggle} />
            ) : (
              <ChevronDown size={14} color={palette.devToggle} />
            )}
          </Pressable>

          {devOpen ? (
            <View
              style={[
                styles.terminal,
                {
                  backgroundColor: palette.terminalBg,
                  borderColor: palette.terminalBorder,
                },
              ]}
            >
              <View style={styles.terminalHeader}>
                <View style={styles.terminalLabelRow}>
                  <View style={styles.terminalDot} />
                  <Text style={[styles.terminalType, { color: palette.terminalLabel }]}>
                    TypeError
                  </Text>
                </View>
                <Pressable
                  onPress={handleCopy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Copy stack trace"
                >
                  {copied ? (
                    <Check size={14} color="#34d399" />
                  ) : (
                    <Copy size={14} color={palette.terminalLabel} />
                  )}
                </Pressable>
              </View>
              <Text
                selectable
                style={[styles.terminalBody, { color: palette.terminalText }]}
              >
                {technicalDetails}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  embeddedRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    minHeight: 220,
  },
  inlineRoot: {
    marginHorizontal: 14,
    marginBottom: 10,
  },
  centerBlock: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  inlineInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  inlineCard: {
    width: '100%',
  },
  iconStage: {
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.2,
  },
  iconCard: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    transform: [{ rotate: '3deg' }],
  },
  pulseDotWrap: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffe4e6',
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  inlineIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  inlineCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  inlineTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
  },
  inlineMessage: {
    fontSize: 12,
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 280,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  inlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  retryBtnBusy: {
    opacity: 0.85,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  devSection: {
    width: '100%',
    maxWidth: 320,
    marginTop: 36,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  devToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  terminal: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30363d',
  },
  terminalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  terminalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  terminalType: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontWeight: '600',
  },
  terminalBody: {
    fontSize: 11,
    lineHeight: 17,
    padding: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
