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
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

const FLEX_CARD_BREAKPOINT = 720;
const FLEX_CARD_RATIO = 0.4;
const FLEX_CARD_MIN_WIDTH = 420;
const FLEX_CARD_MAX_WIDTH = 720;
const FLEX_CARD_CANVAS = "#f4f6fb";

export default function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ panel?: string | string[] }>();
  const { width } = useWindowDimensions();

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

  const isNarrow = width < FLEX_CARD_BREAKPOINT;
  const cardWidth = isNarrow
    ? width
    : Math.min(
        FLEX_CARD_MAX_WIDTH,
        Math.max(Math.round(width * FLEX_CARD_RATIO), FLEX_CARD_MIN_WIDTH),
      );

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
      {!isNarrow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workspace"
          onPress={closeOverlay}
          style={styles.backdrop}
        />
      ) : null}
      <View style={[styles.card, { width: cardWidth }]}>
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
    flexDirection: "row",
    backgroundColor: "transparent",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.32)",
  },
  card: {
    height: "100%",
    backgroundColor: FLEX_CARD_CANVAS,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: -10, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 24,
  },
});
