import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';

/** Mobile activation column width (phone / OTP steps). */
export const ACTIVATION_CONTENT_MAX_WIDTH = 400;

/** Shared layout constants for activation flows. */
export const onboardingLayout = {
  contentMaxWidth: layout.contentMaxWidth,
  activationMaxWidth: ACTIVATION_CONTENT_MAX_WIDTH,
  contentInner: {
    width: '100%' as const,
    maxWidth: ACTIVATION_CONTENT_MAX_WIDTH,
    alignSelf: 'center' as const,
    paddingHorizontal: layout.screenPaddingX,
  },
  scrollBottomPad: space[8],
} as const;
