import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { SemanticAddIcon } from '@/components/SemanticAddIcon';
import { useGlobalFabAnimation } from '@/lib/hooks/useGlobalFabAnimation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Plus, type LucideIcon } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { pe } from '@/lib/platformViewStyle.util';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLayoutInsets } from '@/lib/layoutInsets';

interface FABProps {
  label?: string;
  onPress: () => void;
  icon?: string; // fallback prop type, ignoring
  FontAwesomeIconName?: ComponentProps<typeof FontAwesome>['name'];
  LucideIconComponent?: LucideIcon;
  showPlusSuffix?: boolean;
}

/** FAB: 24pt above container bottom. Per standards: bottom = 24 + insets.bottom. */
export function FAB({
  label,
  onPress,
  icon,
  FontAwesomeIconName = 'plus',
  LucideIconComponent,
  showPlusSuffix = true,
}: FABProps) {
  const layout = useLayoutInsets();
  const { shellStyle, ringStyle } = useGlobalFabAnimation();
  const IconComponent = LucideIconComponent ?? Plus;
  const shouldRenderLucideIcon = LucideIconComponent != null;
  const shouldShowPlus = shouldRenderLucideIcon && showPlusSuffix && IconComponent !== Plus;
  const primaryIconColor = Theme.buttonPrimaryText;
  const plusBadgeColor = Theme.buttonPrimaryText;

  return (
    <Animated.View
      style={[
        styles.fab,
        { bottom: layout.fabBottom() },
        shellStyle,
        pe('box-none'),
      ]}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityLabel={label}
      >
        <Animated.View style={[styles.innerRing, ringStyle, pe('none')]} />
        <View style={styles.content}>
        {shouldRenderLucideIcon ? (
          shouldShowPlus ? (
            <SemanticAddIcon
              IconComponent={IconComponent}
              iconSize={20}
              iconColor={primaryIconColor}
              badgeSize={16}
              badgeIconSize={12}
              badgeBackgroundColor={plusBadgeColor}
              badgeIconColor={Theme.buttonPrimary}
              badgeOffsetX={-7}
              badgeOffsetY={-5}
            />
          ) : (
            <IconComponent size={20} color={primaryIconColor} strokeWidth={2.5} />
          )
        ) : (
          <FontAwesome name={FontAwesomeIconName} size={18} color={primaryIconColor} />
        )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Layout.fabRightOffset,
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: Layout.fabElevation,
    shadowColor: Theme.buttonPrimaryBorder,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  innerRing: {
    position: 'absolute',
    width: Layout.fabSize - 10,
    height: Layout.fabSize - 10,
    borderRadius: (Layout.fabSize - 10) / 2,
    borderWidth: 1,
    borderColor: 'rgba(77, 54, 54, 0.15)',
  },
});
