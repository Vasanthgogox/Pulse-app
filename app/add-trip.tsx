/**
 * Create Trip — full-screen page (pushed, not modal). Reuses AddTripModal content.
 * On close/complete we navigate to Trips tab so we don't fall back to Ops Agent (index).
 */
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { createLedgerEntry } from '@/features/finance';
import { AddTripModal, assignTripDriverByPhone, createTrip, createTripWithOtp, type AddTripFormData } from '@/features/trips';
import { useInvalidateTrips } from '@/lib/queries';
import { useSafeBack } from '@/lib/useSafeBack';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

export default function AddTripPage() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { currentOrganization } = useOrganization();
  const { user, profile } = useAuth();
  const invalidateTrips = useInvalidateTrips();

  const closeAndGoBack = () => {
    // If we're coming from Ops Agent or want to force Trips view:
    router.replace('/(tabs)/trips');
  };

  const ensureSessionReady = () => {
    if (!currentOrganization?.id || !user?.uid) {
      throw new Error(
        'Organization or user session is not ready. Please wait a moment and try again.',
      );
    }
    return { orgId: currentOrganization.id, userId: user.uid };
  };

  const refreshTripsAfterCreate = async (orgId: string) => {
    await Promise.resolve(invalidateTrips(orgId));
  };

  const handleComplete = async (data: AddTripFormData, options?: { supplySource: string; driverPhone?: string }) => {
    const { orgId, userId } = ensureSessionReady();
    const isAggregate = options?.supplySource === 'aggregate' && !!data.supplier_id;
    if (isAggregate) {
      const { error, trip, otp } = await createTripWithOtp(orgId, userId, {
        pickup_area: data.pickup_area,
        drop_location: data.drop_location,
        pickup_lat: data.pickup_lat ?? undefined,
        pickup_lon: data.pickup_lon ?? undefined,
        drop_lat: data.drop_lat ?? undefined,
        drop_lon: data.drop_lon ?? undefined,
        distance: data.distance ?? undefined,
        estimated_duration: data.estimated_duration ?? undefined,
        client_name: data.client_name,
        client_id: data.client_id ?? undefined,
        client_price: data.client_price,
        supplier_rate: data.supplier_rate,
        supplier_id: data.supplier_id ?? undefined,
        notes: data.notes ?? undefined,
        vehicle_display_number: data.vehicle_display_number?.trim() || undefined,
        owner_user_id: profile?.uid ?? userId,
        created_by_user_id: profile?.uid ?? userId,
        trip_payout_mode: 'market',
      });
      if (error) throw error;
      const advancePaidAgg = Number(data.advance_paid ?? 0);
      const supplierIdAgg = data.supplier_id ?? null;
      if (trip && advancePaidAgg > 0 && supplierIdAgg) {
        const { error: ledgerErr } = await createLedgerEntry(orgId, {
          trip_id: trip.id,
          party_name: 'Advance',
          description: 'Trip Payment',
          amount_in: 0,
          amount_out: advancePaidAgg,
          contact_id: supplierIdAgg,
          contact_type: 'supplier',
        });
        if (ledgerErr) throw ledgerErr;
      }
      if (trip && options?.driverPhone?.trim()) {
        const { error: assignErr } = await assignTripDriverByPhone(trip.id, orgId, options.driverPhone.trim(), { trackingOnly: true });
        if (assignErr) console.warn('Trip created but driver assign by phone failed:', assignErr.message);
      }
      if (trip) {
        await refreshTripsAfterCreate(orgId);
      }
      if (trip && otp && options?.driverPhone?.trim()) return { trip, otp };
      closeAndGoBack();
      return;
    }
    const { error, trip } = await createTrip(orgId, userId, {
      pickup_area: data.pickup_area,
      drop_location: data.drop_location,
      pickup_lat: data.pickup_lat ?? undefined,
      pickup_lon: data.pickup_lon ?? undefined,
      drop_lat: data.drop_lat ?? undefined,
      drop_lon: data.drop_lon ?? undefined,
        distance: data.distance ?? undefined,
        estimated_duration: data.estimated_duration ?? undefined,
      client_name: data.client_name,
      client_id: data.client_id ?? undefined,
      client_price: data.client_price,
      supplier_rate: data.supplier_rate,
      supplier_id: data.supplier_id ?? undefined,
      notes: data.notes ?? undefined,
      driver_id: data.driver_id ?? undefined,
      vehicle_id: data.vehicle_id ?? undefined,
      owner_user_id: profile?.uid ?? userId,
      created_by_user_id: profile?.uid ?? userId,
      trip_payout_mode: options?.supplySource === 'aggregate' ? 'market' : 'asset',
    });
    if (error) throw error;
    if (trip && options?.supplySource === 'aggregate' && options?.driverPhone?.trim()) {
      const { error: assignErr } = await assignTripDriverByPhone(trip.id, orgId, options.driverPhone.trim(), { trackingOnly: true });
      if (assignErr) console.warn('Trip created but driver assign by phone failed:', assignErr.message);
    }
    const advancePaid = Number(data.advance_paid ?? 0);
    const supplierId = data.supplier_id ?? null;
    if (trip && advancePaid > 0 && supplierId) {
      const { error: ledgerErr } = await createLedgerEntry(orgId, {
        trip_id: trip.id,
        party_name: 'Advance',
        description: 'Trip Payment',
        amount_in: 0,
        amount_out: advancePaid,
        contact_id: supplierId,
        contact_type: 'supplier',
      });
      if (ledgerErr) throw ledgerErr;
    }
    if (trip) {
      await refreshTripsAfterCreate(orgId);
    }
    closeAndGoBack();
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AddTripModal
        organizationId={currentOrganization?.id ?? null}
        onClose={closeAndGoBack}
        onComplete={handleComplete}
      />
    </View>
  );
}
