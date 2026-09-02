/**
 * Load Center. Pulse on each indent card publishes / reboosts the 24h story.
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { LOADS_HUB_PAGE_BG } from "@/features/network/components/LoadCenterHubMobileShell";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import Theme from "@/constants/Theme";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function PulseLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { currentOrganization: organization, isLoading: orgLoading } = useOrganization();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canViewLoadsHub = canSurface("tripops.pulse_loads");
  // Gate the org id too: no orgId means LoadCenterView fetches nothing.
  const orgId = canViewLoadsHub ? organization?.id ?? null : null;

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
      {/* A4.3: sibling destination, not a Load Center tab — Get Load stays
          relationship-based; Find Loads is the open-Marketplace surface. */}
      <Pressable
        style={styles.findLoadsBanner}
        onPress={() => router.push(ROUTES.FIND_LOADS as import("expo-router").Href)}
      >
        <Text style={styles.findLoadsBannerTitle}>Find Loads</Text>
        <Text style={styles.findLoadsBannerSubtitle}>
          Open Marketplace opportunities →
        </Text>
      </Pressable>
      <LoadCenterView
        onCreateIndentPress={() => {
          if (!canSurface("tripops.indents.create")) return;
          router.push(ROUTES.CREATE_INDENT as import("expo-router").Href);
        }}
        onIndentPress={(indent) => router.push(`/indent/${indent.id}` as import("expo-router").Href)}
        onMyNetworkPress={() =>
          router.push(ROUTES.TABS.NETWORK as import("expo-router").Href)
        }
        contentTopPadding={0}
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
  findLoadsBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Theme.brandBlueSoft,
  },
  findLoadsBannerTitle: { fontSize: 15, fontWeight: "700", color: Theme.brandBlueInk },
  findLoadsBannerSubtitle: { fontSize: 13, color: Theme.brandBlueInk, marginTop: 2 },
});
