/**
 * Load Center + share indent to Pulse network (story broadcast).
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { useInvalidateNetwork } from "@/lib/queries/useNetworkQueries";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

export default function PulseLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const invalidatePosts = useInvalidatePosts(orgId);

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  return (
    <View style={[styles.root, { paddingTop: contentTopInset }]}>
      <LoadCenterView
        onCreateIndentPress={() => router.push(ROUTES.CREATE_INDENT as import("expo-router").Href)}
        onIndentPress={(indent) => router.push(`/indent/${indent.id}` as import("expo-router").Href)}
        onShareToNetwork={(indent) => setShareLoad(indent)}
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
  root: { flex: 1, backgroundColor: Theme.surface },
});
