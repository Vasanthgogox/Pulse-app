/**
 * Shared compact layout tokens for client / supplier / vehicle / org profile hubs on mobile.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { METRONIC } from '@/features/network/components/desktop/networkDesktopHub.styles';
import { StyleSheet } from 'react-native';

const GUTTER = Layout.screenPaddingHorizontal;

export const profileHubLayoutStyles = StyleSheet.create({
  hubRootCompact: {
    backgroundColor: METRONIC.bodyBg,
  },

  pageChrome: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  chromeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  chromeBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 2,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: 'center',
  },
  chromeBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: METRONIC.text,
  },
  chromeTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chromeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: METRONIC.text,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  chromeSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: METRONIC.muted,
    lineHeight: 14,
  },
  chromePillsScroll: {
    marginHorizontal: -GUTTER,
  },
  chromePillsContent: {
    paddingHorizontal: GUTTER,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Meta chips + Invites CTA share one row. */
  chromeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chromePillsScrollInline: {
    flex: 1,
    marginLeft: -GUTTER,
  },
  chromePillsContentInline: {
    paddingLeft: GUTTER,
    paddingRight: 4,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chromeInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexShrink: 0,
    backgroundColor: METRONIC.text,
  },
  chromeInviteBtnActive: {
    backgroundColor: Theme.primary,
  },
  chromeInviteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textOnPrimary,
    includeFontPadding: false,
  },
  /** Badges + trailing chrome actions on one row */
  chromeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  chromeBadgeGroup: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  /** Trailing icon in chrome badge row (chat, etc.) */
  chromeInlineAction: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
    flexShrink: 0,
  },
  chromeInlineActionActive: {
    borderColor: Theme.primary,
    backgroundColor: '#F5F3FF',
  },
  /** @deprecated use chromeBadgeRow + chromeInlineAction */
  chromeActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
  },
  chromePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#F1F1F4',
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  chromePillWarn: {
    backgroundColor: '#FFF8DD',
    borderColor: '#F6C000',
  },
  chromePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: METRONIC.subtle,
    letterSpacing: 0.35,
  },
  chromePillTextWarn: {
    color: '#B8860B',
  },

  tabBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingTop: 0,
    minHeight: undefined,
    gap: 0,
    backgroundColor: Theme.cardWhite,
  },
  tabScrollCompact: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  tabScrollContentCompact: {
    paddingHorizontal: GUTTER,
    gap: 2,
    paddingVertical: 0,
    alignItems: 'flex-end',
  },
  tabBtnCompact: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    marginBottom: 0,
    borderBottomWidth: 2,
  },
  tabTextCompact: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: GUTTER,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  tabActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: METRONIC.text,
  },
  tabActionPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    color: Theme.textOnPrimary,
    includeFontPadding: false,
  },
  tabActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
  },
  tabActionIconActive: {
    borderColor: Theme.primary,
    backgroundColor: '#F5F3FF',
  },

  metricsWrapCompact: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: METRONIC.bodyBg,
  },
  statsBarCompact: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 10,
  },
  statsBarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  statCellGrid: {
    width: '50%',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '50%',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderRightColor: METRONIC.border,
    borderBottomColor: METRONIC.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCellGridTopRight: {
    borderRightWidth: 0,
  },
  statCellGridBottomLeft: {
    borderBottomWidth: 0,
  },
  statCellGridBottomRight: {
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  statValueCompact: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 17,
    color: METRONIC.text,
  },
  statLabelCompact: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    lineHeight: 11,
    textAlign: 'center',
    color: METRONIC.muted,
    textTransform: 'uppercase',
  },

  panelCompact: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: METRONIC.bodyBg,
    borderBottomWidth: 0,
  },
  detailsBodyCompact: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: METRONIC.bodyBg,
    borderBottomWidth: 0,
  },
  salesBodyCompact: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: METRONIC.bodyBg,
    borderBottomWidth: 0,
  },
  splitColumn: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
    flexWrap: 'nowrap',
  },
  sidebarFull: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    gap: 8,
  },
  mainColFull: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flex: 1,
    gap: 8,
  },
  headquarterStack: {
    flexDirection: 'column',
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  contactListFull: {
    minWidth: 0,
    width: '100%',
    flex: undefined,
    paddingTop: 0,
    gap: 7,
  },
  mapFrameFull: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    height: 128,
    minHeight: 128,
    flex: undefined,
  },

  kvRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    paddingVertical: 8,
    width: '100%',
  },
  kvLabelStacked: {
    fontSize: 10,
    fontWeight: '600',
    color: METRONIC.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    lineHeight: 13,
  },
  kvValueStacked: {
    fontSize: 13,
    fontWeight: '400',
    color: METRONIC.text,
    textAlign: 'left',
    width: '100%',
    lineHeight: 18,
  },

  snapshotGridCompact: {
    flexDirection: 'column',
    gap: 8,
  },
  snapshotCellFull: {
    minWidth: 0,
    width: '100%',
  },

  formGridCompact: {
    flexDirection: 'column',
    gap: 8,
  },
  fieldGroupFull: {
    minWidth: 0,
    width: '100%',
    flexGrow: 1,
  },

  tableScroll: {
    marginHorizontal: -GUTTER,
  },
  tableScrollInner: {
    paddingHorizontal: GUTTER,
    minWidth: '100%',
  },
  tableMinWidth: {
    minWidth: 640,
  },

  scrollContentCompact: {
    paddingBottom: 24,
    backgroundColor: METRONIC.bodyBg,
  },

  cardCompact: {
    padding: 10,
    gap: 6,
    borderRadius: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  cardTitleCompact: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 0,
    lineHeight: 16,
  },
  aboutBodyCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeadingCompact: {
    fontSize: 11,
    marginTop: 0,
    lineHeight: 15,
  },
  sectionHeadingSpacedCompact: {
    marginTop: 6,
  },
  networkLinkTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  tagPillTextCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  locationCardCompact: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
  },
  locationsGridCompact: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  },
  activityCardCompact: {
    padding: 10,
    gap: 8,
    borderRadius: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  salesCardPadCompact: {
    padding: 10,
  },
  sectionToolbarCompact: {
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  sectionTitleCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  sectionSubCompact: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
});
