import { useRouter } from 'expo-router';
import { useCallback } from 'react';
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
import { createPulseSignUpTextStyles, PULSE_SIGNUP_TYPO, PULSE_SIGNUP_TYPO_MOBILE } from '@/features/auth/signup/signUpTypography';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import {
  PULSE_PRODUCTS,
  PULSE_PRODUCTS_COMING_SOON,
  WORKSPACE_ACCESS_ACTIONS,
} from '@/lib/onboarding/productCatalog';
import { WORKSPACE_SETUP_COPY } from '@/lib/onboarding/workspaceSetupContent';
import { ROUTES } from '@/lib/routes';
import { useIsDesktopWebInput } from '@/lib/useIsDesktopWebInput';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';
import { PulseAccessOption } from './PulseAccessOption';
import { PulseComingSoonProduct } from './PulseComingSoonProduct';
import { PulseProductOption } from './PulseProductOption';
import { PulseBrandMarkLink } from './PulseSplitBrandLogo';
import { WorkspaceSetupHeroPanel } from './WorkspaceSetupHeroPanel';

const signupText = createPulseSignUpTextStyles(PULSE_SIGNUP);

export function OnboardingPersonaHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWebInput();

  const navigateProduct = useCallback(
    (route: string, productId?: string) => {
      if (productId === 'commerce' || route.startsWith('/sign-in')) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.assign(route);
          return;
        }
      }
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
        <Text style={[styles.sectionLabel, !isDesktop && styles.sectionLabelMobile, isDesktop && styles.sectionLabelDesktop]}>
          {WORKSPACE_SETUP_COPY.sectionProducts}
        </Text>
        <View style={styles.productList}>
          {PULSE_PRODUCTS.map((product) => (
            <PulseProductOption
              key={product.id}
              product={product}
              compact={false}
              onPress={() => navigateProduct(product.route, product.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={[styles.invitedEyebrow, !isDesktop && styles.invitedEyebrowMobile, isDesktop && styles.invitedEyebrowDesktop]}>
          {WORKSPACE_SETUP_COPY.invitedEyebrow}
        </Text>
        <Text style={[styles.sectionLabel, !isDesktop && styles.sectionLabelMobile, isDesktop && styles.sectionLabelDesktop]}>
          {WORKSPACE_SETUP_COPY.sectionWorkspaceAccess}
        </Text>
        <View style={styles.accessList}>
          {WORKSPACE_ACCESS_ACTIONS.map((action) => (
            <View key={action.id} style={styles.accessOptionCell}>
              <PulseAccessOption
                action={action}
                compact={false}
                onPress={() => navigateAccess(action.route, action.params)}
              />
            </View>
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
      <Text style={[styles.signInMuted, !isDesktop && styles.signInMutedMobile]}>
        {WORKSPACE_SETUP_COPY.signInPrompt}
      </Text>
      <Text style={[styles.signInLink, !isDesktop && styles.signInLinkMobile]}>
        {' '}
        {WORKSPACE_SETUP_COPY.signInLink}
      </Text>
    </Pressable>
  );

  const renderComingSoonStrip = () => (
    <View style={styles.comingSoonStrip}>
      <View style={styles.comingSoonHeader}>
        <Text style={[styles.sectionLabel, !isDesktop && styles.sectionLabelMobile]}>
          {WORKSPACE_SETUP_COPY.sectionMoreProducts}
        </Text>
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
          <View style={styles.rightFlowPane}>
            <View style={styles.panelInner}>{renderProductHubMain()}</View>
          </View>
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
        <PulseBrandMarkLink
          onPress={() => router.push(ROUTES.TERMINAL_WEBSITE)}
          accessibilityLabel={WORKSPACE_SETUP_COPY.pulseWebsiteLink}
          size="lg"
          linkStyle={styles.mobileBrandAnchor}
        />
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
    paddingVertical: 20,
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
  },
  rightFlowPane: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  hub: {
    gap: 18,
    width: '100%',
  },
  hubHeader: {
    gap: 8,
    marginBottom: 6,
  },
  hubTitle: {
    color: ONBOARDING_BRAND.ink,
    fontWeight: '600',
  },
  hubTitleDesktop: {
    ...PULSE_SIGNUP_TYPO.titleDesktop,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  hubTitleMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.title,
  },
  hubSubtitle: {
    color: Theme.textMuted,
  },
  hubSubtitleDesktop: {
    ...PULSE_SIGNUP_TYPO.subtitle,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 0,
  },
  hubSubtitleMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.subtitle,
  },

  section: {
    gap: 10,
  },
  sectionLabel: {
    ...PULSE_SIGNUP_TYPO.label,
    color: Theme.textMuted,
  },
  sectionLabelDesktop: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.5,
  },
  sectionLabelMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.label,
    color: Theme.textMuted,
  },
  invitedEyebrow: {
    ...PULSE_SIGNUP_TYPO.caption,
    color: Theme.textSecondary,
    marginBottom: -2,
  },
  invitedEyebrowDesktop: {
    fontSize: 12,
    lineHeight: 16,
  },
  invitedEyebrowMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.caption,
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
    gap: 10,
  },
  accessList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  accessOptionCell: {
    flex: 1,
    minWidth: 0,
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
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textMuted,
  },
  signInMutedMobile: {
    ...signupText.linkSmallMobile,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textMuted,
  },
  signInLink: {
    ...signupText.linkSmall,
    fontSize: 13,
    lineHeight: 18,
    color: ONBOARDING_BRAND.ink,
    fontWeight: '600',
  },
  signInLinkMobile: {
    ...signupText.linkSmallMobile,
    fontSize: 14,
    lineHeight: 20,
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
    paddingTop: 12,
    paddingBottom: 16,
  },
  mobileBrandAnchor: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  mobileHubFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(77, 54, 54, 0.1)',
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
});
