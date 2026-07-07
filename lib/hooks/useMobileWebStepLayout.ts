import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from '@/lib/hooks/useKeyboardVisible';

/** Signup wizard desktop breakpoint (matches signUpConstants). */
export const MOBILE_WEB_FORM_DESKTOP_BREAKPOINT = 1024;

/** Sticky footer: primary button + padding (mobile web). */
export const MOBILE_WEB_DOCKED_FOOTER_HEIGHT = 88;

export interface MobileWebStepLayoutOptions {
  /** Extra bottom scroll padding (account step, etc.). */
  extraScrollPadding?: number;
  /** When true, primary CTA lives in scroll content (desktop/native behaviour). */
  inlinePrimary?: boolean;
  /**
   * @deprecated Keyboard handling is always on for mobile web form steps.
   * Kept for call-site compatibility only.
   */
  keyboardAware?: boolean;
}

/**
 * Single source for signup / onboarding step layout on mobile web + native.
 * Ensures docked footers, keyboard insets, and scroll clearance without per-step hacks.
 */
export function useMobileWebStepLayout(options: MobileWebStepLayoutOptions = {}) {
  const {
    extraScrollPadding = 0,
    inlinePrimary = false,
  } = options;

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= MOBILE_WEB_FORM_DESKTOP_BREAKPOINT;
  const isMobileWeb = Platform.OS === 'web' && !isDesktop;
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();

  const keyboardInset = isMobileWeb
    ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
    : 0;

  /** Mobile web always docks the CTA — inline scroll CTAs break with the iOS keyboard. */
  const useDockedFooter = isMobileWeb ? true : !inlinePrimary;

  const footerClearance = useDockedFooter ? MOBILE_WEB_DOCKED_FOOTER_HEIGHT : 0;

  const scrollPaddingBottom =
    16 + extraScrollPadding + keyboardInset + footerClearance;

  const footerPaddingBottom =
    Math.max(insets.bottom, isDesktop ? 8 : 4) +
    (isMobileWeb ? keyboardInset : 0);

  const rootStyle: ViewStyle = {
    flex: 1,
    minHeight: 0,
    ...(isMobileWeb ? { position: 'relative' as const } : {}),
  };

  const footerStyle: ViewStyle = useDockedFooter
    ? {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2,
        paddingBottom: footerPaddingBottom,
      }
    : {
        paddingBottom: footerPaddingBottom,
      };

  return {
    isDesktop,
    isMobileWeb,
    keyboardVisible,
    keyboardInset,
    useDockedFooter,
    showCtaInScroll: inlinePrimary && !isMobileWeb,
    scrollPaddingBottom,
    rootStyle,
    footerStyle,
    insets,
  };
}
