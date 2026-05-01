import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  AddClientModal,
  createClient,
  type AddClientFormData,
  type ConnectionInviteeMatch,
} from "@/features/clients";
import { PartyRegistrationPortal } from "@/features/finance/components/PartyRegistrationPortal";
import { usePartyPortalRouteHandlers } from "@/features/finance/hooks/usePartyPortalRouteHandlers";
import { queryKeys } from "@/lib/queryKeys";
import { useInvalidateClients } from "@/lib/queries/useClientsQuery";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import {
  getConnectionInviteeByPhone,
  createConnectionRequest,
} from "@/services/connectionRequestsService";

const NO_ORG_MESSAGE =
  "No organization loaded. Sign out and sign in again to refresh, or ensure you are added as a member of an organization in the dashboard.";

/** Close modal: go back to opener, else fallback route. */
function closeModal(
  router: ReturnType<typeof useRouter>,
  returnTo?: string,
) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  if (returnTo) {
    router.replace(returnTo as Parameters<typeof router.replace>[0]);
    return;
  }
  router.replace(ROUTES.TABS.NETWORK as "/");
}

export default function AddClientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const queryClient = useQueryClient();
  const invalidateClients = useInvalidateClients();
  const partyPortal = usePartyPortalRouteHandlers();
  const { currentOrganization, isLoading, refreshOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = returnToParam?.startsWith("/") ? returnToParam : undefined;

  const handleComplete = async (data: AddClientFormData) => {
    if (!currentOrganization?.id) {
      throw new Error(NO_ORG_MESSAGE);
    }
    const orgId = currentOrganization.id;
    if (__DEV__) {
      console.log('[AddClient] Using organization_id:', orgId);
    }
    const { error } = await createClient(orgId, {
      contact_person: data.contactPerson,
      phone: data.phone,
      organization_name: data.organizationName || undefined,
    });
    if (error) throw error;
    invalidateClients(orgId);
    await queryClient.refetchQueries({ queryKey: queryKeys.clients.all(orgId) });
    closeModal(router, returnTo);
  };

  const searchInviteeByPhone = async (
    phone: string
  ): Promise<ConnectionInviteeMatch | null> => {
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

  const handleSendInvitation = async (toOrgId: string) => {
    if (!currentOrganization?.id) {
      throw new Error(NO_ORG_MESSAGE);
    }
    const { error, alreadyInvited } = await createConnectionRequest(
      currentOrganization.id,
      toOrgId,
      { requestShipperClient: true, requestCarrierSupplier: false }
    );
    if (error) throw error;
    if (alreadyInvited) {
      // Still close; they can see in Network > Requests
    }
    closeModal(router, returnTo);
  };

  if (isLoading) {
    return <CenteredLoadingView message="Loading organization…" />;
  }

  if (Platform.OS === "web") {
    return (
      <PartyRegistrationPortal
        visible
        initialKind="client"
        onClose={() => closeModal(router, returnTo)}
        organizationId={partyPortal.organizationId}
        noOrganizationMessage={
          currentOrganization ? null : partyPortal.NO_ORG_MESSAGE
        }
        onRefreshOrganization={partyPortal.refreshOrganization}
        onAddClient={partyPortal.handleAddClientComplete}
        onAddSupplier={partyPortal.handleAddSupplierComplete}
        onAddDriver={partyPortal.handleAddDriverDirect}
        onAddVehicle={partyPortal.handleAddVehicleComplete}
      />
    );
  }

  return (
    <AddClientModal
      onClose={() => closeModal(router, returnTo)}
      onComplete={handleComplete}
      successEntity="customer"
      organizationId={currentOrganization?.id ?? null}
      noOrganizationMessage={currentOrganization ? null : NO_ORG_MESSAGE}
      onRefreshOrganization={refreshOrganization}
      searchInviteeByPhone={searchInviteeByPhone}
      onSendInvitation={handleSendInvitation}
    />
  );
}
