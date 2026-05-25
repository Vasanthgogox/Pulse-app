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

const DETAIL_CANVAS = "#f4f6fb";
const CONTENT_MAX_WIDTH = 720;

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  /** When true, children fill remaining height (e.g. embedded lists). */
  fillBody?: boolean;
  scrollProps?: Pick<ScrollViewProps, "keyboardShouldPersistTaps">;
};

export function WorkspaceDetailLayout({
  title,
  subtitle,
  onBack,
  rightSlot,
  children,
  fillBody = false,
  scrollProps,
}: Props) {
  const insets = useSafeAreaInsets();

  const body = fillBody ? (
    <View style={[styles.fillBody, { paddingBottom: insets.bottom }]}>
      {children}
    </View>
  ) : (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + Layout.sectionSpacing + 8 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? "handled"}
    >
      <View style={styles.contentColumn}>{children}</View>
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
    </View>
  );
}

export const workspaceDetailLayoutStyles = StyleSheet.create({
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
    paddingHorizontal: 20,
    alignItems: "center",
  },
  contentColumn: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    gap: 16,
    alignSelf: "center",
  },
  fillBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
