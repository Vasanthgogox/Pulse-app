import { memo, type ReactNode } from "react";
import { Text } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type WizardContextSummaryProps = {
  eyebrow?: string;
  title: string;
  lines: string[];
  footer?: ReactNode;
};

export const WizardContextSummary = memo(function WizardContextSummary({
  eyebrow = "Context",
  title,
  lines,
  footer,
}: WizardContextSummaryProps) {
  return (
    <>
      <Text style={styles.desktopContextEyebrow}>{eyebrow}</Text>
      <Text style={styles.desktopContextTitle} numberOfLines={2}>
        {title}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={styles.desktopContextLine} numberOfLines={2}>
          {line}
        </Text>
      ))}
      {footer}
    </>
  );
});
