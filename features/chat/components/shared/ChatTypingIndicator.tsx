import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

function TypingDot({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 24,
          bounciness: 8,
        }),
        Animated.spring(scale, {
          toValue: 0.6,
          useNativeDriver: true,
          speed: 24,
          bounciness: 2,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, scale]);

  return (
    <Animated.View
      style={[styles.dot, { transform: [{ scale }] }]}
    />
  );
}

export function ChatTypingIndicator({
  typingNames,
  variant = "mobile",
}: {
  typingNames: string[];
  variant?: "mobile" | "desktop";
}) {
  if (typingNames.length === 0) return null;

  let label: string;
  if (typingNames.length === 1) {
    label = `${typingNames[0]} is typing`;
  } else if (typingNames.length === 2) {
    label = `${typingNames[0]} and ${typingNames[1]} are typing`;
  } else {
    label = `${typingNames.length} people are typing`;
  }

  return (
    <View style={[styles.wrap, variant === "desktop" && styles.wrapDesktop]}>
      {/* Avatar-column spacer for alignment */}
      <View style={styles.avatarSpacer} />
      <View style={styles.bubble}>
        <View style={styles.dotsRow}>
          <TypingDot delay={0} />
          <TypingDot delay={180} />
          <TypingDot delay={360} />
        </View>
      </View>
      <Text style={[styles.label, variant === "desktop" && styles.labelDesktop]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  wrapDesktop: {
    paddingHorizontal: 20,
  },
  avatarSpacer: {
    width: 28,
    height: 28,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F0F0F0",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#9CA3AF",
  },
  label: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
    flexShrink: 1,
  },
  labelDesktop: {
    fontSize: 10.5,
    color: "#94A3B8",
  },
});
