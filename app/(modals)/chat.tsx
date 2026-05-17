/**
 * Legacy modal path — forwards to root `/chat` so deep links keep working.
 */
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ChatModalRedirect() {
  const params = useLocalSearchParams();
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    qs.set(key, String(Array.isArray(value) ? value[0] : value));
  }
  const suffix = qs.toString();
  return <Redirect href={(suffix ? `/chat?${suffix}` : "/chat") as "/chat"} />;
}
