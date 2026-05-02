import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { PartyRegistrationPortal } from '@/features/finance/components/PartyRegistrationPortal';
import { usePartyPortalRouteHandlers } from '@/features/finance/hooks/usePartyPortalRouteHandlers';
import { AddVehicleModal, type AddVehicleCompletePayload, createVehicle } from '@/features/vehicles';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/routes';
import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

const DEFAULT_FALLBACK_ROUTE = ROUTES.TABS.RESOURCES;

/** Dismiss modal: go back to the page that opened it. */
function closeModal(router: ReturnType<typeof useRouter>, returnTo?: string) {
  if (router.canGoBack()) {
    router.back();
  } else if (returnTo) {
    router.replace(returnTo as Parameters<typeof router.replace>[0]);
  } else {
    router.replace(DEFAULT_FALLBACK_ROUTE);
  }
}

export default function AddVehicleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const queryClient = useQueryClient();
  const partyPortal = usePartyPortalRouteHandlers();
  const { currentOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = returnToParam?.startsWith('/') ? returnToParam : undefined;

  const handleComplete = async (payload: AddVehicleCompletePayload) => {
    if (!currentOrganization?.id) return;
    const orgId = currentOrganization.id;
    const { error } = await createVehicle(orgId, {
      vehicleSource: payload.vehicleSource,
      vehicle_number: payload.vehicleNumber,
      vehicle_type: payload.vehicleType,
      capacity: payload.capacity,
      vehicle_brand: payload.vehicleBrand ?? undefined,
      vehicle_model: payload.vehicleModel ?? undefined,
      vehicle_body_type: payload.vehicleBodyType ?? undefined,
      vehicle_size: payload.vehicleSize ?? undefined,
      vehicle_axle: payload.vehicleAxle ?? undefined,
      documents: payload.documents,
    });
    if (error) throw error;
    await queryClient.refetchQueries({ queryKey: queryKeys.vehicles.all(orgId) });
  };

  if (Platform.OS === 'web') {
    return (
      <PartyRegistrationPortal
        visible
        initialKind="vehicle"
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
    <AddVehicleModal
      onClose={() => closeModal(router, returnTo)}
      onComplete={handleComplete}
      ownAssetOnly
    />
  );
}
