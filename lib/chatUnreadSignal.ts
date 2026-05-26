/**
 * Tiny external store for chat unread counts.
 *
 * Why this exists:
 *   `DemoTabBar` (mounted from `app/_layout.tsx`) needs the unread badge
 *   counts from chat. Importing `useTripChat` / `useIntegratedChat` would
 *   drag the entire chat graph (~256 KB of contexts + store + service)
 *   into the startup chunk.
 *
 * Pattern:
 *   - Chat providers (lazy) call `setTripUnreadCount` / `setNetworkUnreadCount`
 *     as their internal counts change.
 *   - Consumers (like `DemoTabBar`) read via `useSyncExternalStore`.
 *   - Until chat providers mount, the counts stay at 0 — exactly what we
 *     want for sign-in / splash / driver routes that never load chat.
 *
 * Zero deps. Safe to import from anywhere — does NOT pull chat code.
 */

type Listener = () => void;

let tripUnread = 0;
let networkUnread = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function setTripUnreadCount(n: number): void {
  if (n === tripUnread) return;
  tripUnread = n;
  emit();
}

export function setNetworkUnreadCount(n: number): void {
  if (n === networkUnread) return;
  networkUnread = n;
  emit();
}

export function getTripUnreadCount(): number {
  return tripUnread;
}

export function getNetworkUnreadCount(): number {
  return networkUnread;
}

export function getTotalChatUnreadCount(): number {
  return tripUnread + networkUnread;
}

export function subscribeChatUnreadSignal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
