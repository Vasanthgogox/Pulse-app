/**
 * Single-page client/supplier add form (desktop / wide).
 * Compact card layout — contact import omitted (not available on desktop web).
 */
import { memo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowRight, ChevronLeft, Smartphone } from "lucide-react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";

function IndiaFlagIcon({ width = 18, height = 13 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 20 15">
      <Rect width="20" height="5" fill="#FF9933" />
      <Rect y="5" width="20" height="5" fill="#FFFFFF" />
      <Rect y="10" width="20" height="5" fill="#138808" />
      <Circle cx="10" cy="7.5" r="1.6" fill="#000080" />
      <Path
        d="M10 6.2 L10.35 7.15 L11.35 7.15 L10.55 7.75 L10.85 8.7 L10 8.1 L9.15 8.7 L9.45 7.75 L8.65 7.15 L9.65 7.15 Z"
        fill="#000080"
      />
    </Svg>
  );
}

export interface PartyContactCombinedFormProps {
  entityTitle: string;
  subtitle?: string;
  onClose: () => void;

  orgLabel: string;
  orgValue: string;
  onOrgChange: (value: string) => void;

  contactLabel: string;
  contactValue: string;
  onContactChange: (value: string) => void;

  phoneValue: string;
  onPhoneChange: (value: string) => void;
  phoneMaxLength?: number;

  formError: string | null;
  noOrganizationBanner?: ReactNode;
  phoneExtras?: ReactNode;

  canAdvance: boolean;
  onAdvance: () => void;
  advanceLabel?: string;
}

export const PartyContactCombinedForm = memo(function PartyContactCombinedForm({
  entityTitle,
  subtitle = "Fill required fields and continue.",
  onClose,
  orgLabel,
  orgValue,
  onOrgChange,
  contactLabel,
  contactValue,
  onContactChange,
  phoneValue,
  onPhoneChange,
  phoneMaxLength = 10,
  formError,
  noOrganizationBanner,
  phoneExtras,
  canAdvance,
  onAdvance,
  advanceLabel = "Continue",
}: PartyContactCombinedFormProps) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="party-close-btn"
        >
          <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.entityTitle} numberOfLines={1}>
              {entityTitle}
            </Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {noOrganizationBanner}

        {formError ? (
          <View style={styles.errorBar} testID="party-form-error">
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}

        <View style={styles.fields}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{orgLabel}</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. abc company"
              placeholderTextColor={Theme.textMuted}
              value={orgValue}
              onChangeText={onOrgChange}
              autoCapitalize="words"
              testID="party-org-name-input"
            />
          </View>

          <View style={styles.row2}>
            <View style={styles.row2Grow}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{contactLabel}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={Theme.textMuted}
                  value={contactValue}
                  onChangeText={onContactChange}
                  autoCapitalize="words"
                  testID="party-contact-name-input"
                />
              </View>
            </View>
            <View style={styles.row2Grow}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={styles.phoneOuter}>
                  <View style={styles.phoneCcWrap}>
                    <IndiaFlagIcon />
                    <Text style={styles.phoneCc}>+91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="10-digit mobile"
                    placeholderTextColor={Theme.textMuted}
                    keyboardType="phone-pad"
                    maxLength={phoneMaxLength}
                    value={phoneValue}
                    onChangeText={onPhoneChange}
                    testID="party-phone-input"
                  />
                  <Smartphone size={16} color={Theme.textMuted} />
                </View>
              </View>
            </View>
          </View>

          {phoneExtras ? <View style={styles.phoneExtras}>{phoneExtras}</View> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryBtn, !canAdvance && styles.primaryBtnDisabled]}
          onPress={onAdvance}
          disabled={!canAdvance}
          testID="party-continue-btn"
        >
          <Text style={styles.primaryBtnText}>{advanceLabel}</Text>
          <ArrowRight size={16} color={Theme.buttonDarkText} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: Theme.screenBackground,
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Theme.positive,
  },
  entityTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  subtitle: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textSecondary,
    paddingLeft: 14,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  fields: {
    gap: 4,
  },
  fieldBlock: {
    marginBottom: 14,
    gap: 6,
  },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm,
    minHeight: 46,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  row2: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  row2Grow: {
    flex: 1,
    minWidth: 0,
  },
  phoneOuter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceForm,
    minHeight: 46,
  },
  phoneCcWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  phoneCc: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: 12,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  phoneExtras: {
    marginTop: -4,
    marginBottom: 4,
  },
  errorBar: {
    backgroundColor: Theme.negativeMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.negative,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonDark,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  primaryBtnDisabled: {
    opacity: 0.38,
  },
  primaryBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    letterSpacing: 0.75,
  },
});
