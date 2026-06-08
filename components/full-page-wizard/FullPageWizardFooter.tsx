import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export interface FullPageWizardFooterProps {
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
  tertiaryDisabled?: boolean;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  loading?: boolean;
  summary?: string;
  hint?: string | null;
}

export function FullPageWizardFooter({
  secondaryLabel = "Back",
  onSecondaryPress,
  tertiaryLabel,
  onTertiaryPress,
  tertiaryDisabled = false,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  loading = false,
  summary,
  hint,
}: FullPageWizardFooterProps) {
  const disabled = primaryDisabled || loading;

  return (
    <View>
      {summary ? (
        <Text style={styles.footerSummary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
      <View style={styles.footerBar}>
        {onSecondaryPress ? (
          <Pressable style={styles.cancelBtn} onPress={onSecondaryPress}>
            <Text style={styles.cancelBtnText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
        {tertiaryLabel && onTertiaryPress ? (
          <Pressable
            style={[
              styles.tertiaryBtn,
              tertiaryDisabled && styles.tertiaryBtnDisabled,
            ]}
            onPress={onTertiaryPress}
            disabled={tertiaryDisabled}
          >
            <Text style={styles.tertiaryBtnText}>{tertiaryLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.submitBtn, disabled && styles.submitBtnDisabled]}
          onPress={onPrimaryPress}
          disabled={disabled}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{primaryLabel}</Text>
          )}
        </Pressable>
      </View>
      {hint ? <Text style={styles.footerHint}>{hint}</Text> : null}
    </View>
  );
}
