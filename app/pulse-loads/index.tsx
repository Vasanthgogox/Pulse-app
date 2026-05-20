/**
 * Load Center + share indent to Pulse network (story broadcast).
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { useInvalidateNetwork } from "@/lib/queries/useNetworkQueries";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PulseLoadsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 1024;
  const router = useRouter();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const invalidatePosts = useInvalidatePosts(orgId);

  if (!orgId) {
    return <AppLoadingSplash variant="preparing" style={styles.root} />;
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: isDesktopWeb ? Layout.desktopTopNavOffset : insets.top },
      ]}
    >
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
          // Keep sheet open so the success step + "Share on WhatsApp" stay usable; user closes with ✕.
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
});
