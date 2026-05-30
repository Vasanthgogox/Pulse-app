/**
 * Place search for pickup/drop: API-driven (India), returns display name + lat/lon on select.
 * Location modal matches Create Trip pickers (FleetEntityPickerModal — centered sheet, search, rich rows).
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
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
  /** Tighter field height and typography for native / narrow create-trip forms. */
  compact?: boolean;
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
  compact = false,
}: LocationSearchFieldProps) {
  const { width: winW } = useWindowDimensions();
  const horizontalPad = Layout.screenPaddingHorizontal * 2;
  /** Explicit width avoids RN Web % layout quirks so the sheet stays visually centered on mobile. */
  const sheetWidth = Math.min(winW - horizontalPad, 520);
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

  const sheetType = compact ? sheetTypography.compact : sheetTypography.default;
  const rowIconSize = compact ? 15 : 16;

  const dropdownListContent = (
    <>
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={sheetType.loadingText}>Searching…</Text>
        </View>
      )}
      {showNoMatchMessage && (
        <View style={styles.emptyListWrap}>
          <Text style={sheetType.emptyListSubtext}>
            No suggestions for "{query}". You can use your text as a custom address below.
          </Text>
        </View>
      )}
      {!loading && listToShow.length > 0 && (
        <>
          <Text style={sheetType.sectionLabel}>
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
                  compact && styles.placeRowCompact,
                  selected && styles.placeRowSelected,
                  webCursor,
                ]}
                onPress={() => handleSelect(place)}
                activeOpacity={0.75}
              >
                <View style={[styles.rowIconCircle, compact && styles.rowIconCircleCompact]}>
                  <MapPin size={rowIconSize} color={Theme.iconPrimary} />
                </View>
                <Text style={sheetType.placeRowText} numberOfLines={3}>
                  {place.displayName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      {showCustomOption && (
        <TouchableOpacity
          style={[styles.customAddressRow, compact && styles.customAddressRowCompact, webCursor]}
          onPress={handleUseCustom}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.rowIconCircle,
              compact && styles.rowIconCircleCompact,
              styles.customIconCircle,
            ]}
          >
            <MapPin size={rowIconSize} color={Theme.primary} />
          </View>
          <Text style={sheetType.customAddressText}>
            Use "{draft.trim()}" as custom address
          </Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={[styles.wrapper, compact && styles.wrapperCompact]} collapsable={false}>
      <Text style={labelStyle}>{label}</Text>
      <View style={styles.inputRow}>
        {leadingIcon ? (
          <View
            style={[styles.leadingIconWrap, compact && styles.leadingIconWrapCompact]}
            pointerEvents="none"
          >
            {leadingIcon}
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openDropdown}
          style={[
            styles.input,
            compact && styles.inputCompact,
            inputStyle,
            styles.inputPressable,
            leadingIcon ? styles.inputWithLeadingIcon : null,
            leadingIcon && compact ? styles.inputWithLeadingIconCompact : null,
          ]}
        >
          <Text
            style={[
              styles.inputValueText,
              compact && styles.inputValueTextCompact,
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
              <View
                style={[
                  styles.sheet,
                  { width: sheetWidth, maxWidth: sheetWidth, alignSelf: "center" },
                ]}
              >
                <View style={[styles.sheetHead, compact && styles.sheetHeadCompact]}>
                  <View style={styles.sheetTitles}>
                    <Text style={sheetType.sheetTitle}>Pick a place in India</Text>
                    <Text style={sheetType.sheetSubtitle}>
                      Search cities, areas, or landmarks
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeDropdown}
                    style={[styles.closeBtn, compact && styles.closeBtnCompact, webCursor]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <X size={compact ? 16 : 17} color={Theme.primary} strokeWidth={2.5} />
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
                  compactChat
                  compactChatSize={compact ? "sm" : "md"}
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
  wrapperCompact: {
    marginBottom: 0,
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
    alignItems: "center",
    width: 28,
    zIndex: 1,
  },
  leadingIconWrapCompact: {
    left: 12,
    width: 24,
  },
  inputWithLeadingIcon: {
    paddingLeft: 44,
  },
  inputWithLeadingIconCompact: {
    paddingLeft: 36,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "400",
    fontStyle: "normal",
    minHeight: 44,
    paddingRight: 44,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  inputCompact: {
    borderRadius: 12,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 40,
  },
  inputPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  inputValueText: {
    fontSize: 15,
    fontWeight: "400",
    fontStyle: "normal",
  },
  inputValueTextCompact: {
    fontSize: 14,
    fontStyle: "normal",
    fontWeight: "400",
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
    ...Platform.select({
      web: {
        width: "100%",
        minHeight: "100%",
        alignSelf: "center",
      } as ViewStyle,
      default: {},
    }),
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
    ...Platform.select({
      web: {
        width: "100%",
        left: 0,
        right: 0,
      } as ViewStyle,
      default: {},
    }),
  },
  sheet: {
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  sheetHeadCompact: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  sheetSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    fontStyle: "normal",
    marginTop: 2,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  closeBtnCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  searchShell: {
    marginHorizontal: 16,
    marginBottom: 8,
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  placeRowCompact: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 8,
  },
  placeRowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  rowIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconCircleCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  customIconCircle: {
    backgroundColor: Theme.positiveMuted,
  },
  placeRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
  },
  customAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  customAddressRowCompact: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 8,
  },
  customAddressText: {
    flex: 1,
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 11,
    color: Theme.textMuted,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 5,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
});

/** Modal typography — default sizes reduced; compact matches dense create-trip forms. */
const sheetTypography = {
  default: StyleSheet.create({
    sheetTitle: styles.sheetTitle,
    sheetSubtitle: styles.sheetSubtitle,
    sectionLabel: styles.sectionLabel,
    placeRowText: styles.placeRowText,
    customAddressText: styles.customAddressText,
    loadingText: styles.loadingText,
    emptyListSubtext: styles.emptyListSubtext,
  }),
  compact: StyleSheet.create({
    sheetTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: Theme.textPrimaryDark,
    },
    sheetSubtitle: {
      fontSize: 10,
      fontWeight: "400",
      marginTop: 2,
      color: Theme.textSecondary,
      lineHeight: 14,
    },
    sectionLabel: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 0.3,
      textTransform: "uppercase",
      color: Theme.textMuted,
      paddingHorizontal: 14,
      paddingTop: 4,
      paddingBottom: 4,
      backgroundColor: Theme.surfaceGray,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Theme.borderLight,
    },
    placeRowText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "500",
      color: Theme.textPrimaryDark,
    },
    customAddressText: {
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
      color: Theme.primary,
    },
    loadingText: {
      fontSize: 11,
      color: Theme.textSecondary,
    },
    emptyListSubtext: {
      fontSize: 10,
      color: Theme.textMuted,
      marginBottom: 4,
    },
  }),
};
