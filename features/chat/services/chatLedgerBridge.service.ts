import { supabase } from "@/lib/supabase";
import type { LedgerEventMetadata } from "../types/chat.types";

export interface PostLedgerEventParams {
  tripId: string;
  transactionId: string;
  amount: number;
  flow: "in" | "out";
  category: string;
  paymentMode: string;
  referenceNumber?: string | null;
  notes?: string | null;
  senderOrgId: string;
  senderOrgName: string;
  receiverOrgId: string;
  receiverOrgName: string;
}

/**
 * Posts a ledger_event system card to all trip_conversations for the given trip
 * that involve integrated (linked) client or supplier parties.
 * Called from createLedgerEntry after a successful transaction insert.
 */
export async function postLedgerEventToChat(params: PostLedgerEventParams): Promise<void> {
  const {
    tripId, transactionId, amount, flow, category, paymentMode,
    referenceNumber, notes, senderOrgId, senderOrgName, receiverOrgId, receiverOrgName,
  } = params;

  const metadata: LedgerEventMetadata = {
    transaction_id: transactionId,
    amount,
    flow,
    category,
    payment_mode: paymentMode,
    reference_number: referenceNumber ?? null,
    notes: notes ?? null,
    sender_org_id: senderOrgId,
    sender_org_name: senderOrgName,
    receiver_org_id: receiverOrgId,
    receiver_org_name: receiverOrgName,
    acknowledged_at: null,
    disputed: false,
  };

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

  const content = flow === "in"
    ? `${senderOrgName} received ${amountLabel} · ${category}`
    : `${senderOrgName} paid ${amountLabel} to ${receiverOrgName} · ${category}`;

  // Fetch all conversations for this trip that belong to integrated parties
  const { data: conversations, error } = await supabase()
    .from("trip_conversations")
    .select("id, organization_id, party_type, client_id, supplier_id")
    .eq("trip_id", tripId)
    .in("party_type", ["client", "supplier"]);

  if (error || !conversations?.length) return;

  for (const conv of conversations) {
    // Only post to conversations belonging to one of the two transacting orgs
    if (conv.organization_id !== senderOrgId && conv.organization_id !== receiverOrgId) continue;

    await supabase().from("trip_messages").insert({
      conversation_id: conv.id,
      organization_id: conv.organization_id,
      sender_user_id: null,
      sender_role: "system",
      sender_name: "Payment System",
      content,
      message_type: "ledger_event",
      is_read: false,
      metadata,
    });
  }
}

/**
 * Mirrors a ledger entry from chat into the receiver's own transactions ledger.
 * Called when receiver taps "Add to my book" on a ledger card.
 */
export async function mirrorLedgerEntryFromChat(
  metadata: LedgerEventMetadata,
  receiverOrgId: string,
  tripId: string | null
): Promise<{ error: Error | null }> {
  const isReceiver = metadata.receiver_org_id === receiverOrgId;
  const amountIn = isReceiver ? metadata.amount : 0;
  const amountOut = isReceiver ? 0 : metadata.amount;

  const description = [
    metadata.category,
    `Mode: ${metadata.payment_mode}`,
    metadata.reference_number ? `UTR: ${metadata.reference_number}` : null,
    metadata.notes ? `Notes: ${metadata.notes}` : null,
    `Mirrored from: ${metadata.sender_org_name}`,
  ].filter(Boolean).join(" | ");

  const { error } = await supabase().from("transactions").insert({
    organization_id: receiverOrgId,
    trip_id: tripId,
    party_name: isReceiver ? metadata.sender_org_name : metadata.receiver_org_name,
    description,
    amount_in: amountIn,
    amount_out: amountOut,
    transaction_date: new Date().toISOString().slice(0, 10),
    contact_type: null,
    contact_id: null,
  });

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Marks a ledger_event message as acknowledged (add-to-book confirmed).
 */
export async function acknowledgeLedgerEventMessage(
  messageId: string,
  conversationId: string
): Promise<void> {
  const acknowledgedAt = new Date().toISOString();

  const { data: msg } = await supabase()
    .from("trip_messages")
    .select("metadata")
    .eq("id", messageId)
    .single();

  if (!msg) return;

  const updatedMeta = { ...(msg.metadata ?? {}), acknowledged_at: acknowledgedAt };

  await supabase()
    .from("trip_messages")
    .update({ metadata: updatedMeta })
    .eq("id", messageId);

  // Also update mirror message in same conversation (same transaction_id)
  const txId = (msg.metadata as LedgerEventMetadata)?.transaction_id;
  if (!txId) return;

  const { data: mirrors } = await supabase()
    .from("trip_messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .eq("message_type", "ledger_event")
    .neq("id", messageId);

  for (const mirror of mirrors ?? []) {
    if ((mirror.metadata as LedgerEventMetadata)?.transaction_id === txId) {
      await supabase()
        .from("trip_messages")
        .update({ metadata: { ...mirror.metadata, acknowledged_at: acknowledgedAt } })
        .eq("id", mirror.id);
    }
  }
}

/**
 * Marks a ledger_event message as disputed.
 */
export async function disputeLedgerEventMessage(messageId: string): Promise<void> {
  const { data: msg } = await supabase()
    .from("trip_messages")
    .select("metadata")
    .eq("id", messageId)
    .single();

  if (!msg) return;

  await supabase()
    .from("trip_messages")
    .update({ metadata: { ...(msg.metadata ?? {}), disputed: true } })
    .eq("id", messageId);
}
