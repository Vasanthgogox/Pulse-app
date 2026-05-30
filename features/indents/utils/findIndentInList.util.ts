import type { IndentRow } from '@/features/indents/services/indents.service';

/** Match indent id or display code within a preloaded list. */
export function findIndentInMarketList(
  indents: IndentRow[],
  indentIdOrDisplayId: string,
): IndentRow | null {
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
