/**
 * Legacy `/account` route → forwards into the workspace flex-card overlay
 * (`/workspace?panel=account`) so the page lives inside the standard 40vw
 * side card with the rest of the workspace surface.
 *
 * Kept as a redirect for deep links, email CTAs and any older nav stacks
 * that still resolve `ROUTES.MY_ACCOUNT`.
 */
import { Redirect } from "expo-router";

export default function AccountRedirect() {
  return <Redirect href={"/workspace?panel=account" as never} />;
}
