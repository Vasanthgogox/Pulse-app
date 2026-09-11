import { ROUTES } from "@/lib/routes";
import { Redirect } from "expo-router";

/** Invoice POD tab hands off to the Pulse POD product — not Finance Pro. */
export default function PulseInvoicePodRoute() {
  return <Redirect href={ROUTES.POD_RECONCILIATION} />;
}
