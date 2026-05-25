import Theme from '@/constants/Theme';
import { assignmentShellStyles } from '@/features/trips/styles/assignmentShellShared';
import { useDriverMaster } from '@/features/trips/hooks/useDriverMaster';
import { useVehicleMaster } from '@/features/trips/hooks/useVehicleMaster';
import { useReassignTrip } from '@/features/trips/hooks/useReassignTrip';
import { useReassignMigrationGate } from '@/features/trips/hooks/useReassignMigrationGate';
import { getTripOtpForDisplay } from '@/features/trips/services/tripOtp.service';
import type { TripRow } from '@/features/trips/services/trips.service';
import type { ReassignCompletedMeta } from '@/features/trips/components/reassign/reassign.types';
import { hasReassignChanges, phoneLast10 } from '@/features/trips/utils/reassignChangeDetection.util';
import {
  isTripReassignStaleError,
  tripReassignStaleUserMessage,
} from '@/features/trips/utils/tripReassignConflict.util';
import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from '@/lib/hooks/useKeyboardVisible';
import { validatePhone } from '@/lib/phoneValidation';
import { formatIndianVehicleNumber } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DriverReassignSection,
  type DriverReassignMode,
} from './DriverReassignSection';
import {
  VehicleReassignSection,
  type VehicleReassignMode,
} from './VehicleReassignSection';
import { reassignStyles as s } from './reassign.styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId: string;
  isAggregate: boolean;
  canAssign: boolean;
  currentUserId: string | null;
  driverAssignOrgId: string | null;
  currentDriverName: string | null;
  currentVehicleLabel: string | null;
  onCompleted: (meta?: ReassignCompletedMeta) => void | Promise<void>;
  onReloadTrip: () => void | Promise<void>;
  onVehicleDisplayChange?: (plate: string) => void;
};

type OtpSuccess = { code: string; expires_at: string | null };

