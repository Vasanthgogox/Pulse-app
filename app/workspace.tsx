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
import { shouldMountAuthenticatedDataPlane } from "@/lib/bootGate";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { MemberSurfaceId } from "@/lib/memberSurfaces";

export default function WorkspaceScreen() {
  const { sessionAttached } = useAuth();
  if (!shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }
  return <AuthenticatedWorkspaceScreen />;
}

function AuthenticatedWorkspaceScreen() {
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

  /**
   * WorkspaceHubMenu already gates each menu row on the matching surface
   * (see its own comment: "this drawer renders above every MemberDomainGate,
   * so each row needs its own surface check") — but that only stops a member
   * from tapping into a panel via the menu. The panel components themselves
   * (WorkspaceProfilePanel, WorkspaceOrgKycPanel, WorkspaceTeamPanel,
   * WorkspaceProductsPanel) had no check of their own, so a direct URL
   * (?panel=kyc, ?panel=team, ?panel=profile, ?panel=products) bypassed the
   * menu-level gating entirely. Enforce the identical surface requirement
   * here, at the one place every entry point (menu tap or direct URL) must
   * pass through. "account"/"account-edit"/"language"/"region" stay open —
   * personal identity and preferences, not org-business data.
   */
  const { can: canSurface, isLoading: memberAccessLoading } = useMemberAccess();
  const panelRequiredSurface: Partial<Record<WorkspacePanelId, MemberSurfaceId>> = {
    profile: "sales.tab",
    kyc: "workspace.kyc",
    team: "team.manage",
    settings: "workspace.settings",
    products: "workspace.products",
    "ocr-usage": "workspace.products",
  };
  const requiredSurface = activePanel ? panelRequiredSurface[activePanel] : undefined;
  const panelDenied =
    !memberAccessLoading && !!requiredSurface && !canSurface(requiredSurface);

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

  // Bounce a denied panel back to the hub menu — mirrors MemberDomainGate's
  // redirect-on-deny pattern for full-screen routes, scoped to this overlay.
  useEffect(() => {
    if (panelDenied) closePanel();
  }, [panelDenied, closePanel]);

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
    if (panelDenied) return null;
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
  }, [activePanel, closeOverlay, closePanel, closeOcrUsagePanel, closeTeamPanel, openOrgSection, openPanel, orgSection, panelDenied, router]);

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
