import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { StyleSheet, View } from "react-native";

export type IntegrationMode = "manual" | "integrated";

interface IntegrationModeTagProps {
  mode: IntegrationMode;
}

export function IntegrationModeTag({ mode }: IntegrationModeTagProps) {
  const isIntegrated = mode === "integrated";

  return (
    <View
      style={[
        styles.tag,
        isIntegrated ? styles.tagIntegrated : styles.tagManual,
      ]}
    >
      <FontAwesome
        name={isIntegrated ? "link" : "unlink"}
        size={12}
        color={isIntegrated ? Theme.integratedIcon : Theme.nonIntegratedIcon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  tagIntegrated: {},
  tagManual: {},
});
