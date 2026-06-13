import { useLocalSearchParams, useRouter } from "expo-router";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PartyRegistrationPortal } from "@/features/finance/components/PartyRegistrationPortal";
import { usePartyPortalRouteHandlers } from "@/features/finance/hooks/usePartyPortalRouteHandlers";
import type { SupplierInviteeMatch } from "@/features/suppliers/components/AddSupplierModal";
import {
  getConnectionInviteeByPhone,
  createConnectionRequest,
} from "@/features/connections/services/connectionRequests.service";
import { ROUTES } from "@/lib/routes";

export default function AddSupplierScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const partyPortal = usePartyPortalRouteHandlers();
  const { currentOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = returnToParam?.startsWith("/") ? returnToParam : undefined;

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnTo) {
      router.replace(returnTo as Parameters<typeof router.replace>[0]);
      return;
    }
    router.replace(ROUTES.TABS.NETWORK as "/");
  };

  const searchInviteeByPhone = async (
    phone: string,
  ): Promise<SupplierInviteeMatch | null> => {
    const { error, invitee } = await getConnectionInviteeByPhone(phone);
    if (error || !invitee) return null;
    return {
      organization_id: invitee.organization_id,
      full_name: invitee.full_name,
      phone: invitee.phone,
      organization_name: invitee.organization_name,
      profile_company_name: invitee.profile_company_name,
      profile_role: invitee.profile_role,
    };
  };

  const handleSendSupplierInvitation = async (toOrgId: string) => {
    if (!currentOrganization?.id) return;
    const { error } = await createConnectionRequest(
      currentOrganization.id,
      toOrgId,
      { requestShipperClient: false, requestCarrierSupplier: true },
    );
    if (error) throw error;
  };

  return (
    <PartyRegistrationPortal
      visible
      initialKind="supplier"
      onClose={closeModal}
      organizationId={partyPortal.organizationId}
      noOrganizationMessage={
        currentOrganization ? null : partyPortal.NO_ORG_MESSAGE
      }
      onRefreshOrganization={partyPortal.refreshOrganization}
      onAddClient={partyPortal.handleAddClientComplete}
      onAddSupplier={partyPortal.handleAddSupplierComplete}
      onAddDriver={partyPortal.handleAddDriverDirect}
      onAddVehicle={partyPortal.handleAddVehicleComplete}
      searchInviteeByPhone={searchInviteeByPhone}
      onSendSupplierInvitation={handleSendSupplierInvitation}
    />
  );
}
