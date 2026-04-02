/**
 * Header plus button — square black button with white plus icon.
 * Matches Trip Details / entity detail header style. Use in header right corner instead of floating FAB.
 */
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { StyleSheet, TouchableOpacity } from "react-native";
import Theme from "@/constants/Theme";
import { Plus, type LucideIcon } from "lucide-react-native";

export interface HeaderPlusButtonProps {
  onPress: () => void;
  /** Accessibility label (e.g. "Add transaction") */
  accessibilityLabel?: string;
  IconComponent?: LucideIcon;
}

export function HeaderPlusButton({
  onPress,
  accessibilityLabel = "Add",
  IconComponent = Plus,
}: HeaderPlusButtonProps) {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {IconComponent === Plus ? (
        <Plus size={16} color={Theme.textOnPrimary} strokeWidth={2.5} />
      ) : (
        <SemanticAddIcon
          IconComponent={IconComponent}
          iconSize={16}
          iconColor={Theme.textOnPrimary}
          badgeSize={16}
          badgeIconSize={11}
          badgeBackgroundColor={Theme.textOnPrimary}
          badgeIconColor={Theme.darkBackground}
          badgeOffsetX={-7}
          badgeOffsetY={-5}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
});
