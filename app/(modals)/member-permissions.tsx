/**
 * Owner-only per-member permission detail (domain toggles).
 * Opened from Access Control / Team Edit with ?memberId=.
 */
import { MemberPermissionsPanel } from "@/features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

export default function MemberPermissionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const memberId = typeof params.memberId === "string" ? params.memberId : "";

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(
        ROUTES.MODALS.ACCESS_CONTROL as Parameters<typeof router.replace>[0],
      );
    }
  }, [router]);

  return (
    <MemberPermissionsPanel memberId={memberId} onBack={handleBack} />
  );
}
