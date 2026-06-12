/**
 * Registers the device Expo push token when the user is signed in.
 * Skips Expo Go on Android (SDK 53+ push unsupported).
 */
import Constants from "expo-constants";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

import { registerPushToken } from "../services/pushToken.service";

export function usePushTokenRegistration(enabled: boolean = true) {
  const { user } = useAuth();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    if (Platform.OS === "android" && Constants.executionEnvironment === "storeClient") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const { status: existing } = await Notifications.getPermissionsAsync();
        const finalStatus =
          existing === "granted"
            ? existing
            : (await Notifications.requestPermissionsAsync()).status;
        if (finalStatus !== "granted" || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const tokenResult = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        const token = tokenResult.data?.trim();
        if (!token || cancelled || token === lastTokenRef.current) return;

        await registerPushToken(token);
        lastTokenRef.current = token;
      } catch {
        // Permission denied or Expo Go — non-fatal.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);
}
