/**
 * Workspace business region preference (India / Southeast Asia / Other).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LocaleRegion } from "@/lib/i18n";

const STORAGE_KEY = "@qmobile/workspace-region";

export const WORKSPACE_REGION_LABELS: Record<LocaleRegion, string> = {
  india: "India",
  southeast_asia: "Southeast Asia",
  other: "Global",
};

export async function getWorkspaceRegion(): Promise<LocaleRegion> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "india" || raw === "southeast_asia" || raw === "other") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "india";
}

export async function setWorkspaceRegion(region: LocaleRegion): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, region);
}
