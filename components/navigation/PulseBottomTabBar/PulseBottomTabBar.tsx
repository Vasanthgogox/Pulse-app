/**
 * Compact mobile bottom navigation — flat five-tab row with underline selection.
 */
import { memo, useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  DollarSign,
  Home,
  MessageSquare,
  Signpost,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';

import { WEB_TOP_NAV_ICON } from '@/components/demo/webTopNavIcon.tokens';
import type { DemoTabId, DemoTabVisibility } from '@/components/demo/DemoTabBar';
import Theme from '@/constants/Theme';
import { pe } from '@/lib/platformViewStyle.util';
import { preloadPulseLoadsRoute, preloadTabScreen } from '@/lib/preloadRoutes';
import type { PreloadableTab } from '@/lib/preloadRoutes';

import {
  MOBILE_TAB_ICON_SIZE,
  MOBILE_TAB_ICON_SIZE_COMPACT,
} from './constants';
import {
  PULSE_BOTTOM_TAB_DOCK,
  pulseTabBarBodyHeight,
} from './dockMetrics';
import { PulseBottomTabSlot } from './PulseBottomTabSlot';

export type PulseBottomTabBarProps = {
  activeTab: DemoTabId;
  /** Per-domain tab visibility (functional member roles). Omitted → all visible. */
  visibility?: DemoTabVisibility;
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

function TabOutlineIcon({
  Icon,
  active,
  size,
}: {
  Icon: LucideIcon;
  active: boolean;
  size: number;
}) {
  return (
    <Icon
      size={size}
      color={active ? WEB_TOP_NAV_ICON.active : WEB_TOP_NAV_ICON.muted}
      strokeWidth={WEB_TOP_NAV_ICON.stroke}
    />
  );
}

function PulseBottomTabBarInner({
  activeTab,
  visibility,
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
  const iconSize = isCompactMobile ? MOBILE_TAB_ICON_SIZE_COMPACT : MOBILE_TAB_ICON_SIZE;
  const showFinance = visibility?.finance ?? true;
  const showTrips = visibility?.trips ?? true;
  const showNetwork = visibility?.network ?? true;

  const switchTab = useCallback(
    (tab: DemoTabId) => {
      onCollapseNetworkDock();
      onTabChange(tab);
    },
    [onCollapseNetworkDock, onTabChange],
  );

  const warmTab = useCallback(
    (tab: DemoTabId) => {
      if (tab === 'loadCenter') {
        preloadPulseLoadsRoute();
      } else if (tab === 'finance' || tab === 'trips' || tab === 'network') {
        preloadTabScreen(tab as PreloadableTab);
      }
      onWarmTab?.(tab);
    },
    [onWarmTab],
  );

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
        {showNetwork ? (
          <PulseBottomTabSlot
            label="Home"
            active={activeTab === 'network'}
            badgeCount={pendingInvites}
            compact={isCompactMobile}
            onPress={() => switchTab('network')}
            onPressIn={() => warmTab('network')}
            icon={
              <Home
                size={iconSize}
                color={
                  activeTab === 'network'
                    ? WEB_TOP_NAV_ICON.active
                    : WEB_TOP_NAV_ICON.muted
                }
                fill={activeTab === 'network' ? WEB_TOP_NAV_ICON.active : 'transparent'}
                strokeWidth={WEB_TOP_NAV_ICON.stroke}
              />
            }
          />
        ) : null}
        {showFinance ? (
          <PulseBottomTabSlot
            label="Cash"
            active={activeTab === 'finance'}
            compact={isCompactMobile}
            onPress={() => switchTab('finance')}
            onPressIn={() => warmTab('finance')}
            icon={
              <TabOutlineIcon
                Icon={DollarSign}
                active={activeTab === 'finance'}
                size={iconSize}
              />
            }
          />
        ) : null}
        {showTrips ? (
          <PulseBottomTabSlot
            label="Trips"
            active={activeTab === 'trips'}
            compact={isCompactMobile}
            onPress={() => switchTab('trips')}
            onPressIn={() => warmTab('trips')}
            icon={
              <TabOutlineIcon
                Icon={Signpost}
                active={activeTab === 'trips'}
                size={iconSize}
              />
            }
          />
        ) : null}
        <PulseBottomTabSlot
          label="Loads"
          active={activeTab === 'loadCenter'}
          badgeCount={activeLoadCount}
          compact={isCompactMobile}
          onPress={() => switchTab('loadCenter')}
          onPressIn={() => warmTab('loadCenter')}
          icon={
            <TabOutlineIcon
              Icon={Truck}
              active={activeTab === 'loadCenter'}
              size={iconSize}
            />
          }
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
          icon={
            <TabOutlineIcon Icon={MessageSquare} active={isChatRoute} size={iconSize} />
          }
        />
      </View>
    </View>
  );
}

function propsEqual(prev: PulseBottomTabBarProps, next: PulseBottomTabBarProps): boolean {
  return (
    prev.activeTab === next.activeTab &&
    prev.visibility?.finance === next.visibility?.finance &&
    prev.visibility?.trips === next.visibility?.trips &&
    prev.visibility?.network === next.visibility?.network &&
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: PULSE_BOTTOM_TAB_DOCK.shellPaddingTop,
    paddingHorizontal: 0,
  },
  shellIos: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  shellAndroid: {
    elevation: 6,
  },
  shellWeb: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: pulseTabBarBodyHeight(false),
    paddingHorizontal: 4,
    paddingTop: PULSE_BOTTOM_TAB_DOCK.barPaddingTop,
  },
  barCompact: {
    height: pulseTabBarBodyHeight(true),
    paddingHorizontal: 2,
  },
});
