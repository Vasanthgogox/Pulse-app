/**
 * Premium mobile bottom navigation — Slack-like permanence, Pulse brand visuals.
 * Navigation fires on press (no pre-animation); active state follows route.
 */
import { memo, useCallback, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Home, Package, Route, Wallet } from 'lucide-react-native';

import { AnimatedChatTabIcon } from '@/components/AnimatedChatTabIcon';
import type { DemoTabId } from '@/components/demo/DemoTabBar';
import Theme from '@/constants/Theme';
import { pe } from '@/lib/platformViewStyle.util';
import { preloadPulseLoadsRoute, preloadTabScreen } from '@/lib/preloadRoutes';
import type { PreloadableTab } from '@/lib/preloadRoutes';

import {
  MOBILE_EDGE_ICON_SIZE,
  MOBILE_EDGE_ICON_SIZE_COMPACT,
  CLUSTER_STROKE,
} from './constants';
import { PulseBottomTabCluster, type PulseClusterTab } from './PulseBottomTabCluster';
import { PulseBottomTabSlot } from './PulseBottomTabSlot';

export type PulseBottomTabBarProps = {
  activeTab: DemoTabId;
  isChatRoute: boolean;
  isCompactMobile: boolean;
  footerPadBottom: number;
  messageUnreadCount: number;
  pendingInvites: number;
  activeLoadCount: number;
  onTabChange: (tab: DemoTabId) => void;
  onOpenChat: () => void;
  /** Finger-down: prefetch chat chunks + bootstrap before navigation. */
  onOpenChatWarm?: () => void;
  onCollapseNetworkDock: () => void;
  onWarmTab?: (tab: DemoTabId) => void;
};

function PulseBottomTabBarInner({
  activeTab,
  isChatRoute,
  isCompactMobile,
  footerPadBottom,
  messageUnreadCount,
  pendingInvites,
  activeLoadCount,
  onTabChange,
  onOpenChat,
  onOpenChatWarm,
  onCollapseNetworkDock,
  onWarmTab,
}: PulseBottomTabBarProps) {
  const clusterActiveIndex =
    activeTab === 'finance' ? 0 : activeTab === 'trips' ? 1 : activeTab === 'loadCenter' ? 2 : -1;

  const switchTab = useCallback(
    (tab: DemoTabId) => {
      onCollapseNetworkDock();
      onTabChange(tab);
    },
    [onCollapseNetworkDock, onTabChange],
  );

  const warmFinance = useCallback(() => {
    preloadTabScreen('finance' as PreloadableTab);
    onWarmTab?.('finance');
  }, [onWarmTab]);

  const warmTrips = useCallback(() => {
    preloadTabScreen('trips' as PreloadableTab);
    onWarmTab?.('trips');
  }, [onWarmTab]);

  const warmLoads = useCallback(() => {
    preloadPulseLoadsRoute();
    onWarmTab?.('loadCenter');
  }, [onWarmTab]);

  const clusterTabs = useMemo<PulseClusterTab[]>(
    () => [
      { id: 'finance', label: 'Cash', Icon: Wallet },
      { id: 'trips', label: 'Trips', Icon: Route },
      { id: 'loads', label: 'Loads', Icon: Package, badgeCount: activeLoadCount },
    ],
    [activeLoadCount],
  );

  const clusterWarmers = useMemo(
    () => [warmFinance, warmTrips, warmLoads],
    [warmFinance, warmTrips, warmLoads],
  );

  const onClusterPress = useCallback(
    (index: number) => {
      if (index === 0) switchTab('finance');
      else if (index === 1) switchTab('trips');
      else switchTab('loadCenter');
    },
    [switchTab],
  );

  const onClusterWarm = useCallback(
    (index: number) => {
      clusterWarmers[index]?.();
    },
    [clusterWarmers],
  );

  const edgeIconSize = isCompactMobile
    ? MOBILE_EDGE_ICON_SIZE_COMPACT + 1
    : MOBILE_EDGE_ICON_SIZE + 1;

  const shellSurface =
    Platform.OS === 'android'
      ? styles.shellAndroid
      : Platform.OS === 'ios'
        ? styles.shellIos
        : styles.shellWeb;

  return (
    <View
      style={[styles.footerWrap, shellSurface, { paddingBottom: footerPadBottom }, pe('box-none')]}
    >
      <View style={[styles.bar, isCompactMobile && styles.barCompact]}>
        <PulseBottomTabSlot
          label="Home"
          active={activeTab === 'network'}
          badgeCount={pendingInvites}
          compact={isCompactMobile}
          onPress={() => switchTab('network')}
          onPressIn={() => onWarmTab?.('network')}
          style={styles.edgeSlot}
          icon={
            <Home
              size={edgeIconSize}
              color={activeTab === 'network' ? Theme.textOnPrimary : Theme.pulseIndigo}
              fill={activeTab === 'network' ? Theme.textOnPrimary : 'transparent'}
              strokeWidth={activeTab === 'network' ? CLUSTER_STROKE + 0.1 : CLUSTER_STROKE}
              opacity={activeTab === 'network' ? 1 : 0.58}
            />
          }
        />
        <PulseBottomTabCluster
          tabs={clusterTabs}
          activeIndex={clusterActiveIndex}
          compact={isCompactMobile}
          onPressAt={onClusterPress}
          onWarmAt={onClusterWarm}
        />
        <PulseBottomTabSlot
          label="Chat"
          active={isChatRoute}
          badgeCount={messageUnreadCount}
          compact={isCompactMobile}
          onPressIn={onOpenChatWarm}
          onPress={() => {
            onCollapseNetworkDock();
            onOpenChat();
          }}
          style={styles.edgeSlot}
          icon={
            <View style={!isChatRoute ? styles.chatIconMuted : undefined}>
              <AnimatedChatTabIcon active={isChatRoute} size={edgeIconSize} />
            </View>
          }
        />
      </View>
    </View>
  );
}

function propsEqual(prev: PulseBottomTabBarProps, next: PulseBottomTabBarProps): boolean {
  return (
    prev.activeTab === next.activeTab &&
    prev.isChatRoute === next.isChatRoute &&
    prev.isCompactMobile === next.isCompactMobile &&
    prev.footerPadBottom === next.footerPadBottom &&
    prev.messageUnreadCount === next.messageUnreadCount &&
    prev.pendingInvites === next.pendingInvites &&
    prev.activeLoadCount === next.activeLoadCount &&
    prev.onTabChange === next.onTabChange &&
    prev.onOpenChat === next.onOpenChat &&
    prev.onOpenChatWarm === next.onOpenChatWarm &&
    prev.onCollapseNetworkDock === next.onCollapseNetworkDock &&
    prev.onWarmTab === next.onWarmTab
  );
}

export const PulseBottomTabBar = memo(PulseBottomTabBarInner, propsEqual);

const styles = StyleSheet.create({
  footerWrap: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Theme.tabBarBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.tabBarBorderTop,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  shellIos: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  shellAndroid: {
    elevation: 10,
  },
  shellWeb: {
    shadowColor: Theme.pulseIndigo,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 10,
  },
  barCompact: {
    minHeight: 52,
    paddingHorizontal: 10,
    gap: 8,
  },
  edgeSlot: {
    width: 58,
    maxWidth: 58,
  },
  chatIconMuted: { opacity: 0.55 },
});
