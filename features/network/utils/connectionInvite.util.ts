/**
 * Single path for in-app connection requests + off-app share (matches Connections hub).
 */
import {
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  createConnectionRequest,
  getConnectionInviteeByPhone,
  looksLikeConnectionRateLimitError,
} from "@/services/connectionRequestsService";
import { Alert, Share } from "react-native";

export type PartyForConnectionInvite = {
  id: string;
  name: string;
  role: "CLIENT" | "SUPPLIER" | "DRIVER";
  is_integrated: boolean;
  phone?: string | null;
};

export async function runConnectionInvite(
  orgId: string,
  item: PartyForConnectionInvite,
  onAfter?: () => void | Promise<void>,
): Promise<void> {
  if (item.is_integrated) {
    return;
  }
  if (!item.phone?.trim()) {
    Alert.alert("Phone missing", `Add a phone number for ${item.name} before sending an invite.`);
    return;
  }

  try {
    const { invitee, error: lookupError } = await getConnectionInviteeByPhone(item.phone);
    if (lookupError) throw lookupError;

    if (invitee?.organization_id && item.role !== "DRIVER") {
      const { error, alreadyInvited } = await createConnectionRequest(orgId, invitee.organization_id, {
        requestShipperClient: item.role === "CLIENT",
        requestCarrierSupplier: item.role === "SUPPLIER",
      });
      if (error) throw error;
      await onAfter?.();
      Alert.alert(
        alreadyInvited ? "Request already sent" : "Request sent",
        `${item.name} is on Q. We sent an in-app connection request.`,
      );
      return;
    }

    await Share.share({
      message: `Hi ${item.name}, join me on Q to manage loads, trips, payments, and network requests together.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send invite";
    Alert.alert(
      "Could not send invite",
      looksLikeConnectionRateLimitError(message) ? CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE : message,
    );
  }
}
