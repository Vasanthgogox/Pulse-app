import type { DriverRow } from '@/features/drivers/services/drivers.service';
import type { VehicleRow } from '@/features/vehicles/services/vehicles.service';
import { formatIndianVehicleNumber } from '@/lib/format';

export function pilotCodeFromName(name: string): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function filterDriversForReassign(
  drivers: DriverRow[],
  query: string,
): DriverRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return drivers;
  return drivers.filter((d) => {
    const name = (d.name ?? '').toLowerCase();
    const phone = (d.phone ?? '').replace(/\s/g, '');
    return name.includes(q) || phone.includes(q.replace(/\s/g, ''));
  });
}

export function filterVehiclesForReassign(
  vehicles: VehicleRow[],
  query: string,
): VehicleRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return vehicles;
  return vehicles.filter((v) => {
    const num = formatIndianVehicleNumber(v.vehicle_number ?? '').toLowerCase();
    const type = (v.vehicle_type ?? '').toLowerCase();
    return num.includes(q) || type.includes(q);
  });
}

export function vehicleRowLabel(v: VehicleRow): string {
  const plate = formatIndianVehicleNumber(v.vehicle_number ?? '').trim();
  const type = (v.vehicle_type ?? '').trim();
  if (plate && type) return `${plate} · ${type}`;
  return plate || type || '—';
}
