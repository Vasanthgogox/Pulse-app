/**
 * Load Center + share indent to Pulse network (story broadcast).
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { LOADS_HUB_PAGE_BG } from "@/features/network/components/LoadCenterHubMobileShell";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { useInvalidateNetwork } from "@/lib/queries/useNetworkQueries";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import Theme from "@/constants/Theme";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function PulseLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { currentOrganization: organization, isLoading: orgLoading } = useOrganization();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canViewLoadsHub = canSurface("tripops.pulse_loads");
  // Gate the org id too: no orgId means LoadCenterView fetches nothing.
  const orgId = canViewLoadsHub ? organization?.id ?? null : null;
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const invalidatePosts = useInvalidatePosts(orgId);

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  // Surfaces hydrate async — deciding before they land bounces permitted members.
  if (accessLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  if (!canViewLoadsHub) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>You don't have access to Pulse loads.</Text>
      </View>
    );
  }

  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant={orgLoading ? "preparing" : "generic"} />;
  }

  return (
    <View style={[styles.root, { paddingTop: contentTopInset }]}>
      <LoadCenterView
        onCreateIndentPress={() => router.push(ROUTES.CREATE_INDENT as import("expo-router").Href)}
        onIndentPress={(indent) => router.push(`/indent/${indent.id}` as import("expo-router").Href)}
        onShareToNetwork={(indent) => setShareLoad(indent)}
        onMyNetworkPress={() =>
          router.push(ROUTES.TABS.NETWORK as import("expo-router").Href)
        }
        contentTopPadding={0}
      />
      <ShareLoadSheet
        visible={shareLoad !== null}
        indent={shareLoad}
        orgId={orgId}
        onClose={() => setShareLoad(null)}
        onSuccess={() => {
          invalidatePosts();
          invalidateNetwork();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LOADS_HUB_PAGE_BG },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: LOADS_HUB_PAGE_BG,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
});
