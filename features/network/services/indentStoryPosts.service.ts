/**
 * Pulse LOAD stories linked to indents — lifecycle when indent closes (awarded, etc.).
 */
import { supabase } from '@/lib/supabase';

/** Indent statuses that should remove linked stories from the network feed. */
export const INDENT_TERMINAL_STORY_STATUSES = [
  'awarded',
  'completed',
  'cancelled',
  'closed',
  'expired',
] as const;

export function isIndentTerminalForStory(
  status: string | null | undefined,
): boolean {
  const s = (status ?? '').trim().toLowerCase();
  return (INDENT_TERMINAL_STORY_STATUSES as readonly string[]).includes(s);
}

/**
 * Soft-deactivate all active LOAD stories for an indent (stops reel + new bids).
 * DB trigger also runs on indent status change; this keeps the client cache in sync.
 */
export async function deactivatePostsForIndent(
  indentId: string,
): Promise<{ error: Error | null; deactivatedCount: number }> {
  const { data, error } = await supabase()
    .from('posts')
    .update({ is_active: false })
    .eq('source_indent_id', indentId)
    .eq('is_active', true)
    .select('id');

  if (error) {
    return { error: new Error(error.message), deactivatedCount: 0 };
  }
  return { error: null, deactivatedCount: (data ?? []).length };
}
