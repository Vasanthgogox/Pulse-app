import { Share } from "react-native";
import * as Sharing from "expo-sharing";
import { composeSMS } from "@/lib/smsComposer";

export interface InviteShareParams {
  inviteePhone: string;
  inviteeName: string;
  orgName: string;
  inviterName?: string;
}

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
 * Open the native share sheet to send the invite message.
 * Falls back to SMS composer if native Share is unavailable.
 */
export async function shareInvite(params: InviteShareParams): Promise<void> {
  const message = buildInviteShareMessage(params);

  try {
    // Try native Share first (iOS 13.2+, Android 5.1+)
    if (Share.share) {
      const result = await Share.share({
        message,
        title: `Invite ${params.inviteeName}`,
      });
      return;
    }
  } catch (error) {
    // User cancelled or Share unavailable
  }

  // Fallback: open native SMS composer
  try {
    await composeSMS({
      recipients: [params.inviteePhone],
      body: message,
    });
  } catch (error) {
    // SMS composer unavailable or cancelled
    console.error("Failed to open share options:", error);
  }
}
