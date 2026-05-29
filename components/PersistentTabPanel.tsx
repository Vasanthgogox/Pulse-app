import { useEffect, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  /** When true, panel is visible and interactive. */
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Mount on first activation; keep mounted afterward (Slack-like persistence). */
  preserve?: boolean;
};

/**
 * Tab panel that stays mounted after first visit so scroll position and local UI
 * state survive tab switches. Inactive panels are hidden, not unmounted.
 */
export function PersistentTabPanel({
  active,
  children,
  style,
  preserve = true,
}: Props) {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active && preserve) setMounted(true);
  }, [active, preserve]);

  if (!preserve) {
    return active ? <View style={style}>{children}</View> : null;
  }

  if (!mounted) return null;

  return (
    <View
      style={[style, !active && { display: "none" }]}
      pointerEvents={active ? "auto" : "none"}
      collapsable={false}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </View>
  );
}
