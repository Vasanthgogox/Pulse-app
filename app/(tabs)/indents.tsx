import { Redirect } from "expo-router";

import { ROUTES } from "@/lib/routes";

/**
 * Legacy indents tab — redirects to Load Center hub (trips-aligned UI).
 * @see features/network/components/LoadCenterView.tsx
 */
export default function IndentsScreenRedirect() {
  return <Redirect href={ROUTES.PULSE_LOADS} />;
}
