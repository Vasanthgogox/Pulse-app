import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditAction, DbColumn, LiveTableResult, ParsedField, SchemaTableResult } from '@/types';
import {
  expandFieldsForSchemaCompare,
  isSchemaMetaField,
  parseDataDetailTables,
  parseSchemaTableRef,
  schemaFieldKey,
  tablesForAction,
} from '@/lib/dataDetail';
import { escapeHtml, formatCellValue } from '@/lib/format';

export function dbColumnMap(columns: DbColumn[]) {
  const map = new Map<string, DbColumn>();
  for (const c of columns || []) {
    map.set(String(c.column_name).toLowerCase(), c);
  }
  return map;
}

export function compareDocFieldToDbSchema(field: ParsedField, colMap: Map<string, DbColumn>) {
  if (isSchemaMetaField(field)) {
    return { cls: 'cmp-na', label: 'N/A', dbCol: null as DbColumn | null };
  }
  const key = schemaFieldKey(field.name);
  if (!key) return { cls: 'cmp-na', label: 'N/A', dbCol: null as DbColumn | null };
  const col = colMap.get(key);
  if (col) {
    return {
      cls: field.optional && col.is_nullable === 'YES' ? 'cmp-warn' : 'cmp-match',
      label: field.optional ? 'NULLABLE' : 'PRESENT',
      dbCol: col,
    };
  }
  return { cls: 'cmp-miss', label: 'MISSING', dbCol: null as DbColumn | null };
}

function formatDbColumnType(col: DbColumn | null) {
  if (!col) return '—';
  return col.udt_name || col.data_type || '—';
}

export function renderCompareHtml(
  parsed: ReturnType<typeof parseDataDetailTables>,
  schemaByTable: Record<string, SchemaTableResult>,
): string {
  if (!parsed.length) return '<p class="detail-empty">No documented schema to compare.</p>';
  return (
    `<p class="detail-hint" style="margin-bottom:12px">Compares <strong>documented audit schema</strong> vs <strong>live Postgres columns</strong> (via linked DB introspection) — not row data.</p>` +
    parsed
      .map((section) => {
        const key = section.tableRef || section.title;
        const schemaInfo =
          schemaByTable[key] || schemaByTable[section.title] || { columns: [], error: 'No schema loaded' };
        const colMap = dbColumnMap(schemaInfo.columns);
        const schemaFields = expandFieldsForSchemaCompare(section.fields);
        const documentedKeys = new Set(
          schemaFields.filter((f) => !isSchemaMetaField(f)).map((f) => schemaFieldKey(f.name)).filter(Boolean),
        );
        const extraCols = (schemaInfo.columns || []).filter(
          (c) => !documentedKeys.has(String(c.column_name).toLowerCase()),
        );
        return `<div class="detail-section">
      <div class="detail-section-title">${escapeHtml(section.title)}${section.tableRef ? ` · ${escapeHtml(section.tableRef)}` : ''}</div>
      ${schemaInfo.error ? `<p class="detail-hint warn">${escapeHtml(schemaInfo.error)}</p>` : ''}
      <div class="detail-table-wrap">
        <table class="detail-data-table">
          <thead><tr><th>Documented field</th><th>Audit schema</th><th>DB column</th><th>DB type</th><th>Nullable</th><th>Status</th></tr></thead>
          <tbody>
            ${schemaFields
              .map((f) => {
                const cmp = compareDocFieldToDbSchema(f, colMap);
                const schemaNote = f.optional
                  ? 'nullable (documented)'
                  : f.value && !f.value.includes('\n') && !isSchemaMetaField(f)
                    ? `e.g. ${f.value}`
                    : 'expected column';
                return `<tr>
                <td class="field-name">${escapeHtml(f.name)}</td>
                <td class="doc-val">${escapeHtml(schemaNote)}</td>
                <td class="live-val">${escapeHtml(cmp.dbCol ? cmp.dbCol.column_name : '—')}</td>
                <td class="live-val">${escapeHtml(formatDbColumnType(cmp.dbCol))}</td>
                <td class="doc-val">${escapeHtml(cmp.dbCol ? cmp.dbCol.is_nullable : '—')}</td>
                <td class="${cmp.cls}">${cmp.label}</td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${
        extraCols.length
          ? `
        <div class="detail-section-title" style="margin-top:14px;color:var(--upd)">Extra DB columns (not in audit doc)</div>
        <div class="detail-table-wrap">
          <table class="detail-data-table">
            <thead><tr><th>DB column</th><th>Type</th><th>Nullable</th></tr></thead>
            <tbody>
              ${extraCols
                .map(
                  (c) => `<tr>
                <td class="live-val">${escapeHtml(c.column_name)}</td>
                <td class="live-val">${escapeHtml(formatDbColumnType(c))}</td>
                <td class="doc-val">${escapeHtml(c.is_nullable)}</td>
              </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`
          : ''
      }
    </div>`;
      })
      .join('')
  );
}

export function renderDetailTableHtml(parsed: ReturnType<typeof parseDataDetailTables>): string {
  if (!parsed.length) return '<p class="detail-empty">No schema tables to display.</p>';
  return parsed
    .map(
      (section) => `
    <div class="detail-section">
      <div class="detail-section-title">${escapeHtml(section.title)}</div>
      <div class="detail-table-wrap">
        <table class="detail-data-table">
          <thead><tr><th>Field</th><th>Documented value</th></tr></thead>
          <tbody>
            ${section.fields
              .map(
                (f) => `
              <tr>
                <td class="field-name">${escapeHtml(f.name)}</td>
                <td class="doc-val">${escapeHtml(f.value || '—')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,
    )
    .join('');
}

export function renderLiveRowsTable(title: string, rows: Record<string, unknown>[], error: string | null): string {
  if (error) {
    return `<div class="detail-section"><div class="detail-section-title">${escapeHtml(title)}</div>
      <p class="detail-hint warn">${escapeHtml(error)}</p></div>`;
  }
  if (!rows?.length) {
    return `<div class="detail-section"><div class="detail-section-title">${escapeHtml(title)}</div>
      <p class="detail-hint">No rows returned.</p></div>`;
  }
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  return `<div class="detail-section">
    <div class="detail-section-title">${escapeHtml(title)} · ${rows.length} row(s)</div>
    <div class="detail-table-wrap">
      <table class="detail-data-table">
        <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${cols.map((c) => `<td class="live-val">${escapeHtml(formatCellValue(row[c]))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

export async function fetchAuthUsersLive(sbAdmin: SupabaseClient, limit = 5): Promise<LiveTableResult> {
  try {
    const { data, error } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: limit });
    if (error) return { rows: [], error: `auth.users: ${error.message}` };
    const rows = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      aud: u.aud,
      role: u.role,
      email_confirmed_at: u.email_confirmed_at,
      confirmed_at: u.confirmed_at,
      last_sign_in_at: u.last_sign_in_at,
      created_at: u.created_at,
      is_anonymous: u.is_anonymous,
      is_sso_user: (u as { is_sso_user?: boolean }).is_sso_user,
      raw_app_meta_data: u.app_metadata,
      raw_user_meta_data: u.user_metadata,
    }));
    rows.sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'auth.users fetch failed' };
  }
}

