import { useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AddVehicleModal, type AddVehicleCompletePayload, createVehicle } from '@/features/vehicles';
import { queryKeys } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeBack } from '@/lib/useSafeBack';

/** Dismiss modal: go back to the page that opened it. */
function closeModal(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/finance');
}

export default function AddVehicleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const safeBack = useSafeBack();
  const { currentOrganization } = useOrganization();

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
    closeModal(router);
  };

  return (
    <AddVehicleModal
      onClose={() => closeModal(router)}
      onComplete={handleComplete}
      ownAssetOnly
    />
  );
}
