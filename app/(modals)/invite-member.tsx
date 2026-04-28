/**
 * Invite member modal screen — wraps InviteMemberModal feature component.
 */
import { useOrganization } from "@/contexts/OrganizationContext";
import { InviteMemberModal } from "@/features/organization/components/InviteMemberModal";
import { useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export default function InviteMemberScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const invalidate = useInvalidateOrgMembers(orgId || null);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(ROUTES.MODALS.TEAM as Parameters<typeof router.replace>[0]);
    }
  };

  const handleInvited = async () => {
    if (orgId) {
      invalidate();
      await queryClient.refetchQueries({ queryKey: queryKeys.orgMembers.all(orgId) });
    }
    handleClose();
  };

  if (!orgId) {
    handleClose();
    return null;
  }

  return (
    <InviteMemberModal
      orgId={orgId}
      onClose={handleClose}
      onInvited={handleInvited}
    />
  );
}
