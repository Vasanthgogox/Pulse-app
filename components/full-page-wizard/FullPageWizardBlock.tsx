import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export interface FullPageWizardBlockProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FullPageWizardBlock({
  title,
  subtitle,
  children,
  style,
}: FullPageWizardBlockProps) {
  return (
    <View style={[styles.block, style]}>
      {title ? <Text style={styles.blockTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.blockMeta}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}
