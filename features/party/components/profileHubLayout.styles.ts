/**
 * Shared compact layout tokens for client / supplier / vehicle profile hubs on mobile.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { METRONIC } from '@/features/network/components/desktop/networkDesktopHub.styles';
import { StyleSheet } from 'react-native';

export const profileHubLayoutStyles = StyleSheet.create({
  pageChrome: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
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
    paddingVertical: 6,
    paddingRight: 4,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: 'center',
  },
  chromeBackText: {
    fontSize: 14,
    fontWeight: '600',
    color: METRONIC.text,
  },
  chromeTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chromeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: METRONIC.text,
    letterSpacing: -0.3,
  },
  chromeSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: METRONIC.subtle,
  },
  chromePillsScroll: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  chromePillsContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chromePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F1F4',
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  chromePillWarn: {
    backgroundColor: '#FFF8DD',
    borderColor: '#F6C000',
  },
  chromePillText: {
    fontSize: 10,
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
  },
  tabScrollCompact: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  tabScrollContentCompact: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 4,
    paddingVertical: 2,
  },
  tabBtnCompact: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: 'center',
    marginBottom: 0,
    borderBottomWidth: 2,
  },
  tabTextCompact: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
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
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: METRONIC.text,
  },
  tabActionPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  tabActionIcon: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: 10,
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
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 4,
  },
  statsBarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCellGrid: {
    width: '50%',
    flex: undefined,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderRightColor: METRONIC.border,
    borderBottomColor: METRONIC.border,
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
    fontSize: 18,
    fontWeight: '800',
  },
  statLabelCompact: {
    fontSize: 9,
    letterSpacing: 0.5,
  },

  panelCompact: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
  },
  detailsBodyCompact: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  splitColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  sidebarFull: {
    width: '100%',
    minWidth: undefined,
    maxWidth: undefined,
    flexShrink: 1,
  },
  mainColFull: {
    width: '100%',
    minWidth: undefined,
    flex: undefined,
  },
  headquarterStack: {
    flexDirection: 'column',
  },
  contactListFull: {
    minWidth: undefined,
    width: '100%',
    paddingTop: 4,
  },
  mapFrameFull: {
    width: '100%',
    minWidth: undefined,
    height: 140,
    minHeight: 140,
  },

  kvRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    paddingVertical: 10,
  },
  kvLabelStacked: {
    fontSize: 11,
    fontWeight: '600',
    color: METRONIC.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kvValueStacked: {
    fontSize: 14,
    fontWeight: '600',
    color: METRONIC.text,
    textAlign: 'left',
    width: '100%',
    lineHeight: 20,
  },

  snapshotGridCompact: {
    flexDirection: 'column',
    gap: 8,
  },
  snapshotCellFull: {
    minWidth: undefined,
    width: '100%',
  },

  formGridCompact: {
    flexDirection: 'column',
    gap: 10,
  },
  fieldGroupFull: {
    minWidth: undefined,
    width: '100%',
    flexGrow: 1,
  },

  tableScroll: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  tableScrollInner: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    minWidth: '100%',
  },
  tableMinWidth: {
    minWidth: 640,
  },

  scrollContentCompact: {
    paddingBottom: 32,
  },
});
