import {
  INDENT_VEHICLE_COUNT_ERROR,
  INDENT_VEHICLE_COUNT_MAX,
  INDENT_VEHICLE_COUNT_MIN,
} from "@/features/indents/utils/indentVehicleCount.util";

export type SharedIndentCopy = { id: string };

export type SharedIndentCopyOps<
  T extends SharedIndentCopy = SharedIndentCopy,
  D = unknown,
> = {
  createIndent: (
    orgId: string,
    data: D,
    options?: { action?: "draft" | "share" },
  ) => Promise<{ error: Error | null; indent: T | null }>;
  updateIndentDraft: (
    indentId: string,
    data: D,
  ) => Promise<{ error: Error | null; indent: T | null }>;
  shareDraftIndent: (
    indentId: string,
  ) => Promise<{ error: Error | null; indent: T | null }>;
  cancelIndent: (indentId: string) => Promise<{ error: Error | null }>;
};

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function rejectVehicleCount(count: number): Error | null {
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < INDENT_VEHICLE_COUNT_MIN ||
    count > INDENT_VEHICLE_COUNT_MAX
  ) {
    return new Error(INDENT_VEHICLE_COUNT_ERROR);
  }
  return null;
}

/**
 * Create N matching shared indents. Invalid count is rejected (not clamped).
 * If any copy fails after others were created, previously created copies are
 * cancelled so the operation is all-or-nothing.
 *
 * Stories: each successful copy still goes through share/create, which calls
 * `ensureIndentStory` (one live 24h LOAD story per indent). A batch story is
 * not used because Pulse/reel state and awardability are indent-scoped.
 */
export async function createSharedIndentCopiesWithOps<
  T extends SharedIndentCopy,
  D = unknown,
>(
  ops: SharedIndentCopyOps<T, D>,
  orgId: string,
  data: D,
  count: number,
  options?: { existingDraftId?: string | null },
): Promise<{ error: Error | null; indents: T[] }> {
  const countError = rejectVehicleCount(count);
  if (countError) return { error: countError, indents: [] };

  const created: T[] = [];
  const draftId = isUuid(options?.existingDraftId)
    ? options.existingDraftId.trim()
    : null;

  const rollback = async (cause: Error) => {
    const cancelFailures: string[] = [];
    for (const row of created) {
      const { error: cancelErr } = await ops.cancelIndent(row.id);
      if (cancelErr) cancelFailures.push(cancelErr.message);
    }
    if (cancelFailures.length > 0) {
      return {
        error: new Error(
          `${cause.message} Created loads could not all be cancelled: ${cancelFailures.join("; ")}`,
        ),
        indents: created,
      };
    }
    return { error: cause, indents: [] as T[] };
  };

  for (let i = 0; i < count; i++) {
    if (i === 0 && draftId) {
      const { error: draftError } = await ops.updateIndentDraft(draftId, data);
      if (draftError) return rollback(draftError);
      const { error: shareError, indent } = await ops.shareDraftIndent(draftId);
      if (shareError) return rollback(shareError);
      if (!indent) {
        return rollback(new Error("Could not share the draft indent."));
      }
      created.push(indent);
      continue;
    }

    const { error, indent } = await ops.createIndent(orgId, data, {
      action: "share",
    });
    if (error) return rollback(error);
    if (!indent) {
      return rollback(new Error("Could not create indent."));
    }
    created.push(indent);
  }

  return { error: null, indents: created };
}
