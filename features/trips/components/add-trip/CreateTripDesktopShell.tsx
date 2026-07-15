import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import Theme from "@/constants/Theme";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopShellProps = {
  title?: string;
  subtitle?: string;
  stepIndex?: number;
  stepTotal?: number;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  progress?: ReactNode;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  hint?: string | null;
  fillBody?: boolean;
};

export function CreateTripDesktopShell({
  title = "Create Trip",
  subtitle,
  stepIndex,
  stepTotal,
  onClose,
  onBack,
  children,
  progress,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  primaryLoading = false,
  hint = null,
  fillBody = false,
}: CreateTripDesktopShellProps) {
  const insets = useSafeAreaInsets();
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;

  const stepChrome = (
    <View style={s.stepSurfaceHeader}>
      {progress}
      {subtitle ? <Text style={s.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  const bodyInner = (
    <>
      {stepChrome}
      {fillBody ? (
        <ScrollView
          style={s.stepSurfaceBodyScroll}
          contentContainerStyle={s.stepSurfaceBodyScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={s.stepSurfaceBody}>{children}</View>
      )}
    </>
  );

  const stepContent = (
    <View style={[s.stepSurface, fillBody && s.stepSurfaceFill]}>
      {bodyInner}
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={[s.rail, s.headerInner]}>
          <View style={s.headerLeft}>
            <Pressable
              onPress={onClose}
              style={s.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <ArrowLeft size={18} color={Theme.textSecondary} strokeWidth={2.5} />
              <Text style={s.closeBtnText}>Close</Text>
            </Pressable>
            <View style={s.headerDivider} />
            <Text style={s.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {stepLabel ? <Text style={s.headerStep}>{stepLabel}</Text> : null}
        </View>
      </View>

      {fillBody ? (
        <View style={[s.content, { flex: 1, minHeight: 0 }]}>
          <View style={[s.contentInner, { flex: 1, minHeight: 0 }]}>
            {stepContent}
          </View>
        </View>
      ) : (
        <ScrollView
          style={s.content}
          contentContainerStyle={[
            s.contentInner,
            { paddingBottom: 20 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {stepContent}
        </ScrollView>
      )}

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View
          style={[
            s.rail,
            s.footerInner,
            onBack ? s.footerInnerWithBack : null,
          ]}
        >
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={s.footerBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to previous step"
            >
              <ArrowLeft size={14} color={Theme.textPrimaryDark} strokeWidth={2.5} />
              <Text style={s.footerBackBtnText}>Back</Text>
            </Pressable>
          ) : (
            <View style={s.footerSpacer} />
          )}
          <View style={s.footerPrimaryWrap}>
            <Pressable
              onPress={onPrimaryPress}
              disabled={primaryDisabled || primaryLoading}
              style={[
                s.footerPrimaryBtn,
                (primaryDisabled || primaryLoading) && s.footerPrimaryBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryDisabled || primaryLoading }}
            >
              {primaryLoading ? (
                <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
              ) : (
                <Text
                  style={[
                    s.footerPrimaryBtnText,
                    (primaryDisabled || primaryLoading) &&
                      s.footerPrimaryBtnTextDisabled,
                  ]}
                >
                  {primaryLabel}
                </Text>
              )}
            </Pressable>
            {hint && primaryDisabled && !primaryLoading ? (
              <Text style={s.footerHint}>{hint}</Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
