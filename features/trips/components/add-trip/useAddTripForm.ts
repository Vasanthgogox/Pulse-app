/**
 * Add Trip — form state, validation, and payload builder.
 * Keeps modal component thin and makes it easy to add steps/fields later.
 * Validation: single O(n) pass over fields.
 */
import { validatePhone } from '@/lib/phoneValidation';
import {
    VALIDATION,
    maxLength,
    nonNegativeAmount,
    positiveAmount,
    required,
    runValidators,
} from '@/lib/validation';
import { getOptimalRoute } from '@/services/routingService';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AddTripFormData, AddTripFormState } from './types';

export type AddTripIssueField =
  | 'pickup'
  | 'drop'
  | 'tripDate'
  | 'tons'
  | 'client'
  | 'clientPrice'
  | 'partner'
  | 'partnerRate'
  | 'vehicleNumber'
  | 'driverName'
  | 'driverPhone'
  | 'driverConfirm'
  | 'advancePaid'
  | 'notes'
  | 'assetDriver'
  | 'assetVehicle';

export interface AddTripValidationIssue {
  field: AddTripIssueField;
  message: string;
}

/** Collects every blocking validation issue (same rules as legacy single-message validation). */
function computeValidationIssues(state: AddTripFormState): AddTripValidationIssue[] {
  const issues: AddTripValidationIssue[] = [];
  const push = (field: AddTripIssueField, message: string) => {
    issues.push({ field, message });
  };

  const errPick = runValidators(state.pickupArea, [required(), maxLength(255)]);
  if (errPick) push('pickup', `Pickup area: ${errPick}`);

  const errDrop = runValidators(state.dropLocation, [required(), maxLength(255)]);
  if (errDrop) push('drop', `Drop location: ${errDrop}`);

  if (state.tripStartDate.trim()) {
    const dateIsoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateIsoRe.test(state.tripStartDate.trim())) {
      push('tripDate', 'Trip start date: use YYYY-MM-DD');
    }
  }

  if (state.tons.trim()) {
    const tonsNum = Number(state.tons);
    if (!Number.isFinite(tonsNum) || tonsNum < 0) {
      push('tons', 'Tons: enter a valid non-negative number');
    }
  }

  const errClient = runValidators(state.clientName, [required(), maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH)]);
  if (errClient) push('client', `Client: ${errClient}`);

  const errPrice = positiveAmount()(state.clientPrice);
  if (errPrice) push('clientPrice', `Client price: ${errPrice}`);

  if (state.supplySource === 'aggregate') {
    if (!state.supplierId) {
      push('partner', 'Select a transport partner');
    }
    const err5 = nonNegativeAmount()(state.supplierRate);
    if (err5) push('partnerRate', `Partner rate: ${err5}`);

    if (!state.assignLater) {
      const vehicleTrimmed = state.aggregateVehicleText.trim();
      if (!vehicleTrimmed) push('vehicleNumber', 'Vehicle: required for aggregate trips');
      const nameTrimmed = state.aggregateDriverName.trim();
      if (!nameTrimmed) push('driverName', 'Driver name: required for aggregate trips');
      else if (nameTrimmed.length < 2) push('driverName', 'Driver name: enter at least 2 characters');
      const driverPhoneTrimmed = state.driverPhone.trim();
      if (!driverPhoneTrimmed) push('driverPhone', 'Driver for tracking: required for aggregate trips');
    }
  }

  if (state.supplySource === 'asset' && !state.assignLater) {
    if (!state.driverId) push('assetDriver', 'Driver: required');
    if (!state.vehicleId) push('assetVehicle', 'Vehicle: required');
  }

  if (state.advancePaid.trim()) {
    const err6 = nonNegativeAmount()(state.advancePaid);
    if (err6) push('advancePaid', `Advance paid: ${err6}`);
  }

  const notesWithVehicle =
    state.supplySource === 'aggregate' && state.aggregateVehicleText.trim()
      ? (state.notes.trim() ? state.notes.trim() + '\n' : '') + 'Vehicle: ' + state.aggregateVehicleText.trim()
      : state.notes;
  const err7 = maxLength(VALIDATION.NOTES_MAX_LENGTH)(notesWithVehicle);
  if (err7) push('notes', `Notes: ${err7}`);

  if (state.supplySource === 'aggregate' && state.driverPhone.trim()) {
    const err8 = validatePhone(state.driverPhone.trim());
    if (err8) push('driverPhone', `Driver for tracking: ${err8}`);
  }

  if (state.supplySource === 'aggregate' && state.driverPhoneTripConflict) {
    const lab = state.driverPhoneTripConflictLabel?.trim();
    const who = state.driverPhoneName?.trim() || 'This driver';
    push(
      'driverPhone',
      lab
        ? `${who} is already on trip ${lab}. Finish or reassign that trip first.`
        : `${who} is already on another trip. Use a different number or complete that trip first.`,
    );
  }

  if (state.supplySource === 'aggregate' && state.driverPhoneAvailabilityError?.trim()) {
    push('driverPhone', `Driver availability check: ${state.driverPhoneAvailabilityError.trim()}`);
  }

  if (
    state.supplySource === 'aggregate' &&
    state.driverPhoneName &&
    !state.driverPhoneConfirmed &&
    !state.driverPhoneTripConflict
  ) {
    push('driverConfirm', `Tap to confirm the driver: ${state.driverPhoneName}`);
  }

  return issues;
}

