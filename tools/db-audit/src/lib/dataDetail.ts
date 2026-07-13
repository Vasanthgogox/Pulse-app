import type { AuditAction, ParsedField, ParsedTableSection } from '@/types';
import { escapeHtml } from '@/lib/format';

export function summarizeDataDetail(detail: string | null | undefined) {
  if (!detail || !String(detail).trim()) return null;
  const text = String(detail);
  const tables = (text.match(/TABLE\s+\d+/gi) || []).length || 1;
  const fields = (text.match(/^\s*\+/gm) || []).length;
  return { tables, fields: fields || text.split('\n').filter(Boolean).length };
}

export function formatDataDetailHtml(detail: string | null | undefined): string {
  if (!detail || !String(detail).trim()) {
    return '<p class="detail-empty">No schema detail recorded for this action.</p>';
  }
  return `<pre class="detail-raw">${escapeHtml(String(detail))}</pre>`;
}

export function renderDataDetailCellHtml(detail: string | null | undefined): string {
  const summary = summarizeDataDetail(detail);
  if (!summary) return '<span class="cell-dim">—</span>';
  return `<div class="data-detail-preview">
    <span class="data-detail-meta">${summary.tables} table${summary.tables === 1 ? '' : 's'} · ${summary.fields} field${summary.fields === 1 ? '' : 's'}</span>
    <span class="data-detail-link">View schema</span>
  </div>`;
}

export function extractTableRefFromTitle(title: string): string | undefined {
  const m = title.match(/\b((?:auth|public)\.\w+)\b/i);
  if (m) return m[1].toLowerCase();
  const bare = title.match(/—\s*(\w[\w.]*)\s*$/);
  if (bare) {
    const t = bare[1];
    return t.includes('.') ? t : `public.${t}`;
  }
  return undefined;
}

export function parseDataDetailTables(detail: string | null | undefined): ParsedTableSection[] {
  if (!detail || !String(detail).trim()) return [];
  const blocks = String(detail).split(/(?=TABLE\s+\d+)/i).map((s) => s.trim()).filter(Boolean);
  if (!blocks.length) {
    return [{
      title: 'Schema',
      fields: String(detail).split('\n').filter(Boolean).map((line) => ({ name: line, value: '' })),
    }];
  }
  return blocks.map((block) => {
    const lines = block.split('\n');
    const title = (lines[0] || 'TABLE').trim();
    const fields: ParsedField[] = [];
    let current: ParsedField | null = null;
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (/^\s{4,}/.test(raw) && current) {
        current.value += (current.value ? '\n' : '') + trimmed;
        continue;
      }
      const eq = trimmed.match(/^([^=]+)=(.*)$/);
      if (eq) {
        current = { name: eq[1].trim(), value: eq[2].trim() };
        fields.push(current);
        continue;
      }
      const sp = trimmed.match(/^([^\s].*?)\s{2,}(.+)$/);
      if (sp) {
        current = { name: sp[1].trim(), value: sp[2].trim() };
        fields.push(current);
        continue;
      }
      if (trimmed.endsWith(':')) {
        current = { name: trimmed.replace(/:$/, '').trim(), value: '' };
        fields.push(current);
        continue;
      }
      if (current && (trimmed.startsWith('[') || trimmed.includes(','))) {
        current.value += (current.value ? '\n' : '') + trimmed;
        continue;
      }
      current = { name: trimmed, value: '' };
      fields.push(current);
    }
    return { title, fields, tableRef: extractTableRefFromTitle(title) };
  });
}

export function tablesForAction(action: AuditAction): string[] {
  const refs = new Set<string>();
  const parsed = parseDataDetailTables(action.data_detail || '');
  for (const s of parsed) {
    if (s.tableRef) refs.add(s.tableRef);
  }
  (action.ins_tables || []).forEach((t) => refs.add(t.includes('.') ? t : `public.${t}`));
  (action.upd_tables || []).forEach((t) => refs.add(t.includes('.') ? t : `public.${t}`));
  return [...refs];
}

export function parseSchemaTableRef(ref: string) {
  if (!ref) return { schema: 'public', table: ref };
  const parts = ref.split('.');
  if (parts.length >= 2) return { schema: parts[0], table: parts.slice(1).join('.') };
  return { schema: 'public', table: ref };
}

export function schemaFieldKey(name: string): string {
  return String(name || '').split(/[=(:\[]/)[0].trim().toLowerCase();
}

export function isSchemaMetaField(field: ParsedField): boolean {
  const n = field.name || '';
  const v = field.value || '';
  if (n.includes('(JSON)')) return true;
  if (/NOT saved/i.test(n) || /NOT saved/i.test(v)) return true;
  if (/^⚠/.test(v)) return true;
  return false;
}

export function expandFieldsForSchemaCompare(fields: ParsedField[]): ParsedField[] {
  const out: ParsedField[] = [];
  for (const f of fields) {
    if (/^\[null\]/i.test(f.name)) {
      const rest = `${f.name.replace(/^\[null\]\s*:?\s*/i, '')}${f.value ? `, ${f.value}` : ''}`;
      rest.split(',').forEach((c) => {
        const col = c.trim();
        if (col) out.push({ name: col, value: 'nullable', optional: true });
      });
      continue;
    }
    const blob =
      f.value && !f.name.includes('=') && f.value.includes(',') && f.value.includes('=')
        ? `${f.name}, ${f.value}`
        : f.name.includes('=')
          ? f.name
          : null;
    if (blob && blob.includes(',')) {
      blob.split(',').forEach((part) => {
        const eq = part.trim().match(/^([^=]+)=(.*)$/);
        if (eq) out.push({ name: eq[1].trim(), value: '', optional: false });
        else {
          const bare = part.trim();
          if (bare && !bare.includes(':')) out.push({ name: bare, value: '', optional: false });
        }
      });
      continue;
    }
    out.push(f);
  }
  return out;
}
