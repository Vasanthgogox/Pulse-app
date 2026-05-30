import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";

/** Hero manifest ETE label from routing API duration (seconds). */
export function formatManifestEteFromRouteSeconds(
  seconds: number | null | undefined,
): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const totalMin = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Trip `estimated_duration` from create-trip routing (Postgres interval or human label). */
export function formatManifestEteFromEstimatedDuration(
  estimatedDuration: string | null | undefined,
): string {
  const formatted = formatEstimatedDuration(estimatedDuration);
  if (formatted === "—") return "—";
  return formatted
    .replace(/(\d+)H/gi, (_, n) => `${n}h`)
    .replace(/(\d+)M/gi, (_, n) => `${n}m`);
}
