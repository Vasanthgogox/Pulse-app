/**
 * Story → network DM reply preview (WhatsApp-style quote strip).
 * Stored in network_messages.metadata.reply_to_story.
 */
import type { ReplyPreviewData } from "@/features/chat/components/shared/ChatReplyPreview";

export type StoryReplyToStoryMeta = {
  post_id: string;
  story_type?: string | null;
  title?: string | null;
  route?: string | null;
  owner_name?: string | null;
};

export type NetworkMessageMetadata = {
  reply_to_story?: StoryReplyToStoryMeta | null;
  [key: string]: unknown;
};

export function buildStoryReplyMetadata(input: {
  postId: string;
  storyType?: string | null;
  title?: string | null;
  origin?: string | null;
  destination?: string | null;
  ownerName?: string | null;
}): NetworkMessageMetadata {
  const origin = (input.origin ?? "").trim();
  const destination = (input.destination ?? "").trim();
  const route =
    origin && destination
      ? `${origin} → ${destination}`
      : origin || destination || null;
  return {
    reply_to_story: {
      post_id: input.postId,
      story_type: input.storyType ?? null,
      title: (input.title ?? "").trim() || null,
      route,
      owner_name: (input.ownerName ?? "").trim() || null,
    },
  };
}

function storyReplySummary(story: StoryReplyToStoryMeta): string {
  const title = (story.title ?? "").trim();
  const route = (story.route ?? "").trim();
  if (title && route) return `${title} · ${route}`;
  if (title) return title;
  if (route) return route;
  const type = (story.story_type ?? "").trim();
  if (type === "LOAD") return "Load broadcast";
  if (type === "VEHICLE_AVAILABILITY") return "Vehicle story";
  return "Story";
}

/** Map persisted metadata → ChatReplyThreadStrip props. */
export function networkMetadataToReplyPreview(
  metadata: unknown,
): ReplyPreviewData | null {
  if (!metadata || typeof metadata !== "object") return null;
  const story = (metadata as NetworkMessageMetadata).reply_to_story;
  if (!story || typeof story !== "object" || !story.post_id) return null;
  return {
    messageId: story.post_id,
    senderName: (story.owner_name ?? "").trim() || "Story",
    content: storyReplySummary(story),
    messageType: "story",
  };
}
