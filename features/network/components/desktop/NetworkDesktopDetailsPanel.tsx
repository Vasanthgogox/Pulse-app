/**
 * Details tab was removed from the Network hub (`?tab=details` → My Profile).
 * This no-op keeps stale Metro graphs from 500ing on the old import.
 */
export function NetworkDesktopDetailsPanel(_props?: Record<string, unknown>) {
  return null;
}
