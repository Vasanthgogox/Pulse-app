import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  AddSupplierModal,
  type SupplierFormData,
  type SupplierInviteeMatch,
} from '@/features/suppliers/components/AddSupplierModal';
import { createSupplier } from '@/features/suppliers/services/suppliers.service';
import {
  getConnectionInviteeByPhone,
  createConnectionRequest,
} from '@/services/connectionRequestsService';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/routes';
import { useQueryClient } from '@tanstack/react-query';

export default function AddSupplierScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = returnToParam?.startsWith('/') ? returnToParam : undefined;

  const closeModal = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnTo) {
      router.replace(returnTo as Parameters<typeof router.replace>[0]);
      return;
    }
    router.replace(ROUTES.TABS.NETWORK as '/');
  };

  const handleComplete = async (data: SupplierFormData) => {
    if (!currentOrganization?.id) return;
    const orgId = currentOrganization.id;
    const { error } = await createSupplier(orgId, {
      company_name: data.companyName || undefined,
      contact_person: data.name,
      phone: data.phone,
    });
    if (error) throw error;
    await queryClient.refetchQueries({ queryKey: queryKeys.suppliers.all(orgId) });
    closeModal();
  };

  const searchInviteeByPhone = async (
    phone: string
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

  const handleSendInvitation = async (toOrgId: string) => {
    if (!currentOrganization?.id) return;
    const { error, alreadyInvited } = await createConnectionRequest(
      currentOrganization.id,
      toOrgId,
      { requestShipperClient: false, requestCarrierSupplier: true }
    );
    if (error) throw error;
    if (alreadyInvited) {
      // Still close; they can see in Network > Requests
    }
    closeModal();
  };

  return (
    <AddSupplierModal
      onClose={closeModal}
      onComplete={handleComplete}
      searchInviteeByPhone={searchInviteeByPhone}
      onSendInvitation={handleSendInvitation}
    />
  );
}