const initialState: AddTripFormState = {
  pickupArea: '',
  dropLocation: '',
  tripStartDate: '',
  tons: '',
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
  supplierDisplayName: '',
  advancePaid: '',
  assignLater: false,
  notes: '',
  driverId: null,
  vehicleId: null,
  driverPhone: '',
  aggregateDriverName: '',
  driverPhoneName: null,
  driverPhoneConfirmed: false,
  driverPhoneTripConflict: false,
  driverPhoneTripConflictLabel: null,
  driverPhoneAvailabilityError: null,
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
  const setTripStartDate = useCallback((v: string) => setState((s) => ({ ...s, tripStartDate: v })), []);
  const setTons = useCallback((v: string) => setState((s) => ({ ...s, tons: v })), []);
  const setClientName = useCallback((v: string) => setState((s) => ({ ...s, clientName: v, clientId: null })), []);
  const setClientId = useCallback((id: string | null) => setState((s) => ({ ...s, clientId: id })), []);
  const setClientSelection = useCallback((id: string | null, name: string) => setState((s) => ({ ...s, clientId: id, clientName: name })), []);
  const setClientPrice = useCallback((v: string) => setState((s) => ({ ...s, clientPrice: v })), []);
  const setSupplierRate = useCallback((v: string) => setState((s) => ({ ...s, supplierRate: v })), []);
  const setSupplySource = useCallback((v: AddTripFormState['supplySource']) => setState((s) => ({
    ...s,
    supplySource: v,
    supplierId: v === 'aggregate' ? s.supplierId : null,
    supplierDisplayName: v === 'aggregate' ? s.supplierDisplayName : '',
    driverId: v === 'asset' ? s.driverId : null,
    vehicleId: v === 'asset' ? s.vehicleId : null,
    driverPhone: v === 'asset' ? '' : s.driverPhone,
    driverPhoneName: v === 'asset' ? null : s.driverPhoneName,
    driverPhoneConfirmed: v === 'asset' ? false : s.driverPhoneConfirmed,
    driverPhoneTripConflict: v === 'asset' ? false : s.driverPhoneTripConflict,
    driverPhoneTripConflictLabel: v === 'asset' ? null : s.driverPhoneTripConflictLabel,
    driverPhoneAvailabilityError: v === 'asset' ? null : s.driverPhoneAvailabilityError,
    aggregateVehicleText: v === 'asset' ? '' : s.aggregateVehicleText,
  })), []);
  const setSupplierSelection = useCallback(
    (id: string | null, displayName?: string | null) =>
      setState((s) => ({
        ...s,
        supplierId: id,
        supplierDisplayName: id ? String(displayName ?? '').trim() : '',
      })),
    [],
  );
  const setAdvancePaid = useCallback((v: string) => setState((s) => ({ ...s, advancePaid: v })), []);
  const setAssignLater = useCallback((v: boolean) =>
    setState((s) => ({
      ...s,
      assignLater: v,
      ...(v && s.supplySource === 'asset'
        ? { driverId: null as string | null, vehicleId: null as string | null }
        : {}),
      ...(v && s.supplySource === 'aggregate'
        ? {
            driverPhone: '',
            aggregateDriverName: '',
            driverPhoneName: null as string | null,
            driverPhoneConfirmed: false,
            driverPhoneTripConflict: false,
            driverPhoneTripConflictLabel: null as string | null,
            driverPhoneAvailabilityError: null as string | null,
            aggregateVehicleText: '',
          }
        : {}),
    })),
  []);
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
        driverPhoneTripConflict: false,
        driverPhoneTripConflictLabel: null,
        driverPhoneAvailabilityError: null,
      })),
    [],
  );
  const setDriverPhoneTripConflict = useCallback(
    (conflict: boolean, label: string | null) =>
      setState((s) => ({
        ...s,
        driverPhoneTripConflict: conflict,
        driverPhoneTripConflictLabel: label,
      })),
    [],
  );
  const setDriverPhoneAvailabilityError = useCallback(
    (message: string | null) =>
      setState((s) => ({
        ...s,
        driverPhoneAvailabilityError: message,
      })),
    [],
  );
  const setDriverPhoneName = useCallback((v: string | null) => setState((s) => ({ ...s, driverPhoneName: v })), []);
  const setDriverPhoneConfirmed = useCallback((v: boolean) => setState((s) => ({ ...s, driverPhoneConfirmed: v })), []);
  const setAggregateVehicleText = useCallback((v: string) => setState((s) => ({ ...s, aggregateVehicleText: v })), []);
  const setAggregateDriverName = useCallback((v: string) => setState((s) => ({ ...s, aggregateDriverName: v })), []);

  const clearClientSelection = useCallback(() => setState((s) => ({ ...s, clientId: null, clientName: '' })), []);

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

  const validationIssues = useMemo(() => computeValidationIssues(state), [state]);

  /** Single source of truth with field-level validation (see `computeValidationIssues`). */
  const canSubmit = validationIssues.length === 0;

  /** First blocking message (footer / alerts); full list is `validationIssues`. */
  const getValidationError = useCallback((): string | null => {
    return validationIssues[0]?.message ?? null;
  }, [validationIssues]);

  const buildPayload = useCallback((): AddTripFormData => {
    const parseAmount = (raw: string) => {
      const n = parseFloat(String(raw ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const clientPrice = parseAmount(state.clientPrice);
    // Asset: no partner; use 0. Aggregate: validated above.
    const supplierRate = state.supplySource === 'asset' ? 0 : parseAmount(state.supplierRate);
    const advancePaid = parseAmount(state.advancePaid);
    let notes = state.notes.trim();
    if (state.tons.trim()) {
      notes = (notes ? notes + '\n' : '') + `Load: ${state.tons.trim()} Tons`;
    }
    if (state.supplySource === 'aggregate' && state.aggregateDriverName.trim()) {
      notes =
        (notes ? notes + '\n' : '') +
        'Driver name (tracking): ' +
        state.aggregateDriverName.trim();
    }
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
      pickup_date: state.tripStartDate.trim() || null,
      distance: state.routeDistanceKm ?? undefined,
      estimated_duration: state.routeEtaInterval ?? undefined,
      client_name: state.clientName.trim(),
      client_id: state.clientId,
      client_price: clientPrice,
      supplier_rate: supplierRate,
      supplier_id: state.supplySource === 'aggregate' ? state.supplierId || null : null,
      supplier_name:
        state.supplySource === 'aggregate' && state.supplierId
          ? state.supplierDisplayName.trim() || null
          : null,
      advance_paid: state.supplySource === 'aggregate' && advancePaid > 0 ? advancePaid : undefined,
      notes: notes || null,
      driver_id:
        state.supplySource === 'asset' && !state.assignLater
          ? state.driverId || null
          : null,
      vehicle_id:
        state.supplySource === 'asset' && !state.assignLater
          ? state.vehicleId || null
          : null,
      vehicle_display_number:
        state.supplySource === 'aggregate' && state.aggregateVehicleText.trim()
          ? state.aggregateVehicleText.trim()
          : undefined,
      tons: state.tons.trim() || null,
    };
  }, [state]);

  const setters = useMemo(
    () => ({
      setPickupArea,
      setDropLocation,
      setPickupCoords,
      setDropCoords,
      setTripStartDate,
      setTons,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSupplierRate,
      setSupplySource,
      setSupplierSelection,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setDriverPhoneTripConflict,
      setDriverPhoneAvailabilityError,
      setAggregateVehicleText,
      setAggregateDriverName,
      clearClientSelection,
    }),
    [
      setPickupArea,
      setDropLocation,
      setPickupCoords,
      setDropCoords,
      setTripStartDate,
      setTons,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSupplierRate,
      setSupplySource,
      setSupplierSelection,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setDriverPhoneTripConflict,
      setDriverPhoneAvailabilityError,
      setAggregateVehicleText,
      setAggregateDriverName,
      clearClientSelection,
    ],
  );

  return {
    state,
    setters,
    canSubmit,
    buildPayload,
    getValidationError,
    validationIssues,
  };
}
