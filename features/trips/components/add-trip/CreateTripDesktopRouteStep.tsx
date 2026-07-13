import DateTimePicker from "@react-native-community/datetimepicker";
import { ArrowRight, MapPin, Navigation2 } from "lucide-react-native";
import { memo, useState } from "react";
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
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import { LocationSearchField } from "./LocationSearchField";

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

function routePreviewLine(value: string): string {
  const t = value.trim();
  if (!t) return "—";
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

const desktopLocationInputStyle = {
  backgroundColor: Theme.cardWhite,
  borderWidth: 1,
  borderColor: Theme.borderLight,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  minHeight: 48,
  fontSize: 14,
  fontWeight: "600" as const,
  color: Theme.textPrimaryDark,
  flex: 1,
};

export type CreateTripDesktopRouteStepProps = {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  fieldInvalid: (field: string) => boolean;
  onPickupDropdownOpenChange: (open: boolean) => void;
  onDropDropdownOpenChange: (open: boolean) => void;
};

export const CreateTripDesktopRouteStep = memo(function CreateTripDesktopRouteStep({
  state,
  setters,
  fieldInvalid,
  onPickupDropdownOpenChange,
  onDropDropdownOpenChange,
}: CreateTripDesktopRouteStepProps) {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  const quickDates = [
    { label: "Today", get: getToday },
    { label: "Tomorrow", get: getTomorrow },
    { label: "Day after", get: getDayAfter },
  ] as const;

  const showRouteSummary =
    state.pickupArea.trim().length > 0 && state.dropLocation.trim().length > 0;

  return (
    <View style={s.stepBody}>
      <View style={s.routeGrid}>
        <View style={s.routeGridMain}>
          <View style={s.routeFieldsStack}>
            <View style={s.routeConnector} pointerEvents="none" />

            <View style={s.routeFieldBlock}>
              <LocationSearchField
                label="Pickup *"
                placeholder="Search or pick pickup location"
                value={state.pickupArea}
                onChangeText={setters.setPickupArea}
                onSelectPlace={(_name, coords) =>
                  setters.setPickupCoords(coords.lat, coords.lon)
                }
                leadingIcon={<MapPin size={18} color={Theme.textMuted} />}
                leadingIconLayout="inline"
                labelStyle={s.routeFieldLabel}
                inputStyle={[
                  desktopLocationInputStyle,
                  fieldInvalid("pickup") && s.routeInputShellError,
                ]}
                compact
                onDropdownOpenChange={onPickupDropdownOpenChange}
              />
            </View>

            <View style={s.routeFieldBlock}>
              <LocationSearchField
                label="Drop *"
                placeholder="Search or pick drop location"
                value={state.dropLocation}
                onChangeText={setters.setDropLocation}
                onSelectPlace={(_name, coords) =>
                  setters.setDropCoords(coords.lat, coords.lon)
                }
                leadingIcon={
                  <Navigation2
                    size={18}
                    color={Theme.textMuted}
                    style={{ transform: [{ rotate: "45deg" }] }}
                  />
                }
                leadingIconLayout="inline"
                labelStyle={s.routeFieldLabel}
                inputStyle={[
                  desktopLocationInputStyle,
                  fieldInvalid("drop") && s.routeInputShellError,
                ]}
                compact
                onDropdownOpenChange={onDropDropdownOpenChange}
              />
            </View>
          </View>

          {showRouteSummary ? (
            <View style={s.routeSummary}>
              <View style={s.routeSummaryHeader}>
                <ArrowRight size={16} color={Theme.textSecondary} strokeWidth={2} />
                <Text style={s.routeSummaryTitle} numberOfLines={2}>
                  {routePreviewLine(state.pickupArea)}{" "}
                  <Text style={s.routeSummaryArrow}>→</Text>{" "}
                  {routePreviewLine(state.dropLocation)}
                </Text>
              </View>
              {state.routeLoading ||
              state.routeDistanceKm != null ||
              state.routeEtaLabel != null ? (
                <View style={s.routeSummaryMetrics}>
                  <View style={[s.routeSummaryMetric, s.routeSummaryMetricBorder]}>
                    <Text style={s.routeSummaryMetricLabel}>Distance</Text>
                    <Text style={s.routeSummaryMetricValue}>
                      {state.routeLoading
                        ? "…"
                        : state.routeDistanceKm != null
                          ? `${state.routeDistanceKm} km`
                          : "—"}
                    </Text>
                  </View>
                  <View style={s.routeSummaryMetric}>
                    <Text style={s.routeSummaryMetricLabel}>ETA</Text>
                    <Text style={s.routeSummaryMetricValue}>
                      {state.routeLoading
                        ? "…"
                        : state.routeEtaLabel != null
                          ? state.routeEtaLabel
                          : "—"}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={s.routeGridAside}>
          <View style={s.routeDateSection}>
            <Text style={s.routeFieldLabel}>Trip Start Date</Text>
            <View style={s.quickDateRow}>
              {quickDates.map(({ label, get }) => {
                const iso = get();
                const isActive = state.tripStartDate === iso;
                return (
                  <Pressable
                    key={label}
                    style={[s.quickDateChip, isActive && s.quickDateChipActive]}
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
            {Platform.OS === "web" ? (
              <TextInput
                style={[s.dateInput, fieldInvalid("tripDate") && s.routeInputShellError]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Theme.placeholder}
                value={state.tripStartDate}
                onChangeText={setters.setTripStartDate}
                autoCorrect={false}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={[s.dateInput, fieldInvalid("tripDate") && s.routeInputShellError]}
                  onPress={() => setShowStartDatePicker(true)}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark }}>
                    {state.tripStartDate
                      ? new Date(`${state.tripStartDate}T12:00:00`).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
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
                        <View style={{ marginTop: "auto", backgroundColor: Theme.cardWhite, padding: 16 }}>
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

          <View style={s.infoBanner}>
            <View style={s.infoBannerIcon}>
              <MapPin size={18} color={Theme.iconPrimary} strokeWidth={2.5} />
            </View>
            <View style={s.infoBannerCopy}>
              <View style={s.infoBannerTitleRow}>
                <Navigation2
                  size={12}
                  color={Theme.textMuted}
                  style={{ transform: [{ rotate: "45deg" }] }}
                />
                <Text style={s.infoBannerTitle}>Update your route details</Text>
              </View>
              <Text style={s.infoBannerBody}>
                Add accurate pickup and drop points for better tracking and ETA.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});
