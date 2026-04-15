import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AddDriverModal, type DriverFormData, inviteDriver, createDriver } from '@/features/drivers';
import { queryKeys } from '@/lib/supabase';
import { closeModal } from './add-driver-closeModal';

export { closeModal };

type CloseModalRouter = Parameters<typeof closeModal>[0];


export default function AddDriverScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();

  /** Send Invitation — if driver has app account (same phone, role=driver) they see invite in-app; else create driver row. */
  const handleInvite = async (data: DriverFormData) => {
    if (!currentOrganization?.id) {
      throw new Error('No organization selected. Sign out and sign in again.');
    }
    const orgId = currentOrganization.id;
    const { error, inviteSent, inviteAlreadyExists, inviteStatus } = await inviteDriver(
      orgId,
      data,
      currentOrganization.name ?? undefined
    );
    if (error) throw error;
    await queryClient.refetchQueries({ queryKey: queryKeys.drivers.all(orgId) });
    if (!inviteSent) {
      if (inviteAlreadyExists) {
        Alert.alert(
          'Already invited',
          `An invitation was already sent to this driver (${(inviteStatus ?? 'pending').toUpperCase()}).`,
          [{ text: 'OK', onPress: () => closeModal(router as CloseModalRouter) }]
        );
        return;
      }
      Alert.alert(
        'Driver added',
        "They'll see the invitation in the app once they sign up with this phone number (choose \"Driver\" when signing up). You can assign trips to them after they accept.",
        [{ text: 'OK', onPress: () => closeModal(router as CloseModalRouter) }]
      );
      return;
    }
    // Invite sent in-app: modal onClose runs after onComplete resolves.
  };

  /** Add Driver (direct) — creates driver row without invite wording. */
  const handleAddDriver = async (data: DriverFormData) => {
    if (!currentOrganization?.id) throw new Error('No organization selected.');
    const orgId = currentOrganization.id;
    const { error } = await createDriver(orgId, data);
    if (error) throw error;
    await queryClient.refetchQueries({ queryKey: queryKeys.drivers.all(orgId) });
    // Dismiss: AddDriverModal calls onClose after this promise resolves — avoid double navigation.
  };

  return (
    <AddDriverModal
      onClose={() => closeModal(router as CloseModalRouter)}
      onComplete={handleInvite}
      onAddDriver={handleAddDriver}
      salariedOnly
    />
  );
}
