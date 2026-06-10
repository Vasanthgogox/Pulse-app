import { profileHubLayoutStyles as mobile } from '@/features/party/components/profileHubLayout.styles';
import { useProfileHubCompact } from '@/features/party/hooks/useProfileHubCompact';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/**
 * Shared compact style fragments for Metronic profile hubs on mobile / narrow web.
 */
export function useProfileHubCompactLayout() {
  const compact = useProfileHubCompact();

  return {
    compact,
    scrollContent: compact ? mobile.scrollContentCompact : undefined,
    hubRoot: compact ? mobile.hubRootCompact : undefined,
    pageChrome: compact ? mobile.pageChrome : undefined,
    tabBar: compact ? mobile.tabBarCompact : undefined,
    tabScroll: compact ? mobile.tabScrollCompact : undefined,
    tabScrollContent: compact ? mobile.tabScrollContentCompact : undefined,
    tabBtn: compact ? mobile.tabBtnCompact : undefined,
    tabText: compact ? mobile.tabTextCompact : undefined,
    tabActionsRow: compact ? mobile.tabActionsRow : undefined,
    metricsWrap: compact ? mobile.metricsWrapCompact : undefined,
    statsBar: compact ? mobile.statsBarCompact : undefined,
    statsBarGrid: compact ? mobile.statsBarGrid : undefined,
    statCellGrid: compact ? mobile.statCellGrid : undefined,
    statValue: compact ? mobile.statValueCompact : undefined,
    statLabel: compact ? mobile.statLabelCompact : undefined,
    panel: compact ? mobile.panelCompact : undefined,
    detailsBody: compact ? mobile.detailsBodyCompact : undefined,
    salesBody: compact ? mobile.salesBodyCompact : undefined,
    splitRow: compact ? mobile.splitColumn : undefined,
    sidebar: compact ? mobile.sidebarFull : undefined,
    mainCol: compact ? mobile.mainColFull : undefined,
    card: compact ? mobile.cardCompact : undefined,
    cardTitle: compact ? mobile.cardTitleCompact : undefined,
    aboutBody: compact ? mobile.aboutBodyCompact : undefined,
    sectionHeading: compact ? mobile.sectionHeadingCompact : undefined,
    sectionHeadingSpaced: compact ? mobile.sectionHeadingSpacedCompact : undefined,
    headquarterRow: compact ? mobile.headquarterStack : undefined,
    mapFrame: compact ? mobile.mapFrameFull : undefined,
    contactList: compact ? mobile.contactListFull : undefined,
    locationsGrid: compact ? mobile.locationsGridCompact : undefined,
    locationCard: compact ? mobile.locationCardCompact : undefined,
    activityCard: compact ? mobile.activityCardCompact : undefined,
    sectionToolbar: compact ? mobile.sectionToolbarCompact : undefined,
    sectionTitle: compact ? mobile.sectionTitleCompact : undefined,
    sectionSub: compact ? mobile.sectionSubCompact : undefined,
    kvRowStacked: compact ? mobile.kvRowStacked : undefined,
    kvLabelStacked: compact ? mobile.kvLabelStacked : undefined,
    kvValueStacked: compact ? mobile.kvValueStacked : undefined,
    statCellGridCorner: (idx: number): StyleProp<ViewStyle> => {
      if (!compact) return undefined;
      if (idx === 1) return mobile.statCellGridTopRight;
      if (idx === 2) return mobile.statCellGridBottomLeft;
      if (idx === 3) return mobile.statCellGridBottomRight;
      return undefined;
    },
  };
}

export type ProfileHubCompactLayout = ReturnType<typeof useProfileHubCompactLayout>;

export function mergeCompactText(
  base: StyleProp<TextStyle>,
  compactStyle: StyleProp<TextStyle> | undefined,
  compact: boolean,
): StyleProp<TextStyle> {
  return compact && compactStyle ? [base, compactStyle] : base;
}
