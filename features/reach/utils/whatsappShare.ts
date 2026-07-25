/**
 * Share via WhatsApp if installed, falling back to the OS share sheet.
 * Same pattern already used twice (StoryDetailScreen.tsx, ReachCampaignDetailScreen.tsx)
 * — extracted here for the third use (referral invite) rather than a third copy.
 */
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";

export async function shareViaWhatsAppOrFallback(message: string, fallbackUrl: string): Promise<void> {
  try {
    const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
      return;
    }
  } catch {
    // fall through to generic share
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fallbackUrl, { dialogTitle: message });
  }
}
