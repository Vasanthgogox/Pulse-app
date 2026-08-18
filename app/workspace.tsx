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
import { WorkspaceOcrUsagePanel } from "@/features/organization/components/workspace/WorkspaceOcrUsagePanel";
import { WorkspaceProductsPanel } from "@/features/organization/components/workspace/WorkspaceProductsPanel";
import { WorkspaceProfilePanel } from "@/features/organization/components/workspace/WorkspaceProfilePanel";
import { WorkspaceSettingsPanel } from "@/features/organization/components/workspace/WorkspaceSettingsPanel";
import { WorkspaceTeamPanel } from "@/features/organization/components/workspace/WorkspaceTeamPanel";
import {
  isWorkspaceHubInlinePanel,
  parseOrgHubSection,
  parseWorkspacePanelId,
  type OrgHubSection,
  type WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

export default function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    panel?: string | string[];
    section?: string | string[];
  }>();

  const activePanel = useMemo(
    () => parseWorkspacePanelId(params.panel),
    [params.panel],
  );
  const orgSection = useMemo(
    () => parseOrgHubSection(params.section),
    [params.section],
  );

  const previousPanelRef = useRef<WorkspacePanelId | null>(null);

  const closeOverlay = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.TABS.NETWORK as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openPanel = useCallback(
    (panel: WorkspacePanelId) => {
      previousPanelRef.current = activePanel;
      router.setParams({ panel, section: "" });
    },
    [activePanel, router],
  );

  const closePanel = useCallback(() => {
    router.setParams({ panel: "", section: "" });
  }, [router]);

  const closeTeamPanel = useCallback(() => {
    const previous = previousPanelRef.current;
    if (previous && previous !== "team") {
      openPanel(previous);
      return;
    }
    closePanel();
  }, [closePanel, openPanel]);

  const closeOcrUsagePanel = useCallback(() => {
    const previous = previousPanelRef.current;
    if (previous && previous !== "ocr-usage") {
      openPanel(previous);
      return;
    }
    closePanel();
  }, [closePanel, openPanel]);

  const openOrgSection = useCallback(
    (section: OrgHubSection | null) => {
      if (section) {
        previousPanelRef.current = activePanel;
        router.setParams({ panel: "kyc", section });
        return;
      }
      const previous = previousPanelRef.current;
      if (previous && previous !== "kyc") {
        previousPanelRef.current = null;
        openPanel(previous);
        return;
      }
      router.setParams({ panel: "kyc", section: "" });
    },
    [activePanel, openPanel, router],
  );

  const panelContent = useMemo(() => {
    if (activePanel === "account") {
      return (
        <WorkspaceAccountPanel
          onBack={closePanel}
          onEdit={() => openPanel("account-edit")}
          onOpenPanel={openPanel}
          onOpenRoute={(path) => {
            closeOverlay();
            router.replace(path as Parameters<typeof router.replace>[0]);
          }}
        />
      );
    }
    if (activePanel === "account-edit") {
      return <WorkspaceEditAccountPanel onBack={() => openPanel("account")} />;
    }
    if (activePanel === "profile") {
      return (
        <WorkspaceProfilePanel
          onBack={closePanel}
          onOpenPanel={openPanel}
          onOpenOrgSection={openOrgSection}
          onOpenRoute={(path) => {
            closeOverlay();
            router.replace(path as Parameters<typeof router.replace>[0]);
          }}
        />
      );
    }
    if (activePanel === "settings") {
      return <WorkspaceSettingsPanel onBack={closePanel} />;
    }
    if (activePanel === "team") {
      return <WorkspaceTeamPanel onBack={closeTeamPanel} />;
    }
    if (activePanel === "kyc") {
      return (
        <WorkspaceOrgKycPanel
          onBack={closePanel}
          section={orgSection}
          onOpenSection={openOrgSection}
          onOpenPanel={openPanel}
        />
      );
    }
    if (activePanel === "products") {
      return <WorkspaceProductsPanel onBack={closePanel} />;
    }
    if (activePanel === "ocr-usage") {
      return <WorkspaceOcrUsagePanel onBack={closeOcrUsagePanel} />;
    }
    return null;
  }, [activePanel, closeOverlay, closePanel, closeOcrUsagePanel, closeTeamPanel, openOrgSection, openPanel, orgSection, router]);

  const shellPanelOpen = !!activePanel && !isWorkspaceHubInlinePanel(activePanel);

  const hub = (
    <WorkspaceHubMenu
      activePanel={activePanel}
      onSelectPanel={openPanel}
      onSelectOrgSection={openOrgSection}
      onExit={closeOverlay}
      inlinePanel={isWorkspaceHubInlinePanel(activePanel) ? activePanel : null}
      onCloseInlinePanel={closePanel}
    />
  );

  return (
    <View style={styles.root}>
      <WorkspaceFeedbackProvider>
        <WorkspaceFlexCardShell
          hub={hub}
          panel={panelContent}
          panelOpen={shellPanelOpen}
          onDismiss={closeOverlay}
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
