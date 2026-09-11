import { FinanceProPipelineScreen } from "@/features/finance-pro/components/FinanceProPipelineScreen";
import { ROUTES } from "@/lib/routes";
import { shouldMountAuthenticatedDataPlane } from "@/lib/bootGate";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";

export default function FinanceProTripsPodRoute() {
  const { sessionAttached } = useAuth();
  if (!shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }
  return <FinanceProPipelineScreen />;
}
