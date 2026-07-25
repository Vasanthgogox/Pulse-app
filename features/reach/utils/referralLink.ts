/**
 * Referral invite link — mirrors buildPulseStoryPublicUrl's exact pattern
 * (lib/routes.ts): a real https link when EXPO_PUBLIC_WEB_BASE_URL is set,
 * falling back to an Expo deep link otherwise. The code itself stays visible
 * as a secondary, manually-enterable fallback — the link is the primary
 * share mechanism, not the code.
 */
import * as Linking from "expo-linking";

export function buildReferralLink(code: string): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
  if (webBase !== "") {
    return `${webBase}/r/${encodeURIComponent(code)}`;
  }
  return Linking.createURL(`/r/${encodeURIComponent(code)}`);
}
