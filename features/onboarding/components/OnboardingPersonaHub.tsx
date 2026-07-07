import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Theme from '@/constants/Theme';
import {
  DESKTOP_SIGNUP_SPLIT_FLOW_MAX,
  DESKTOP_SIGNUP_SPLIT_PAD,
} from '@/features/auth/signup/signUpConstants';
import { createPulseSignUpTextStyles, PULSE_SIGNUP_TYPO } from '@/features/auth/signup/signUpTypography';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import {
  PULSE_PRODUCTS,
  PULSE_PRODUCTS_COMING_SOON,
  WORKSPACE_ACCESS_ACTIONS,
} from '@/lib/onboarding/productCatalog';
import { WORKSPACE_SETUP_COPY } from '@/lib/onboarding/workspaceSetupContent';
import { ROUTES } from '@/lib/routes';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';
import { PulseAccessOption } from './PulseAccessOption';
import { PulseComingSoonProduct } from './PulseComingSoonProduct';
import { PulseProductOption } from './PulseProductOption';
import { WorkspaceSetupHeroPanel } from './WorkspaceSetupHeroPanel';

const signupText = createPulseSignUpTextStyles(PULSE_SIGNUP);

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

  const navigateProduct = useCallback(
    (route: string) => {
      router.push(route as never);
    },
    [router],
  );

  const navigateAccess = useCallback(
    (route: string, params?: Record<string, string>) => {
      if (params) {
        router.push({ pathname: route, params } as never);
        return;
      }
      router.push(route as never);
    },
    [router],
  );

  const renderProductHubMain = () => (
    <View style={styles.hub}>
      <View style={styles.hubHeader}>
        <Text style={[styles.hubTitle, isDesktop ? styles.hubTitleDesktop : styles.hubTitleMobile]}>
          {WORKSPACE_SETUP_COPY.personaTitle}
        </Text>
        <Text
          style={[
            styles.hubSubtitle,
            isDesktop ? styles.hubSubtitleDesktop : styles.hubSubtitleMobile,
          ]}
        >
          {WORKSPACE_SETUP_COPY.personaSubtitle}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{WORKSPACE_SETUP_COPY.sectionProducts}</Text>
        <View style={styles.productList}>
          {PULSE_PRODUCTS.map((product) => (
            <PulseProductOption
              key={product.id}
              product={product}
              compact
              onPress={() => navigateProduct(product.route)}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.invitedEyebrow}>{WORKSPACE_SETUP_COPY.invitedEyebrow}</Text>
        <Text style={styles.sectionLabel}>{WORKSPACE_SETUP_COPY.sectionWorkspaceAccess}</Text>
        <View style={styles.accessList}>
          {WORKSPACE_ACCESS_ACTIONS.map((action) => (
            <PulseAccessOption
              key={action.id}
              action={action}
              compact
              onPress={() => navigateAccess(action.route, action.params)}
            />
          ))}
        </View>
      </View>
    </View>
  );

  const renderSignInFooter = () => (
    <Pressable
      onPress={() => router.push(ROUTES.SIGN_IN)}
      style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
    >
      <Text style={styles.signInMuted}>{WORKSPACE_SETUP_COPY.signInPrompt}</Text>
      <Text style={styles.signInLink}> {WORKSPACE_SETUP_COPY.signInLink}</Text>
    </Pressable>
  );

  const renderComingSoonStrip = () => (
    <View style={styles.comingSoonStrip}>
      <View style={styles.comingSoonHeader}>
        <Text style={styles.sectionLabel}>{WORKSPACE_SETUP_COPY.sectionMoreProducts}</Text>
        <View style={styles.comingSoonPill}>
          <Text style={styles.comingSoonPillText}>{WORKSPACE_SETUP_COPY.sectionComingSoon}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.comingSoonScroll}
        keyboardShouldPersistTaps="handled"
      >
        {PULSE_PRODUCTS_COMING_SOON.map((product) => (
          <PulseComingSoonProduct key={product.id} product={product} variant="chip" />
        ))}
      </ScrollView>
    </View>
  );

  const renderHubFooter = (bottomInset = 0) => (
    <View style={[styles.hubFooter, { paddingBottom: Math.max(bottomInset, 12) }]}>
      {renderSignInFooter()}
      <View style={styles.footerDivider} />
      {renderComingSoonStrip()}
    </View>
  );

  if (isDesktop) {
    return (
      <View
        style={[
          styles.desktopShell,
          Platform.OS === 'web' ? (WEB_APP_VIEWPORT_STYLE as ViewStyle) : null,
        ]}
      >
        <View style={[styles.desktopCol, styles.desktopLeftCol]}>
          <WorkspaceSetupHeroPanel />
        </View>

        <View style={styles.panelDivider} />

        <View style={[styles.desktopCol, styles.rightPanel]}>
          <ScrollView
            style={styles.rightScroll}
            contentContainerStyle={styles.rightScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.panelInner}>{renderProductHubMain()}</View>
          </ScrollView>
          <View style={styles.panelInnerFooter}>{renderHubFooter()}</View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.mobileRoot, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderProductHubMain()}
      </ScrollView>
      <View style={styles.mobileHubFooter}>{renderHubFooter(insets.bottom)}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Theme.screenBackground,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
  },

  desktopCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: '50%',
    minHeight: 0,
    alignSelf: 'stretch',
    zIndex: 1,
  },

  desktopLeftCol: {
    backgroundColor: Theme.screenBackground,
  },

  panelInner: {
    width: '100%',
    maxWidth: DESKTOP_SIGNUP_SPLIT_FLOW_MAX,
    alignSelf: 'center',
    paddingHorizontal: DESKTOP_SIGNUP_SPLIT_PAD,
    paddingTop: 36,
    paddingBottom: 12,
  },

  panelInnerFooter: {
    width: '100%',
    maxWidth: DESKTOP_SIGNUP_SPLIT_FLOW_MAX,
    alignSelf: 'center',
    paddingHorizontal: DESKTOP_SIGNUP_SPLIT_PAD,
  },

  panelDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(77, 54, 54, 0.1)',
    alignSelf: 'stretch',
    zIndex: 2,
  },

  rightPanel: {
    backgroundColor: Theme.screenBackground,
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  rightScroll: {
    flex: 1,
    minHeight: 0,
  },
  rightScrollContent: {
    flexGrow: 1,
  },

  hub: {
    gap: 12,
  },
  hubHeader: {
    gap: 3,
    marginBottom: 2,
  },
  hubTitle: {
    color: ONBOARDING_BRAND.ink,
    fontWeight: '600',
  },
  hubTitleDesktop: {
    ...PULSE_SIGNUP_TYPO.titleDesktop,
  },
  hubTitleMobile: {
    ...PULSE_SIGNUP_TYPO.titleCompact,
  },
  hubSubtitle: {
    color: Theme.textMuted,
  },
  hubSubtitleDesktop: {
    ...PULSE_SIGNUP_TYPO.subtitle,
  },
  hubSubtitleMobile: {
    ...PULSE_SIGNUP_TYPO.subtitleCompact,
  },

  section: {
    gap: 6,
  },
  sectionLabel: {
    ...PULSE_SIGNUP_TYPO.label,
    color: Theme.textMuted,
  },
  invitedEyebrow: {
    ...PULSE_SIGNUP_TYPO.caption,
    color: Theme.textSecondary,
    marginBottom: -2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(77, 54, 54, 0.1)',
    alignSelf: 'stretch',
  },

  productList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  accessList: {
    gap: 5,
  },

  hubFooter: {
    gap: 0,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(77, 54, 54, 0.1)',
    backgroundColor: Theme.screenBackground,
  },
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(77, 54, 54, 0.08)',
    marginVertical: 8,
  },
  comingSoonStrip: {
    gap: 6,
    paddingBottom: 2,
  },
  comingSoonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  comingSoonPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(77, 54, 54, 0.1)',
    backgroundColor: Theme.analyticsCanvas,
  },
  comingSoonPillText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  comingSoonScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },

  signInBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  signInMuted: {
    ...signupText.linkSmall,
    color: Theme.textMuted,
  },
  signInLink: {
    ...signupText.linkSmall,
    color: ONBOARDING_BRAND.ink,
    fontWeight: '600',
  },

  mobileRoot: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    position: 'relative',
    overflow: 'hidden',
  },
  mobileScroll: {
    flex: 1,
    minHeight: 0,
  },
  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  mobileHubFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(77, 54, 54, 0.1)',
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
});
