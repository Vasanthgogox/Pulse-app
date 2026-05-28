/**
 * Workspace overlay — 40vw right-anchored flex card with a tap-to-close
 * backdrop on wider viewports; full-screen card on narrow viewports.
 *
 * Master/detail swap inside the same card:
 *  - No `?panel=` → hub (org header + quick actions + workspace list + footer)
 *  - `?panel=settings|team|kyc|account` → matching detail panel
 *
 * Registered with `presentation: 'transparentModal'` in the root Stack so the
 * underlying screen (Home / Network / etc.) shows through the backdrop.
 *
 * Lives at `app/workspace.tsx` (flat) so the route name registers as
 * `workspace` and matches the `<Stack.Screen name="workspace" />` entry in
 * `app/_layout.tsx`. A nested `app/workspace/index.tsx` would register as
 * `workspace/index` on this Expo Router version and break the screen options.
 */
import { WorkspaceHubMenu } from "@/components/profile/WorkspaceHubMenu";
import { WorkspaceAccountPanel } from "@/features/organization/components/workspace/WorkspaceAccountPanel";
import { WorkspaceEditAccountPanel } from "@/features/organization/components/workspace/WorkspaceEditAccountPanel";
import { WorkspaceFeedbackProvider } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WorkspaceOrgKycPanel } from "@/features/organization/components/workspace/WorkspaceOrgKycPanel";
import { WorkspaceSettingsPanel } from "@/features/organization/components/workspace/WorkspaceSettingsPanel";
import { WorkspaceTeamPanel } from "@/features/organization/components/workspace/WorkspaceTeamPanel";
import {
  parseWorkspacePanelId,
  type WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
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
    if (activePanel === "team") {
      return <WorkspaceTeamPanel onBack={closePanel} />;
    }
    if (activePanel === "kyc") {
      return <WorkspaceOrgKycPanel onBack={closePanel} />;
    }
    return null;
  }, [activePanel, closePanel, openPanel]);

  return (
    <View style={styles.root}>
      <View style={styles.page}>
        <WorkspaceFeedbackProvider>
          {activePanel ? (
            panelContent
          ) : (
            <WorkspaceHubMenu
              activePanel={null}
              onSelectPanel={openPanel}
              onExit={closeOverlay}
            />
          )}
        </WorkspaceFeedbackProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f6fb",
  },
  page: {
    flex: 1,
    backgroundColor: "#f4f6fb",
  },
});
