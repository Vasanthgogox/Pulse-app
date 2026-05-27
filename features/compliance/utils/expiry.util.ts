/**
 * Expiry math + presentation helpers used across compliance UI
 * (DocumentCard, ExpiryTimeline, top-card "Expiring in N days", alert
 * notifications, etc.).
 *
 * Two responsibilities:
 *
 *  1. **Math** — derive `daysUntilExpiry` and the `ExpiryAlertLevel`
 *     bucket from a date string. The bucket thresholds (7d critical,
 *     30d warning, 90d notice) are mirrored by the SQL `compute_*`
 *     RPCs; if you change them here, update the SQL too.
 *
 *  2. **Presentation** — short / long human strings (`"in 3 days"`,
 *     `"Expired 9 days ago"`) and a `Theme`-aware color helper for
 *     pill / chip backgrounds so consumers never hardcode hex.
 *
 * Wrap dates in `new Date(YYYY-MM-DD)` carefully: ISO date strings
 * (no timezone suffix) are interpreted as UTC midnight by the JS
 * engine. We use `Date.UTC(...)` parsing to keep the bucket math
 * timezone-stable.
 */

import Theme from "@/constants/Theme";
import type {
  ComplianceDocument,
  DocumentRow,
  ExpiryAlertLevel,
} from "../types/compliance.types";
import {
  getDocTypeDefinition,
  type DocTypeDefinition,
} from "./docTypes.util";

// ── Bucket thresholds (keep in sync with SQL RPCs) ──────────────────────────

export const EXPIRY_CRITICAL_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 30;
export const EXPIRY_NOTICE_DAYS = 90;

// ── Date helpers ────────────────────────────────────────────────────────────

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseDateUtc(input: string | Date | null): number | null {
  if (!input) return null;
  if (input instanceof Date) {
    return Date.UTC(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate(),
    );
  }

  // ISO date-only ("2026-08-27") OR full ISO datetime — both work here.
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole days from today to `expiryDate`. Negative = past expiry. Returns
 * `null` when the date is missing or unparseable.
 */
export function daysUntilExpiry(
  expiryDate: string | Date | null,
): number | null {
  const expUtc = parseDateUtc(expiryDate);
  if (expUtc == null) return null;
  return Math.round((expUtc - startOfTodayUtc()) / 86_400_000);
}

/** Map a day-count to an `ExpiryAlertLevel`. `null` days → `"ok"`. */
export function getExpiryAlertLevel(
  daysUntil: number | null,
): ExpiryAlertLevel {
  if (daysUntil == null) return "ok";
  if (daysUntil < 0) return "expired";
  if (daysUntil <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (daysUntil <= EXPIRY_WARNING_DAYS) return "warning";
  if (daysUntil <= EXPIRY_NOTICE_DAYS) return "notice";
  return "ok";
}

// ── Presentation ────────────────────────────────────────────────────────────

/** Short countdown — e.g. `"3d"`, `"−2d"`, `"—"`. */
export function formatExpiryShort(daysUntil: number | null): string {
  if (daysUntil == null) return "—";
  if (daysUntil < 0) return `${daysUntil}d`;
  return `${daysUntil}d`;
}

/**
 * Conversational countdown — e.g. `"Expires today"`, `"Expires in 9 days"`,
 * `"Expired 4 days ago"`, `"No expiry"`. Pass an i18n `t` function later
 * when this is wrapped for localization.
 */
export function formatExpiryNarrative(
  daysUntil: number | null,
): string {
  if (daysUntil == null) return "No expiry";
  if (daysUntil === 0) return "Expires today";
  if (daysUntil > 0) {
    return daysUntil === 1
      ? "Expires tomorrow"
      : `Expires in ${daysUntil} days`;
  }
  const past = Math.abs(daysUntil);
  return past === 1 ? "Expired 1 day ago" : `Expired ${past} days ago`;
}

/** Theme-aware color tuples for pills/badges keyed by alert level. */
export function getExpiryToneColors(level: ExpiryAlertLevel): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (level) {
    case "expired":
      return {
        fg: Theme.destructive ?? "#DC2626",
        bg: Theme.negativeMuted ?? "#FEE2E2",
        border: Theme.destructive ?? "#DC2626",
      };
    case "critical":
      return {
        fg: Theme.destructive ?? "#DC2626",
        bg: Theme.negativeMuted ?? "#FEE2E2",
        border: "rgba(220,38,38,0.35)",
      };
    case "warning":
      return {
        fg: Theme.warning ?? "#B45309",
        bg: Theme.warningMuted ?? "#FEF3C7",
        border: "rgba(180,83,9,0.35)",
      };
    case "notice":
      return {
        fg: Theme.primary ?? "#4F46E5",
        bg: "rgba(79,70,229,0.10)",
        border: "rgba(79,70,229,0.30)",
      };
    case "ok":
    default:
      return {
        fg: Theme.positive ?? "#15803D",
        bg: Theme.positiveMuted ?? "#D1FAE5",
        border: "rgba(21,128,61,0.30)",
      };
  }
}

// ── Service-boundary enrichment ─────────────────────────────────────────────

/**
 * Turn a raw `DocumentRow` from the service into a UI-friendly
 * `ComplianceDocument`. Use this once at the service layer so screens
 * never re-derive `daysUntilExpiry` / `alertLevel` themselves.
 */
export function enrichDocument(
  row: DocumentRow,
): ComplianceDocument {
  const days = daysUntilExpiry(row.expiry_date);
  // If status is already 'expired' from server, force the bucket.
  const level: ExpiryAlertLevel =
    row.status === "expired"
      ? "expired"
      : getExpiryAlertLevel(days);

  let displayLabel = row.doc_label ?? row.doc_type;
  if (!row.doc_label) {
    const def: DocTypeDefinition = getDocTypeDefinition(
      row.entity_type,
      row.doc_type,
    );
    displayLabel = def.label;
  }

  return {
    ...row,
    daysUntilExpiry: days,
    alertLevel: level,
    displayLabel,
    hasFile: typeof row.storage_path === "string" && row.storage_path.length > 0,
  };
}

/** Bulk variant — `enrichDocument` over an array, stable order. */
export function enrichDocuments(
  rows: DocumentRow[],
): ComplianceDocument[] {
  return rows.map(enrichDocument);
}
