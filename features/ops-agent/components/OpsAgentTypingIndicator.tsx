import { View } from "react-native";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";

interface OpsAgentTypingIndicatorProps {
  themeRef: OpsRef;
  styles: OpsAgentStyles;
}

export function OpsAgentTypingIndicator({ themeRef: REF, styles }: OpsAgentTypingIndicatorProps) {
  return (
    <View style={[styles.messageRow, styles.messageRowSystem]}>
      <View style={[styles.quTypingBubble, { backgroundColor: REF.botBubble, borderColor: REF.border }]}>
        <View style={styles.typingDots}>
          <View style={[styles.typingDot, styles.quTypingDot]} />
          <View style={[styles.typingDot, styles.typingDot2, styles.quTypingDot]} />
          <View style={[styles.typingDot, styles.typingDot3, styles.quTypingDot]} />
        </View>
      </View>
    </View>
  );
}
