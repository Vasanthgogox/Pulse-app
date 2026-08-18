/**
 * Legacy `/business-pulse` (Business Intelligence dashboard) → own-org Network hub.
 *
 * Same destination as the former workspace header org-avatar tap:
 * `ROUTES.networkOrgHub("profile")`.
 */
import { ROUTES } from "@/lib/routes";
import { Redirect } from "expo-router";

export default function BusinessPulseRedirect() {
  return <Redirect href={ROUTES.networkOrgHub("profile") as never} />;
}
