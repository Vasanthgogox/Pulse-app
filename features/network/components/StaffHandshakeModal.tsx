/**
 * StaffHandshakeModal — Staff Handshake / Deploy modal.
 * Extracted from LoadCenterView.tsx.
 * Renders Asset roster (driver+vehicle from org) and Aggregate (OTP for partner driver) flows.
 */
import Theme from "@/constants/Theme";
import { type StaffHandshakeResult } from "@/features/network/hooks/useStaffHandshake";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";
import { DriverRow } from "@/features/drivers/services/drivers.service";
import { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  assignmentShellColors,
  assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { formatMobileNumber } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { IndianVehicleRegistrationInput } from "@/components/indianVehicle/IndianVehicleRegistrationInput";
import { AssignmentEntityAvatarGrid } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import {
  driverOptionsToAvatarGridItems,
  vehicleOptionsToAvatarGridItems,
  type FleetDriverOption,
  type FleetVehicleOption,
} from "@/features/trips/utils/fleetAvatarGridItems.util";
import { AssignmentEntityPicker } from "@/features/trips/components/AssignmentEntityPicker";
import { suppliersToAvatarGridItems } from "@/features/suppliers/utils/supplierAvatarGridItems.util";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { useMemo, useRef } from "react";
import { useFleetAssignmentAvailability } from "@/features/trips/hooks/useFleetAssignmentAvailability";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ASSET_FLOW_STEPS = [
  { id: "driver", label: "Driver" },
  { id: "vehicle", label: "Vehicle" },
] as const;

type AssetFlowStep = (typeof ASSET_FLOW_STEPS)[number]["id"];

type AssetRosterPickersProps = {
  isFlow: boolean;
  assetFlowStep: AssetFlowStep;
  width: number;
  orgId: string | null;
  activeDrivers: DriverRow[];
  vehicles: VehicleRow[];
  assignDriverId: string | null;
  assignVehicleId: string | null | undefined;
  set: StaffHandshakeResult["set"];
  onNavigateAddDriver: () => void;
  onNavigateAddVehicle: () => void;
};

export function AssetRosterPickers({
  isFlow,
  assetFlowStep,
  width,
  orgId,
  activeDrivers,
  vehicles,
  assignDriverId,
  assignVehicleId,
  set,
  onNavigateAddDriver,
  onNavigateAddVehicle,
}: AssetRosterPickersProps) {
  const selectedDriver = activeDrivers.find((d) => String(d.id) === assignDriverId);
  const selectedVehicle =
    typeof assignVehicleId === "string"
      ? vehicles.find((v) => String(v.id) === assignVehicleId)
      : null;

  const showDriver = !isFlow || assetFlowStep === "driver";
  const showVehicle = !isFlow || assetFlowStep === "vehicle";

  const driverDisplay =
    selectedDriver?.name ?? selectedDriver?.phone ?? "Not selected";
  const vehicleDisplay = selectedVehicle?.vehicle_number ?? "Not selected";

  const fleetAvailability = useFleetAssignmentAvailability(orgId, {
    selectedDriverId: assignDriverId,
    selectedVehicleId: assignVehicleId,
    onClearDriver: () => set.assignDriverId(null),
    onClearVehicle: () => set.assignVehicleId(undefined),
  });

  const { driverIdsOnActiveTrip, vehicleIdsOnActiveTrip, isDriverBusy, isVehicleBusy } =
    fleetAvailability;

  const driverPickerItems = useMemo(() => {
    const options: FleetDriverOption[] = activeDrivers.map((d) => ({
      ...d,
      isBusy: isDriverBusy(String(d.id)),
    }));
    return driverOptionsToAvatarGridItems(options);
  }, [activeDrivers, isDriverBusy]);

  const vehiclePickerItems = useMemo(() => {
    const options: FleetVehicleOption[] = vehicles.map((v) => ({
      ...v,
      isBusy: isVehicleBusy(String(v.id)),
    }));
    return vehicleOptionsToAvatarGridItems(options);
  }, [vehicles, isVehicleBusy]);

  const hasBusyDrivers = driverIdsOnActiveTrip.length > 0;
  const hasBusyVehicles = vehicleIdsOnActiveTrip.length > 0;

  const driverGridFooterHint =
    showDriver && isFlow
      ? hasBusyDrivers
        ? "Drivers on another trip cannot be selected. Pick an available driver or use Assign later."
        : "Choose an available driver, then continue."
      : undefined;

  const vehicleGridFooterHint =
    showVehicle && isFlow
      ? hasBusyVehicles
        ? "Vehicles on another trip cannot be selected. Pick an available vehicle or use Assign later."
        : "Choose an available fleet vehicle, then continue."
      : undefined;

  return (
    <>
      {showDriver && !isFlow && hasBusyDrivers ? (
        <Text style={styles.fleetBusyBanner}>
          Some drivers are on active trips and cannot be selected.
        </Text>
      ) : null}

      {showDriver ? (
        isFlow ? (
          <AssignmentEntityAvatarGrid
            title="Select Driver"
            variant="wizard"
            embedded
            totalCount={activeDrivers.length}
            selectedId={assignDriverId}
            onSelect={(id) => {
              if (isDriverBusy(id)) return;
              set.assignDriverId(id);
            }}
            items={driverPickerItems}
            emptyMessage="No asset drivers were found in your organization. Add a salaried driver to continue with Asset-based assignment, or use the Aggregate flow from the previous step."
            emptyActionLabel="Add Driver"
            onEmptyAction={onNavigateAddDriver}
            headerActionLabel="Add Driver"
            onHeaderAction={onNavigateAddDriver}
            footerHint={driverGridFooterHint}
          />
        ) : (
          <AssignmentEntityPicker
            title="Select Driver"
            totalCount={activeDrivers.length}
            icon="user"
            selectedId={assignDriverId}
            onSelect={(id) => {
              if (isDriverBusy(id)) return;
              set.assignDriverId(id);
            }}
            items={driverPickerItems.map((d) => ({
              id: d.id,
              title: d.title,
              subtitle: d.subtitle ?? d.statusLabel,
              disabled: d.disabled,
            }))}
            emptyMessage="No asset drivers were found in your organization. Add a salaried driver to continue with Asset-based assignment, or use the Aggregate flow from the previous step."
            emptyActionLabel="Add Driver"
            onEmptyAction={onNavigateAddDriver}
            headerActionLabel="Add Driver"
            onHeaderAction={onNavigateAddDriver}
          />
        )
      ) : null}

      {showVehicle && !isFlow && hasBusyVehicles ? (
        <Text style={styles.fleetBusyBanner}>
          Some vehicles are on active trips and cannot be selected.
        </Text>
      ) : null}

      {showVehicle ? (
        isFlow ? (
          <AssignmentEntityAvatarGrid
            title="Select Vehicle"
            variant="wizard"
            embedded
            totalCount={vehicles.length}
            selectedId={
              typeof assignVehicleId === "string" ? assignVehicleId : null
            }
            onSelect={(id) => {
              if (isVehicleBusy(id)) return;
              set.assignVehicleId(id);
            }}
            items={vehiclePickerItems}
            emptyMessage="No vehicles were found in your fleet. Add an own vehicle to continue with Asset-based assignment."
            emptyActionLabel="Add Vehicle"
            onEmptyAction={onNavigateAddVehicle}
            headerActionLabel="Add Vehicle"
            onHeaderAction={onNavigateAddVehicle}
            footerHint={vehicleGridFooterHint}
          />
        ) : (
          <AssignmentEntityPicker
            title="Select Vehicle"
            totalCount={vehicles.length}
            icon="truck"
            selectedId={
              typeof assignVehicleId === "string" ? assignVehicleId : null
            }
            onSelect={(id) => {
              if (isVehicleBusy(id)) return;
              set.assignVehicleId(id);
            }}
            items={vehiclePickerItems.map((v) => ({
              id: v.id,
              title: v.title,
              subtitle: v.subtitle ?? v.statusLabel,
              disabled: v.disabled,
            }))}
            emptyMessage="No vehicles were found in your fleet. Add an own vehicle to continue with Asset-based assignment."
            emptyActionLabel="Add Vehicle"
            onEmptyAction={onNavigateAddVehicle}
            headerActionLabel="Add Vehicle"
            onHeaderAction={onNavigateAddVehicle}
          />
        )
      ) : null}

      {!isFlow ? (
        <>
          <Text style={assignmentShellStyles.supplyFooterHint}>
            Select a driver and a vehicle from your org to continue.
          </Text>
          <View style={styles.assignSummaryBar}>
            <View style={styles.assignSummaryRow}>
              <View style={styles.assignSummaryBlock}>
                <Text style={styles.assignSummaryLabel}>Selected Driver</Text>
                <Text style={styles.assignSummaryValue}>{driverDisplay}</Text>
              </View>
              <View style={styles.assignSummaryDivider} />
              <View style={styles.assignSummaryBlock}>
                <Text style={styles.assignSummaryLabel}>Selected Vehicle</Text>
                <Text style={styles.assignSummaryValue}>{vehicleDisplay}</Text>
              </View>
            </View>
          </View>
        </>
      ) : null}
    </>
  );
}

interface StaffHandshakeModalProps {
  visible: boolean;
  handshake: StaffHandshakeResult;
  activeDrivers: DriverRow[];
  vehicles: VehicleRow[];
  suppliers: SupplierRow[];
  visiblePartnersForHandshake: SupplierRow[];
  orgId: string | null;
  width: number;
  isCompactModalLayout: boolean;
  insets: { top: number; bottom: number };
  onSuccess: (msg: string) => void;
  onClose?: () => void;
}

export function StaffHandshakeModal({
  visible,
  handshake,
  activeDrivers,
  vehicles,
  visiblePartnersForHandshake,
  orgId,
  width,
  isCompactModalLayout,
  insets,
  onSuccess,
  onClose,
}: StaffHandshakeModalProps) {
  const router = useRouter();
  const { state, set } = handshake;
  const {
    currentLoad,
    isDeploying,
    useAdHocDriver,
    assignDriverId,
    assignVehicleId,
    assignVehicleRegistration,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    aggregatePhoneName,
    aggregatePhoneNotFound,
    aggregatePhoneInTrip,
    subcontractSupplierId,
    subcontractRate,
    aggregateAdvancePaid,
    deployOtpCode,
    deployOtpExpiresAt,
    deployTripIdForOtp,
    staffHandshakeAssignLater,
    rosterReady,
    aggregateTrackingFlowReady,
    aggregatePartnerHandshakeComplete,
  } = state;

  // TextInput refs
  const aggregatePartnerRateInputRef = useRef<TextInput | null>(null);
  const aggregateAdvancePaidInputRef = useRef<TextInput | null>(null);
  const aggregateDriverNameInputRef = useRef<TextInput | null>(null);
  const aggregateDriverPhoneInputRef = useRef<TextInput | null>(null);
  const aggregateVehicleInputRef = useRef<TextInput | null>(null);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === "web" ? "fade" : "slide"}
      presentationStyle={
        Platform.OS === "web" ? "overFullScreen" : "fullScreen"
      }
      transparent={Platform.OS === "web"}
      onRequestClose={() => handshake.backFromOtp()}
    >
      <View
        style={
          Platform.OS === "web"
            ? assignmentShellStyles.webModalBackdrop
            : [styles.assignModalPage, { paddingTop: insets.top }]
        }
      >
        <View
          style={
            Platform.OS === "web"
              ? [
                  assignmentShellStyles.webModalCardWhite,
                  { paddingTop: insets.top },
                  isCompactModalLayout && styles.assignWebModalCardCompact,
                  !useAdHocDriver && {
                    height: "auto",
                    maxHeight: 620,
                    minHeight: 420,
                  },
                ]
              : styles.handshakeNativeInner
          }
        >
          <View style={assignmentShellStyles.modalHero}>
            <View style={assignmentShellStyles.modalHeroText}>
              <Text
                style={[
                  assignmentShellStyles.modalTitle,
                  { fontStyle: "italic", fontWeight: "900" },
                ]}
              >
                Supply & Allocation
              </Text>
              <Text style={assignmentShellStyles.modalSubtitle}>
                Network node selection — roster deploy or OTP for the driver.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handshake.close()}
              hitSlop={12}
              style={assignmentShellStyles.modalCloseBtn}
              accessibilityLabel="Close"
            >
              <FontAwesome
                name="times"
                size={18}
                color={assignmentShellColors.subtitle}
              />
            </TouchableOpacity>
          </View>
          {currentLoad && (
            <View
              style={[styles.assignModalBody, assignmentShellStyles.modalBodyFlex]}
            >
              <ScrollView
                style={styles.assignModalScroll}
                contentContainerStyle={[
                  assignmentShellStyles.bodyScrollContent,
                  {
                    paddingHorizontal: isCompactModalLayout ? 12 : 20,
                    paddingTop: isCompactModalLayout ? 12 : 20,
                    paddingBottom: !deployOtpCode
                      ? 110 + insets.bottom
                      : 24 + insets.bottom,
                  },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {/* OTP result (ad hoc flow completed) */}
                {deployOtpCode ? (
                  <>
                    <Text style={styles.modalHint}>
                      Share this code with the driver to claim the trip.
                    </Text>
                    <View style={styles.otpCard}>
                      <Text style={styles.otpCode}>{deployOtpCode}</Text>
                      {deployOtpExpiresAt ? (
                        <Text style={styles.otpExpiry}>
                          Expires{" "}
                          {new Date(deployOtpExpiresAt).toLocaleString()}
                        </Text>
                      ) : null}
                      <View style={styles.otpActions}>
                        <TouchableOpacity
                          style={styles.otpBtn}
                          onPress={() => {
                            Clipboard.setStringAsync(deployOtpCode).then(() =>
                              onSuccess("Copied"),
                            );
                          }}
                        >
                          <Text style={styles.otpBtnText}>Copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.otpBtn}
                          onPress={() => {
                            Share.share({
                              message: `Claim this trip with code: ${deployOtpCode}`,
                              title: "Trip claim code",
                            }).catch(() => {});
                          }}
                        >
                          <Text style={styles.otpBtnText}>Share</Text>
                        </TouchableOpacity>
                        {deployTripIdForOtp ? (
                          <TouchableOpacity
                            style={styles.otpBtn}
                            onPress={async () => {
                              const { code, expires_at } =
                                await regenerateTripOtp(deployTripIdForOtp);
                              if (code) {
                                set.deployOtpCode(code);
                                set.deployOtpExpiresAt(expires_at ?? null);
                                onSuccess("OTP regenerated");
                              }
                            }}
                          >
                            <Text style={styles.otpBtnText}>Regenerate</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.modalSubmit, styles.handshakeBtnModal]}
                      onPress={() => {
                        const isShipper =
                          currentLoad.organization_id === orgId;
                        handshake.close();
                        if (isShipper)
                          router.push(
                            "/(tabs)/trips" as import("expo-router").Href,
                          );
                      }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.modalSubmitText}>
                        {currentLoad.organization_id === orgId
                          ? "Go to Trips"
                          : "Done"}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <SupplyAllocationModeBar
                      mode={useAdHocDriver ? "aggregate" : "asset"}
                      compact={isCompactModalLayout}
                      assignLater={staffHandshakeAssignLater}
                      onModeChange={(mode) => {
                        if (mode === "aggregate") {
                          set.useAdHocDriver(true);
                          set.assignDriverId(null);
                          set.assignVehicleId(undefined);
                          set.assignVehicleRegistration("");
                          set.aggregateDriverPhone("");
                          set.aggregateDriverTrackingName("");
                          set.subcontractSupplierId(null);
                          set.subcontractRate("");
                          set.aggregateAdvancePaid("");
                          set.aggregateDriverNameManualRef.current = false;
                          set.aggregateDriverTrackingName("");
                          set.aggregatePhoneName(null);
                          set.aggregatePhoneNotFound(false);
                          set.aggregatePhoneInTrip(false);
                        } else {
                          set.useAdHocDriver(false);
                          set.assignVehicleRegistration("");
                          set.aggregateDriverPhone("");
                          set.aggregateDriverTrackingName("");
                          set.subcontractSupplierId(null);
                          set.subcontractRate("");
                          set.aggregateAdvancePaid("");
                          set.aggregateDriverNameManualRef.current = false;
                          set.aggregateDriverTrackingName("");
                          set.aggregatePhoneName(null);
                          set.aggregatePhoneNotFound(false);
                          set.aggregatePhoneInTrip(false);
                        }
                      }}
                      onAssignLaterChange={(v) => {
                        set.staffHandshakeAssignLater(v);
                        if (v) {
                          set.assignDriverId(null);
                          set.assignVehicleId(undefined);
                          set.aggregateDriverPhone("");
                          set.aggregateDriverNameManualRef.current = false;
                          set.aggregateDriverTrackingName("");
                          set.assignVehicleRegistration("");
                        }
                      }}
                    />

                    {!useAdHocDriver ? (
                      staffHandshakeAssignLater ? (
                        <Text style={styles.modalHint}>
                          Assign vehicle and driver on the trip screen before the
                          trip starts.
                        </Text>
                      ) : (
                        <AssetRosterPickers
                          isFlow={false}
                          assetFlowStep="driver"
                          width={width}
                          orgId={orgId}
                          activeDrivers={activeDrivers}
                          vehicles={vehicles}
                          assignDriverId={assignDriverId}
                          assignVehicleId={assignVehicleId}
                          set={set}
                          onNavigateAddDriver={() => {
                            const closeFn = onClose ?? (() => handshake.close());
                            closeFn();
                            setTimeout(
                              () => {
                                router.push(
                                  "/(modals)/add-driver" as import("expo-router").Href,
                                );
                              },
                              Platform.OS === "ios" ? 100 : 0,
                            );
                          }}
                          onNavigateAddVehicle={() => {
                            const closeFn = onClose ?? (() => handshake.close());
                            closeFn();
                            setTimeout(
                              () => {
                                router.push(
                                  "/(modals)/add-vehicle" as import("expo-router").Href,
                                );
                              },
                              Platform.OS === "ios" ? 100 : 0,
                            );
                          }}
                        />
                      )
                    ) : (
                      (() => {
                        const inlinePartners = visiblePartnersForHandshake;
                        const canWideAlign =
                          Platform.OS === "web" ? width >= 1200 : width >= 900;

                        const openAddPartner = () => {
                          handshake.close();
                          setTimeout(
                            () => {
                              router.push(
                                "/(modals)/add-supplier" as import("expo-router").Href,
                              );
                            },
                            Platform.OS === "ios" ? 100 : 0,
                          );
                        };

                        const partnerPane = (
                          <View
                            style={[
                              styles.aggregatePaneCard,
                              canWideAlign && styles.aggregatePaneWide,
                            ]}
                          >
                            <AssignmentEntityAvatarGrid
                              title="Select Transport Partner"
                              totalCount={inlinePartners.length}
                              selectedId={subcontractSupplierId}
                              onSelect={(id) =>
                                set.subcontractSupplierId(
                                  subcontractSupplierId === id ? null : id,
                                )
                              }
                              items={suppliersToAvatarGridItems(inlinePartners)}
                              emptyMessage="No partners yet. Add a transport partner to continue."
                              emptyActionLabel="Add partner"
                              onEmptyAction={openAddPartner}
                              headerActionLabel="Add partner"
                              onHeaderAction={openAddPartner}
                              footerHint="Select a transport partner from your network to continue."
                            />
                          </View>
                        );

                        const rateAndTrackingPane = (
                          <View
                            style={[
                              styles.aggregatePaneCard,
                              canWideAlign && styles.aggregatePaneWide,
                            ]}
                          >
                            <View
                              style={[
                                styles.aggregateGridRow,
                                canWideAlign && styles.aggregateGridRowWide,
                              ]}
                            >
                              <View style={styles.aggregateGridCol}>
                                <Text style={styles.tripAssignRowLabel}>
                                  Partner rate (₹) *
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="0"
                                  placeholderTextColor={Theme.textMuted}
                                  value={subcontractRate}
                                  onChangeText={set.subcontractRate}
                                  ref={aggregatePartnerRateInputRef}
                                  keyboardType="decimal-pad"
                                  returnKeyType="next"
                                  onSubmitEditing={() =>
                                    aggregateAdvancePaidInputRef.current?.focus()
                                  }
                                />
                              </View>
                              <View style={styles.aggregateGridCol}>
                                <Text style={styles.tripAssignRowLabel}>
                                  Advance paid (₹)
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="Optional"
                                  placeholderTextColor={Theme.textMuted}
                                  value={aggregateAdvancePaid}
                                  onChangeText={set.aggregateAdvancePaid}
                                  ref={aggregateAdvancePaidInputRef}
                                  keyboardType="decimal-pad"
                                  returnKeyType={
                                    staffHandshakeAssignLater ? "done" : "next"
                                  }
                                  onSubmitEditing={() => {
                                    if (!staffHandshakeAssignLater) {
                                      aggregateDriverNameInputRef.current?.focus();
                                    }
                                  }}
                                />
                              </View>
                            </View>

                            {!staffHandshakeAssignLater ? (
                              <>
                                <Text style={styles.tripAssignRowLabel}>
                                  Driver Name (Tracking) *
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="e.g. Suresh Kumar"
                                  placeholderTextColor={Theme.textMuted}
                                  value={aggregateDriverTrackingName}
                                  onChangeText={(value) => {
                                    set.aggregateDriverNameManualRef.current = true;
                                    set.aggregateDriverTrackingName(value);
                                  }}
                                  ref={aggregateDriverNameInputRef}
                                  autoCorrect={false}
                                  autoCapitalize="words"
                                  returnKeyType="next"
                                  onSubmitEditing={() =>
                                    aggregateDriverPhoneInputRef.current?.focus()
                                  }
                                />
                                <View
                                  style={[
                                    styles.aggregateGridRow,
                                    canWideAlign && styles.aggregateGridRowWide,
                                  ]}
                                >
                                  <View style={styles.aggregateGridCol}>
                                    <Text
                                      style={[
                                        styles.tripAssignRowLabel,
                                        styles.aggregateInlineFieldLabel,
                                      ]}
                                    >
                                      Driver Phone (Tracking) *
                                    </Text>
                                    <View
                                      style={[
                                        styles.aggregatePhoneInputWrap,
                                        assignmentShellStyles.inputWell,
                                      ]}
                                    >
                                      <Text style={styles.aggregatePhonePrefix}>
                                        🇮🇳 +91
                                      </Text>
                                      <TextInput
                                        style={styles.aggregatePhoneInput}
                                        placeholder="98765 43210"
                                        placeholderTextColor={Theme.textMuted}
                                        value={aggregateDriverPhone}
                                        onChangeText={(t) =>
                                          set.aggregateDriverPhone(
                                            formatMobileNumber(t),
                                          )
                                        }
                                        ref={aggregateDriverPhoneInputRef}
                                        keyboardType="phone-pad"
                                        autoComplete="tel"
                                        returnKeyType="next"
                                        onSubmitEditing={() =>
                                          aggregateVehicleInputRef.current?.focus()
                                        }
                                      />
                                    </View>
                                  </View>
                                  <View style={styles.aggregateGridCol}>
                                    <Text
                                      style={[
                                        styles.tripAssignRowLabel,
                                        styles.aggregateInlineFieldLabel,
                                      ]}
                                    >
                                      Vehicle Number *
                                    </Text>
                                    <IndianVehicleRegistrationInput
                                      variant="compact"
                                      showLabel={false}
                                      value={assignVehicleRegistration}
                                      onChangeText={set.assignVehicleRegistration}
                                      inputRef={aggregateVehicleInputRef}
                                      testID="handshake-vehicle-input"
                                    />
                                  </View>
                                </View>
                                {aggregatePhoneName ? (
                                  <Text style={styles.phoneModalFound}>
                                    Found: {aggregatePhoneName}
                                  </Text>
                                ) : aggregatePhoneNotFound ? (
                                  <Text style={styles.phoneModalNotFound}>
                                    No driver found for this number
                                  </Text>
                                ) : null}
                                {aggregatePhoneName && aggregatePhoneInTrip ? (
                                  <Text style={styles.phoneModalInTrip}>
                                    Driver is in trip
                                  </Text>
                                ) : null}
                              </>
                            ) : null}
                          </View>
                        );

                        return (
                          <>
                            {staffHandshakeAssignLater ? (
                              <Text style={styles.modalHint}>
                                Add vehicle number and driver phone on the trip
                                screen before the trip starts.
                              </Text>
                            ) : null}
                            <View
                              style={assignmentShellStyles.tripAssignSurfaceCard}
                            >
                              <View style={styles.tripAssignCardHeader}>
                                <Text style={styles.tripAssignCardHeaderTitle}>
                                  Current Node
                                </Text>
                                <View
                                  style={[
                                    styles.tripAssignSourceBadge,
                                    styles.tripAssignBadgeUnassigned,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.tripAssignSourceBadgeText,
                                      styles.tripAssignSourceBadgeTextUnassigned,
                                    ]}
                                  >
                                    Unassigned
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.tripAssignPartnerHint}>
                                Associated partner (required). Select your
                                sub-supplier for this trip and enter the rate you
                                will pay.
                              </Text>
                              <ScrollView
                                style={[
                                  styles.currentNodeInnerScroll,
                                  !canWideAlign && styles.currentNodeInnerScrollMobile,
                                  isCompactModalLayout && styles.currentNodeInnerScrollCompact,
                                ]}
                                contentContainerStyle={[
                                  styles.currentNodeInnerScrollContent,
                                  styles.aggregateSplit,
                                  canWideAlign && styles.aggregateSplitWide,
                                ]}
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={!canWideAlign}
                              >
                                {canWideAlign ? (
                                  <>
                                    {partnerPane}
                                    {rateAndTrackingPane}
                                  </>
                                ) : (
                                  <View style={styles.aggregateMobileStack}>
                                    {partnerPane}
                                    {rateAndTrackingPane}
                                  </View>
                                )}
                              </ScrollView>
                            </View>
                          </>
                        );
                      })()
                    )}
                  </>
                )}
              </ScrollView>
              {!deployOtpCode ? (
                <View
                  style={[
                    assignmentShellStyles.modalFooterBar,
                    { paddingBottom: Math.max(16, insets.bottom + 8) },
                  ]}
                >
                  {isDeploying ? (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadingText}>Creating trip…</Text>
                    </View>
                  ) : !useAdHocDriver && staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDeploying}
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => void handshake.deployRoster()}
                    >
                      <FontAwesome
                        name="bolt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Authorize & deploy voyage
                      </Text>
                    </Pressable>
                  ) : !useAdHocDriver &&
                    !staffHandshakeAssignLater &&
                    rosterReady ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDeploying}
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => void handshake.deployRoster()}
                    >
                      <FontAwesome
                        name="bolt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Authorize & deploy voyage
                      </Text>
                    </Pressable>
                  ) : useAdHocDriver && !staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        isDeploying ||
                        !aggregatePartnerHandshakeComplete ||
                        !aggregateTrackingFlowReady ||
                        (aggregateDriverPhone.trim().length > 0 &&
                          aggregatePhoneInTrip)
                      }
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => void handshake.deployAdHoc()}
                    >
                      <FontAwesome
                        name="share-alt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        {aggregateDriverPhone.trim().length > 0 &&
                        aggregatePhoneInTrip
                          ? "Driver on trip"
                          : "Deploy & get OTP"}
                      </Text>
                    </Pressable>
                  ) : useAdHocDriver && staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        isDeploying || !aggregatePartnerHandshakeComplete
                      }
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => void handshake.deployAdHoc()}
                    >
                      <FontAwesome
                        name="share-alt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Create trip & assign later
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.modalHint, { marginBottom: 0 }]}>
                      {!useAdHocDriver
                        ? "Select a driver and a vehicle from your org to continue."
                        : "Enter driver name, driver phone, and vehicle number, or use Assign later."}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  assignModalPage: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
    position: "relative",
  },
  handshakeNativeInner: {
    flex: 1,
    minHeight: 0,
  },
  assignWebModalCardCompact: {
    width: "98%",
    maxWidth: 760,
    borderRadius: 14,
    ...Platform.select({
      web: { height: "92vh", maxHeight: "92vh" } as any,
      default: { maxHeight: "92%" },
    }),
  },
  assignModalBody: {
    flex: 1,
    minHeight: 0,
  },
  assignModalScroll: { flex: 1 },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  modalHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  handshakeBtnModal: { backgroundColor: Theme.textPrimaryDark },
  otpCard: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  otpCode: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 4,
    marginBottom: 8,
  },
  otpExpiry: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 16,
  },
  otpActions: {
    flexDirection: "row",
    gap: 12,
  },
  otpBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 8,
  },
  otpBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  handshakeSegmentSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  handshakeSegmentPill: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  handshakeSegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 11,
  },
  handshakeSegBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: {
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      } as any,
    }),
  },
  handshakeSegBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  handshakeSegBtnTextActive: {
    color: "#ffffff",
  },
  handshakeAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      } as any,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  handshakeAssignLaterOuterCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  handshakeAssignLaterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  handshakeAssignLaterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  handshakeAssignLaterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  handshakeAssignLaterSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 2,
  },
  handshakePrimaryCta: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 12px 24px rgba(15,23,42,0.2)",
        cursor: "pointer",
      } as any,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },
  handshakePrimaryCtaText: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  assignSelectionGrid: {
    gap: 12,
    marginBottom: 14,
  },
  assignSelectionGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  assignPickerCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  assignPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  assignPickerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assignPickerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceLight,
  },
  assignPickerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  assignEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 8,
    gap: 10,
  },
  assignEntityRowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  assignEntityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignEntityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  assignEntityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignEntitySubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  assignEmptyState: {
    marginTop: 2,
    gap: 10,
  },
  assignEmptyActionBtn: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
  },
  assignEmptyActionBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  assignSummaryBar: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  assignSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignSummaryBlock: {
    flex: 1,
    minWidth: 0,
  },
  assignSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  fleetBusyBanner: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.warning,
    lineHeight: 17,
    marginBottom: 8,
  },
  assignSummaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assignSummaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tripAssignCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignCardHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tripAssignSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tripAssignBadgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderInput,
  },
  tripAssignSourceBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tripAssignSourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  tripAssignPartnerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
    marginBottom: 10,
  },
  tripAssignRowLabel: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  aggregateSplit: {
    gap: 12,
  },
  currentNodeInnerScroll: {
    width: "100%",
  },
  currentNodeInnerScrollMobile: {
    maxHeight: 440,
  },
  currentNodeInnerScrollCompact: {
    maxHeight: 380,
  },
  currentNodeInnerScrollContent: {
    paddingBottom: 8,
  },
  aggregateMobileStack: {
    gap: 12,
  },
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregatePaneCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 8,
  },
  aggregatePaneWide: {
    minHeight: 190,
  },
  aggregatePaneHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  aggregatePaneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  aggregatePartnerCard: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aggregatePartnerCardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  aggregatePartnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aggregatePartnerAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
  },
  aggregatePartnerList: {
    gap: 8,
  },
  aggregateViewMoreBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  aggregateViewMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  aggregateGridRow: {
    gap: 12,
  },
  aggregateGridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregateGridCol: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  aggregateInlineFieldLabel: {
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 11,
    marginBottom: 6,
  },
  aggregatePhoneInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aggregatePhonePrefix: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  aggregatePhoneInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  partnerAddBtn: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  partnerAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  assignVehicleInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  phoneModalFound: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  phoneModalNotFound: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.negative,
    marginTop: 4,
  },
  choiceActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
  },
  vehicleIcon: {
    backgroundColor: "#e2e8f0",
  },
});
