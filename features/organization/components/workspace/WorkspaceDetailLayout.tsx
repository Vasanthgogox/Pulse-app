/**
 * Detail-pane shell shared by every workspace panel.
 *
 * Layout mirrors the reference: white chrome header, soft canvas body, and
 * an optional sticky white footer for Cancel / Save Changes actions.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { WorkspacePanelChrome } from "@/features/organization/components/workspace/WorkspacePanelChrome";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DETAIL_CANVAS = "#f5f7fb";
const CONTENT_MAX_WIDTH = 720;

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  /** Sticky footer slot (e.g. Cancel + Save Changes). */
  footerSlot?: React.ReactNode;
  children: React.ReactNode;
  /** When true, children fill remaining height (e.g. embedded lists). */
  fillBody?: boolean;
  scrollProps?: Pick<ScrollViewProps, "keyboardShouldPersistTaps">;
  /** Override centred column width (e.g. product catalogue grid). */
  contentMaxWidth?: number;
};

export function WorkspaceDetailLayout({
  title,
  subtitle,
  onBack,
  rightSlot,
  footerSlot,
  children,
  fillBody = false,
  scrollProps,
  contentMaxWidth = CONTENT_MAX_WIDTH,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasFooter = !!footerSlot;

  const body = fillBody ? (
    <View
      style={[
        styles.fillBody,
        { paddingBottom: hasFooter ? 0 : insets.bottom },
      ]}
    >
      {children}
    </View>
  ) : (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: hasFooter
            ? 24
            : insets.bottom + Layout.sectionSpacing + 8,
        },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? "handled"}
    >
      <View style={[styles.contentColumn, { maxWidth: contentMaxWidth }]}>
        {children}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <WorkspacePanelChrome
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        rightSlot={rightSlot}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
      {hasFooter ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <View style={[styles.footerInner, { maxWidth: contentMaxWidth }]}>
            {footerSlot}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    backgroundColor: DETAIL_CANVAS,
  },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 18,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    alignItems: "stretch",
  },
  contentColumn: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    gap: 14,
    alignSelf: "center",
  },
  fillBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footer: {
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 4,
  },
  footerInner: {
    width: "100%",
    alignSelf: "center",
  },
});

export const workspaceDetailLayoutStyles = styles;
