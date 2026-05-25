import type { TripRow } from '@/features/trips/services/trips.service';
import { formatIndianVehicleNumber } from '@/lib/format';

export function phoneLast10(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

type ChangeArgs = {
  trip: Pick<TripRow, 'driver_id' | 'vehicle_id' | 'vehicle_display_number'>;
  driverModeIsPhone: boolean;
  phone: string;
  currentDriverPhone: string | null;
  selectedDriverId: string | null;
  selectedVehicleId: string | null;
  adHocPlate: string;
  isAggregate: boolean;
};

/** True when confirm would change driver, vehicle, phone, or ad-hoc plate vs current trip. */
export function hasReassignChanges({
  trip,
  driverModeIsPhone,
  phone,
  currentDriverPhone,
  selectedDriverId,
  selectedVehicleId,
  adHocPlate,
  isAggregate,
}: ChangeArgs): boolean {
  const currentPlate = formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim();
  const newPlate = formatIndianVehicleNumber(adHocPlate).trim();

  if (driverModeIsPhone) {
    const newPhone = phone.trim();
    const phoneChanged =
      newPhone.length > 0 &&
      phoneLast10(newPhone) !== phoneLast10(currentDriverPhone ?? '');
    const vehicleChanged = (selectedVehicleId ?? null) !== (trip.vehicle_id ?? null);
    const plateChanged =
      isAggregate &&
      !selectedVehicleId &&
      newPlate.length > 0 &&
      newPlate !== currentPlate;
    return phoneChanged || vehicleChanged || plateChanged;
  }

  const driverChanged = (selectedDriverId ?? null) !== (trip.driver_id ?? null);
  const vehicleChanged = (selectedVehicleId ?? null) !== (trip.vehicle_id ?? null);
  const plateChanged =
    isAggregate &&
    !selectedVehicleId &&
    newPlate.length > 0 &&
    newPlate !== currentPlate;

  return driverChanged || vehicleChanged || plateChanged;
}
