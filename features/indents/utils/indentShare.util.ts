import { getIndentDisplayNumber, type IndentRow } from "@/features/indents/services/indents.service";
import { formatINR } from "@/lib/format";
import * as Linking from "expo-linking";
import { Platform, Share } from "react-native";

export function buildIndentWhatsAppShareMessage(indent: IndentRow): string {
  const routeLabel = `${(indent.pickup_area || "—").toUpperCase()} → ${(indent.drop_location || "—").toUpperCase()}`;
  const dateLabel = indent.pickup_date
    ? new Date(indent.pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
  const budget = formatINR(Number(indent.client_price || 0));
  const indentDisplay = getIndentDisplayNumber(indent);
  const webBase =
    process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
  const deepLink =
    webBase !== ""
      ? `${webBase}/indent/${indent.id}`
      : Linking.createURL(`/indent/${indent.id}`);

  return (
    `Load Indent ${indentDisplay}\n` +
    `${routeLabel}\n` +
    `Pickup: ${dateLabel} · Budget: ${budget}\n\n` +
    `Update your bid:\n${deepLink}`
  );
}

export async function shareIndentOnWhatsApp(indent: IndentRow): Promise<void> {
  const message = buildIndentWhatsAppShareMessage(indent);
  const encoded = encodeURIComponent(message);
  const waWeb = `https://wa.me/?text=${encoded}`;
  const waNative = `whatsapp://send?text=${encoded}`;

  try {
    if (Platform.OS === "web") {
      await Linking.openURL(waWeb);
      return;
    }
    const canOpen = await Linking.canOpenURL(waNative);
    if (canOpen) {
      await Linking.openURL(waNative);
      return;
    }
    await Share.share({ message });
  } catch {
    await Share.share({ message });
  }
}
