import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { composeSms } from "@/lib/smsComposer";

export interface InviteShareParams {
  inviteePhone: string;
  inviteeName: string;
  orgName: string;
  inviterName?: string;
}

export type ShareInviteResult =
  | { ok: true; method: "share" | "sms" | "clipboard" }
  | { ok: false; reason: "cancelled" | "unavailable"; message?: string };

/**
 * Compose a shareable invite message with phone number and org context.
 * Used by admin to manually nudge invitees via OS share sheet / native Messages.
 */
export function buildInviteShareMessage(params: InviteShareParams): string {
  const orgContext = params.orgName ? ` to ${params.orgName}` : "";
  const inviterContext = params.inviterName ? ` ${params.inviterName} invited ` : " You've been invited ";
  return (
    `${inviterContext}to join Pulse${orgContext}. ` +
    `Download Pulse and sign up with this phone number: ${params.inviteePhone} ` +
    `https://pulse.gogox.com`
  );
}

/**
 * Share the invite message via the best available channel for the platform:
 * - Web: browser's native Web Share API if present, else copy-to-clipboard.
 * - Native: OS share sheet (react-native Share), falling back to SMS composer.
 */
export async function shareInvite(params: InviteShareParams): Promise<ShareInviteResult> {
  const message = buildInviteShareMessage(params);

  if (Platform.OS === "web") {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> })
        : null;
    if (nav?.share) {
      try {
        await nav.share({ title: `Invite ${params.inviteeName}`, text: message });
        return { ok: true, method: "share" };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return { ok: false, reason: "cancelled" };
        // fall through to clipboard on any other web-share failure
      }
    }
    try {
      await Clipboard.setStringAsync(message);
      return { ok: true, method: "clipboard" };
    } catch (err) {
      return {
        ok: false,
        reason: "unavailable",
        message: err instanceof Error ? err.message : "Could not copy invite message.",
      };
    }
  }

  try {
    const result = await Share.share({ message, title: `Invite ${params.inviteeName}` });
    if (result.action === Share.dismissedAction) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: true, method: "share" };
  } catch {
    // Share.share threw (rare on native) — fall back to SMS composer below.
  }

  const sms = await composeSms(params.inviteePhone, message);
  if (sms.ok) return { ok: true, method: "sms" };

  try {
    await Clipboard.setStringAsync(message);
    return { ok: true, method: "clipboard" };
  } catch (err) {
    return {
      ok: false,
      reason: "unavailable",
      message: sms.message ?? (err instanceof Error ? err.message : "Could not share invite."),
    };
  }
}
