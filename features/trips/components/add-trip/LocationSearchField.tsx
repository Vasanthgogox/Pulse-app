/**
 * Place search for pickup/drop: API-driven (India), returns display name + lat/lon on select.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { addToPlacesCache, getPopularPlacesInIndia, searchPlacesInIndia, type PlaceResult } from "@/lib/placesService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
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
  inputStyle,
  labelStyle,
  onDropdownOpenChange,
}: LocationSearchFieldProps) {
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
            {isPopularList ? (query ? "Suggestions" : "Popular places — tap or type to search") : "Suggestions"}
          </Text>
          {listToShow.map((place) => (
            <TouchableOpacity
              key={place.placeId}
              style={[styles.listItem, draft === place.displayName && styles.listItemActive]}
              onPress={() => handleSelect(place)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.listItemText, { color: Theme.textPrimary }]}
                numberOfLines={2}
              >
                {place.displayName}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}
      {showCustomOption && (
        <TouchableOpacity
          style={styles.createRow}
          onPress={handleUseCustom}
          activeOpacity={0.7}
        >
          <FontAwesome name="map-marker" size={14} color={Theme.primary} />
          <Text style={[styles.createRowText, { color: Theme.primary }]}>
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
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openDropdown}
          style={[styles.input, inputStyle, styles.inputPressable]}
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
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={closeDropdown}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View
              style={styles.dropdownModalCard}
              onStartShouldSetResponder={() => true}
            >
              <Text style={styles.dropdownModalTitle}>Pick a place in India</Text>
              <View style={styles.modalSearchRow}>
                <FontAwesome name="search" size={14} color={Theme.textMuted} />
                <TextInput
                  ref={modalInputRef}
                  style={styles.modalSearchInput}
                  value={draft}
                  onChangeText={(t) => {
                    setDraft(t);
                    onChangeText(t);
                  }}
                  placeholder={placeholder}
                  placeholderTextColor={Theme.placeholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
                {draft.trim().length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setDraft("");
                      onChangeText("");
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <FontAwesome name="times-circle" size={18} color={Theme.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <ScrollView
                style={styles.dropdownScroll}
                contentContainerStyle={styles.dropdownScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces
              >
                {dropdownListContent}
              </ScrollView>
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
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
    paddingRight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  dropdownModalCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    maxHeight: 380,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.headerPaddingBelowInset - 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  modalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  modalSearchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    fontSize: 16,
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownScrollContent: {
    paddingVertical: 8,
    paddingBottom: Layout.screenPaddingHorizontal,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  listItem: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  listItemActive: {
    backgroundColor: Theme.positiveMuted,
  },
  listItemText: {
    fontSize: 14,
    fontWeight: "600",
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  createRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.primary,
  },
  emptyListWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
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
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: 6,
  },
});
