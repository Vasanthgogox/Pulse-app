import Theme from '@/constants/Theme';
import { SemanticAddIcon } from '@/components/SemanticAddIcon';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Plus, type LucideIcon } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const IconComponent = LucideIconComponent ?? Plus;
  const shouldRenderLucideIcon = LucideIconComponent != null;
  const shouldShowPlus = shouldRenderLucideIcon && showPlusSuffix && IconComponent !== Plus;
  const primaryIconColor = Theme.textOnPrimary;
  const plusBadgeColor = "#0f172a";

  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: 24 + insets.bottom }]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityLabel={label}
    >
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
              badgeIconColor={Theme.textOnPrimary}
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
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.primary,
    borderWidth: 2.5,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
