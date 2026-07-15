import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { alertRegistryActionStyles } from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type FullPageWizardFooterActionVariant = "wizard" | "registry";

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
  /** Registry = notification / chat alert CTA chrome (Decline + Pay now). */
  actionVariant?: FullPageWizardFooterActionVariant;
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
  actionVariant = "wizard",
}: FullPageWizardFooterProps) {
  const disabled = primaryDisabled || loading;
  const isRegistry = actionVariant === "registry";
  const actionStyles = alertRegistryActionStyles;

  const footerBarStyle = isRegistry
    ? actionStyles.footerBar
    : summary
      ? styles.footerBarWithSummary
      : styles.footerBar;

  return (
    <View>
      <View style={footerBarStyle}>
        {summary ? (
          <Text
            style={
              isRegistry ? actionStyles.footerSummary : styles.footerSummaryInline
            }
            numberOfLines={2}
          >
            {summary}
          </Text>
        ) : null}
        <View style={styles.footerActions}>
          {onSecondaryPress ? (
            <Pressable
              style={
                isRegistry ? actionStyles.footerGhostBtn : styles.cancelBtn
              }
              onPress={onSecondaryPress}
            >
              <Text
                style={
                  isRegistry
                    ? actionStyles.footerGhostBtnText
                    : styles.cancelBtnText
                }
              >
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
          {tertiaryLabel && onTertiaryPress ? (
            <Pressable
              style={[
                isRegistry ? actionStyles.footerTertiaryBtn : styles.tertiaryBtn,
                !isRegistry && tertiaryDisabled && styles.tertiaryBtnDisabled,
                isRegistry &&
                  tertiaryDisabled &&
                  actionStyles.btnDisabled,
              ]}
              onPress={onTertiaryPress}
              disabled={tertiaryDisabled}
            >
              <Text
                style={
                  isRegistry
                    ? actionStyles.footerTertiaryBtnText
                    : styles.tertiaryBtnText
                }
              >
                {tertiaryLabel}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              isRegistry ? actionStyles.footerPrimaryBtn : styles.submitBtn,
              summary && !isRegistry && styles.submitBtnWithSummary,
              disabled &&
                (isRegistry
                  ? actionStyles.btnDisabled
                  : styles.submitBtnDisabled),
            ]}
            onPress={onPrimaryPress}
            disabled={disabled}
          >
            {loading ? (
              <ActivityIndicator
                color={isRegistry ? "#fff" : Theme.buttonPrimaryText}
                size="small"
              />
            ) : (
              <Text
                style={
                  isRegistry
                    ? actionStyles.footerPrimaryBtnText
                    : [
                        styles.submitBtnText,
                        disabled && styles.submitBtnTextDisabled,
                      ]
                }
              >
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
      {hint ? (
        <Text style={isRegistry ? actionStyles.footerHint : styles.footerHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
