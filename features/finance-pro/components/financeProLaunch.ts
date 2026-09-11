import { ROUTES } from "@/lib/routes";
import type { Href } from "expo-router";
import { parseSafeReturnTo, withReturnTo } from "./financeProReturnTo";

const FINANCE_PRO_HOME = ROUTES.FINANCE_PRO;

function origin(returnTo?: string | null): string {
  return parseSafeReturnTo(returnTo) ?? FINANCE_PRO_HOME;
}

export const FINANCE_PRO_LAUNCH = {
  pulseInvoice: (returnTo?: string) =>
    withReturnTo(ROUTES.INVOICING_EXECUTE, origin(returnTo)),
  pulseInvoiceHome: (returnTo?: string) =>
    withReturnTo(ROUTES.PULSE_INVOICE, origin(returnTo)),
  pulseInvoiceFromPod: (podReturnTo?: string | null) => {
    const podHref = podReturnTo
      ? `${ROUTES.POD_RECONCILIATION}?returnTo=${encodeURIComponent(origin(podReturnTo))}`
      : ROUTES.POD_RECONCILIATION;
    return withReturnTo(ROUTES.INVOICING_EXECUTE, podHref);
  },
  pulsePod: (returnTo?: string) =>
    withReturnTo(ROUTES.POD_RECONCILIATION, origin(returnTo)),
  coreLedger: ROUTES.TABS.FINANCE as Href,
  coreTrip: (id: string) => `/trip/${id}` as Href,
  coreClient: (id: string) => ROUTES.clientDetail(id) as Href,
};
