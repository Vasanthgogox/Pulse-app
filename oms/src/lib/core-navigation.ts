/** Core (execution) app routes — same origin as Commerce in dev (`/oms` → Core `/`). */
export function coreIndentUrl(indentId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/indent/${encodeURIComponent(indentId)}`;
}

export function coreTripUrl(tripId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/trip/${encodeURIComponent(tripId)}`;
}
