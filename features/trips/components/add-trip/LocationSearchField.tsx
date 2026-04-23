/**
 * Place search for pickup/drop: API-driven (India), returns display name + lat/lon on select.
 * Location modal matches Create Trip pickers (FleetEntityPickerModal — centered sheet, search, rich rows).
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { addToPlacesCache, getPopularPlacesInIndia, searchPlacesInIndia, type PlaceResult } from "@/lib/placesService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MapPin, X } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

export interface PlaceCoords {
  lat: number;
  lon: number;
}

export interface LocationSearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (val: string) => void;
  /** When user selects a place from API results, called with display name and coords. */
  onSelectPlace?: (displayName: string, coords: PlaceCoords) => void;
  /** Optional icon inside the field (e.g. MapPin / Navigation), left-aligned like other form rows. */
  leadingIcon?: ReactNode;
  inputStyle?: object;
  labelStyle?: object;
  onDropdownOpenChange?: (open: boolean) => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function LocationSearchField({
  label,
  placeholder,
  value,
  onChangeText,
  onSelectPlace,
  leadingIcon,
  inputStyle,
  labelStyle,
  onDropdownOpenChange,
}: LocationSearchFieldProps) {
  const { width: winW } = useWindowDimensions();
  const cardMaxW = Math.min(winW - 48, 520);
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalInputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    onDropdownOpenChange?.(false);
  }, [onDropdownOpenChange]);

  const openDropdown = useCallback(() => {
    // Sync draft with current value on open.
    setDraft(value);
    setDropdownOpen(true);
    onDropdownOpenChange?.(true);
    // Ensure modal's input focuses after modal is visible.
    setTimeout(() => modalInputRef.current?.focus(), 0);
  }, [onDropdownOpenChange, value]);

  const query = draft.trim();
  const popularForDisplay =
    query.length < MIN_QUERY_LENGTH
      ? getPopularPlacesInIndia()
      : getPopularPlacesInIndia(query);

  useEffect(() => {
    // Only search while the dropdown/modal is open; prevents background re-renders from triggering calls.
    if (!dropdownOpen) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setResults([]);
      return;
    }
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Cancel any in-flight request for previous text.
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      searchPlacesInIndia(query, { signal: abortRef.current.signal })
        .then((list) => setResults(list))
        .catch((e) => {
          // Abort is expected when typing fast.
          if (e?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, dropdownOpen]);

  const handleSelect = useCallback(
    (place: PlaceResult) => {
      setDraft(place.displayName);
      onChangeText(place.displayName);
      onSelectPlace?.(place.displayName, { lat: place.lat, lon: place.lon });
      addToPlacesCache(place).catch(() => {});
      closeDropdown();
    },
    [onChangeText, onSelectPlace, closeDropdown]
  );

  const handleUseCustom = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) {
      onChangeText(trimmed);
      onSelectPlace?.(trimmed, { lat: 0, lon: 0 });
      addToPlacesCache({ placeId: `custom-${trimmed}`, displayName: trimmed, lat: 0, lon: 0 }).catch(() => {});
    }
    closeDropdown();
  }, [draft, onChangeText, onSelectPlace, closeDropdown]);

  const handleClear = useCallback(() => {
    onChangeText("");
    setDraft("");
  }, [onChangeText]);

  const showCustomOption = draft.trim().length > 0;
  const hasApiResults = results.length > 0;
  const showPopular = !loading && (query.length < MIN_QUERY_LENGTH || !hasApiResults);
  const listToShow = hasApiResults ? results : showPopular ? popularForDisplay : [];
  const isPopularList = showPopular && !hasApiResults;
  const showNoMatchMessage = !loading && query.length >= MIN_QUERY_LENGTH && listToShow.length === 0;

  const dropdownListContent = (
    <>
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      )}
      {showNoMatchMessage && (
        <View style={styles.emptyListWrap}>
          <Text style={styles.emptyListSubtext}>
            No suggestions for "{query}". You can use your text as a custom address below.
          </Text>
        </View>
      )}
      {!loading && listToShow.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>
            {isPopularList
              ? query
                ? "Suggestions"
                : "Popular places — tap or type to search"
              : "Suggestions"}
          </Text>
          {listToShow.map((place) => {
            const selected = draft === place.displayName;
            return (
              <TouchableOpacity
                key={place.placeId}
                style={[
                  styles.placeRow,
                  selected && styles.placeRowSelected,
                  webCursor,
                ]}
                onPress={() => handleSelect(place)}
                activeOpacity={0.75}
              >
                <View style={styles.rowIconCircle}>
                  <MapPin size={18} color={Theme.iconPrimary} />
                </View>
                <Text style={styles.placeRowText} numberOfLines={3}>
                  {place.displayName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      {showCustomOption && (
        <TouchableOpacity
          style={[styles.customAddressRow, webCursor]}
          onPress={handleUseCustom}
          activeOpacity={0.75}
        >
          <View style={[styles.rowIconCircle, styles.customIconCircle]}>
            <MapPin size={18} color={Theme.primary} />
          </View>
          <Text style={styles.customAddressText}>
            Use "{draft.trim()}" as custom address
          </Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={styles.wrapper} collapsable={false}>
      <Text style={labelStyle}>{label}</Text>
      <View style={styles.inputRow}>
        {leadingIcon ? (
          <View style={styles.leadingIconWrap} pointerEvents="none">
            {leadingIcon}
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openDropdown}
          style={[
            styles.input,
            inputStyle,
            styles.inputPressable,
            leadingIcon ? styles.inputWithLeadingIcon : null,
          ]}
        >
          <Text
            style={[
              styles.inputValueText,
              { color: value.trim() ? Theme.textPrimary : Theme.placeholder },
            ]}
            numberOfLines={1}
          >
            {value.trim() ? value : placeholder}
          </Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome name="times-circle" size={20} color={Theme.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.chevronBtn}
            onPress={() => (dropdownOpen ? closeDropdown() : openDropdown())}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome
              name={dropdownOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={Theme.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {dropdownOpen && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeDropdown}
        >
          <View style={styles.modalRoot} accessibilityViewIsModal>
            <Pressable style={styles.backdropPress} onPress={closeDropdown}>
              <View style={styles.backdropDim} />
            </Pressable>
            <View style={styles.centerWrap} pointerEvents="box-none">
              <View style={[styles.sheet, { maxWidth: cardMaxW }]}>
                <View style={styles.sheetHead}>
                  <View style={styles.sheetTitles}>
                    <Text style={styles.sheetTitle}>Pick a place in India</Text>
                    <Text style={styles.sheetSubtitle}>
                      Search cities, areas, or landmarks
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeDropdown}
                    style={[styles.closeBtn, webCursor]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <X size={18} color={Theme.primary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                <CreateTripSheetSearchInput
                  ref={modalInputRef}
                  value={draft}
                  onChangeText={(t) => {
                    setDraft(t);
                    onChangeText(t);
                  }}
                  placeholder={placeholder}
                  autoCapitalize="words"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  shellStyle={styles.searchShell}
                  accessibilityLabel="Search places"
                />

                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  bounces
                >
                  {dropdownListContent}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 1,
    marginBottom: 12,
  },
  inputRow: {
    position: "relative",
    marginBottom: 4,
  },
  leadingIconWrap: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  inputWithLeadingIcon: {
    paddingLeft: 44,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
    paddingRight: 44,
    ...Platform.select({
      web: { outlineStyle: "none" } as TextStyle,
    }),
  },
  inputPressable: {
    justifyContent: "center",
  },
  inputValueText: {
    fontSize: 16,
    fontWeight: "600",
  },
  clearBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  chevronBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sheet: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  searchShell: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sheetScroll: {
    maxHeight: 340,
    minHeight: 120,
  },
  sheetScrollContent: {
    paddingBottom: 16,
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  placeRowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  rowIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  customIconCircle: {
    backgroundColor: Theme.positiveMuted,
  },
  placeRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  customAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  customAddressText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  emptyListWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  emptyListText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  emptyListSubtext: {
    fontSize: 12,
    color: Theme.textMuted,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
});
