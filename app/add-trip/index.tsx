/**
 * Create Trip — full-screen page (pushed, not modal). Reuses AddTripModal content.
 * On close/complete we navigate to Trips tab so we don't fall back to Ops Agent (index).
 */
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { createLedgerEntry } from '@/features/finance/services/finance.service';
import { AddTripModal } from '@/features/trips/components/add-trip';
import type { AddTripFormData } from '@/features/trips/components/add-trip';
import {
  assignTripDriverByPhone,
  createTrip,
  createTripWithOtp,
  type TripOtpInfo,
} from '@/features/trips/services/trips.service';
import { getTripOtpForDisplay } from '@/features/trips/services/tripOtp.service';
import type { AddTripCompleteResult } from '@/features/trips/components/add-trip/types';
import { useInvalidateTrips } from '@/lib/queries/useTripsQuery';
import { useVisibleIndentQuery } from '@/lib/queries/useIndentsQuery';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { showAppAlert } from '@/lib/appAlert';

export default function AddTripPage() {
  const { can: canSurface, isLoading: isMemberAccessLoading } = useMemberAccess();
  const canAddTrip =
    canSurface('tripops.trips.create_asset') ||
    canSurface('tripops.trips.create_aggregate');

  if (isMemberAccessLoading) {
    return <View style={{ flex: 1 }} />;
  }

  if (!canAddTrip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
          No access
        </Text>
        <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
          You don't have permission to create trips.
        </Text>
      </View>
    );
  }

  return <AddTripPageContent />;
}

function AddTripPageContent() {
  const router = useRouter();
  const { indentId } = useLocalSearchParams<{ indentId?: string }>();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { data: sourceIndent } = useVisibleIndentQuery(orgId, indentId ?? null);
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

  const resolveTripNumber = (trip: unknown): string => {
    if (!trip || typeof trip !== 'object') return 'Trip';
    const candidateKeys = ['display_trip_id', 'trip_number', 'id'] as const;
    for (const key of candidateKeys) {
      const value = (trip as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return 'Trip';
  };

  const handleComplete = async (
    data: AddTripFormData,
    options?: { supplySource: string; driverPhone?: string; driverName?: string },
  ): Promise<AddTripCompleteResult | void> => {
    const { orgId, userId } = ensureSessionReady();
    const loadTonsRaw =
      data.tons != null && String(data.tons).trim() !== ""
        ? Number(data.tons)
        : NaN;
    const loadTons =
      Number.isFinite(loadTonsRaw) && loadTonsRaw >= 0
        ? loadTonsRaw
        : undefined;
    const advancePaidRaw = Number(data.advance_paid ?? 0);
    const normalizedAdvancePaid =
      Number.isFinite(advancePaidRaw) && advancePaidRaw >= 0
        ? advancePaidRaw
        : 0;
    const isAggregate = options?.supplySource === 'aggregate' && !!data.supplier_id;
    const assignDriverByPhone = !!options?.driverPhone?.trim();
    const assignDriverName = options?.driverName?.trim() || undefined;
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
        supplier_name: data.supplier_name ?? undefined,
        pickup_date: data.pickup_date ?? undefined,
        load_tons: loadTons,
        load_type: data.load_type ?? undefined,
        advance_paid: normalizedAdvancePaid,
        notes: data.notes ?? undefined,
        driver_commission_percent: data.driver_commission_percent ?? undefined,
        vehicle_display_number: data.vehicle_display_number?.trim() || undefined,
        owner_user_id: profile?.uid ?? userId,
        created_by_user_id: profile?.uid ?? userId,
        trip_payout_mode: 'market',
      }, { skipOtpGeneration: assignDriverByPhone });
      if (error) throw error;
      const advancePaidAgg = normalizedAdvancePaid;
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
        if (ledgerErr) {
          console.warn('[add-trip] Trip created but advance ledger entry failed:', ledgerErr.message);
        }
      }
      let resolvedOtp: TripOtpInfo | null = otp;
      if (trip && assignDriverByPhone) {
        const { error: assignErr, otp: assignOtp } = await assignTripDriverByPhone(
          trip.id,
          orgId,
          options.driverPhone!.trim(),
          {
            trackingOnly: true,
            changedBy: userId,
            driverIdPrev: null,
            vehicleIdPrev: null,
            driverName: assignDriverName,
            commissionPercent: data.driver_commission_percent ?? null,
          },
        );
        if (assignErr) {
          console.warn('Trip created but driver assign by phone failed:', assignErr.message);
          showAppAlert(
            'Trip created',
            `Trip was created, but driver could not be assigned: ${assignErr.message}`,
          );
        } else if (assignOtp) {
          resolvedOtp = assignOtp;
        } else {
          const { code, expires_at } = await getTripOtpForDisplay(trip.id);
          if (code && expires_at) resolvedOtp = { code, expires_at };
        }
      }
      if (trip) {
        await refreshTripsAfterCreate(orgId);
      }
      if (trip && resolvedOtp && assignDriverByPhone) return { trip, otp: resolvedOtp };
      if (trip) {
        return {
          trip,
          otp: null,
          successDetails: {
            tripNumber: resolveTripNumber(trip),
            routeLabel: `${data.pickup_area} -> ${data.drop_location}`,
          },
        };
      }
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
      supplier_name: data.supplier_name ?? undefined,
      pickup_date: data.pickup_date ?? undefined,
      load_tons: loadTons,
      load_type: data.load_type ?? undefined,
      advance_paid: normalizedAdvancePaid,
      notes: data.notes ?? undefined,
      driver_id: data.driver_id ?? undefined,
      driver_commission_percent: data.driver_commission_percent ?? undefined,
      driver_commission_per_km: data.driver_commission_per_km ?? undefined,
      vehicle_id: data.vehicle_id ?? undefined,
      owner_user_id: profile?.uid ?? userId,
      created_by_user_id: profile?.uid ?? userId,
      trip_payout_mode: options?.supplySource === 'aggregate' ? 'market' : 'asset',
    });
    if (error) throw error;
    if (trip && options?.supplySource === 'aggregate' && options?.driverPhone?.trim()) {
      const { error: assignErr } = await assignTripDriverByPhone(
        trip.id,
        orgId,
        options.driverPhone.trim(),
        {
          trackingOnly: true,
          changedBy: userId,
          driverIdPrev: null,
          vehicleIdPrev: null,
          driverName: options.driverName?.trim() || undefined,
          commissionPercent: data.driver_commission_percent ?? null,
        },
      );
      if (assignErr) {
        console.warn('Trip created but driver assign by phone failed:', assignErr.message);
        showAppAlert(
          'Trip created',
          `Trip was created, but driver could not be assigned: ${assignErr.message}`,
        );
      }
    }
    const advancePaid = normalizedAdvancePaid;
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
      if (ledgerErr) {
        console.warn('[add-trip] Trip created but advance ledger entry failed:', ledgerErr.message);
      }
    }
    if (trip) {
      await refreshTripsAfterCreate(orgId);
    }
    if (trip) {
      return {
        trip,
        otp: null,
        successDetails: {
          tripNumber: resolveTripNumber(trip),
          routeLabel: `${data.pickup_area} -> ${data.drop_location}`,
        },
      };
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AddTripModal
        organizationId={orgId}
        sourceIndent={sourceIndent ?? null}
        onClose={closeAndGoBack}
        onComplete={handleComplete}
      />
    </View>
  );
}
