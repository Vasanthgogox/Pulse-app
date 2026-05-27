import Theme from '@/constants/Theme';
import { Platform, StyleSheet } from 'react-native';

export const C = {
  bg: '#ffffff',
  surface: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  placeholder: '#94a3b8',
  accent: Theme.driverEmerald,
  error: Theme.destructive,
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  warningBorder: '#fcd34d',
} as const;

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  mobileShell: { flex: 1 },
  panelShell: { flex: 1, flexDirection: 'row', backgroundColor: '#020617' },
  leftPanel: { flex: 1, backgroundColor: '#000', paddingHorizontal: 52, paddingVertical: 48, justifyContent: 'center' },
  leftLogo: { fontSize: 44, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1.1, color: '#fff', marginBottom: 14 },
  logoDot: { color: Theme.driverPrimary },
  leftTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', color: 'rgba(148,163,184,0.75)', marginBottom: 18 },
  leftTitle: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -0.8, marginBottom: 12 },
  leftSub: { fontSize: 15, lineHeight: 24, color: 'rgba(148,163,184,0.75)', maxWidth: 420 },
  rightPanel: { flex: 1, backgroundColor: '#fff' },
  mobileRight: { flex: 1 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  backBtnText: { fontSize: 14, color: C.muted, fontWeight: '600' },
  brandText: { fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, color: Theme.driverPrimary },
  topBarRight: { width: 60 },

  scroller: { flex: 1 },
  scrollerContent: { flexGrow: 1 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  pageScroll: { flex: 1 },
  pageInner: { flexGrow: 1, maxWidth: 360, alignSelf: 'center', width: '100%' },

  pageTitle: { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 8, letterSpacing: -0.4 },
  /** Slightly smaller so the full line fits in `pageInner` without scaling or clipping. */
  pageTitleWelcome: { fontSize: 20, letterSpacing: -0.35 },
  pageSub: { fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 20 },
  phoneHighlight: { fontWeight: '700', color: C.text },
  orgNameHighlight: { fontWeight: '700', color: C.accent },

  // Phone
  phoneRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  phoneRowError: { borderColor: C.error },
  flag: { fontSize: 22, marginLeft: 12, marginRight: 6 },
  dialCode: { fontSize: 15, fontWeight: '700', color: C.text, marginRight: 6 },
  phoneInput: { flex: 1, minHeight: 50, paddingVertical: 14, paddingHorizontal: 8, fontSize: 16, color: C.text },

  // OTP
  otpIconWrap: { alignSelf: 'center', marginBottom: 12 },
  resendRow: { alignItems: 'center', marginTop: 14 },
  resendCountdown: { fontSize: 13, color: C.muted },

  // Org check
  orgStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  orgExistsBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10,
    backgroundColor: C.warningBg, borderRadius: 10, borderWidth: 1, borderColor: C.warningBorder,
    padding: 12,
  },
  orgExistsTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 3 },
  orgExistsSub: { fontSize: 12, color: '#78350f', lineHeight: 17 },
  orgAvailBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  orgAvailText: { fontSize: 13, color: '#166534', fontWeight: '600' },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  req: { color: C.error },
  input: {
    minHeight: 50, paddingVertical: 14, paddingHorizontal: 14, fontSize: 15, color: C.text,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  inputMultiline: {
    minHeight: 84, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: C.text,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    textAlignVertical: 'top',
  },
  inputPassword: {
    flex: 1, minHeight: 50, paddingVertical: 14, paddingHorizontal: 14, paddingRight: 48,
    fontSize: 15, color: C.text, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 12, padding: 8 },
  fieldError: { fontSize: 12, color: C.error, marginTop: 5, marginLeft: 2 },
  fieldHint: { fontSize: 12, color: C.muted, marginTop: 5, marginLeft: 2 },

  // Chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.surface,
  },
  chipActive: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: '#166534' },

  // Operating model cards
  modelRow: { flexDirection: 'row', gap: 8 },
  modelCard: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center',
  },
  modelCardActive: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
  modelLabel: { fontSize: 13, fontWeight: '700', color: C.muted },
  modelLabelActive: { color: '#166534' },
  modelSub: { fontSize: 11, color: C.placeholder, marginTop: 2 },

  // City picker
  cityTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 52, paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg,
  },
  cityTriggerError: { borderColor: C.error, backgroundColor: '#fff5f5' },
  cityTriggerText: { flex: 1, fontSize: 15, color: C.placeholder },

  citySelectedCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    borderLeftWidth: 5, backgroundColor: C.bg,
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  citySelectedInfo: { flex: 1 },
  citySelectedName: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  citySelectedMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  citySelectedState: { fontSize: 12, color: C.muted, fontWeight: '500' },
  cityZonePill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
  },
  cityZonePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  cityClearBtn: { padding: 4 },

  cityPickerPanel: {
    borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: '#fff', overflow: 'hidden',
    shadowColor: '#0f172a', shadowOpacity: 0.09, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  citySearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  citySearchInput: {
    flex: 1, fontSize: 15, color: C.text,
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },

  popularSection: { paddingTop: 12, paddingBottom: 4 },
  pickerSectionLabel: {
    fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 14,
  },
  popularScrollContent: { gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  popularChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1.5, backgroundColor: C.surface,
  },
  popularChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  popularChipText: { fontSize: 12, fontWeight: '700', color: C.text },
  pickerDivider: { height: 1, backgroundColor: C.border, marginBottom: 10, marginTop: 2 },
  resultCount: {
    fontSize: 11, fontWeight: '600', color: C.muted,
    paddingHorizontal: 14, paddingVertical: 8,
  },

  cityResultsList: { maxHeight: 268 },
  cityResultItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, minHeight: 58,
  },
  cityResultItemActive: { backgroundColor: '#f0fdf4' },
  cityResultBar: { width: 4, height: 34, borderRadius: 2, marginRight: 12 },
  cityResultBody: { flex: 1 },
  cityResultName: { fontSize: 14, fontWeight: '600', color: C.text },
  cityResultNameMatch: { fontWeight: '800', color: C.text, textDecorationLine: 'underline' },
  cityResultState: { fontSize: 11, color: C.muted, marginTop: 2 },
  cityResultZonePill: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginLeft: 8,
  },
  cityResultZoneText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  cityResultSep: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  cityEmptyState: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  cityEmptyTitle: { fontSize: 14, fontWeight: '700', color: C.muted },
  cityEmptyHint: { fontSize: 12, color: C.placeholder, textAlign: 'center', maxWidth: 200 },

  // Join notice banner (on account step)
  joinNoticeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18,
    backgroundColor: C.warningBg, borderRadius: 10, borderWidth: 1, borderColor: C.warningBorder, padding: 12,
  },
  joinNoticeText: { flex: 1, fontSize: 13, color: '#78350f', lineHeight: 18 },
  joinNoticeOrg: { fontWeight: '700' },

  // Primary button
  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 10,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  // Alt text / links
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  altText: { fontSize: 13, color: C.muted },
  altLink: { fontSize: 13, color: C.accent, fontWeight: '700' },
  googleBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    marginTop: 8,
  },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: 0.2 },

  // Success page
  successInner: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 40 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  successTitle: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4, marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24, maxWidth: 300 },
  successEmailBold: { fontWeight: '700' },
  inviteHintCard: {
    flexDirection: 'row', gap: 12, backgroundColor: '#f0fdf4', borderRadius: 12,
    borderWidth: 1, borderColor: '#bbf7d0', padding: 14, marginBottom: 24, width: '100%',
  },
  inviteHintTitle: { fontSize: 13, fontWeight: '700', color: '#166534', marginBottom: 4 },
  inviteHintSub: { fontSize: 12, color: '#166534', lineHeight: 18 },

  // Validation state
  labelError: { color: C.error },
  inputError: { borderColor: C.error, backgroundColor: '#fff5f5' },
  inputSuccess: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  fieldSuccess: { fontSize: 12, color: '#16a34a', marginTop: 5, marginLeft: 2, fontWeight: '600' },
  chipGroupError: { padding: 4, borderRadius: 10, borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fff5f5' },

  // Password strength
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  strengthBar: { flex: 1, flexDirection: 'row', gap: 4 },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border },
  strengthWeak: { backgroundColor: C.error },
  strengthFair: { backgroundColor: C.warning },
  strengthGood: { backgroundColor: '#22c55e' },
  strengthStrong: { backgroundColor: '#16a34a' },
  strengthLabel: { fontSize: 11, fontWeight: '700', minWidth: 44, textAlign: 'right' },
  strengthLabelWeak: { color: C.error },
  strengthLabelFair: { color: C.warning },
  strengthLabelGood: { color: '#22c55e' },
  strengthLabelStrong: { color: '#16a34a' },

  // Step dots
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 16, paddingTop: 12, paddingHorizontal: 16,
  },
  dotItem: { alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent, width: 20 },
  dotDone: { backgroundColor: C.accent, opacity: 0.5 },
  dotLabel: { fontSize: 9, color: C.muted, fontWeight: '600', letterSpacing: 0.3 },
  dotLabelActive: { color: C.accent },
});

