import type { IndentRow } from "./services/indents.service";

/**
 * In-memory first-paint seed for Indent Detail (not TanStack Query).
 *
 * Used by the Load Center (`app/pulse-loads/index.tsx`) and Load Board
 * (`app/load-board/index.tsx`) list screens to stash the already-loaded
 * IndentRow before navigating to `/indent/[id]`.
 *
 * IndentRow is a partial seed only. `getVisibleIndentById` remains the
 * authoritative hydration source — never write this seed into any query cache.
 * Mirrors `features/trips/initialTripForDetail.ts` / `features/clients/initialClientForDetail.ts`.
 */
let initialIndentById: Record<string, IndentRow> = {};

export function setInitialIndentForDetail(indent: IndentRow): void {
  if (indent?.id) initialIndentById[indent.id] = indent;
}

export function getInitialIndentForDetail(indentId: string): IndentRow | null {
  const i = initialIndentById[indentId] ?? null;
  return i?.id === indentId ? i : null;
}

export function clearInitialIndentForDetail(indentId: string): void {
  delete initialIndentById[indentId];
}
