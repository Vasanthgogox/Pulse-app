/** Format number as INR. */
export function formatINR(value: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
  // Intl emits "₹78,000" with no gap — add a space after the symbol for readability.
  return formatted.replace(/₹(?=\d)/g, '₹ ');
}

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

/** Number only for ledger table cells (no ₹), e.g. "6,000" — matches client ledger. */
export function formatLedgerAmount(value: number): string {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
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
/**
 * Indian vehicle registration format: XX NN LL NNNN (state 2 letters, district 2 digits, series 2 letters, number 1–4 digits).
 * Returns true if raw (alphanumeric only, any case) matches this pattern (full or partial while typing).
 */
const INDIAN_VEHICLE_PARTIAL = /^([A-Z]{2})([0-9]{0,2})([A-Z]{0,2})([0-9]{0,4})$/;

/** Normalize vehicle number for matching (alphanumeric, uppercase, no spaces). Use when comparing trip.vehicle_display_number to vehicle.vehicle_number. */
export function normalizeVehicleNumberForMatch(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeRawVehicleInput(s: string): string {
  return normalizeVehicleNumberForMatch(s);
}

/**
 * Format for display: e.g. "TN25CM7892" or "TN 25 CM 7892" → "TN 25 CM 7892".
 * Non-Indian values (e.g. "TRK-SEED-001") are returned trimmed, unchanged.
 */
export function formatIndianVehicleNumber(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = normalizeRawVehicleInput(trimmed);
  if (!normalized) return trimmed;
  const m = normalized.match(INDIAN_VEHICLE_PARTIAL);
  if (!m) return trimmed;
  const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
  return parts.join(' ');
}

/**
 * Format mobile number to exactly 10 digits when fully typed.
 * Strips non-digits and handles common +91 or 0 prefixes when pasted.
 */
export function formatMobileNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10) {
    if (digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
  }
  return digits.slice(0, 10);
}

/**
 * Format as user types in vehicle number input. Applies Indian spacing when pattern matches; otherwise uppercase + trim.
 * Use in onChangeText so pasted "tn25cm7892" or "TN 25 CM 7892" and typing both show "TN 25 CM 7892".
 */
export function formatIndianVehicleNumberInput(next: string): string {
  const normalized = normalizeRawVehicleInput(next);
  if (!normalized) return '';
  const m = normalized.match(INDIAN_VEHICLE_PARTIAL);
  if (!m) return normalized;
  const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
  return parts.join(' ');
}
