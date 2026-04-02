/**
 * Add Trip — form state, validation, and payload builder.
 * Keeps modal component thin and makes it easy to add steps/fields later.
 * Validation: single O(n) pass over fields.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import type { AddTripFormData, AddTripFormState } from './types';
import { validatePhone } from '@/lib/phoneValidation';
import { getOptimalRoute } from '@/services/routingService';
import {
  VALIDATION,
  maxLength,
  nonNegativeAmount,
  positiveAmount,
  required,
  runValidators,
} from '@/lib/validation';

const initialState: AddTripFormState = {
  pickupArea: '',
  dropLocation: '',
  pickupLat: null,
  pickupLon: null,
  dropLat: null,
  dropLon: null,
  routeDistanceKm: null,
  routeEtaInterval: null,
  routeEtaLabel: null,
  routeLoading: false,
  clientName: '',
  clientId: null,
  clientPrice: '',
  supplierRate: '',
  supplySource: 'asset',
  supplierId: null,
  advancePaid: '',
  assignLater: false,
  notes: '',
  driverId: null,
  vehicleId: null,
  driverPhone: '',
  driverPhoneName: null,
  driverPhoneConfirmed: false,
  aggregateVehicleText: '',
};

export function useAddTripForm() {
  const [state, setState] = useState<AddTripFormState>(initialState);

  const setPickupArea = useCallback((v: string) => setState((s) => ({
    ...s,
    pickupArea: v,
    ...(v.trim() ? {} : { pickupLat: null, pickupLon: null }),
  })), []);
  const setDropLocation = useCallback((v: string) => setState((s) => ({
    ...s,
    dropLocation: v,
    ...(v.trim() ? {} : { dropLat: null, dropLon: null }),
  })), []);
  const setPickupCoords = useCallback((lat: number, lon: number) => setState((s) => ({ ...s, pickupLat: lat, pickupLon: lon })), []);
  const setDropCoords = useCallback((lat: number, lon: number) => setState((s) => ({ ...s, dropLat: lat, dropLon: lon })), []);
  const setClientName = useCallback((v: string) => setState((s) => ({ ...s, clientName: v, clientId: null })), []);
  const setClientId = useCallback((id: string | null) => setState((s) => ({ ...s, clientId: id })), []);
  const setClientSelection = useCallback((id: string | null, name: string) => setState((s) => ({ ...s, clientId: id, clientName: name })), []);
  const setClientPrice = useCallback((v: string) => setState((s) => ({ ...s, clientPrice: v })), []);
  const setSupplierRate = useCallback((v: string) => setState((s) => ({ ...s, supplierRate: v })), []);
  const setSupplySource = useCallback((v: AddTripFormState['supplySource']) => setState((s) => ({
    ...s,
    supplySource: v,
    supplierId: v === 'aggregate' ? s.supplierId : null,
    driverId: v === 'asset' ? s.driverId : null,
    vehicleId: v === 'asset' ? s.vehicleId : null,
    driverPhone: v === 'asset' ? '' : s.driverPhone,
    driverPhoneName: v === 'asset' ? null : s.driverPhoneName,
    driverPhoneConfirmed: v === 'asset' ? false : s.driverPhoneConfirmed,
    aggregateVehicleText: v === 'asset' ? '' : s.aggregateVehicleText,
  })), []);
  const setSupplierId = useCallback((v: string | null) => setState((s) => ({ ...s, supplierId: v })), []);
  const setAdvancePaid = useCallback((v: string) => setState((s) => ({ ...s, advancePaid: v })), []);
  const setAssignLater = useCallback((v: boolean) => setState((s) => ({ ...s, assignLater: v })), []);
  const setNotes = useCallback((v: string) => setState((s) => ({ ...s, notes: v })), []);
  const setDriverId = useCallback((v: string | null) => setState((s) => ({ ...s, driverId: v })), []);
  const setVehicleId = useCallback((v: string | null) => setState((s) => ({ ...s, vehicleId: v })), []);
  const setDriverPhone = useCallback(
    (v: string) =>
      setState((s) => ({
        ...s,
        driverPhone: v,
        // A new lookup must be re-confirmed by the user.
        driverPhoneConfirmed: false,
      })),
    [],
  );
  const setDriverPhoneName = useCallback((v: string | null) => setState((s) => ({ ...s, driverPhoneName: v })), []);
  const setDriverPhoneConfirmed = useCallback((v: boolean) => setState((s) => ({ ...s, driverPhoneConfirmed: v })), []);
  const setAggregateVehicleText = useCallback((v: string) => setState((s) => ({ ...s, aggregateVehicleText: v })), []);

  const clearClientSelection = useCallback(() => setState((s) => ({ ...s, clientId: null, clientName: '' })), []);

  const canSubmit = (() => {
    if (!state.pickupArea.trim() || !state.dropLocation.trim()) return false;
    if (!state.clientId || !state.clientName.trim()) return false;
    const cp = parseFloat(state.clientPrice) || 0;
    if (cp <= 0 || cp > VALIDATION.AMOUNT_MAX) return false;
    const sr = parseFloat(state.supplierRate) || 0;
    if (state.supplySource === 'asset') {
      if (!state.assignLater && (!state.driverId || !state.vehicleId)) return false;
      return true;
    }
    if (state.supplySource === 'aggregate') {
      const supplierOk = !!(
        state.supplierId &&
        sr >= 0 &&
        sr <= VALIDATION.AMOUNT_MAX &&
        state.aggregateVehicleText.trim().length > 0
      );

      // If we found a driver by phone, require explicit confirmation before enabling "Create Trip".
      const driverFound = !!(state.driverPhoneName && state.driverPhone.trim());
      const driverOk = !driverFound || state.driverPhoneConfirmed;

      return supplierOk && driverOk;
    }
    return false;
  })();

  const computeEtaInterval = (durationSeconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const computeEtaLabel = (durationSeconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const totalMinutes = Math.ceil(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}M`;
    if (minutes <= 0) return `${hours}H`;
    return `${hours}H ${minutes}M`;
  };

  const computeHaversineDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    // Approx distance on WGS84 sphere (metres), used only as a fallback.
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius metres
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = R * c;
    return meters / 1000;
  };

  const isValidCoord = (n: number | null | undefined) => {
    if (n == null) return false;
    if (!Number.isFinite(n)) return false;
    // Our custom address flow uses (0,0). Treat that as "unset".
    if (Math.abs(n) < 0.000001) return false;
    return true;
  };

  // Auto-calculate route distance + ETA for route preview + persistence.
  useEffect(() => {
    const canCompute =
      isValidCoord(state.pickupLat) &&
      isValidCoord(state.pickupLon) &&
      isValidCoord(state.dropLat) &&
      isValidCoord(state.dropLon);

    if (!canCompute) {
      setState((s) => ({
        ...s,
        routeDistanceKm: null,
        routeEtaInterval: null,
        routeEtaLabel: null,
        routeLoading: false,
      }));
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      setState((s) => ({ ...s, routeLoading: true }));
      try {
        const from = { latitude: state.pickupLat as number, longitude: state.pickupLon as number };
        const to = { latitude: state.dropLat as number, longitude: state.dropLon as number };
        const route = await getOptimalRoute(from, to);

        if (cancelled) return;

        if (route) {
          const distanceKmRaw = route.distance / 1000;
          const distanceKm = distanceKmRaw > 0 ? Math.round(distanceKmRaw) : 0;
          const etaSeconds = route.duration;

          setState((s) => ({
            ...s,
            routeDistanceKm: distanceKm > 0 ? distanceKm : 0,
            routeEtaInterval: computeEtaInterval(etaSeconds),
            routeEtaLabel: computeEtaLabel(etaSeconds),
          }));
          return;
        }

        // Fallback when routing APIs fail.
        const distanceKmFallbackRaw = computeHaversineDistanceKm(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        const distanceKmFallback = Math.max(1, Math.round(distanceKmFallbackRaw));
        // Assume avg speed 40km/h => ~1.5 min per km.
        const etaSecondsFallback = (distanceKmFallback * 60) / 40;

        setState((s) => ({
          ...s,
          routeDistanceKm: distanceKmFallback,
          routeEtaInterval: computeEtaInterval(etaSecondsFallback),
          routeEtaLabel: computeEtaLabel(etaSecondsFallback),
        }));
      } catch {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          routeDistanceKm: null,
          routeEtaInterval: null,
          routeEtaLabel: null,
        }));
      } finally {
        if (cancelled) return;
        setState((s) => ({ ...s, routeLoading: false }));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // Intentionally use pickup/drop coords only; other fields don't affect route calculation.
  }, [state.pickupLat, state.pickupLon, state.dropLat, state.dropLon]);

  /** Single-pass validation; returns first error message or null. */
  const getValidationError = useCallback((): string | null => {
    const err = runValidators(state.pickupArea, [required(), maxLength(255)]);
    if (err) return `Pickup area: ${err}`;
    const err2 = runValidators(state.dropLocation, [required(), maxLength(255)]);
    if (err2) return `Drop location: ${err2}`;
    const err3 = runValidators(state.clientName, [required(), maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH)]);
    if (err3) return `Client: ${err3}`;
    const err4 = positiveAmount()(state.clientPrice);
    if (err4) return `Client price: ${err4}`;
    // Supplier rate required only for aggregate (partner) trips; asset trips use own driver/vehicle, so no partner rate.
    if (state.supplySource === 'aggregate') {
      const err5 = nonNegativeAmount()(state.supplierRate);
      if (err5) return `Supplier rate: ${err5}`;
      const vehicleTrimmed = state.aggregateVehicleText.trim();
      if (!vehicleTrimmed) return 'Vehicle: required for aggregate trips';
      const driverPhoneTrimmed = state.driverPhone.trim();
      if (!driverPhoneTrimmed) return 'Driver for tracking: required for aggregate trips';
    }
    if (state.supplySource === 'asset' && !state.assignLater) {
      if (!state.driverId) return 'Driver: required';
      if (!state.vehicleId) return 'Vehicle: required';
    }
    if (state.advancePaid.trim()) {
      const err6 = nonNegativeAmount()(state.advancePaid);
      if (err6) return `Advance paid: ${err6}`;
    }
    const notesWithVehicle =
      state.supplySource === 'aggregate' && state.aggregateVehicleText.trim()
        ? (state.notes.trim() ? state.notes.trim() + '\n' : '') + 'Vehicle: ' + state.aggregateVehicleText.trim()
        : state.notes;
    const err7 = maxLength(VALIDATION.NOTES_MAX_LENGTH)(notesWithVehicle);
    if (err7) return `Notes: ${err7}`;
    if (state.supplySource === 'aggregate' && state.driverPhone.trim()) {
      const err8 = validatePhone(state.driverPhone.trim());
      if (err8) return `Driver for tracking: ${err8}`;
    }

    if (state.supplySource === 'aggregate' && state.driverPhoneName && !state.driverPhoneConfirmed) {
      return `Tap again to confirm the driver: ${state.driverPhoneName}`;
    }
    return null;
  }, [state]);

  const buildPayload = useCallback((): AddTripFormData => {
    const clientPrice = parseFloat(state.clientPrice) || 0;
    // Asset: no partner; use 0. Aggregate: validated above.
    const supplierRate = state.supplySource === 'asset' ? 0 : (parseFloat(state.supplierRate) || 0);
    const advancePaid = parseFloat(state.advancePaid) || 0;
    let notes = state.notes.trim();
    if (state.supplySource === 'aggregate' && state.aggregateVehicleText.trim()) {
      notes = (notes ? notes + '\n' : '') + 'Vehicle: ' + state.aggregateVehicleText.trim();
    }
    return {
      pickup_area: state.pickupArea.trim(),
      drop_location: state.dropLocation.trim(),
      pickup_lat: state.pickupLat ?? undefined,
      pickup_lon: state.pickupLon ?? undefined,
      drop_lat: state.dropLat ?? undefined,
      drop_lon: state.dropLon ?? undefined,
      distance: state.routeDistanceKm ?? undefined,
      estimated_duration: state.routeEtaInterval ?? undefined,
      client_name: state.clientName.trim(),
      client_id: state.clientId,
      client_price: clientPrice,
      supplier_rate: supplierRate,
      supplier_id: state.supplySource === 'aggregate' ? state.supplierId || null : null,
      advance_paid: state.supplySource === 'aggregate' && advancePaid > 0 ? advancePaid : undefined,
      notes: notes || null,
      driver_id: state.supplySource === 'asset' ? state.driverId || null : null,
      vehicle_id: state.supplySource === 'asset' ? state.vehicleId || null : null,
      vehicle_display_number:
        state.supplySource === 'aggregate' && state.aggregateVehicleText.trim()
          ? state.aggregateVehicleText.trim()
          : undefined,
    };
  }, [state]);

  const setters = useMemo(
    () => ({
      setPickupArea,
      setDropLocation,
      setPickupCoords,
      setDropCoords,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSupplierRate,
      setSupplySource,
      setSupplierId,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setAggregateVehicleText,
      clearClientSelection,
    }),
    [
      setPickupArea,
      setDropLocation,
      setPickupCoords,
      setDropCoords,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSupplierRate,
      setSupplySource,
      setSupplierId,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setAggregateVehicleText,
      clearClientSelection,
    ],
  );

  return {
    state,
    setters,
    canSubmit,
    buildPayload,
    getValidationError,
  };
}
