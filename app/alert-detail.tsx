import { AlertDetailScreen } from "@/features/alertRegistry/components/AlertDetailScreen";
import { useAlertRegistryFinanceHandlers } from "@/lib/hooks/useAlertRegistryFinanceHandlers";
import { parseAlertDetailParams } from "@/lib/alertRegistry/alertDetailRoute.util";
import { useLocalSearchParams } from "expo-router";
import { useSafeBack } from "@/lib/useSafeBack";
import { View, StyleSheet } from "react-native";
import Theme from "@/constants/Theme";

export default function AlertDetailRoute() {
  const raw = useLocalSearchParams<{
    kind?: string;
    id?: string;
    alertId?: string;
    mode?: string;
  }>();
  const { kind, id, mode } = parseAlertDetailParams(raw);
  const safeBack = useSafeBack();
  const { finance } = useAlertRegistryFinanceHandlers();

  if (!kind || !id) {
    return <View style={styles.root} />;
  }

  return (
    <AlertDetailScreen
      kind={kind}
      alertId={id}
      mode={mode}
      onBack={safeBack}
      finance={finance}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
});
