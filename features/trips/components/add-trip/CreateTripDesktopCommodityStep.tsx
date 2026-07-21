/**
 * Create Trip — commodity / load details step (vehicle, load type, tons).
 */
import { memo } from "react";
import { Platform, Text, View } from "react-native";

import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopCommodityStepProps = {
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
  compact?: boolean;
};

export const CreateTripDesktopCommodityStep = memo(
  function CreateTripDesktopCommodityStep({
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
    compact = false,
  }: CreateTripDesktopCommodityStepProps) {
    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>Load details</Text>
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
              isWide={false}
              useFormChrome
              preferWebSelect={Platform.OS === "web" && !compact}
              desktopChrome
              fieldLabelStyle={s.desktopFieldLabel}
              fieldInputStyle={[s.inputBoxClean, s.formFieldInput]}
            />
          </View>
        </View>
      </View>
    );
  },
);
