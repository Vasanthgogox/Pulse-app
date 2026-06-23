/**
 * Header plus button — illustration pill with ink plus icon.
 * Use in header right corner instead of floating FAB.
 */
import { pulsePillButtonContainerIconOnly, pulsePillButtonPressed } from "@/constants/PulsePillButtonChrome";
import Theme from "@/constants/Theme";
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { Plus, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

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
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        pulsePillButtonContainerIconOnly,
        pressed && pulsePillButtonPressed,
      ]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {IconComponent === Plus ? (
        <Plus size={16} color={Theme.buttonPrimaryText} strokeWidth={2.5} />
      ) : (
        <SemanticAddIcon
          IconComponent={IconComponent}
          iconSize={16}
          iconColor={Theme.buttonPrimaryText}
          badgeSize={16}
          badgeIconSize={11}
          badgeBackgroundColor={Theme.buttonPrimaryText}
          badgeIconColor={Theme.buttonPrimary}
          badgeOffsetX={-7}
          badgeOffsetY={-5}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
  },
});
