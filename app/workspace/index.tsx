/**
 * Workspace hub — narrow hub (~35%) + wide detail pane (~65%).
 * All workspace details open in-pane (back returns to hub); tap hub body to close pane.
 */
import { FlexPageSplitLayout } from "@/components/layout/FlexPageSplitLayout";
import { WorkspaceHubMenu } from "@/components/profile/WorkspaceHubMenu";
import { WorkspaceOrgKycPanel } from "@/features/organization/components/workspace/WorkspaceOrgKycPanel";
import { WorkspaceSettingsPanel } from "@/features/organization/components/workspace/WorkspaceSettingsPanel";
import { WorkspaceTeamPanel } from "@/features/organization/components/workspace/WorkspaceTeamPanel";
import {
  parseWorkspacePanelId,
  type WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";

export default function WorkspaceHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ panel?: string | string[] }>();
  const activePanel = useMemo(() => parseWorkspacePanelId(params.panel), [params.panel]);

  const openPanel = useCallback(
    (panel: WorkspacePanelId) => {
      router.setParams({ panel });
    },
    [router],
  );

  const closePanel = useCallback(() => {
    router.setParams({ panel: "" });
  }, [router]);

  const panelContent = useMemo(() => {
    if (activePanel === "settings") {
      return <WorkspaceSettingsPanel onBack={closePanel} />;
    }
    if (activePanel === "team") {
      return <WorkspaceTeamPanel onBack={closePanel} />;
    }
    if (activePanel === "kyc") {
      return <WorkspaceOrgKycPanel onBack={closePanel} />;
    }
    return null;
  }, [activePanel, closePanel]);

  return (
    <FlexPageSplitLayout
      hub={
        <WorkspaceHubMenu
          activePanel={activePanel}
          onSelectPanel={openPanel}
          onExit={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile" as Parameters<typeof router.replace>[0]);
          }}
        />
      }
      panel={panelContent}
      panelOpen={activePanel != null}
      onClosePanel={closePanel}
    />
  );
}
