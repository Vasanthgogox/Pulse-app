import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { ROUTES } from "@/lib/routes";

/** Connections hub stores driver rows as `driver-{uuid}`. */
export function connectedDriverEntityId(connectionId: string): string {
  return connectionId.startsWith("driver-")
    ? connectionId.slice("driver-".length)
    : connectionId;
}

/** Finance ledger detail route for a hub connection (client / supplier / driver). */
export function connectedOrgLedgerDetailRoute(item: ConnectedOrg): string {
  if (item.role === "CLIENT") {
    return ROUTES.clientDetail(item.id, "cash");
  }
  if (item.role === "SUPPLIER") {
    return ROUTES.supplierDetail(item.id, "cash");
  }
  return ROUTES.driverDetail(connectedDriverEntityId(item.id), "ledger");
}