export async function fetchLiveTableData(
  sbAdmin: SupabaseClient,
  tableRef: string,
  limit = 5,
): Promise<LiveTableResult> {
  const { schema, table } = parseSchemaTableRef(tableRef);
  try {
    if (schema === 'auth' && table === 'users') {
      return fetchAuthUsersLive(sbAdmin, limit);
    }
    let res = await sbAdmin.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
    if (res.error) {
      res = await sbAdmin.from(table).select('*').limit(limit);
    }
    if (res.error) return { rows: [], error: `${schema}.${table}: ${res.error.message}` };
    return { rows: (res.data as Record<string, unknown>[]) || [], error: null };
  } catch (e) {
    return { rows: [], error: `${schema}.${table}: ${e instanceof Error ? e.message : 'query failed'}` };
  }
}

export async function fetchDbTableSchema(
  client: SupabaseClient | null,
  tableRef: string,
): Promise<SchemaTableResult> {
  const { schema, table } = parseSchemaTableRef(tableRef);
  const ref = `${schema}.${table}`;
  try {
    const res = await fetch(`/api/table-schema?ref=${encodeURIComponent(ref)}`);
    if (res.ok) {
      const body = (await res.json()) as SchemaTableResult & { error?: string | null };
      if (body.error) return { columns: [], error: body.error };
      return { columns: body.columns || [], error: null };
    }
  } catch {
    /* vite plugin unavailable */
  }
  if (!client) return { columns: [], error: 'No Supabase client.' };
  const { data, error } = await client.rpc('get_table_columns', { p_schema: schema, p_table: table });
  if (error) {
    return {
      columns: [],
      error: `${ref}: ${error.message} (run audit dev server for schema API)`,
    };
  }
  return { columns: (data as DbColumn[]) || [], error: null };
}

export async function fetchSchemasForAction(
  client: SupabaseClient | null,
  action: AuditAction,
): Promise<Record<string, SchemaTableResult>> {
  const refs = tablesForAction(action);
  const out: Record<string, SchemaTableResult> = {};
  for (const ref of refs) {
    out[ref] = await fetchDbTableSchema(client, ref);
    const section = parseDataDetailTables(action.data_detail || '').find((s) => s.tableRef === ref);
    if (section) out[section.title] = out[ref];
  }
  return out;
}

export async function fetchLiveForAction(
  sbAdmin: SupabaseClient,
  action: AuditAction,
): Promise<Record<string, LiveTableResult>> {
  const refs = tablesForAction(action);
  const out: Record<string, LiveTableResult> = {};
  for (const ref of refs) {
    out[ref] = await fetchLiveTableData(sbAdmin, ref);
    const section = parseDataDetailTables(action.data_detail || '').find((s) => s.tableRef === ref);
    if (section) out[section.title] = out[ref];
  }
  return out;
}
