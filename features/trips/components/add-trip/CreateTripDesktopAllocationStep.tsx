import { AlertCircle, Info, ListTodo } from "lucide-react-native";
import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Switch,
  Text,
  View,
} from "react-native";

import { WizardEntitySummaryCard } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import type { ExistingDriverMatch, DriverRow } from "@/features/drivers/services/drivers.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";
import { CreateTripDesktopAggregateFields } from "@/features/trips/components/add-trip/CreateTripDesktopAggregateFields";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { supplierToNumericPartyPreview } from "@/features/suppliers/utils/supplierNumericPartyPreview.util";

import {
  CreateTripDesktopEntityList,
  CreateTripDesktopListSection,
} from "./CreateTripDesktopPickers";
import { entityInitials } from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

type DriverOption = DriverRow & { isBusy: boolean };
type VehicleOption = VehicleRow & { isBusy: boolean };

export type CreateTripDesktopAllocationStepProps = {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  invalid: (field: AddTripIssueField) => boolean;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  fleetLoading: boolean;
  selectedSupplierRow: SupplierRow | null;
  assignLaterSwitchDisabled: boolean;
  assetFleetWarningLines: string[];
  driverPhoneMatches: readonly ExistingDriverMatch[];
  driverPhoneLookupLoading: boolean;
  selectedDriverMatchId: string | null;
  onSelectDriverMatch: (match: ExistingDriverMatch) => void;
  driverListExpanded: boolean;
  vehicleListExpanded: boolean;
  onExpandDriverList: () => void;
  onExpandVehicleList: () => void;
  onSelectDriver: (id: string) => void;
  onSelectVehicle: (id: string) => void;
  onAddDriver?: () => void;
  onAddVehicle?: () => void;
  /** Stack fleet columns + flow lists on mobile. */
  compact?: boolean;
};

