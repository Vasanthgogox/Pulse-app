import { Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";

interface OpsAgentReattemptBubbleProps {
  onReattempt: () => void;
  themeRef: OpsRef;
  styles: OpsAgentStyles;
}

export function OpsAgentReattemptBubble({ onReattempt, themeRef: REF, styles }: OpsAgentReattemptBubbleProps) {
  return (
    <View style={[styles.messageRow, styles.messageRowSystem]}>
      <View style={[styles.quBubble, styles.reattemptBubble, { backgroundColor: REF.botBubble, borderColor: REF.border }]}>
        <TouchableOpacity style={styles.reattemptBtn} onPress={onReattempt} activeOpacity={0.8}>
          <FontAwesome name="refresh" size={12} color={REF.accent} />
          <Text style={styles.reattemptBtnText}>Re-attempt creation</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
