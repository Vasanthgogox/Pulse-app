/**
 * Demo footer: FISCAL | TRIPS | NETWORK — Tesla-style glass dock with sliding pill.
 * Ops Agent is accessed via global floating icon.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const springBounce = { damping: 14, stiffness: 400 };
const springSettle = { damping: 18, stiffness: 320 };

/** Wraps content with a pop-in animation when selected. */
function AnimatedTabIcon({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withSpring(1.15, springBounce),
        withSpring(1.05, springSettle)
      );
    } else {
      scale.value = withSpring(1, springSettle);
    }
  }, [selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[animatedStyle, styles.animatedIconWrap, Platform.OS === 'web' && styles.animatedIconWrapWeb]}>
      {children}
    </Animated.View>
  );
}

export type DemoTabId = 'finance' | 'trips' | 'network';

/** Side tabs: selected = primary icon + label. */
const SIDE_SELECTED_COLOR = Theme.primary;

interface DemoTabBarProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId) => void;
  onLoadBoardPress: () => void;
  showLoadFab?: boolean;
}

export function DemoTabBar({
  activeTab,
  onTabChange,
  onLoadBoardPress,
}: DemoTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const isWeb = Platform.OS === 'web';
  const isFiscal = activeTab === 'finance';
  const isTrips = activeTab === 'trips';
  const isNetwork = activeTab === 'network';

  const dockBottom = insets.bottom;
  const verticalPad = Math.max(dockBottom / 4, 4);
  const bottomPad = verticalPad + 6;
  const topPad = isWeb ? Math.max(insets.top, 16) : verticalPad;
  
  return (
    <View style={[styles.footerWrap, isWeb ? { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 } : { paddingTop: verticalPad, paddingBottom: bottomPad }]}>
      <View style={[styles.glassDock, isWeb && styles.glassDockWeb]}>
        
        {isWeb && (
          <View style={styles.webLogoWrap}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.webLogoImage}
              resizeMode="contain"
              accessibilityLabel="Q web"
            />
            <Text style={styles.webLogoText}>Q WEB</Text>
          </View>
        )}

        <View style={[styles.tabsRow, isWeb && styles.tabsRowWeb]}>
          {/* Column 1: Fiscal — pill behind when active */}
          <View style={[styles.dockColumn, isWeb && styles.dockColumnWeb]}>
            <View style={[styles.activePill, isWeb && styles.activePillWeb, isFiscal && styles.activePillVisible]}>
              <View style={[styles.activePillAccent, isWeb && styles.activePillAccentWeb]} />
            </View>
            <TouchableOpacity
              style={styles.dockButton}
              onPress={() => onTabChange('finance')}
              activeOpacity={0.9}
              hitSlop={{
                top: Layout.touchTargetHitSlop,
                bottom: Layout.touchTargetHitSlop,
                left: Layout.touchTargetHitSlop,
                right: Layout.touchTargetHitSlop,
              }}
            >
              <AnimatedTabIcon selected={isFiscal}>
                <FontAwesome5
                  name="credit-card"
                  size={16}
                  color={isFiscal ? Theme.textOnPrimary : Theme.textMutedDemo}
                  solid={isFiscal}
                />
                <Text style={[styles.dockLabel, isFiscal && styles.dockLabelActive]}>
                  {t('fiscal').toUpperCase()}
                </Text>
              </AnimatedTabIcon>
            </TouchableOpacity>
          </View>

          {/* Column 2: Trips — route icon (voyage/fleet) */}
          <View style={[styles.dockColumn, isWeb && styles.dockColumnWeb]}>
            <View style={[styles.activePill, isWeb && styles.activePillWeb, isTrips && styles.activePillVisible]}>
              <View style={[styles.activePillAccent, isWeb && styles.activePillAccentWeb]} />
            </View>
            <TouchableOpacity
              style={styles.dockButton}
              onPress={() => onTabChange('trips')}
              activeOpacity={0.9}
              hitSlop={{
                top: Layout.touchTargetHitSlop,
                bottom: Layout.touchTargetHitSlop,
                left: Layout.touchTargetHitSlop,
                right: Layout.touchTargetHitSlop,
              }}
            >
              <AnimatedTabIcon selected={isTrips}>
                <FontAwesome5
                  name="route"
                  size={16}
                  color={isTrips ? Theme.textOnPrimary : Theme.textMutedDemo}
                  solid={isTrips}
                />
                <Text style={[styles.dockLabel, isTrips && styles.dockLabelActive]}>
                  {t('trips').toUpperCase()}
                </Text>
              </AnimatedTabIcon>
            </TouchableOpacity>
          </View>

          {/* Column 3: Network */}
          <View style={[styles.dockColumn, isWeb && styles.dockColumnWeb]}>
            <View style={[styles.activePill, isWeb && styles.activePillWeb, isNetwork && styles.activePillVisible]}>
              <View style={[styles.activePillAccent, isWeb && styles.activePillAccentWeb]} />
            </View>
            <TouchableOpacity
              style={styles.dockButton}
              onPress={() => onTabChange('network')}
              activeOpacity={0.9}
              hitSlop={{
                top: Layout.touchTargetHitSlop,
                bottom: Layout.touchTargetHitSlop,
                left: Layout.touchTargetHitSlop,
                right: Layout.touchTargetHitSlop,
              }}
            >
              <AnimatedTabIcon selected={isNetwork}>
                <FontAwesome5
                  name="users"
                  size={16}
                  color={isNetwork ? Theme.textOnPrimary : Theme.textMutedDemo}
                  solid={isNetwork}
                />
                <Text style={[styles.dockLabel, isNetwork && styles.dockLabelActive]}>
                  {t('network').toUpperCase()}
                </Text>
              </AnimatedTabIcon>
            </TouchableOpacity>
          </View>
        </View>

        {isWeb && (
          <View style={styles.webRightWrap}>
            {/* Optional right side content for web navbar */}
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  animatedIconWrapWeb: {
    flexDirection: 'column',
    gap: 3,
  },
  footerWrap: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  glassDock: {
    height: Layout.tabBarHeight + 5,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  glassDockWeb: {
    height: Layout.tabBarHeight + 20,
    borderRadius: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowOffset: { width: 0, height: 4 },
    backgroundColor: '#fff',
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Changed to space-between
  },
  webLogoWrap: {
    width: 200,
    height: '100%',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingLeft: 24,
  },
  webLogoText: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    color: Theme.primary,
    letterSpacing: 2,
  },
  webLogoImage: {
    width: 48,
    height: 48,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  tabsRowWeb: {
    flex: 1,
    maxWidth: 600,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderRadius: 24,
    marginVertical: 6,
    padding: 2,
  },
  webRightWrap: {
    width: 200,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  dockColumn: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  dockColumnWeb: {
    flex: 1, // distribute evenly in the fixed width 400 container
  },
  activePill: {
    position: 'absolute',
    top: 2.5,
    left: 2.5,
    right: 2.5,
    bottom: 2.5,
    borderRadius: 18,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    opacity: 0,
  },
  activePillVisible: {
    opacity: 1,
  },
  activePillWeb: {
    borderRadius: 18,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  activePillAccent: {
    position: 'absolute',
    bottom: 0,
    left: '28%',
    right: '28%',
    height: 3,
    borderRadius: 999,
    backgroundColor: Theme.teslaRed,
  },
  activePillAccentWeb: {
    bottom: 0,
    left: '28%',
    right: '28%',
    height: 3,
    borderRadius: 999,
  },
  dockButton: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.minTouchTargetSize,
  },
  dockLabel: {
    fontSize: 7,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Theme.textMutedDemo,
  },
  dockLabelActive: {
    color: Theme.textOnPrimary,
  },
  dockLabelActiveWeb: {
    color: Theme.textPrimaryDark,
  },
  dockLabelWeb: {
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 0,
  },
});
