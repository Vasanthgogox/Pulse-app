import Theme from '@/constants/Theme';
import { Platform, StyleSheet } from 'react-native';

import { SIGNUP_MOBILE_TOKENS as T } from './signUpMobileTokens';

export const SIGNUP_MOBILE = {
  accent: Theme.driverEmerald,
  bg: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  placeholder: '#94a3b8',
  surface: '#f8fafc',
  keypadTray: '#f1f5f9',
} as const;

/** Centered column used in keypad + scroll steps. */
export const signUpMobileContentInner = {
  width: '100%' as const,
  maxWidth: T.contentMaxWidth,
  alignSelf: 'center' as const,
  paddingHorizontal: T.padH,
};

export const signUpMobileStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SIGNUP_MOBILE.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.padH,
    paddingTop: 2,
    paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 68,
    paddingVertical: 4,
  },
  backBtnText: {
    fontSize: T.backFontSize,
    fontWeight: '600',
    color: SIGNUP_MOBILE.muted,
  },
  brandText: {
    fontSize: T.brandSize,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    color: Theme.driverPrimary,
  },
  topBarSpacer: {
    minWidth: 68,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyKeypad: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 4,
    paddingBottom: 20,
    ...signUpMobileContentInner,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: T.progressPadTop,
    paddingHorizontal: T.padH,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SIGNUP_MOBILE.border,
    backgroundColor: SIGNUP_MOBILE.bg,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    paddingHorizontal: 1,
  },
  progressBar: {
    width: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  progressBarActive: {
    width: 22,
    height: 3,
    backgroundColor: SIGNUP_MOBILE.accent,
  },
  progressBarDone: {
    width: 10,
    backgroundColor: SIGNUP_MOBILE.accent,
    opacity: 0.45,
  },
  progressLabel: {
    fontSize: T.progressLabelSize,
    fontWeight: '600',
    color: SIGNUP_MOBILE.muted,
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  progressLabelActive: {
    color: SIGNUP_MOBILE.accent,
    fontWeight: '700',
  },
  mobileTitle: {
    fontSize: T.titleSize,
    fontWeight: '700',
    color: SIGNUP_MOBILE.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: T.titleLineHeight,
    marginBottom: 6,
  },
  mobileSubtitle: {
    fontSize: T.subtitleSize,
    color: SIGNUP_MOBILE.muted,
    textAlign: 'center',
    lineHeight: T.subtitleLineHeight,
    maxWidth: 300,
  },
  heroBlock: {
    alignItems: 'center',
    paddingBottom: T.heroPadBottom,
  },
  stepTitle: {
    fontSize: T.titleSize,
    fontWeight: '700',
    color: SIGNUP_MOBILE.text,
    letterSpacing: -0.3,
    lineHeight: T.titleLineHeight,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: T.subtitleSize,
    color: SIGNUP_MOBILE.muted,
    lineHeight: T.subtitleLineHeight,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: T.fieldLabelSize,
    fontWeight: '700',
    color: SIGNUP_MOBILE.muted,
    marginBottom: 6,
    letterSpacing: T.fieldLabelSpacing,
    textTransform: 'uppercase',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SIGNUP_MOBILE.border,
    borderRadius: T.inputRadius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: T.displayMinHeight,
    backgroundColor: SIGNUP_MOBILE.surface,
  },
  displayRowError: {
    borderColor: Theme.destructive,
    backgroundColor: '#fef2f2',
  },
  flag: {
    fontSize: T.flagSize,
    marginRight: 6,
  },
  dialCode: {
    fontSize: T.dialCodeSize,
    fontWeight: '700',
    color: SIGNUP_MOBILE.text,
    marginRight: 6,
  },
  displayValue: {
    flex: 1,
    fontSize: T.displayFontSize,
    fontWeight: '600',
    color: SIGNUP_MOBILE.text,
    letterSpacing: 0.8,
    minWidth: 0,
  },
  displayPlaceholder: {
    color: SIGNUP_MOBILE.placeholder,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: SIGNUP_MOBILE.border,
    borderRadius: T.inputRadius,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 11 : 12,
    fontSize: T.inputFontSize,
    fontWeight: '500',
    color: SIGNUP_MOBILE.text,
    backgroundColor: SIGNUP_MOBILE.surface,
    minHeight: T.inputMinHeight,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  inputError: {
    borderColor: Theme.destructive,
    backgroundColor: '#fef2f2',
  },
  primaryBtn: {
    backgroundColor: SIGNUP_MOBILE.accent,
    borderRadius: T.btnRadius,
    paddingVertical: T.btnPaddingV,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontSize: T.btnFontSize,
    fontWeight: '600',
    color: '#fff',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: T.orMarginV,
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: SIGNUP_MOBILE.border,
  },
  orText: {
    fontSize: 12,
    color: SIGNUP_MOBILE.muted,
    fontWeight: '500',
  },
  googleBtn: {
    borderRadius: T.btnRadius,
    paddingVertical: T.googleBtnPaddingV,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: SIGNUP_MOBILE.border,
    backgroundColor: SIGNUP_MOBILE.bg,
    minHeight: 44,
  },
  googleBtnText: {
    fontSize: T.btnFontSize,
    fontWeight: '600',
    color: SIGNUP_MOBILE.text,
  },
  altRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: T.altMarginTop,
    flexWrap: 'wrap',
  },
  altText: {
    fontSize: T.altFontSize,
    color: SIGNUP_MOBILE.muted,
  },
  altLink: {
    fontSize: T.linkFontSize,
    color: SIGNUP_MOBILE.accent,
    fontWeight: '600',
  },
  fieldError: {
    fontSize: 11,
    color: Theme.destructive,
    marginTop: 6,
    fontWeight: '500',
  },
  fieldHint: {
    fontSize: 11,
    color: SIGNUP_MOBILE.muted,
    marginTop: 6,
  },
  keypadDock: {
    width: '100%',
    backgroundColor: SIGNUP_MOBILE.keypadTray,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SIGNUP_MOBILE.border,
    paddingTop: 4,
  },
});
