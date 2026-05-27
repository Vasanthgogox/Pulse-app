import { useRouter } from 'expo-router';
import {
  Building2,
  ChevronRight,
  Link as LinkIcon,
  Truck,
  Users,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDING_PERSONAS } from '@/lib/onboarding/constants';
import { ROUTES } from '@/lib/routes';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import { DRIVER_SIGNUP } from '@/features/auth/signup/signUpDriverTheme';
import { PULSE_SIGNUP_RADIUS } from '@/features/auth/signup/signUpPulseTheme';

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

export function OnboardingPersonaHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.brand}>PULSE.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.title}>Get started on Pulse</Text>
          <Text style={styles.subtitle}>
            Choose how you use the platform. We'll guide you through identity, verification, and
            workspace setup.
          </Text>
        </View>

        <View style={styles.cards}>
          {ONBOARDING_PERSONAS.map((persona) => {
            const Icon = PERSONA_ICONS[persona.icon];
            const theme = PERSONA_THEMES[persona.id];
            return (
              <Pressable
                key={persona.id}
                onPress={() => router.push(persona.route as never)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && { borderColor: theme.primary, backgroundColor: theme.primaryTint },
                ]}
                accessibilityRole="button"
                accessibilityLabel={persona.title}
              >
                <View style={[styles.iconWrap, { backgroundColor: theme.primaryTint }]}>
                  <Icon size={20} color={theme.primary} strokeWidth={2.5} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{persona.title}</Text>
                  <Text style={styles.cardSub}>{persona.subtitle}</Text>
                </View>
                <ChevronRight size={20} color="#d1d5db" strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push(ROUTES.SIGN_IN)}
          style={styles.signInBtn}
          accessibilityRole="button"
        >
          <Text style={styles.signInText}>Already activated? Sign in</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PULSE_SIGNUP.bg,
  },
  header: {
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
  brand: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.6,
    color: PULSE_SIGNUP.primary,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 32,
    color: PULSE_SIGNUP.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: PULSE_SIGNUP.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cards: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    backgroundColor: PULSE_SIGNUP.bg,
    borderRadius: PULSE_SIGNUP_RADIUS.card,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: PULSE_SIGNUP.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 11,
    fontWeight: '700',
    color: PULSE_SIGNUP.muted,
    lineHeight: 16,
  },
  signInBtn: {
    marginTop: 32,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: PULSE_SIGNUP_RADIUS.button,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.surface,
  },
  signInText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#374151',
  },
});
