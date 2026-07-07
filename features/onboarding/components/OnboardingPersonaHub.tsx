import { useRouter } from 'expo-router';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Link as LinkIcon,
  Truck,
  Users,
  Zap,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDING_PERSONAS } from '@/lib/onboarding/constants';
import { ROUTES } from '@/lib/routes';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import { DRIVER_SIGNUP } from '@/features/auth/signup/signUpDriverTheme';
import { PULSE_SIGNUP_RADIUS } from '@/features/auth/signup/signUpPulseTheme';
import Theme from '@/constants/Theme';

const PERSONA_ICONS = {
  building: Building2,
  truck: Truck,
  users: Users,
  link: LinkIcon,
} as const;

const PERSONA_THEMES = {
  business_owner: PULSE_SIGNUP,
  driver: DRIVER_SIGNUP,
  join_team: PULSE_SIGNUP,
  join_fleet: DRIVER_SIGNUP,
} as const;

/** Text/icons on white cards — pastel `primary` is fill-only; use ink accent. */
function personaAccentInk(theme: (typeof PERSONA_THEMES)[keyof typeof PERSONA_THEMES]): string {
  return theme.primaryDark;
}

const FEATURES = [
  'Trip management & real-time GPS',
  'GST-compliant invoicing & payments',
  'Driver payroll & fleet compliance',
  'Marketplace — post and bid on loads',
] as const;

