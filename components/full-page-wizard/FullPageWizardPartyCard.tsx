import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export interface FullPageWizardPartyCardProps {
  label: string;
  name: string;
  avatar: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FullPageWizardPartyCard({
  label,
  name,
  avatar,
  style,
}: FullPageWizardPartyCardProps) {
  return (
    <View style={[styles.partyCard, style]}>
      {avatar}
      <View style={styles.partyTextWrap}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

export interface FullPageWizardPartyRowProps {
  children: ReactNode;
  stack?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FullPageWizardPartyRow({
  children,
  stack = false,
  style,
}: FullPageWizardPartyRowProps) {
  return (
    <View style={[styles.partyRow, stack && styles.partyRowStack, style]}>
      {children}
    </View>
  );
}
