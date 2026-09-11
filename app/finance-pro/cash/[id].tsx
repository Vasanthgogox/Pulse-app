import { FinanceProCashDetailScreen } from "@/features/finance-pro/components/FinanceProCashDetailScreen";
import { ROUTES } from "@/lib/routes";
import { shouldMountAuthenticatedDataPlane } from "@/lib/bootGate";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";

export default function FinanceProCashRoute() {
  const { sessionAttached } = useAuth();
  if (!shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }
  return <FinanceProCashDetailScreen />;
}
