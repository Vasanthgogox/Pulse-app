/**
 * Add Trip — shared types for form data and modal props.
 * Only 2 Source of Supply: Asset (Own Fleet) | Aggregate (Associated Partner).
 */

export type SupplySource = 'asset' | 'aggregate';

export interface AddTripFormData {
  pickup_area: string;
  drop_location: string;
  /** Planned trip start date (YYYY-MM-DD). Stored in trips.pickup_date. */
  pickup_date?: string | null;
  /** Optional coordinates from place search (for maps/distance when backend supports). */
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  /** Pre-calculated route distance (km). Persisted into trips.distance (numeric). */
  distance?: number | null;
  /**
   * Pre-calculated route ETA stored as an interval-compatible string (HH:MM:SS).
   * This will be rendered by driver UI.
   */
  estimated_duration?: string | null;
  client_name: string;
  client_id?: string | null;
  client_price: number;
  supplier_rate: number;
  supplier_id?: string | null;
  /** Advance paid to partner (aggregate only). Optional; can be recorded as ledger after create. */
  advance_paid?: number;
  notes?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Aggregate only: vehicle number for display (persisted as trip.vehicle_display_number). */
  vehicle_display_number?: string | null;
  /** Optional load weight in tons; stored in notes as metadata text. */
  tons?: string | null;
}

export interface AddTripFormState {
  pickupArea: string;
  dropLocation: string;
  /** Planned trip start date (YYYY-MM-DD). */
  tripStartDate: string;
  /** Optional load weight in tons as text input. */
  tons: string;
  pickupLat: number | null;
  pickupLon: number | null;
  dropLat: number | null;
  dropLon: number | null;
  /** Calculated route stats (for display + persistence). */
  routeDistanceKm: number | null;
  routeEtaInterval: string | null;
  routeEtaLabel: string | null;
  routeLoading: boolean;
  clientName: string;
  clientId: string | null;
  clientPrice: string;
  supplierRate: string;
  supplySource: SupplySource;
  supplierId: string | null;
  advancePaid: string;
  assignLater: boolean;
  notes: string;
  driverId: string | null;
  vehicleId: string | null;
  /** Aggregate only: assign driver for tracking by phone (used after createTrip). */
  driverPhone: string;
  /** Display name from phone lookup (aggregate). */
  driverPhoneName: string | null;
  /** When `driverPhoneName` is present, require explicit user confirmation. */
  driverPhoneConfirmed: boolean;
  /** Aggregate only: optional vehicle as text (stored in trip notes). */
  aggregateVehicleText: string;
}

/** Optional context passed to onComplete for post-create actions (e.g. assign driver by phone). */
export interface AddTripCompleteOptions {
  supplySource: SupplySource;
  /** When set with supplySource === 'aggregate', assign this trip to driver by phone after create. */
  driverPhone?: string;
}

/** Result when create returns OTP (aggregate trip). */
export interface AddTripSuccessDetails {
  tripNumber: string;
  routeLabel: string;
}

export interface AddTripCompleteResult {
  trip: { id: string };
  otp: { code: string; expires_at: string } | null;
  successDetails?: AddTripSuccessDetails;
}

export interface AddTripModalProps {
  organizationId: string | null;
  onClose: () => void;
  /** Called on submit. May return { trip, otp } for aggregate so modal shows OTP card. */
  onComplete: (
    data: AddTripFormData,
    options?: AddTripCompleteOptions
  ) => void | Promise<void> | Promise<AddTripCompleteResult | void>;
}
