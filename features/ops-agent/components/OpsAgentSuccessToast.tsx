import { Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";

interface OpsAgentSuccessToastProps {
  visible: boolean;
  message: string;
  themeRef: OpsRef;
  styles: OpsAgentStyles;
  topOffset: number;
}

export function OpsAgentSuccessToast({
  visible,
  message,
  themeRef: REF,
  styles,
  topOffset,
}: OpsAgentSuccessToastProps) {
  if (!visible) return null;
  return (
    <View style={[styles.successToast, { top: topOffset }]} pointerEvents="none">
      <FontAwesome name="check" size={14} color={REF.green} />
      <Text style={styles.successToastText}>{message}</Text>
    </View>
  );
}
