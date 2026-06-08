import type { ReactNode } from "react";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export interface WizardFormBodyProps {
  /** When true, parent `FullPageWizardShell` owns scrolling — render a plain View. */
  shellScroll: boolean;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, "children" | "contentContainerStyle">;
}

/**
 * Avoid nested ScrollViews in full-page wizards: mobile steps scroll via the shell.
 */
export function WizardFormBody({
  shellScroll,
  children,
  contentContainerStyle,
  scrollViewProps,
}: WizardFormBodyProps) {
  if (shellScroll) {
    return (
      <View style={[styles.wizardStepBody, contentContainerStyle]}>{children}</View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  );
}
