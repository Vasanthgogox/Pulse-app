import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { hubMobileChromeStyles as styles } from "./hubMobileChrome";

export interface HubMobileScreenHeaderProps {
  title: string;
  action?: ReactNode;
}

/** Row 1 — hub title + primary action pill (Add Trip / Add Load). */
export function HubMobileScreenHeader({ title, action }: HubMobileScreenHeaderProps) {
  return (
    <View style={styles.screenHeaderRow}>
      <Text style={styles.screenTitle}>{title}</Text>
      {action}
    </View>
  );
}
