import { ROUTES } from "@/lib/routes";
import type { Href } from "expo-router";

const ALLOWED_PREFIXES = [
  ROUTES.FINANCE_PRO,
  ROUTES.POD_RECONCILIATION,
  ROUTES.PULSE_INVOICE,
  ROUTES.INVOICING_EXECUTE,
] as const;

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function parseSafeReturnTo(raw: unknown, depth = 0): string | null {
  if (depth > 2) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("://")) return null;
  const qIndex = value.indexOf("?");
  const path = qIndex >= 0 ? value.slice(0, qIndex) : value;
  const qs = qIndex >= 0 ? value.slice(qIndex + 1) : "";
  if (!isAllowedPath(path)) return null;
  if (!qs) return path;
  const params = new URLSearchParams(qs);
  const keys = [...params.keys()];
  if (keys.some((key) => key !== "returnTo")) return null;
  const nested = params.get("returnTo");
  if (nested && !parseSafeReturnTo(nested, depth + 1)) return null;
  return `${path}?${params.toString()}`;
}

export function withReturnTo(href: string, returnTo: string): Href {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}returnTo=${encodeURIComponent(returnTo)}` as Href;
}

export function returnToLabel(path: string): string {
  const base = path.split("?")[0] ?? path;
  if (base.startsWith(ROUTES.FINANCE_PRO)) return "Back to Finance Pro";
  if (base.startsWith(ROUTES.POD_RECONCILIATION)) return "Back to Pulse POD";
  if (base.startsWith(ROUTES.PULSE_INVOICE) || base.startsWith(ROUTES.INVOICING_EXECUTE)) {
    return "Back to Pulse Invoice";
  }
  return "Back";
}
