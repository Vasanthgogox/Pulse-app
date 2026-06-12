/**
 * Deep-link handlers for unified trip room action cards.
 */
import type { Router } from "expo-router";

import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

export type TripChatRoomActionId =
  | "view_trip"
  | "view_document"
  | "view_ledger";

export interface TripChatRoomActionContext {
  tripId: string;
  router: Pick<Router, "push">;
  onClose?: () => void;
}

function resolveTripId(
  message: ChatPlatformMessageRow,
  fallbackTripId: string,
): string {
  const meta = message.metadata ?? {};
  const fromMeta = meta.trip_id;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  return fallbackTripId;
}

function resolveDocumentPath(message: ChatPlatformMessageRow): string | null {
  const meta = message.metadata ?? {};
  const candidates = [
    meta.storage_path,
    meta.document_path,
    (meta as { document_share?: { storage_path?: string } }).document_share
      ?.storage_path,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function handleTripChatRoomAction(
  actionId: string,
  message: ChatPlatformMessageRow,
  ctx: TripChatRoomActionContext,
): boolean {
  const tripId = resolveTripId(message, ctx.tripId);

  switch (actionId as TripChatRoomActionId) {
    case "view_trip":
      ctx.onClose?.();
      ctx.router.push(`/trip/${encodeURIComponent(tripId)}` as never);
      return true;
    case "view_ledger":
      ctx.onClose?.();
      ctx.router.push(`/trip-ledger/${encodeURIComponent(tripId)}` as never);
      return true;
    case "view_document": {
      const storagePath = resolveDocumentPath(message);
      ctx.onClose?.();
      if (storagePath) {
        ctx.router.push(
          `/documents-center?tripId=${encodeURIComponent(tripId)}&path=${encodeURIComponent(storagePath)}` as never,
        );
      } else {
        ctx.router.push(`/trip/${encodeURIComponent(tripId)}` as never);
      }
      return true;
    }
    default:
      return false;
  }
}
