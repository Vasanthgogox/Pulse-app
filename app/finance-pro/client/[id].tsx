import { FinanceProClient360Screen } from "@/features/finance-pro/components/FinanceProClient360Screen";
import { ROUTES } from "@/lib/routes";
import { shouldMountAuthenticatedDataPlane } from "@/lib/bootGate";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";

export default function FinanceProClientRoute() {
  const { sessionAttached } = useAuth();
  if (!shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }
  return <FinanceProClient360Screen />;
}