export function ReassignSheet({
  visible,
  onClose,
  trip,
  organizationId,
  isAggregate,
  canAssign,
  currentUserId,
  driverAssignOrgId,
  currentDriverName,
  currentVehicleLabel,
  onCompleted,
  onReloadTrip,
  onVehicleDisplayChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const keyboardInset = effectiveKeyboardInset(keyboardVisible, keyboardHeight);
  const { drivers, isLoading: driversLoading, refetch: refetchDrivers } =
    useDriverMaster(organizationId);
  const { vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } =
    useVehicleMaster(organizationId);

  const migrationGateEnabled = visible && isAggregate;
  const {
    migrationBlocked,
    migrationChecking,
    refreshMigrationCheck,
  } = useReassignMigrationGate(migrationGateEnabled);

  const [tripUpdatedAtSnapshot, setTripUpdatedAtSnapshot] = useState<string | null>(
    trip.updated_at ?? null,
  );
  const [driverMode, setDriverMode] = useState<DriverReassignMode>('existing');
  const [vehicleMode, setVehicleMode] = useState<VehicleReassignMode>('existing');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    trip.driver_id ?? null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    trip.vehicle_id ?? null,
  );
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [adHocPlate, setAdHocPlate] = useState(
    formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim(),
  );
  const [busyDriverIds, setBusyDriverIds] = useState<Set<string>>(new Set());
  const [busyVehicleIds, setBusyVehicleIds] = useState<Set<string>>(new Set());
  const [staleConflict, setStaleConflict] = useState(false);

  const {
    saving,
    error,
    setError,
    reassignCombined,
    reassignByPhone,
    retryVehicleOnly,
    loadBusyDriverIds,
    loadBusyVehicleAssignments,
  } = useReassignTrip({
    trip,
    organizationId,
    currentUserId,
    isAggregate,
    driverAssignOrgId,
    expectedUpdatedAt: tripUpdatedAtSnapshot,
  });
  const [partialVehicleFailure, setPartialVehicleFailure] = useState<{
    vehicleError: string;
    pendingVehicleId: string | null;
  } | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<OtpSuccess | null>(null);
  const otpDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentDriverPhone = useMemo(() => {
    const d = drivers.find((x) => x.id === trip.driver_id);
    return d?.phone ?? null;
  }, [drivers, trip.driver_id]);

  const sheetOpenGenRef = useRef(0);

  useEffect(() => {
    if (!visible) return;

    const openGen = ++sheetOpenGenRef.current;
    setDriverMode('existing');
    setVehicleMode('existing');
    setSelectedDriverId(trip.driver_id ?? null);
    setSelectedVehicleId(trip.vehicle_id ?? null);
    setPhone('');
    setPhoneBusy(false);
    setAdHocPlate(formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim());
    setError(null);
    setPartialVehicleFailure(null);
    setOtpSuccess(null);
    setStaleConflict(false);
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);

    void loadBusyDriverIds().then((ids) => {
      if (sheetOpenGenRef.current === openGen) setBusyDriverIds(ids);
    });
    void loadBusyVehicleAssignments().then(({ busyVehicleIds: busy }) => {
      if (sheetOpenGenRef.current === openGen) setBusyVehicleIds(busy);
    });
    void refetchDrivers();
    void refetchVehicles();
    if (isAggregate) void refreshMigrationCheck(false);
  }, [visible, trip.id]);

  /** Sync snapshot/selection when parent reloads trip after partial save — no fleet refetch storm. */
  useEffect(() => {
    if (!visible) return;
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);
    setSelectedDriverId(trip.driver_id ?? null);
    setSelectedVehicleId(trip.vehicle_id ?? null);
  }, [visible, trip.id, trip.updated_at, trip.driver_id, trip.vehicle_id]);

  useEffect(() => {
    return () => {
      if (otpDismissTimerRef.current) clearTimeout(otpDismissTimerRef.current);
    };
  }, []);

  const handleSelectVehicleId = useCallback((id: string | null) => {
    setSelectedVehicleId(id);
    if (id) setAdHocPlate('');
  }, []);

  const driverModeIsPhone = driverMode === 'phone';

  const hasChanges = useMemo(
    () =>
      hasReassignChanges({
        trip,
        driverModeIsPhone,
        phone,
        currentDriverPhone,
        selectedDriverId,
        selectedVehicleId,
        adHocPlate,
        isAggregate,
      }),
    [
      trip,
      driverModeIsPhone,
      phone,
      currentDriverPhone,
      selectedDriverId,
      selectedVehicleId,
      adHocPlate,
      isAggregate,
    ],
  );

  const meetsValidation = useMemo(() => {
    if (driverModeIsPhone) {
      const trimmed = phone.trim();
      if (!trimmed || validatePhone(trimmed)) return false;
      if (isAggregate) {
        return !!(selectedVehicleId || adHocPlate.trim());
      }
      return !!selectedVehicleId;
    }
    if (!selectedDriverId) return false;
    if (isAggregate) {
      return !!(selectedVehicleId || adHocPlate.trim());
    }
    return !!selectedVehicleId;
  }, [
    driverModeIsPhone,
    phone,
    isAggregate,
    selectedVehicleId,
    adHocPlate,
    selectedDriverId,
  ]);

  const canConfirm = useMemo(() => {
    if (!canAssign || saving || phoneBusy || otpSuccess) return false;
    if (isAggregate && migrationBlocked) return false;
    if (isAggregate && migrationChecking) return false;
    return hasChanges && meetsValidation;
  }, [
    canAssign,
    saving,
    phoneBusy,
    otpSuccess,
    isAggregate,
    migrationBlocked,
    migrationChecking,
    hasChanges,
    meetsValidation,
  ]);

  const buildCompletedMeta = useCallback((): ReassignCompletedMeta => {
    const driverIdChanged = driverModeIsPhone
      ? phone.trim().length > 0 &&
        phoneLast10(phone) !== phoneLast10(currentDriverPhone ?? '')
      : (selectedDriverId ?? null) !== (trip.driver_id ?? null);
    return { driverIdChanged };
  }, [
    driverModeIsPhone,
    phone,
    currentDriverPhone,
    selectedDriverId,
    trip.driver_id,
  ]);

  const handleReloadTrip = useCallback(async () => {
    setStaleConflict(false);
    setError(null);
    setPartialVehicleFailure(null);
    await onReloadTrip();
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);
    setSelectedDriverId(trip.driver_id ?? null);
    setSelectedVehicleId(trip.vehicle_id ?? null);
    setAdHocPlate(formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim());
  }, [onReloadTrip, trip, setError]);

  const scheduleOtpDismiss = useCallback(() => {
    if (otpDismissTimerRef.current) clearTimeout(otpDismissTimerRef.current);
    otpDismissTimerRef.current = setTimeout(() => {
      otpDismissTimerRef.current = null;
      onClose();
    }, 3000);
  }, [onClose]);

  const finishWithOtpReveal = useCallback(
    async (showOtpForAggregatePhone: boolean) => {
      await onCompleted(buildCompletedMeta());
      if (showOtpForAggregatePhone && isAggregate && driverModeIsPhone) {
        const { code, expires_at, error: otpErr } = await getTripOtpForDisplay(trip.id);
        if (code && !otpErr) {
          setOtpSuccess({ code, expires_at });
          scheduleOtpDismiss();
          return;
        }
      }
      onClose();
    },
    [
      onCompleted,
      isAggregate,
      driverModeIsPhone,
      trip.id,
      onClose,
      scheduleOtpDismiss,
      buildCompletedMeta,
    ],
  );

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setError(null);
    setPartialVehicleFailure(null);
    setStaleConflict(false);

    if (driverModeIsPhone) {
      const trimmedPhone = phone.trim();
      const plate = formatIndianVehicleNumber(adHocPlate).trim();
      const result = await reassignByPhone({
        phone: trimmedPhone,
        vehicleId: selectedVehicleId,
        vehicleDisplayNumber: plate || null,
      });
      if (result.staleConflict) {
        setStaleConflict(true);
        return;
      }
      if (result.driverUpdatedVehicleFailed) {
        await onCompleted(buildCompletedMeta());
        setPartialVehicleFailure({
          vehicleError: result.vehicleError ?? 'Vehicle update failed.',
          pendingVehicleId: selectedVehicleId,
        });
        return;
      }
      if (!result.ok) {
        if (result.staleConflict) setStaleConflict(true);
        return;
      }
      if (plate) onVehicleDisplayChange?.(plate);
      await finishWithOtpReveal(true);
      return;
    }

    if (selectedDriverId) {
      const plate =
        isAggregate && !selectedVehicleId
          ? formatIndianVehicleNumber(adHocPlate).trim()
          : '';
      const { ok, staleConflict: stale } = await reassignCombined({
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId,
        vehicleDisplayNumber: plate || undefined,
      });
      if (stale) {
        setStaleConflict(true);
        return;
      }
      if (!ok) return;
      if (plate) onVehicleDisplayChange?.(plate);
      await finishWithOtpReveal(false);
    }
  }, [
    canConfirm,
    driverModeIsPhone,
    phone,
    adHocPlate,
    selectedVehicleId,
    selectedDriverId,
    reassignByPhone,
    reassignCombined,
    isAggregate,
    onVehicleDisplayChange,
    onCompleted,
    finishWithOtpReveal,
    setError,
    buildCompletedMeta,
  ]);

  useEffect(() => {
    if (error && isTripReassignStaleError(error)) {
      setStaleConflict(true);
    }
  }, [error]);

  const handleRetryVehicle = useCallback(async () => {
    const vehicleId = partialVehicleFailure?.pendingVehicleId ?? selectedVehicleId;
    if (!vehicleId) return;
    setError(null);
    const { ok, staleConflict: stale } = await retryVehicleOnly(vehicleId);
    if (stale) {
      setStaleConflict(true);
      return;
    }
    if (!ok) return;
    setPartialVehicleFailure(null);
    await finishWithOtpReveal(isAggregate && driverModeIsPhone);
  }, [
    partialVehicleFailure,
    selectedVehicleId,
    retryVehicleOnly,
    finishWithOtpReveal,
    isAggregate,
    driverModeIsPhone,
    setError,
  ]);

  const summaryDriver = useMemo(() => {
    if (driverModeIsPhone) return phone.trim() || '—';
    const d = drivers.find((x) => x.id === selectedDriverId);
    return d?.name ?? currentDriverName ?? '—';
  }, [
    driverModeIsPhone,
    phone,
    drivers,
    selectedDriverId,
    currentDriverName,
  ]);

  const summaryVehicle = useMemo(() => {
    const v = vehicles.find((x) => x.id === selectedVehicleId);
    if (v) return formatIndianVehicleNumber(v.vehicle_number ?? '') || '—';
    const plate = formatIndianVehicleNumber(adHocPlate).trim();
    if (plate) return plate;
    return currentVehicleLabel ?? '—';
  }, [vehicles, selectedVehicleId, adHocPlate, currentVehicleLabel]);

  if (!canAssign) return null;

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
      presentationStyle={Platform.OS === 'web' ? 'overFullScreen' : 'pageSheet'}
      transparent={Platform.OS === 'web'}
      onRequestClose={onClose}
    >
      <View style={assignmentShellStyles.webModalBackdrop}>
        <KeyboardAvoidingView
          style={{ flex: Platform.OS === 'web' ? 0 : 1, maxHeight: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={insets.top}
        >
        <View
          style={[
            assignmentShellStyles.assignModalWrapSlate,
            { paddingTop: insets.top, flex: Platform.OS === 'web' ? 0 : 1 },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              backgroundColor: Theme.cardWhite,
              borderBottomWidth: 1,
              borderBottomColor: Theme.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: Theme.textPrimary,
                }}
              >
                Reassign trip
              </Text>
              <Text style={{ fontSize: 13, color: Theme.textSecondary, marginTop: 2 }}>
                Pick driver and vehicle — trip stage stays the same.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.85}>
              <FontAwesome name="times" size={18} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>

          {otpSuccess ? (
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <View style={s.otpSuccessCard}>
                <FontAwesome name="check-circle" size={36} color={Theme.primary} />
                <Text style={s.otpSuccessTitle}>Driver reassigned</Text>
                <Text style={[s.otpSuccessHint, { marginBottom: 4 }]}>
                  Share this verification code with the driver:
                </Text>
                <Text style={s.otpSuccessCode}>{otpSuccess.code}</Text>
                {otpSuccess.expires_at ? (
                  <Text style={s.otpSuccessHint}>
                    Expires{' '}
                    {new Date(otpSuccess.expires_at).toLocaleString('en-IN')}
                  </Text>
                ) : null}
                <Text style={s.otpSuccessHint}>
                  The driver enters this code in the app to claim the trip.
                </Text>
                <TouchableOpacity
                  style={s.otpDismissBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={s.otpDismissText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  padding: 16,
                  paddingBottom: 24 + insets.bottom,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {isAggregate && migrationChecking ? (
                  <View style={s.warningBanner}>
                    <ActivityIndicator color={Theme.primary} />
                    <Text style={[s.warningBannerText, { marginTop: 8 }]}>
                      Checking database migration for safe reassignment…
                    </Text>
                  </View>
                ) : null}

                {isAggregate && migrationBlocked ? (
                  <View style={s.warningBanner}>
                    <Text style={s.warningBannerText}>
                      Reassignment is temporarily unavailable: database migration{' '}
                      20260805140000 (preserve trip status on reassign) is not applied on
                      this environment. Ask your admin to run db push, then try again.
                    </Text>
                  </View>
                ) : null}

                {staleConflict ? (
                  <View style={s.partialBanner}>
                    <Text style={s.partialBannerText}>
                      {tripReassignStaleUserMessage(error)}
                    </Text>
                    <TouchableOpacity
                      style={s.retryBtn}
                      onPress={() => void handleReloadTrip()}
                      activeOpacity={0.9}
                    >
                      <Text style={s.retryBtnText}>Reload</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {partialVehicleFailure ? (
                  <View style={s.partialBanner}>
                    <Text style={s.partialBannerText}>
                      Driver updated. Vehicle update failed — retry?
                    </Text>
                    {partialVehicleFailure.vehicleError ? (
                      <Text style={s.inlineError}>{partialVehicleFailure.vehicleError}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={s.retryBtn}
                      onPress={() => void handleRetryVehicle()}
                      disabled={saving}
                      activeOpacity={0.9}
                    >
                      {saving ? (
                        <ActivityIndicator color={Theme.textOnPrimary} size="small" />
                      ) : (
                        <Text style={s.retryBtnText}>Retry vehicle assignment</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                <DriverReassignSection
                  organizationId={organizationId}
                  driverAssignOrgId={driverAssignOrgId}
                  tripId={trip.id}
                  isAggregate={isAggregate}
                  currentDriverId={trip.driver_id ?? null}
                  currentDriverName={currentDriverName}
                  drivers={drivers}
                  driversLoading={driversLoading}
                  busyDriverIds={busyDriverIds}
                  mode={driverMode}
                  onModeChange={setDriverMode}
                  selectedDriverId={selectedDriverId}
                  onSelectDriverId={setSelectedDriverId}
                  phone={phone}
                  onPhoneChange={setPhone}
                  phoneBusy={phoneBusy}
                  onPhoneBusyChange={setPhoneBusy}
                />

                <VehicleReassignSection
                  organizationId={organizationId}
                  isAggregate={isAggregate}
                  driverModeIsPhone={driverModeIsPhone}
                  currentVehicleId={trip.vehicle_id ?? null}
                  currentVehicleLabel={currentVehicleLabel}
                  vehicles={vehicles}
                  vehiclesLoading={vehiclesLoading}
                  busyVehicleIds={busyVehicleIds}
                  mode={vehicleMode}
                  onModeChange={setVehicleMode}
                  selectedVehicleId={selectedVehicleId}
                  onSelectVehicleId={handleSelectVehicleId}
                  adHocPlate={adHocPlate}
                  onAdHocPlateChange={setAdHocPlate}
                />

                {error ? <Text style={s.inlineError}>{error}</Text> : null}
                {!hasChanges && meetsValidation ? (
                  <Text style={[s.rowSub, { marginTop: 8 }]}>
                    Change driver, vehicle, or phone to confirm reassignment.
                  </Text>
                ) : null}
              </ScrollView>

              <View
                style={[
                  s.footer,
                  {
                    paddingBottom: Math.max(16, insets.bottom) + keyboardInset,
                  },
                ]}
              >
                <Text style={s.footerSummary}>
                  <Text style={s.footerSummaryStrong}>{summaryDriver}</Text>
                  {' · '}
                  <Text style={s.footerSummaryStrong}>{summaryVehicle}</Text>
                </Text>
                <TouchableOpacity
                  style={[s.confirmBtn, !canConfirm && s.confirmBtnDisabled]}
                  onPress={() => void handleConfirm()}
                  disabled={!canConfirm}
                  activeOpacity={0.9}
                >
                  {saving ? (
                    <ActivityIndicator color={Theme.textOnPrimary} />
                  ) : (
                    <Text style={s.confirmBtnText}>
                      {driverModeIsPhone ? 'Assign by phone' : 'Confirm reassignment'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