export function OnboardingPersonaHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [webViewportWidth, setWebViewportWidth] = useState<number>(() => {
    if (Platform.OS !== 'web') return 0;
    if (typeof window === 'undefined') return 1280;
    return window.innerWidth || 1280;
  });
  const [webHasFinePointer, setWebHasFinePointer] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleResize = () => {
      setWebViewportWidth(window.innerWidth || 1280);
      if (typeof window.matchMedia === 'function') {
        setWebHasFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isDesktop = Platform.OS === 'web' ? webViewportWidth >= 1024 && webHasFinePointer : false;

  const renderPersonaCards = () => (
    <View style={[styles.cards, isDesktop && styles.cardsDesktop]}>
      {ONBOARDING_PERSONAS.map((persona) => {
        const Icon = PERSONA_ICONS[persona.icon];
        const theme = PERSONA_THEMES[persona.id];
        return (
          <Pressable
            key={persona.id}
            onPress={() => {
              if (persona.id === 'join_team') {
                router.push({
                  pathname: ROUTES.ONBOARDING.BUSINESS,
                  params: { intent: 'team' },
                });
                return;
              }
              router.push(persona.route as never);
            }}
            style={({ pressed }) => [
              styles.card,
              isDesktop && styles.cardDesktop,
              pressed && {
                borderColor: personaAccentInk(theme),
                backgroundColor: theme.primaryTint,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={persona.title}
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.primaryTint }]}>
              <Icon size={20} color={personaAccentInk(theme)} strokeWidth={2.5} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardEyebrow, { color: personaAccentInk(theme) }]}>
                {persona.eyebrow}
              </Text>
              <Text style={styles.cardTitle}>{persona.title}</Text>
              <Text style={styles.cardSub}>{persona.subtitle}</Text>
            </View>
            <ChevronRight size={18} color="#d1d5db" strokeWidth={2} />
          </Pressable>
        );
      })}
    </View>
  );

  // ── Desktop: split-screen layout ──────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={styles.desktopShell}>
        {/* Left — brand/marketing panel */}
        <View style={styles.leftPanel}>
          <View style={styles.leftContent}>
            <View style={styles.leftLogoRow}>
              <Zap size={14} color={Theme.driverPrimary} strokeWidth={3} />
            </View>
            <Text style={styles.leftLogo}>
              PULSE<Text style={styles.logoDot}>.</Text>
            </Text>
            <Text style={styles.leftTag}>Workspace setup</Text>
            <Text style={styles.leftTitle}>Build your logistics business OS.</Text>
            <Text style={styles.leftSubtitle}>
              Everything your transport company needs — trips, drivers, finance, fleet, and
              marketplace — in one unified platform.
            </Text>

            <View style={styles.featureList}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <CheckCircle2 size={14} color={Theme.driverPrimary} strokeWidth={2.5} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Right — persona selection */}
        <View style={styles.rightPanel}>
          {/* Decorative orbs */}
          <View style={styles.orbA} />
          <View style={styles.orbB} />

          <ScrollView
            style={styles.rightScroll}
            contentContainerStyle={styles.rightScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.rightForm}>
              <View style={styles.rightHeader}>
                <Text style={styles.rightTitle}>Get started on Pulse</Text>
                <Text style={styles.rightSubtitle}>
                  Choose how you use the platform. We'll guide you through the rest.
                </Text>
              </View>

              {renderPersonaCards()}

              <Pressable
                onPress={() => router.push(ROUTES.SIGN_IN)}
                style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <Text style={styles.signInMuted}>Already activated?</Text>
                <Text style={styles.signInLink}> Sign in</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile: stacked layout (unchanged) ────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.mobileRoot, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.mobileHeader}>
        <View style={styles.headerSpacer} />
        <Text style={styles.mobileBrand}>
          PULSE<Text style={styles.mobileBrandDot}>.</Text>
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobileContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mobileHero}>
          <Text style={styles.mobileTitle}>Get started on Pulse</Text>
          <Text style={styles.mobileSubtitle}>
            Choose how you use the platform. We'll guide you through identity, verification, and
            workspace setup.
          </Text>
        </View>

        {renderPersonaCards()}

        <Pressable
          onPress={() => router.push(ROUTES.SIGN_IN)}
          style={styles.mobileSignInBtn}
          accessibilityRole="button"
        >
          <Text style={styles.mobileSignInText}>
            <Text style={styles.mobileSignInMuted}>Already activated? </Text>
            <Text style={styles.mobileSignInLink}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // ── Desktop split-screen ─────────────────────────────────────────────────
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
  },

  // Left panel
  leftPanel: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 52,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  leftContent: {
    maxWidth: 480,
  },
  leftLogoRow: {
    marginBottom: 8,
  },
  leftLogo: {
    fontSize: 36,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
    color: '#ffffff',
    marginBottom: 10,
  },
  logoDot: {
    color: Theme.driverPrimary,
  },
  leftTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.65)',
    marginBottom: 14,
  },
  leftTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 12,
  },
  leftSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(148,163,184,0.75)',
    marginBottom: 28,
    maxWidth: 400,
  },
  featureList: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.85)',
  },

  // Right panel
  rightPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  orbA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -70,
    right: -50,
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  orbB: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: -90,
    left: -70,
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
  rightScroll: {
    flex: 1,
  },
  rightScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingVertical: 48,
  },
  rightForm: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 24,
  },
  rightHeader: {
    gap: 6,
  },
  rightTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: '#0f172a',
  },
  rightSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    fontWeight: '500',
  },

  // Cards (shared mobile + desktop)
  cards: {
    gap: 12,
  },
  cardsDesktop: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: PULSE_SIGNUP_RADIUS.card,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardDesktop: {
    padding: 14,
    borderRadius: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 19,
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 17,
  },

  // Sign-in link (desktop)
  signInBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  signInMuted: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  signInLink: {
    fontSize: 13,
    color: PULSE_SIGNUP.primaryDark,
    fontWeight: '800',
  },

  // ── Mobile layout ──────────────────────────────────────────────────────────
  mobileRoot: {
    flex: 1,
    backgroundColor: PULSE_SIGNUP.bg,
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerSpacer: {
    minWidth: 64,
  },
  mobileBrand: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.6,
    color: PULSE_SIGNUP.primaryDark,
  },
  mobileBrandDot: {
    color: Theme.driverPrimary,
  },
  mobileContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  mobileHero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  mobileTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 32,
    color: PULSE_SIGNUP.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  mobileSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: PULSE_SIGNUP.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  mobileSignInBtn: {
    marginTop: 28,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: PULSE_SIGNUP_RADIUS.button,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.surface,
  },
  mobileSignInText: {
    fontSize: 13,
    fontWeight: '600',
  },
  mobileSignInMuted: {
    color: '#64748b',
    fontWeight: '500',
  },
  mobileSignInLink: {
    color: PULSE_SIGNUP.primaryDark,
    fontWeight: '800',
  },
});
