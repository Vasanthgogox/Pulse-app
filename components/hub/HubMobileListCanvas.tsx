import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { hubMobileListCanvasStyles as styles } from "./hubMobileTicketTokens";

export interface HubMobileListCanvasProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Minimal list wrapper for mobile hub ticket cards (trips, indents).
 * Cards carry their own white surface; canvas stays transparent.
 */
export function HubMobileListCanvas({ children, style }: HubMobileListCanvasProps) {
  return <View style={[styles.list, style]}>{children}</View>;
}