export const CreateTripDesktopAllocationStep = memo(function CreateTripDesktopAllocationStep({
  state,
  setters,
  invalid,
  drivers,
  vehicles,
  fleetLoading,
  selectedSupplierRow,
  assignLaterSwitchDisabled,
  assetFleetWarningLines,
  driverPhoneMatches,
  driverPhoneLookupLoading,
  selectedDriverMatchId,
  onSelectDriverMatch,
  driverListExpanded,
  vehicleListExpanded,
  onExpandDriverList,
  onExpandVehicleList,
  onSelectDriver,
  onSelectVehicle,
  onAddDriver,
  onAddVehicle,
  compact = false,
}: CreateTripDesktopAllocationStepProps) {
  const supplyIsAsset = state.supplySource === "asset";

  const driverListItems = useMemo(
    () =>
      drivers.map((driver) => ({
        id: driver.id,
        title: driver.name ?? "Driver",
        subtitle: driver.phone ?? driver.email ?? undefined,
        initials: entityInitials(driver.name ?? "DR"),
        entityType: "driver" as const,
        avatarUrl: driver.avatar_url ?? null,
        avatarSeed: driver.avatar_seed ?? null,
        disabled: driver.isBusy,
        statusLabel: driver.isBusy ? "On trip" : "Available",
        statusTone: driver.isBusy ? ("busy" as const) : ("available" as const),
      })),
    [drivers],
  );

  const vehicleListItems = useMemo(
    () =>
      vehicles.map((vehicle) => {
        const tag =
          formatIndianVehicleNumber(vehicle.vehicle_number || "") ||
          vehicle.vehicle_number ||
          "Vehicle";
        const type = vehicle.vehicle_body_type || vehicle.vehicle_type || "—";
        return {
          id: vehicle.id,
          title: tag,
          subtitle: type,
          initials: tag.slice(0, 2).toUpperCase(),
          entityType: "vehicle" as const,
          disabled: vehicle.isBusy,
          statusLabel: vehicle.isBusy ? "On trip" : "Available",
          statusTone: vehicle.isBusy ? ("busy" as const) : ("available" as const),
        };
      }),
    [vehicles],
  );

  const partnerPreview = useMemo(
    () =>
      !supplyIsAsset && selectedSupplierRow
        ? supplierToNumericPartyPreview(selectedSupplierRow)
        : null,
    [selectedSupplierRow, supplyIsAsset],
  );

  return (
    <View style={[s.allocationStepBody, compact && s.compactAllocationStepBody]}>
      <View style={[s.allocDesktopToolbar, compact && s.compactAllocToolbar]}>
        {partnerPreview ? (
          compact ? (
            <View style={s.allocPartnerNameChip}>
              <Text style={s.allocPartnerNameChipLabel}>Partner</Text>
              <Text style={s.allocPartnerNameChipValue} numberOfLines={1}>
                {partnerPreview.name}
              </Text>
            </View>
          ) : (
            <View style={s.allocToolbarPartnerCard}>
              <WizardEntitySummaryCard
                label="Partner"
                name={partnerPreview.name}
                subtitle={partnerPreview.subtitle || "integrated"}
                entityType="supplier"
                avatarUrl={partnerPreview.avatarUrl ?? null}
                avatarSeed={partnerPreview.avatarSeed ?? null}
                organizationImageUrl={partnerPreview.organizationImageUrl ?? null}
                organizationAvatarSeed={partnerPreview.organizationAvatarSeed ?? null}
                style={s.allocToolbarPartnerCardInner}
                showChevron={false}
              />
            </View>
          )
        ) : (
          <View style={s.sourceSummaryChip}>
            <Text style={s.sourceSummaryChipLabel}>Source</Text>
            <Text style={s.sourceSummaryChipValue}>
              {supplyIsAsset ? "Asset fleet" : "Aggregate"}
            </Text>
          </View>
        )}

        <View style={[s.inputBoxClean, s.allocAssignLaterBox, compact && s.compactAssignLaterBox]}>
          <ListTodo size={16} color={Theme.textRouteCard} strokeWidth={2} />
          <View style={s.allocAssignLaterCopy}>
            <Text style={s.allocAssignLaterTitle}>Assign later</Text>
            <Text style={s.allocAssignLaterSub}>
              Pick vehicle & driver on trip detail
            </Text>
          </View>
          <Switch
            value={state.assignLater}
            onValueChange={setters.setAssignLater}
            disabled={assignLaterSwitchDisabled}
            trackColor={{ false: Theme.borderLight, true: Theme.textPrimaryDark }}
            thumbColor={Theme.cardWhite}
          />
        </View>
      </View>

      {assignLaterSwitchDisabled ? (
        <Text style={s.allocAssignLaterHint}>
          Remove driver or vehicle assignment to enable assign later.
        </Text>
      ) : null}

      {state.assignLater ? (
        <View style={s.allocAssignLaterBanner}>
          <Info size={18} color={Theme.warning} strokeWidth={2.5} />
          <Text style={s.allocAssignLaterBannerText}>
            You have enabled{" "}
            <Text style={s.allocAssignLaterBannerStrong}>Assign Later</Text>. Driver and
            vehicle can be linked anytime after trip creation.
          </Text>
        </View>
      ) : null}

      {!state.assignLater && supplyIsAsset ? (
        <View style={s.allocationFleetPanel}>
          {assetFleetWarningLines.length > 0 ? (
            <View style={s.allocationWarnCompact}>
              <AlertCircle size={14} color={Theme.warning} strokeWidth={2.5} />
              <Text style={s.allocationWarnCompactText}>
                {assetFleetWarningLines[0]}
              </Text>
            </View>
          ) : null}

          {fleetLoading ? (
            <ActivityIndicator color={Theme.iconPrimary} style={{ marginVertical: 24 }} />
          ) : (
            <View style={compact ? s.compactStack : s.allocationColumns}>
              <CreateTripDesktopListSection
                heading="Select driver"
                count={drivers.length}
                onAddPress={onAddDriver}
                addAccessibilityLabel="Add driver"
              >
                <CreateTripDesktopEntityList
                  items={driverListItems}
                  selectedId={state.driverId}
                  listExpanded={driverListExpanded}
                  onExpandList={onExpandDriverList}
                  onSelect={onSelectDriver}
                  scrollMaxHeight={compact ? undefined : 280}
                  compact={compact}
                />
              </CreateTripDesktopListSection>

              <CreateTripDesktopListSection
                heading="Select vehicle"
                count={vehicles.length}
                onAddPress={onAddVehicle}
                addAccessibilityLabel="Add vehicle"
              >
                <CreateTripDesktopEntityList
                  items={vehicleListItems}
                  selectedId={state.vehicleId}
                  listExpanded={vehicleListExpanded}
                  onExpandList={onExpandVehicleList}
                  onSelect={onSelectVehicle}
                  scrollMaxHeight={compact ? undefined : 280}
                  compact={compact}
                />
              </CreateTripDesktopListSection>
            </View>
          )}
        </View>
      ) : null}

      {!state.assignLater && !supplyIsAsset ? (
        <View style={s.allocationAggregatePanel}>
          <CreateTripDesktopAggregateFields
            compact={compact}
            partnerRate={state.supplierRate}
            onPartnerRateChange={(v) => setters.setSupplierRate(v)}
            advancePaid={state.advancePaid}
            onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
            driverCommissionPercent={state.aggregateDriverCommissionPercent}
            onDriverCommissionPercentChange={
              setters.setAggregateDriverCommissionPercent
            }
            partyPreview={
              selectedSupplierRow
                ? supplierToNumericPartyPreview(selectedSupplierRow)
                : undefined
            }
            suppressPartyPreview
            rateError={false}
            advanceError={false}
            driverName={state.aggregateDriverName}
            onDriverNameChange={setters.setAggregateDriverName}
            driverPhone={state.driverPhone}
            onDriverPhoneChange={(v) => setters.setDriverPhone(formatMobileNumber(v))}
            vehicleText={state.aggregateVehicleText}
            onVehicleTextChange={setters.setAggregateVehicleText}
            invalid={invalid}
            driverPhoneMatches={driverPhoneMatches}
            driverPhoneLookupLoading={driverPhoneLookupLoading}
            selectedDriverMatchId={selectedDriverMatchId}
            onSelectDriverMatch={onSelectDriverMatch}
            driverPhoneInTrip={state.driverPhoneTripConflict}
            fleetDrivers={drivers}
            fleetOnly
          />
        </View>
      ) : null}
    </View>
  );
});
