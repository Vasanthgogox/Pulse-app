import { memo } from "react";
import { Platform, View } from "react-native";

import type { ClientRow } from "@/features/clients/services/clients.service";
import { TripClientPickerSection } from "@/features/trips/components/add-trip/TripClientPickerSection";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopCommodityClientStepProps = {
  vehicleType: string;
  loadType: string;
  tons: string;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  onTonsChange: (value: string) => void;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
  clients: ClientRow[];
  clientsLoading: boolean;
  clientId: string | null;
  clientListExpanded: boolean;
  setClientListExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectClient: (client: ClientRow) => void;
  onAddClient: () => void;
  clientError?: boolean;
};

export const CreateTripDesktopCommodityClientStep = memo(
  function CreateTripDesktopCommodityClientStep({
    vehicleType,
    loadType,
    tons,
    onVehicleTypeChange,
    onLoadTypeChange,
    onTonsChange,
    vehicleTypeError,
    loadTypeError,
    tonsError,
    indentVehicleType,
    indentLoadType,
    clients,
    clientsLoading,
    clientId,
    clientListExpanded,
    setClientListExpanded,
    onSelectClient,
    onAddClient,
    clientError,
  }: CreateTripDesktopCommodityClientStepProps) {
    return (
      <View style={s.stepBody}>
        <View style={s.stepGrid}>
          <View style={s.stepGridMain}>
            <View style={s.fieldSection}>
              <TripCommodityFields
                vehicleType={vehicleType}
                loadType={loadType}
                tons={tons}
                onVehicleTypeChange={onVehicleTypeChange}
                onLoadTypeChange={onLoadTypeChange}
                onTonsChange={onTonsChange}
                vehicleTypeError={vehicleTypeError}
                loadTypeError={loadTypeError}
                tonsError={tonsError}
                indentVehicleType={indentVehicleType}
                indentLoadType={indentLoadType}
                isWide
                useFormChrome
                preferWebSelect={Platform.OS === "web"}
                fieldLabelStyle={s.routeFieldLabel}
              />
            </View>
          </View>
          <View style={s.stepGridAside}>
            <View style={s.fieldSection}>
              <TripClientPickerSection
                clients={clients}
                clientsLoading={clientsLoading}
                clientId={clientId}
                clientListExpanded={clientListExpanded}
                setClientListExpanded={setClientListExpanded}
                onSelectClient={onSelectClient}
                onAddClient={onAddClient}
                hasError={clientError}
                wizardMode
                fieldLabelStyle={s.routeFieldLabel}
              />
            </View>
          </View>
        </View>
      </View>
    );
  },
);
