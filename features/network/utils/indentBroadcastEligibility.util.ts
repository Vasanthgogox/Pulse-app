import type { IndentRow } from "@/features/indents";

/**
 * Same rule as Load Center: Pulse story only when the indent has no carrier yet
 * (not awarded, not assigned).
 */
export function indentCanBroadcastToPulseNetwork(load: IndentRow): boolean {
  const s = (load.status || "").toLowerCase();
  if (["completed", "closed", "cancelled", "expired"].includes(s)) return false;
  if (s === "awarded") return false;
  const assigned = (load as { assigned_supplier_id?: string | null }).assigned_supplier_id;
  if (assigned) return false;
  return true;
}
