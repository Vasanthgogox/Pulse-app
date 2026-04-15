/**
 * Ops Agent UI types — message model, theme ref, and confirmation types.
 */
import type { ChatReportData, CreatedEntitySnapshot } from "@/features/ops-agent/services/ops-agent.service";

export type MessageRole = "user" | "system";

export type MessageAttachment =
  | { type: "image"; data: string; mimeType?: string }
  | { type: "contact"; data: { name: string; role?: string; phone?: string } };

/** Pending confirmation (in-chat card) before create; same layout as post-create editable preview. */
export type PendingConfirmType = "client" | "supplier" | "vehicle" | "driver" | "trip";

/** After a create, show editable preview; once user confirms update, set updated: true. */
export interface Message {
  role: MessageRole;
  content: string;
  attachment?: MessageAttachment;
  createdPreview?: CreatedEntitySnapshot & { updated?: boolean };
  /** In-chat confirmation card (replaces modal); user edits and taps Create/Add to confirm. */
  pendingConfirm?: { type: PendingConfirmType; data: Record<string, unknown> };
  /** Report data for formatted display and PDF download. */
  reportData?: ChatReportData;
}

/** Ops Agent — theme palette (dark and light). */
export interface OpsRef {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  textOnAccent: string;
  accent: string;
  accentSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  red: string;
  userBubble: string;
  botBubble: string;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  imagePlaceholderOverlay: string;
  contactCardBg: string;
  contactCardBorder: string;
  editInputBg: string;
  editInputBorder: string;
  surfaceOverlay: string;
  surfaceOverlayText: string;
  surfaceOverlayMuted: string;
  radiusSm: number;
  radius: number;
  radiusLg: number;
  radiusXl: number;
  shadow: object;
  shadowSm: object;
}

export type { ChatReportData, CreatedEntitySnapshot };
