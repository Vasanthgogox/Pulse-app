import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { ListTodo } from "lucide-react-native";

import {
  fullPageWizardStyles,
  WizardPriorSelections,
  type WizardPriorSelectionItem,
} from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { getClientById } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { AddTripSourceIndent } from "@/features/trips/components/add-trip/types";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { AddTripValidationIssue } from "@/features/trips/components/add-trip/useAddTripForm";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AddTripWizardStep } from "@/features/trips/components/add-trip/addTripWizardSteps";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AllocationSubStep } from "@/features/trips/components/add-trip/allocationWizardSteps";
import { formatMobileNumber } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useClientWarehousesQuery } from "@/lib/queries/useClientWarehousesQuery";
import { useClientLaneRatesQuery } from "@/lib/queries/useClientLaneRatesQuery";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useLinkedClientOrgLocationsQuery } from "@/lib/queries/useLinkedClientOrgLocationsQuery";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import {
  buildClientLanePrefill,
  repriceLaneForTons,
} from "@/features/clients/utils/clientLanePrefill.util";

import { AggregateTrackingMobileStep } from "./AggregateTrackingMobileStep";
import { CreateTripDesktopAllocationStep } from "./CreateTripDesktopAllocationStep";
import { CreateTripDesktopAsideArt } from "./CreateTripDesktopAsideArt";
import { CreateTripDesktopClientStep } from "./CreateTripDesktopClientStep";
import { CreateTripDesktopCommodityStep } from "./CreateTripDesktopCommodityStep";
import { CreateTripDesktopRouteStep } from "./CreateTripDesktopRouteStep";
import { CreateTripDesktopSourceStep } from "./CreateTripDesktopSourceStep";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import {
  buildPickupRecommendations,
  preferredPickupRecommendation,
} from "./pickupRecommendations.util";
import type { PickupRecommendation } from "./pickupRecommendations.util";
import { useAddTripFleetResources } from "./useAddTripFleetResources";

const STEP_FADE_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export type CreateTripDesktopWizardProps = {
  wizardStep: AddTripWizardStep;
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  clients: ClientRow[];
  clientsLoading: boolean;
  organizationId: string | null;
  validationIssues: readonly AddTripValidationIssue[];
  sourceIndent?: AddTripSourceIndent | null;
  /** Mobile full-page wizard — same steps as desktop, no side rail. */
  layout?: "desktop" | "mobile";
  /** Mobile aggregate fleet entry — party-style keypad sub-step. */
  allocationSubStep?: AllocationSubStep;
  /** Jump back within phone → name → vehicle (summary chip taps). */
  onAllocationSubStepChange?: (step: AllocationSubStep) => void;
  /** True while client step is on the contract/adhoc lane gate. */
  onLaneGateActiveChange?: (active: boolean) => void;
  /** True when a contract lane is selected (route step becomes date-first). */
  onContractLaneLockedChange?: (locked: boolean) => void;
  /** Navigate back to the client / lane-gate step (Change lane on route). */
  onRequestChangeLane?: () => void;
};

