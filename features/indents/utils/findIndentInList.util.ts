/** Minimal row shape for id / display-code matching (avoids service import cycle). */
export type IndentListMatchRow = {
  id: string;
  indent_operational_code?: string | null;
  indent_code?: string | null;
  display_indent_id?: string | null;
  indent_number?: string | null;
};

/** Match indent id or display code within a preloaded list. */
export function findIndentInMarketList<T extends IndentListMatchRow>(
  indents: T[],
  indentIdOrDisplayId: string,
): T | null {
  const raw = (indentIdOrDisplayId ?? '').trim();
  if (!raw) return null;
  const needle = raw.toLowerCase();
  return (
    indents.find((row) => row.id === raw) ??
    indents.find(
      (row) => (row.indent_operational_code ?? '').toLowerCase() === needle,
    ) ??
    indents.find((row) => (row.indent_code ?? '').toLowerCase() === needle) ??
    indents.find(
      (row) => (row.display_indent_id ?? '').toLowerCase() === needle,
    ) ??
    indents.find((row) => (row.indent_number ?? '').toLowerCase() === needle) ??
    null
  );
}
