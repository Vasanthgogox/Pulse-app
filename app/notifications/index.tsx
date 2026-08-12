import { AlertRegistryPanel, type RegistryFilterTab } from "@/components/AlertRegistryPanel";
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import Theme from "@/constants/Theme";
import { useAlertRegistryFinanceHandlers } from "@/lib/hooks/useAlertRegistryFinanceHandlers";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";

export default function NotificationsScreen() {
  const router = useRouter();
  const layout = useLayoutInsets();
  const [filterTab, setFilterTab] = useState<RegistryFilterTab>("all");
  const { finance, refreshRegistry } = useAlertRegistryFinanceHandlers();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/network");
  };

  return (
    <View style={styles.root}>
      <SurfaceAccessGate surface="workspace.notifications">
        <AlertRegistryPanel
          layout="fullscreen"
          topInset={layout.top}
          bottomInset={layout.scrollBottomPadding()}
          filterTab={filterTab}
          onFilterTabChange={setFilterTab}
          onClose={close}
          onSync={refreshRegistry}
          finance={finance}
        />
      </SurfaceAccessGate>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
});