export function CreateTripDesktopWizard({
  wizardStep,
  state,
  setters,
  clients,
  clientsLoading,
  organizationId,
  validationIssues,
  sourceIndent = null,
  layout = "desktop",
  allocationSubStep,
  onAllocationSubStepChange,
  onLaneGateActiveChange,
  onContractLaneLockedChange,
  onRequestChangeLane,
}: CreateTripDesktopWizardProps) {
  const isMobileLayout = layout === "mobile";
  const router = useRouter();
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);

  const [clientListExpanded, setClientListExpanded] = useState(() => !state.clientId);
  const [driverListExpanded, setDriverListExpanded] = useState(() => !state.driverId);
  const [vehicleListExpanded, setVehicleListExpanded] = useState(() => !state.vehicleId);
  const [partnerListExpanded, setPartnerListExpanded] = useState(() => !state.supplierId);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [laneSearch, setLaneSearch] = useState("");
  const debouncedLaneSearch = useDebouncedValue(laneSearch, 250);

  useEffect(() => {
    if (!state.clientId) setClientListExpanded(true);
  }, [state.clientId]);
  useEffect(() => {
    if (!state.driverId) setDriverListExpanded(true);
  }, [state.driverId]);
  useEffect(() => {
    if (!state.vehicleId) setVehicleListExpanded(true);
  }, [state.vehicleId]);
  useEffect(() => {
    if (!state.supplierId) setPartnerListExpanded(true);
  }, [state.supplierId]);

  const invalidSet = useMemo(
    () => new Set(validationIssues.map((i) => i.field)),
    [validationIssues],
  );
  const invalid = useCallback(
    (field: AddTripIssueField) => invalidSet.has(field),
    [invalidSet],
  );

  const fleet = useAddTripFleetResources(organizationId, state, setters);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === state.clientId) ?? null,
    [clients, state.clientId],
  );
  const { data: clientDetail } = useQuery({
    queryKey: queryKeys.clients.detail(organizationId ?? "", state.clientId ?? ""),
    enabled: Boolean(organizationId && state.clientId),
    queryFn: async () => {
      const { client } = await getClientById(organizationId!, state.clientId!);
      return client;
    },
    staleTime: 60_000,
  });
  const clientForPickup = clientDetail ?? selectedClient;
  const isIntegratedClient =
    clientForPickup?.is_integrated === true ||
    Boolean(clientForPickup?.linked_organization_id);
  const { data: clientWarehouses = [], isLoading: warehousesLoading } =
    useClientWarehousesQuery(organizationId, state.clientId);
  const { data: contractLanes = [], isLoading: lanesLoading } =
    useClientLaneRatesQuery(organizationId, state.clientId, debouncedLaneSearch);
  const { data: linkedOrgLocations = [], isLoading: linkedLocLoading } =
    useLinkedClientOrgLocationsQuery(
      organizationId,
      state.clientId,
      isIntegratedClient,
    );
  const pickupRecommendations = useMemo(
    () =>
      buildPickupRecommendations(
        clientForPickup,
        clientWarehouses,
        linkedOrgLocations,
      ),
    [clientForPickup, clientWarehouses, linkedOrgLocations],
  );
  const pickupLocationsLoading =
    Boolean(state.clientId) &&
    (warehousesLoading || (isIntegratedClient && linkedLocLoading));

  const handleSelectPickupRecommendation = useCallback(
    (rec: PickupRecommendation) => {
      setters.setPickupArea(rec.address);
      setters.setPickupCoords(rec.lat, rec.lon);
    },
    [setters],
  );

  // Prefer registered office, then any office, then warehouse when pickup is empty.
  useEffect(() => {
    if (wizardStep !== "route") return;
    if (state.pickupArea.trim()) return;
    if (pickupLocationsLoading) return;
    const preferred = preferredPickupRecommendation(pickupRecommendations);
    if (!preferred) return;
    setters.setPickupArea(preferred.address);
    setters.setPickupCoords(preferred.lat, preferred.lon);
  }, [
    wizardStep,
    state.pickupArea,
    pickupRecommendations,
    pickupLocationsLoading,
    setters,
  ]);

  const handleSelectClient = useCallback(
    (client: ClientRow) => {
      if (state.clientId === client.id) return;
      Keyboard.dismiss();
      setters.setClientSelection(client.id, client.name);
      // Fresh client → clear prior pickup / lane so warehouse chips can be chosen anew.
      setters.setPickupArea("");
      setSelectedLaneId(null);
      setLaneSearch("");
      setClientListExpanded(false);
    },
    [setters, state.clientId],
  );

  const handleClearClient = useCallback(() => {
    setters.setClientSelection(null, "");
    setSelectedLaneId(null);
    setLaneSearch("");
    setClientListExpanded(true);
  }, [setters]);

  const handleSelectLane = useCallback(
    (lane: ClientLaneRate) => {
      const prefill = buildClientLanePrefill(lane);
      setSelectedLaneId(lane.id);
      if (prefill.pickup) setters.setPickupArea(prefill.pickup);
      if (prefill.drop) setters.setDropLocation(prefill.drop);
      if (prefill.vehicleType) setters.setVehicleType(prefill.vehicleType);
      if (prefill.loadType) setters.setLoadType(prefill.loadType);
      if (prefill.tons) setters.setTons(prefill.tons);
      if (prefill.clientPrice) setters.setClientPrice(prefill.clientPrice);
      const wh = clientWarehouses.find((w) => w.id === prefill.originWarehouseId);
      if (wh?.latitude != null && wh?.longitude != null) {
        setters.setPickupCoords(wh.latitude, wh.longitude);
      }
    },
    [clientWarehouses, setters],
  );

  const handleClearLane = useCallback(() => {
    setSelectedLaneId(null);
  }, []);

  /**
   * Weight drives the price on per-ton / per-kg contract lanes, so editing tons
   * after picking a lane must re-derive the client price.
   */
  const handleTonsChange = useCallback(
    (value: string) => {
      setters.setTons(value);
      const lane = selectedLaneId
        ? contractLanes.find((l) => l.id === selectedLaneId)
        : undefined;
      if (!lane) return;
      const repriced = repriceLaneForTons(lane, value);
      if (repriced) setters.setClientPrice(repriced);
    },
    [contractLanes, selectedLaneId, setters],
  );

  const handleChangeLaneFromRoute = useCallback(() => {
    setSelectedLaneId(null);
    onRequestChangeLane?.();
  }, [onRequestChangeLane]);

  useEffect(() => {
    onContractLaneLockedChange?.(Boolean(selectedLaneId));
  }, [selectedLaneId, onContractLaneLockedChange]);

  const handleAddClient = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleAddPartner = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-supplier",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleSelectPartner = useCallback(
    (supplier: SupplierRow) => {
      const primary =
        supplier.company_name?.trim() || supplier.name?.trim() || "—";
      setters.setSupplierSelection(supplier.id, primary);
      setPartnerListExpanded(false);
    },
    [setters],
  );

  const handleAddDriver = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-driver",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleAddVehicle = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-vehicle",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  let stepContent: ReactNode = null;
  switch (wizardStep) {
    case "client":
      stepContent = (
        <CreateTripDesktopClientStep
          compact={isMobileLayout}
          clients={clients}
          clientsLoading={clientsLoading}
          clientId={state.clientId}
          clientListExpanded={clientListExpanded}
          onExpandClientList={() => setClientListExpanded(true)}
          onToggleClientList={() => setClientListExpanded((prev) => !prev)}
          onSelectClient={handleSelectClient}
          onAddClient={handleAddClient}
          clientError={invalid("client")}
          clientPrice={state.clientPrice}
          onClientPriceChange={setters.setClientPrice}
          clientPriceError={invalid("clientPrice")}
          onClearClient={handleClearClient}
          contractLanes={contractLanes}
          contractLanesLoading={lanesLoading}
          selectedLaneId={selectedLaneId}
          onSelectLane={handleSelectLane}
          onClearLane={handleClearLane}
          laneSearch={laneSearch}
          onLaneSearchChange={setLaneSearch}
          onLaneGateActiveChange={onLaneGateActiveChange}
        />
      );
      break;
    case "route":
      stepContent = (
        <CreateTripDesktopRouteStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          fieldInvalid={invalid}
          onPickupDropdownOpenChange={setPickupDropdownOpen}
          onDropDropdownOpenChange={setDropDropdownOpen}
          pickupRecommendations={pickupRecommendations}
          onSelectPickupRecommendation={handleSelectPickupRecommendation}
          pickupLocationsLoading={pickupLocationsLoading}
          contractRouteLocked={Boolean(selectedLaneId)}
          onChangeLane={selectedLaneId ? handleChangeLaneFromRoute : undefined}
        />
      );
      break;
    case "commodity":
      stepContent = (
        <CreateTripDesktopCommodityStep
          compact={isMobileLayout}
          vehicleType={state.vehicleType}
          loadType={state.loadType}
          tons={state.tons}
          onVehicleTypeChange={setters.setVehicleType}
          onLoadTypeChange={setters.setLoadType}
          onTonsChange={handleTonsChange}
          vehicleTypeError={invalid("vehicleType")}
          loadTypeError={invalid("loadType")}
          tonsError={invalid("tons")}
          indentVehicleType={sourceIndent?.vehicle_type}
          indentLoadType={sourceIndent?.load_type}
        />
      );
      break;
    case "source":
      stepContent = (
        <CreateTripDesktopSourceStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          invalid={invalid}
          suppliers={fleet.suppliers}
          suppliersLoading={fleet.suppliersLoading}
          partnerListExpanded={partnerListExpanded}
          onExpandPartnerList={() => setPartnerListExpanded(true)}
          onTogglePartnerList={() => setPartnerListExpanded((prev) => !prev)}
          onSelectPartner={handleSelectPartner}
          onAddPartner={handleAddPartner}
        />
      );
      break;
    case "allocation": {
      const mobileFleetKeypad =
        isMobileLayout &&
        state.supplySource === "aggregate" &&
        !state.assignLater &&
        (allocationSubStep === "driverPhone" ||
          allocationSubStep === "driverName" ||
          allocationSubStep === "vehicle");

      if (mobileFleetKeypad && allocationSubStep) {
        const summaryItems: WizardPriorSelectionItem[] = [];
        if (selectedClient) {
          summaryItems.push({
            id: "client",
            label: "Client",
            name: selectedClient.name?.trim() || "Client",
          });
        }
        const rateRaw = state.supplierRate.trim();
        if (rateRaw) {
          summaryItems.push({
            id: "rate",
            label: "Rate",
            name: `₹${Number(rateRaw).toLocaleString("en-IN")}`,
          });
        }
        if (
          (allocationSubStep === "driverName" ||
            allocationSubStep === "vehicle") &&
          state.driverPhone.trim()
        ) {
          summaryItems.push({
            id: "phone",
            label: "Phone",
            name: state.driverPhone.trim(),
            onPress: () => onAllocationSubStepChange?.("driverPhone"),
          });
        }
        if (
          allocationSubStep === "vehicle" &&
          state.aggregateDriverName.trim()
        ) {
          summaryItems.push({
            id: "name",
            label: "Driver",
            name: state.aggregateDriverName.trim(),
            onPress: () => onAllocationSubStepChange?.("driverName"),
          });
        }

        stepContent = (
          <View style={s.saleMobileKeypadRoot}>
            <View style={fullPageWizardStyles.wizardKeypadChromePad}>
              {summaryItems.length > 0 ? (
                <WizardPriorSelections items={summaryItems} compact />
              ) : null}
              {allocationSubStep === "driverPhone" ? (
                <View
                  style={[
                    s.inputBoxClean,
                    s.allocAssignLaterBox,
                    s.compactAssignLaterBox,
                  ]}
                >
                  <ListTodo
                    size={16}
                    color={Theme.textRouteCard}
                    strokeWidth={2}
                  />
                  <View style={s.allocAssignLaterCopy}>
                    <Text style={s.allocAssignLaterTitle}>Assign later</Text>
                    <Text style={s.allocAssignLaterSub}>
                      Pick vehicle & driver on trip detail
                    </Text>
                  </View>
                  <Switch
                    value={state.assignLater}
                    onValueChange={setters.setAssignLater}
                    disabled={fleet.assignLaterSwitchDisabled}
                    trackColor={{
                      false: Theme.borderLight,
                      true: Theme.textPrimaryDark,
                    }}
                    thumbColor={Theme.cardWhite}
                  />
                </View>
              ) : null}
            </View>
            <AggregateTrackingMobileStep
              step={allocationSubStep}
              driverName={state.aggregateDriverName}
              onDriverNameChange={setters.setAggregateDriverName}
              driverPhone={state.driverPhone}
              onDriverPhoneChange={(v) =>
                setters.setDriverPhone(formatMobileNumber(v))
              }
              vehicleText={state.aggregateVehicleText}
              onVehicleTextChange={setters.setAggregateVehicleText}
              invalid={invalid}
              driverPhoneMatches={fleet.driverPhoneMatches}
              driverPhoneLookupLoading={fleet.driverPhoneLookupLoading}
              selectedDriverMatchId={fleet.selectedDriverMatchId}
              onSelectDriverMatch={fleet.applyDriverPhoneMatch}
              driverPhoneInTrip={state.driverPhoneTripConflict}
              driverNameFromPlatform={state.driverPhoneName?.trim() || null}
              fleetDrivers={fleet.drivers}
            />
          </View>
        );
        break;
      }

      stepContent = (
        <CreateTripDesktopAllocationStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          invalid={invalid}
          drivers={fleet.driverOptions}
          vehicles={fleet.vehicleOptions}
          fleetLoading={fleet.fleetLoading}
          selectedSupplierRow={fleet.selectedSupplierRow}
          assignLaterSwitchDisabled={fleet.assignLaterSwitchDisabled}
          assetFleetWarningLines={fleet.assetFleetWarningLines}
          driverPhoneMatches={fleet.driverPhoneMatches}
          driverPhoneLookupLoading={fleet.driverPhoneLookupLoading}
          selectedDriverMatchId={fleet.selectedDriverMatchId}
          onSelectDriverMatch={fleet.applyDriverPhoneMatch}
          driverListExpanded={driverListExpanded}
          vehicleListExpanded={vehicleListExpanded}
          onExpandDriverList={() => setDriverListExpanded(true)}
          onExpandVehicleList={() => setVehicleListExpanded(true)}
          onSelectDriver={(id) => {
            const row = fleet.driverOptions.find((d) => d.id === id);
            if (row?.isBusy) return;
            const newId = state.driverId === id ? null : id;
            const dr = newId
              ? fleet.driverOptions.find((d) => d.id === newId)
              : null;
            setters.setDriver(
              newId,
              dr?.commission_percent ?? null,
              dr?.commission_per_km ?? null,
            );
            if (newId) setDriverListExpanded(false);
          }}
          onSelectVehicle={(id) => {
            const row = fleet.vehicleOptions.find((v) => v.id === id);
            if (row?.isBusy) return;
            setters.setVehicleId(state.vehicleId === id ? null : id);
            if (state.vehicleId !== id) setVehicleListExpanded(false);
          }}
          onAddDriver={handleAddDriver}
          onAddVehicle={handleAddVehicle}
        />
      );
      break;
    }
    default:
      stepContent = null;
  }

  void pickupDropdownOpen;
  void dropDropdownOpen;

  const mobileKeypadFill =
    isMobileLayout &&
    ((wizardStep === "client" && Boolean(state.clientId)) ||
      (wizardStep === "source" &&
        state.supplySource === "aggregate" &&
        Boolean(state.supplierId)) ||
      (wizardStep === "allocation" &&
        state.supplySource === "aggregate" &&
        !state.assignLater &&
        (allocationSubStep === "driverPhone" ||
          allocationSubStep === "driverName" ||
          allocationSubStep === "vehicle")));

  const workspaceStyle =
    isMobileLayout
      ? mobileKeypadFill
        ? s.wizardWorkspaceSoloFill
        : s.wizardWorkspaceSolo
      : wizardStep === "allocation"
        ? s.wizardWorkspaceFill
        : s.wizardWorkspace;

  return (
    <View style={workspaceStyle}>
      <View
        style={[
          isMobileLayout ? s.wizardWorkspaceMainSolo : s.wizardWorkspaceMain,
          !isMobileLayout &&
            wizardStep === "allocation" &&
            s.wizardWorkspaceMainFill,
          isMobileLayout && s.wizardWorkspaceMainMobile,
          mobileKeypadFill && s.wizardWorkspaceMainMobileFill,
        ]}
      >
        <MotiView
          key={`${wizardStep}-${allocationSubStep ?? ""}`}
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 280, easing: STEP_FADE_EASE }}
          style={[
            s.stepFadeWrap,
            isMobileLayout &&
              (mobileKeypadFill ? s.saleMobileKeypadRoot : s.compactRouteBody),
          ]}
        >
          {stepContent}
        </MotiView>
      </View>
      {!isMobileLayout ? (
        <View style={s.wizardWorkspaceAside}>
          <MotiView
            key={`aside-${wizardStep}-${selectedLaneId ? "lane" : "adhoc"}`}
            from={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "timing", duration: 260, easing: STEP_FADE_EASE }}
          >
            <CreateTripDesktopAsideArt
              wizardStep={wizardStep}
              contractRouteLocked={Boolean(selectedLaneId)}
            />
          </MotiView>
        </View>
      ) : null}
    </View>
  );
}
