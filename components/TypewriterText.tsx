import { memo, useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import Theme from "@/constants/Theme";

type TypewriterTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Milliseconds per character. */
  msPerChar?: number;
  /** Delay before typing starts. */
  startDelayMs?: number;
  /** Blinking caret while typing (and briefly after). */
  showCursor?: boolean;
  accessibilityLabel?: string;
};

/**
 * Reveals `text` one character at a time (typewriter).
 * Re-runs when `text` changes.
 */
export const TypewriterText = memo(function TypewriterText({
  text,
  style,
  msPerChar = 38,
  startDelayMs = 120,
  showCursor = true,
  accessibilityLabel,
}: TypewriterTextProps) {
  const [count, setCount] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const done = count >= text.length;

  useEffect(() => {
    setCount(0);
    if (!text) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      if (cancelled) return;
      intervalId = setInterval(() => {
        setCount((n) => {
          if (n >= text.length) {
            if (intervalId) clearInterval(intervalId);
            return text.length;
          }
          return n + 1;
        });
      }, msPerChar);
    }, startDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, msPerChar, startDelayMs]);

  useEffect(() => {
    if (!showCursor) return;
    const id = setInterval(() => setCursorOn((v) => !v), 480);
    return () => clearInterval(id);
  }, [showCursor]);

  const visible = text.slice(0, count);
  const showCaret = showCursor && !done && cursorOn;

  return (
    <Text
      style={style}
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityLiveRegion="polite"
    >
      {visible}
      {showCaret ? (
        <Text style={{ color: Theme.textPrimaryDark }}>|</Text>
      ) : null}
    </Text>
  );
});
