export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

const SQL_KW = [
  'SELECT', 'FROM', 'JOIN', 'LEFT', 'INNER', 'WHERE', 'ORDER', 'BY', 'LIMIT', 'INSERT', 'UPDATE',
  'DELETE', 'INTO', 'VALUES', 'SET', 'ON', 'AND', 'OR', 'NOT', 'IS', 'IN', 'AS', 'DESC', 'ASC',
  'COUNT', 'NULL', 'COALESCE', 'GROUP', 'HAVING', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
];

export function highlightSql(sql: string): string {
  if (!sql) return '';
  let s = sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const k of SQL_KW) {
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), `<span class="sk">${k}</span>`);
  }
  s = s.replace(/'([^']*)'/g, `<span class="ss">'$1'</span>`);
  s = s.replace(/(--[^\n]*)/g, `<span class="sm2">$1</span>`);
  return s;
}

export function badge(text: string, cls: string): string {
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

export function opCell(arr: string[] | null | undefined, cls: string): string {
  if (!arr?.length) return '<span class="cell-dim">—</span>';
  return arr.map((t) => badge(t, cls)).join(' ');
}

export function priB(p: string | null | undefined): string {
  const v = (p || 'MEDIUM').toUpperCase();
  const cls = v === 'HIGH' ? 'b-del' : v === 'LOW' ? 'b-na' : 'b-upd';
  return badge(v, cls);
}

export function statusB(status: string): string {
  const cls = status === 'pass' ? 'b-ins' : status === 'fail' ? 'b-del' : 'b-upd';
  return badge(status, cls);
}
