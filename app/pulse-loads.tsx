/**
 * Load Center + share indent to Pulse network (story broadcast).
 * Lives outside the Network tab so Network stays: connections, invites, discover, stories strip only.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { IndentRow } from "@/features/indents";
import { useInvalidateNetwork, useInvalidatePosts } from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PulseLoadsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 1024;
  const router = useRouter();
  const safeBack = useSafeBack();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const invalidatePosts = useInvalidatePosts(orgId);

  if (!orgId) {
    return null;
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: isDesktopWeb ? Layout.desktopTopNavOffset : insets.top },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={safeBack} hitSlop={12} style={styles.back}>
          <ArrowLeft size={22} color={Theme.textPrimaryDark} />
        </Pressable>
        <Text style={styles.title}>LOAD CENTER</Text>
        <View style={styles.back} />
      </View>
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
          setShareLoad(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 1,
  },
});
