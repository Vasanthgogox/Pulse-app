import { AlertRegistryPanel } from "@/components/AlertRegistryPanel";
import Theme from "@/constants/Theme";
import { useAlertRegistryFinanceHandlers } from "@/lib/hooks/useAlertRegistryFinanceHandlers";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";

export default function NotificationsScreen() {
  const router = useRouter();
  const layout = useLayoutInsets();
  const [tab, setTab] = useState<"active" | "history">("active");
  const { finance, refreshRegistry } = useAlertRegistryFinanceHandlers();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/network");
  };

  return (
    <View style={styles.root}>
      <AlertRegistryPanel
        layout="fullscreen"
        topInset={layout.top}
        bottomInset={layout.scrollBottomPadding()}
        tab={tab}
        onTabChange={setTab}
        onClose={close}
        onSync={refreshRegistry}
        finance={finance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
});
