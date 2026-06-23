/**
 * Row shapes from DB views — safe projections for supplier/driver clients.
 * Derived from trips_supplier_view and trips_driver_view.
 */
import type { TripRow } from '@/features/trips/services/trips.service';

/** Safe to send to supplier clients (no shipper operational ids). */
export type SupplierTripRow = {
  id: string;
  booking_ref: string | null;
  source_indent_code: string | null;
  supplier_trip_sequence: number | null;
  status: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_scheduled_at: string | null;
  dropoff_location: string | null;
  dropoff_address: string | null;
  dropoff_scheduled_at: string | null;
  assigned_driver_id: string | null;
  driver_display_trip_id: string | null;
  vehicle_id: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
};

/** Safe to send to driver clients (no booking_ref or shipper operational ids). */
export type DriverTripRow = {
  id: string;
  driver_id?: string | null;
  driver_display_trip_id: string | null;
  status: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_scheduled_at: string | null;
  dropoff_location: string | null;
  dropoff_address: string | null;
  dropoff_scheduled_at: string | null;
  instructions: string | null;
  vehicle_id: string | null;
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  started_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Map supplier view row → legacy TripRow for screens not yet migrated off TripRow. */
export function supplierRowToTripRow(row: SupplierTripRow): TripRow {
  return {
    id: row.id,
    organization_id: '',
    trip_number: row.booking_ref ?? row.id,
    booking_ref: row.booking_ref,
    source_indent_code: row.source_indent_code,
    supplier_trip_sequence: row.supplier_trip_sequence,
    status: row.status,
    pickup_area: row.pickup_location ?? '',
    drop_location: row.dropoff_location ?? '',
    pickup_date: row.pickup_scheduled_at,
    notes: row.instructions,
    driver_id: row.assigned_driver_id,
    driver_display_trip_id: row.driver_display_trip_id,
    vehicle_id: row.vehicle_id,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    indent_id: null,
    source: 'indent',
    client_name: '',
    client_price: 0,
    supplier_rate: 0,
    margin: 0,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: 'pending',
    amount_paid: 0,
    distance: null,
    estimated_duration: null,
    client_id: null,
    supplier_id: null,
    load_type: null,
    started_at: null,
    completed_at: null,
  };
}

/** Map driver view row → legacy TripRow for driver UI until fully on DriverTripRow. */
export function driverRowToTripRow(row: DriverTripRow): TripRow {
  return {
    id: row.id,
    organization_id: '',
    trip_number: row.driver_display_trip_id ?? row.id,
    driver_display_trip_id: row.driver_display_trip_id,
    status: row.status,
    pickup_area: row.pickup_location ?? '',
    drop_location: row.dropoff_location ?? '',
    pickup_date: row.pickup_scheduled_at,
    pickup_lat: row.pickup_lat ?? null,
    pickup_lon: row.pickup_lon ?? null,
    drop_lat: row.drop_lat ?? null,
    drop_lon: row.drop_lon ?? null,
    notes: row.instructions,
    vehicle_id: row.vehicle_id,
    started_at: row.started_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    indent_id: null,
    source: 'assigned',
    client_name: '',
    client_price: 0,
    supplier_rate: 0,
    margin: 0,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: 'pending',
    amount_paid: 0,
    distance: null,
    estimated_duration: null,
    client_id: null,
    supplier_id: null,
    driver_id: row.driver_id ?? null,
    load_type: null,
    completed_at: null,
  };
}
