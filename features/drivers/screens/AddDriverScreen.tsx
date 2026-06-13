import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ThemedAlertModal } from '@/components/ThemedAlertModal';
import { useOrganization } from '@/contexts/OrganizationContext';
import { PartyRegistrationPortal } from '@/features/finance/components/PartyRegistrationPortal';
import { usePartyPortalRouteHandlers } from '@/features/finance/hooks/usePartyPortalRouteHandlers';
import { type DriverFormData, inviteDriver } from '@/features/drivers';
import { queryKeys } from '@/lib/queryKeys';
import { closeModal } from '@/app/(modals)/add-driver-closeModal';

export { closeModal };

type CloseModalRouter = Parameters<typeof closeModal>[0];


export default function AddDriverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const queryClient = useQueryClient();
  const partyPortal = usePartyPortalRouteHandlers();
  const { currentOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = returnToParam?.startsWith('/') ? returnToParam : undefined;
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
    // Invite sent in-app: portal closes after onComplete resolves.
  };

  return (
    <>
      <PartyRegistrationPortal
        visible
        initialKind="driver"
        onClose={() => closeModal(router as CloseModalRouter, returnTo)}
        organizationId={partyPortal.organizationId}
        noOrganizationMessage={
          currentOrganization ? null : partyPortal.NO_ORG_MESSAGE
        }
        onRefreshOrganization={partyPortal.refreshOrganization}
        onAddClient={partyPortal.handleAddClientComplete}
        onAddSupplier={partyPortal.handleAddSupplierComplete}
        onAddDriver={partyPortal.handleAddDriverDirect}
        onAddVehicle={partyPortal.handleAddVehicleComplete}
        onInviteDriver={handleInvite}
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
