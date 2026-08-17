/**
 * Legacy `/account` route → personal My Account panel in the workspace overlay.
 *
 * Kept as a redirect for deep links, email CTAs and any older nav stacks
 * that still resolve `ROUTES.MY_ACCOUNT`.
 */
import { ROUTES } from "@/lib/routes";
import { Redirect } from "expo-router";

export default function AccountRedirect() {
  return <Redirect href={ROUTES.WORKSPACE_ACCOUNT as never} />;
}
