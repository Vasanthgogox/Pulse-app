/**
 * Workspace overlay — right-anchored flex card with backdrop on desktop;
 * full-screen on mobile. Master/detail split widens the card when a panel opens.
 */
import { WorkspaceFlexCardShell } from "@/components/layout/WorkspaceFlexCardShell";
import { WorkspaceHubMenu } from "@/components/profile/WorkspaceHubMenu";
import { WorkspaceAccountPanel } from "@/features/organization/components/workspace/WorkspaceAccountPanel";
import { WorkspaceEditAccountPanel } from "@/features/organization/components/workspace/WorkspaceEditAccountPanel";
import { WorkspaceFeedbackProvider } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WorkspaceOrgKycPanel } from "@/features/organization/components/workspace/WorkspaceOrgKycPanel";
import { WorkspaceProductsPanel } from "@/features/organization/components/workspace/WorkspaceProductsPanel";
import { WorkspaceSettingsPanel } from "@/features/organization/components/workspace/WorkspaceSettingsPanel";
import {
  parseWorkspacePanelId,
  type WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";

export default function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ panel?: string | string[] }>();

  const activePanel = useMemo(
    () => parseWorkspacePanelId(params.panel),
    [params.panel],
  );

  const closeOverlay = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.TABS.NETWORK as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openPanel = useCallback(
    (panel: WorkspacePanelId) => {
      router.setParams({ panel });
    },
    [router],
  );

  const closePanel = useCallback(() => {
    router.setParams({ panel: "" });
  }, [router]);

  useEffect(() => {
    if (activePanel !== "team") return;
    closeOverlay();
    router.replace(ROUTES.MODALS.TEAM as Parameters<typeof router.replace>[0]);
  }, [activePanel, closeOverlay, router]);

  const panelContent = useMemo(() => {
    if (activePanel === "account") {
      return (
        <WorkspaceAccountPanel
          onBack={closePanel}
          onEdit={() => openPanel("account-edit")}
        />
      );
    }
    if (activePanel === "account-edit") {
      return <WorkspaceEditAccountPanel onBack={() => openPanel("account")} />;
    }
    if (activePanel === "settings") {
      return <WorkspaceSettingsPanel onBack={closePanel} />;
    }
    if (activePanel === "kyc") {
      return <WorkspaceOrgKycPanel onBack={closePanel} />;
    }
    if (activePanel === "products") {
      return <WorkspaceProductsPanel onBack={closePanel} />;
    }
    return null;
  }, [activePanel, closePanel, openPanel]);

  const hub = (
    <WorkspaceHubMenu
      activePanel={activePanel}
      onSelectPanel={openPanel}
      onExit={closeOverlay}
    />
  );

  return (
    <View style={styles.root}>
      <WorkspaceFeedbackProvider>
        <WorkspaceFlexCardShell
          hub={hub}
          panel={panelContent}
          panelOpen={!!activePanel}
          onDismiss={closeOverlay}
          onClosePanel={closePanel}
        />
      </WorkspaceFeedbackProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
