import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ThemedAlertModal } from '@/components/ThemedAlertModal';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AddDriverModal, type DriverFormData, inviteDriver, createDriver } from '@/features/drivers';
import { queryKeys } from '@/lib/queryKeys';
import { closeModal } from './add-driver-closeModal';

export { closeModal };

type CloseModalRouter = Parameters<typeof closeModal>[0];


export default function AddDriverScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [themedInfo, setThemedInfo] = useState<{
    title: string;
    message: string;
    variant: 'neutral' | 'warning';
  } | null>(null);
  /** Resolves the pending `handleInvite` Promise after the user dismisses the themed alert. */
  const alertResolveRef = useRef<(() => void) | null>(null);

  const onThemedInfoOk = () => {
    setThemedInfo(null);
    const resolve = alertResolveRef.current;
    alertResolveRef.current = null;
    resolve?.();
  };

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
        await new Promise<void>((resolve) => {
          alertResolveRef.current = resolve;
          setThemedInfo({
            title: 'Already invited',
            message: `An invitation was already sent to this driver (${(inviteStatus ?? 'pending').toUpperCase()}).`,
            variant: 'warning',
          });
        });
        return;
      }
      await new Promise<void>((resolve) => {
        alertResolveRef.current = resolve;
        setThemedInfo({
          title: 'Driver added successfully',
          message:
            'They will see the invitation in the app once they sign up with this phone number (choose "Driver" when signing up). You can assign trips to them after they accept.',
          variant: 'neutral',
        });
      });
      return;
    }
    // Invite sent in-app: AddDriverModal closes after onComplete resolves.
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
    <>
      <AddDriverModal
        onClose={() => closeModal(router as CloseModalRouter)}
        onComplete={handleInvite}
        onAddDriver={handleAddDriver}
        salariedOnly
      />
      <ThemedAlertModal
        visible={themedInfo != null}
        title={themedInfo?.title ?? ''}
        message={themedInfo?.message ?? ''}
        okText="OK"
        variant={themedInfo?.variant === 'warning' ? 'warning' : 'neutral'}
        okVariant="primary"
        onOk={onThemedInfoOk}
        onRequestClose={onThemedInfoOk}
      />
    </>
  );
}
