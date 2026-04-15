/** Short date for ledger e.g. "26 FEB". */
export function formatLedgerDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
  return `${day} ${month}`;
}

/** Date + time for ledger PARTY/ITEM e.g. "5 Mar 26, 5:30 PM". */
export function formatLedgerDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const day = d.getDate();
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${day} ${month} ${year}, ${time}`;
  } catch {
    return '—';
  }
}

/** Time only e.g. "10:30 AM" for mission log. */
export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Relative time e.g. "1 month ago". */
export function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week(s) ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month(s) ago`;
  return `${Math.floor(diffDays / 365)} year(s) ago`;
}
