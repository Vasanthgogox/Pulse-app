import DateTimePicker from "@react-native-community/datetimepicker";
import { ArrowUpDown, ChevronRight, MapPin } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { TypewriterText } from "@/components/TypewriterText";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { AddTripIssueField, useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";

import { CreateTripPickupLocationPicker } from "./CreateTripPickupLocationPicker";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import { LocationSearchField } from "./LocationSearchField";
import type { PickupRecommendation } from "./pickupRecommendations.util";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return toISODate(new Date());
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function getDayAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
}

export type CreateTripDesktopRouteStepProps = {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  fieldInvalid: (field: AddTripIssueField) => boolean;
  onPickupDropdownOpenChange: (open: boolean) => void;
  onDropDropdownOpenChange: (open: boolean) => void;
  /** Stack columns for mobile / narrow widths. */
  compact?: boolean;
  /** Client warehouse / office location cards for pickup. */
  pickupRecommendations?: readonly PickupRecommendation[];
  onSelectPickupRecommendation?: (rec: PickupRecommendation) => void;
  pickupLocationsLoading?: boolean;
};

export const CreateTripDesktopRouteStep = memo(function CreateTripDesktopRouteStep({
  state,
  setters,
  fieldInvalid,
  onPickupDropdownOpenChange,
  onDropDropdownOpenChange,
  compact = false,
  pickupRecommendations = [],
  onSelectPickupRecommendation,
  pickupLocationsLoading = false,
}: CreateTripDesktopRouteStepProps) {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  const quickDates = [
    { label: "Today", get: getToday },
    { label: "Tomorrow", get: getTomorrow },
    { label: "Day after", get: getDayAfter },
  ] as const;

  const swapLocations = useCallback(() => {
    const {
      pickupArea,
      dropLocation,
      pickupLat,
      pickupLon,
      dropLat,
      dropLon,
    } = state;
    setters.setPickupArea(dropLocation);
    setters.setDropLocation(pickupArea);
    if (dropLat != null && dropLon != null) {
      setters.setPickupCoords(dropLat, dropLon);
    }
    if (pickupLat != null && pickupLon != null) {
      setters.setDropCoords(pickupLat, pickupLon);
    }
  }, [setters, state]);

  const handleSelectRecommendation = useCallback(
    (rec: PickupRecommendation) => {
      onSelectPickupRecommendation?.(rec);
    },
    [onSelectPickupRecommendation],
  );

  const dateSection = (
    <View style={s.stepSection}>
      <Text style={s.sectionHeading}>Trip date</Text>
      <View style={s.routeDateSection}>
        <View style={[s.quickDateRow, compact && s.compactQuickDateRow]}>
          {quickDates.map(({ label, get }) => {
            const iso = get();
            const isActive = state.tripStartDate === iso;
            return (
              <Pressable
                key={label}
                style={[
                  s.quickDateChip,
                  compact && s.compactQuickDateChip,
                  isActive && s.quickDateChipActive,
                ]}
                onPress={() => setters.setTripStartDate(iso)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    s.quickDateChipText,
                    isActive && s.quickDateChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          style={[
            s.inputBoxClean,
            s.routeDateInputShell,
            fieldInvalid("tripDate") && s.inputBoxCleanError,
          ]}
        >
          {Platform.OS === "web" ? (
            <TextInput
              style={s.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Theme.placeholder}
              value={state.tripStartDate}
              onChangeText={setters.setTripStartDate}
              autoCorrect={false}
            />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowStartDatePicker(true)}
                activeOpacity={0.85}
              >
                <Text style={s.routeDateNativeValue}>
                  {state.tripStartDate
                    ? new Date(`${state.tripStartDate}T12:00:00`).toLocaleDateString(
                        "en-IN",
                        {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "Tap to pick date"}
                </Text>
              </TouchableOpacity>
              {showStartDatePicker ? (
                Platform.OS === "android" ? (
                  <DateTimePicker
                    value={
                      state.tripStartDate
                        ? new Date(`${state.tripStartDate}T12:00:00`)
                        : new Date()
                    }
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      setShowStartDatePicker(false);
                      if (e.type === "set" && date) {
                        setters.setTripStartDate(toISODate(date));
                      }
                    }}
                  />
                ) : (
                  <Modal visible transparent animationType="slide">
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: Theme.overlayBackdrop }}
                      activeOpacity={1}
                      onPress={() => setShowStartDatePicker(false)}
                    >
                      <View
                        style={{
                          marginTop: "auto",
                          backgroundColor: Theme.cardWhite,
                          padding: 16,
                        }}
                      >
                        <DateTimePicker
                          value={
                            state.tripStartDate
                              ? new Date(`${state.tripStartDate}T12:00:00`)
                              : new Date()
                          }
                          mode="date"
                          display="spinner"
                          minimumDate={new Date()}
                          onChange={(_, date) =>
                            date && setters.setTripStartDate(toISODate(date))
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  </Modal>
                )
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );

  const pickupDropSection = (
    <View style={s.stepSection}>
      <Text style={s.sectionHeading}>Pickup & drop</Text>
      <View style={[s.routeFieldsStack, compact && s.compactRouteFieldsStack]}>
        <CreateTripPickupLocationPicker
          recommendations={pickupRecommendations}
          selectedAddress={state.pickupArea}
          onSelect={handleSelectRecommendation}
          loading={pickupLocationsLoading}
          compact={compact}
        />

        <LocationSearchField
          label="Pickup *"
          placeholder={
            pickupRecommendations.length > 0
              ? "Or search another pickup location"
              : "Search or pick pickup location"
          }
          value={state.pickupArea}
          onChangeText={setters.setPickupArea}
          onSelectPlace={(_name, coords) =>
            setters.setPickupCoords(coords.lat, coords.lon)
          }
          leadingIcon={
            <MapPin size={16} color={Theme.textRouteCard} strokeWidth={2} />
          }
          presentation="desktopShell"
          compact={compact}
          labelStyle={s.desktopFieldLabel}
          inputStyle={fieldInvalid("pickup") ? s.inputBoxCleanError : undefined}
          onDropdownOpenChange={onPickupDropdownOpenChange}
        />

        <View style={[s.routeSwapRow, compact && s.compactRouteSwapRow]}>
          <Pressable
            onPress={swapLocations}
            style={s.routeSwapBtn}
            accessibilityRole="button"
            accessibilityLabel="Swap pickup and drop locations"
          >
            <ArrowUpDown size={14} color={Theme.textRouteCard} strokeWidth={2.5} />
          </Pressable>
        </View>

        <LocationSearchField
          label="Drop *"
          placeholder="Search or pick drop location"
          value={state.dropLocation}
          onChangeText={setters.setDropLocation}
          onSelectPlace={(_name, coords) =>
            setters.setDropCoords(coords.lat, coords.lon)
          }
          leadingIcon={
            <ChevronRight size={16} color={Theme.textRouteCard} strokeWidth={2.5} />
          }
          presentation="desktopShell"
          compact={compact}
          labelStyle={s.desktopFieldLabel}
          inputStyle={fieldInvalid("drop") ? s.inputBoxCleanError : undefined}
          onDropdownOpenChange={onDropDropdownOpenChange}
        />
      </View>

      <View style={[s.infoBanner, s.routeInfoBannerBelowPickup]}>
        <View style={s.infoBannerIcon}>
          <ChevronRight size={16} color={Theme.iconPrimary} strokeWidth={2.5} />
        </View>
        <View style={s.infoBannerCopy}>
          <TypewriterText
            text="Update your route details"
            style={s.infoBannerTitle}
            msPerChar={36}
          />
          <Text style={s.infoBannerBody}>
            Add accurate pickup and drop points for better tracking and ETA
            forecasting.
          </Text>
        </View>
      </View>
    </View>
  );

  /** Mobile: dedicated vertical stack — never reuse desktop row grid (avoids RN Web overlap). */
  if (compact) {
    return (
      <View style={[s.stepBody, s.compactStepBody, s.compactRouteBody]}>
        {dateSection}
        {pickupDropSection}
      </View>
    );
  }

  return (
    <View style={s.stepBody}>
      <View style={s.routeStepGrid}>
        <View style={s.routeStepCol}>{pickupDropSection}</View>
        <View style={s.routeStepCol}>{dateSection}</View>
      </View>
    </View>
  );
});
