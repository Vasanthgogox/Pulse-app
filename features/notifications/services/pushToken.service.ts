/**
 * Push token registration (Phase 4 foundation).
 *
 * Tokens are stored in `user_push_tokens`; new chat_messages enqueue rows in
 * `chat_push_outbox` for a future Expo/FCM worker to deliver.
 */
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

export type PushPlatform = "ios" | "android" | "web";

export function resolvePushPlatform(): PushPlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

export async function registerPushToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  const { error } = await supabase().rpc("register_push_token", {
    p_token: trimmed,
    p_platform: resolvePushPlatform(),
  });
  if (error) throw new Error(error.message);
}
