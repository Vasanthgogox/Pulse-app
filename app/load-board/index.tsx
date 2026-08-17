/**
 * Load Board — full-page screen (root level). Trip Exchange, GIVE LOAD | GET LOAD, indents, CREATE INDENT.
 */
import { LoadBoardModal } from "@/components/LoadBoardModal";
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useSafeBack } from "@/lib/useSafeBack";
import { useRouter } from "expo-router";

export default function LoadBoardFullScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { currentOrganization } = useOrganization();
  const { can: canSurface } = useMemberAccess();

  const handleSyncNodes = () => {
    safeBack();
    setTimeout(() => router.push("/(tabs)/network"), 100);
  };

  return (
    <SurfaceAccessGate surface="sales.load_board">
      <LoadBoardModal
        visible
        asScreen
        onClose={safeBack}
        organizationId={currentOrganization?.id ?? null}
        onSyncNodesPress={handleSyncNodes}
        onCreateIndentPress={() => {
          if (!canSurface("tripops.indents.create")) return;
          router.push("/create-indent" as import("expo-router").Href);
        }}
        onIndentPress={(indent) =>
          router.push(`/indent/${indent.id}` as import("expo-router").Href)
        }
      />
    </SurfaceAccessGate>
  );
}
