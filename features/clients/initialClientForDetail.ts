import type { ClientRow } from "./services/clients.service";

/**
 * In-memory first-paint seed for Client Detail (not TanStack Query).
 *
 * Used by Finance's Customers list (`FinanceScreen.handleEntityRowSelect`)
 * to stash the already-loaded ClientRow before navigating.
 *
 * ClientRow is a partial seed only. `get_client_detail_bundle` remains the
 * authoritative hydration source — never write this seed into that cache.
 * Mirrors `features/trips/initialTripForDetail.ts`.
 */
let initialClientById: Record<string, ClientRow> = {};

export function setInitialClientForDetail(client: ClientRow): void {
  if (client?.id) initialClientById[client.id] = client;
}

export function getInitialClientForDetail(clientId: string): ClientRow | null {
  const c = initialClientById[clientId] ?? null;
  return c?.id === clientId ? c : null;
}

export function clearInitialClientForDetail(clientId: string): void {
  delete initialClientById[clientId];
}
