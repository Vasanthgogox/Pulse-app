/**
 * Place search for pickup/drop: API-driven (India), returns display name + lat/lon on select.
 * Location modal matches Create Trip pickers (FleetEntityPickerModal — centered sheet, search, rich rows).
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { addToPlacesCache, getPopularPlacesInIndia, searchPlacesInIndia, type PlaceResult } from "@/lib/placesService";
import { scrollFocusedWebInputIntoView } from "@/lib/webKeyboard";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MapPin, Search, X } from "lucide-react-native";
import { type ReactNode, forwardRef, useCallback, useEffect, useRef, useState } from "react";
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
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
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
  /** `overlay` — icon inside field padding; `inline` — icon in left rail (desktop wizard). */
  leadingIconLayout?: "overlay" | "inline";
  /** Signup/office flows — lighter typography aligned with Pulse onboarding. */
  sheetVariant?: "default" | "signup";
  sheetTitle?: string;
  sheetSubtitle?: string;
  /**
   * When set (e.g. signup form step), used instead of document scrollIntoView
   * so mobile-web keyboard scroll stays on the parent RN ScrollView.
   */
  onFocusScroll?: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function splitPlaceLabel(displayName: string): { primary: string; secondary?: string } {
  const comma = displayName.indexOf(",");
  if (comma === -1) return { primary: displayName };
  const primary = displayName.slice(0, comma).trim();
  const secondary = displayName.slice(comma + 1).trim();
  return secondary ? { primary, secondary } : { primary: displayName };
}

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
  leadingIconLayout = "overlay",
  sheetVariant = "default",
  sheetTitle,
  sheetSubtitle,
  onFocusScroll,
}: LocationSearchFieldProps) {
  const isSignupSheet = sheetVariant === "signup";
  const { width: winW } = useWindowDimensions();
  const horizontalPad = Layout.screenPaddingHorizontal * 2;
  /** Explicit width avoids RN Web % layout quirks so the sheet stays visually centered on mobile. */
  const sheetWidth = Math.min(winW - horizontalPad, 440);
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
    onFocusScroll?.();
    // Ensure modal's input focuses after modal is visible.
    setTimeout(() => modalInputRef.current?.focus(), 0);
  }, [onDropdownOpenChange, onFocusScroll, value]);

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
      onSelectPlace?.(place.displayName, {
        lat: place.lat,
        lon: place.lon,
        pincode: place.pincode ?? null,
        city: place.city ?? null,
        state: place.state ?? null,
      });
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
  const showNoMatchMessage = !loading && query.length >= MIN_QUERY_LENGTH && listToShow.length === 0;

  const sheetType = isSignupSheet
    ? signupSheetTypography
    : compact
      ? sheetTypography.compact
      : sheetTypography.default;
  const rowIconSize = isSignupSheet ? 14 : compact ? 13 : 14;
  const resolvedSheetTitle =
    sheetTitle ?? (isSignupSheet ? "Pick area on map" : "Pick a place in India");
  const resolvedSheetSubtitle =
    sheetSubtitle ??
    (isSignupSheet
      ? "Search neighbourhoods, landmarks, or cities"
      : "Search cities, areas, or landmarks");
  const popularSectionLabel = isSignupSheet
    ? query
      ? "Suggestions"
      : "Popular areas"
    : query
      ? "Matching places"
      : "Popular places";

  const dropdownListContent = (
    <>
      {loading && (
        <View style={[styles.loadingWrap, isSignupSheet && signupSheetStyles.loadingWrap]}>
          <ActivityIndicator
            size="small"
            color={isSignupSheet ? SIGNUP_SHEET.muted : Theme.primary}
          />
          <Text style={sheetType.loadingText}>Searching…</Text>
        </View>
      )}
      {showNoMatchMessage && (
        <View style={[styles.emptyListWrap, isSignupSheet && signupSheetStyles.emptyListWrap]}>
          <Text style={sheetType.emptyListSubtext}>
            No suggestions for "{query}". You can use your text as a custom address below.
          </Text>
        </View>
      )}
      {!loading && listToShow.length > 0 && (
        <>
          <View style={sheetType.sectionLabelWrap}>
            <Text style={sheetType.sectionLabel}>{popularSectionLabel}</Text>
          </View>
          {listToShow.map((place) => {
            const selected = draft === place.displayName;
            const { primary, secondary } = splitPlaceLabel(place.displayName);
            return (
              <TouchableOpacity
                key={place.placeId}
                style={[
                  styles.placeRow,
                  compact && !isSignupSheet && styles.placeRowCompact,
                  isSignupSheet && signupSheetStyles.placeRow,
                  selected &&
                    (isSignupSheet ? signupSheetStyles.placeRowSelected : styles.placeRowSelected),
                  webCursor,
                ]}
                onPress={() => handleSelect(place)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.rowIconCircle,
                    compact && !isSignupSheet && styles.rowIconCircleCompact,
                    isSignupSheet && signupSheetStyles.rowIconCircle,
                  ]}
                >
                  <MapPin
                    size={rowIconSize}
                    color={isSignupSheet ? SIGNUP_SHEET.muted : Theme.textMuted}
                    strokeWidth={2}
                  />
                </View>
                <View style={styles.placeRowTextCol}>
                  <Text style={sheetType.placeRowPrimary} numberOfLines={1}>
                    {primary}
                  </Text>
                  {secondary ? (
                    <Text style={sheetType.placeRowSecondary} numberOfLines={1}>
                      {secondary}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      {showCustomOption && (
        <TouchableOpacity
          style={[
            styles.customAddressRow,
            compact && !isSignupSheet && styles.customAddressRowCompact,
            isSignupSheet && signupSheetStyles.customAddressRow,
            webCursor,
          ]}
          onPress={handleUseCustom}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.rowIconCircle,
              compact && !isSignupSheet && styles.rowIconCircleCompact,
              isSignupSheet && signupSheetStyles.rowIconCircle,
              !isSignupSheet && styles.customIconCircle,
            ]}
          >
            <MapPin
              size={rowIconSize}
              color={isSignupSheet ? SIGNUP_SHEET.ink : Theme.primary}
              strokeWidth={isSignupSheet ? 2 : 2.5}
            />
          </View>
          <Text style={sheetType.customAddressText}>
            Use "{draft.trim()}" as custom address
          </Text>
        </TouchableOpacity>
      )}
    </>
  );

  const inlineIcon = leadingIconLayout === "inline" && !!leadingIcon;

  return (
    <View style={[styles.wrapper, compact && styles.wrapperCompact]} collapsable={false}>
      <Text style={labelStyle}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          inlineIcon && styles.inputRowInline,
        ]}
      >
        {inlineIcon ? (
          <View style={styles.leadingIconInline}>{leadingIcon}</View>
        ) : leadingIcon ? (
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
            inlineIcon && styles.inputInlineRail,
            !inlineIcon && leadingIcon ? styles.inputWithLeadingIcon : null,
            !inlineIcon && leadingIcon && compact ? styles.inputWithLeadingIconCompact : null,
          ]}
        >
          <Text
            style={[
              styles.inputValueText,
              compact && styles.inputValueTextCompact,
              {
                color: value.trim()
                  ? isSignupSheet
                    ? SIGNUP_SHEET.title
                    : Theme.textPrimary
                  : isSignupSheet
                    ? SIGNUP_SHEET.faint
                    : Theme.placeholder,
              },
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
            <FontAwesome
              name="times-circle"
              size={20}
              color={isSignupSheet ? SIGNUP_SHEET.faint : Theme.textMuted}
            />
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
              color={isSignupSheet ? SIGNUP_SHEET.faint : Theme.textMuted}
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
                  isSignupSheet && signupSheetStyles.sheet,
                  { width: sheetWidth, maxWidth: sheetWidth, alignSelf: "center" },
                ]}
              >
                <View
                  style={[
                    styles.sheetHead,
                    compact && !isSignupSheet && styles.sheetHeadCompact,
                    isSignupSheet && signupSheetStyles.sheetHead,
                  ]}
                >
                  <View style={styles.sheetTitles}>
                    <Text style={sheetType.sheetTitle}>{resolvedSheetTitle}</Text>
                    <Text style={sheetType.sheetSubtitle}>{resolvedSheetSubtitle}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeDropdown}
                    style={[
                      styles.closeBtn,
                      compact && !isSignupSheet && styles.closeBtnCompact,
                      isSignupSheet && signupSheetStyles.closeBtn,
                      webCursor,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <X
                      size={14}
                      color={Theme.textMuted}
                      strokeWidth={2.5}
                    />
                  </TouchableOpacity>
                </View>

                {isSignupSheet ? (
                  <SignupSheetSearchInput
                    ref={modalInputRef}
                    value={draft}
                    onChangeText={(t) => {
                      setDraft(t);
                      onChangeText(t);
                    }}
                    placeholder={placeholder}
                    shellStyle={signupSheetStyles.searchShell}
                    autoFocus
                    onFocusScroll={onFocusScroll}
                  />
                ) : (
                  <View
                    style={[
                      styles.sheetSearchBand,
                      compact && styles.sheetSearchBandCompact,
                    ]}
                  >
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
                      compactChatSize="sm"
                      shellStyle={styles.searchShellInner}
                      accessibilityLabel="Search places"
                    />
                  </View>
                )}

                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={[
                    styles.sheetScrollContent,
                    compact && styles.sheetScrollContentCompact,
                  ]}
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
  inputRowInline: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  leadingIconInline: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRightWidth: 0,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    flexShrink: 0,
  },
  inputInlineRail: {
    flex: 1,
    minWidth: 0,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
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
    // Font props live on the child `<Text style={inputValueText}>` (same
    // values); kept off this View container so the style is a valid ViewStyle.
    minHeight: 44,
    paddingRight: 44,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as ViewStyle,
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
    maxHeight: "78%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 12px 40px rgba(15, 23, 42, 0.12)",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 12,
      },
    }),
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  sheetTitles: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    gap: 2,
  },
  sheetHeadCompact: {
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.15,
    color: Theme.textPrimaryDark,
  },
  sheetSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    flexShrink: 0,
  },
  closeBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  sheetSearchBand: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  sheetSearchBandCompact: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  searchShellInner: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 10,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 40,
    paddingVertical: 6,
  },
  sheetScroll: {
    maxHeight: 320,
    minHeight: 100,
    backgroundColor: Theme.cardWhite,
  },
  sheetScrollContent: {
    paddingBottom: 12,
  },
  sheetScrollContentCompact: {
    paddingBottom: 10,
  },
  sectionLabelWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Theme.cardWhite,
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
    backgroundColor: Theme.cardWhite,
  },
  placeRowCompact: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  placeRowSelected: {
    backgroundColor: Theme.surface,
  },
  placeRowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowIconCircleCompact: {
    width: 26,
    height: 26,
    borderRadius: 8,
  },
  customIconCircle: {
    backgroundColor: Theme.positiveMuted,
  },
  placeRowPrimary: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  placeRowSecondary: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  customAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  customAddressRowCompact: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 8,
  },
  customAddressText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  emptyListWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyListSubtext: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
});

/** Modal typography — default sizes reduced; compact matches dense create-trip forms. */
const sheetTypography = {
  default: StyleSheet.create({
    sheetTitle: styles.sheetTitle,
    sheetSubtitle: styles.sheetSubtitle,
    sectionLabelWrap: styles.sectionLabelWrap,
    sectionLabel: styles.sectionLabel,
    placeRowPrimary: styles.placeRowPrimary,
    placeRowSecondary: styles.placeRowSecondary,
    customAddressText: styles.customAddressText,
    loadingText: styles.loadingText,
    emptyListSubtext: styles.emptyListSubtext,
  }),
  compact: StyleSheet.create({
    sheetTitle: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: -0.1,
      color: Theme.textPrimaryDark,
    },
    sheetSubtitle: {
      fontSize: 9,
      fontWeight: "500",
      color: Theme.textMuted,
      lineHeight: 13,
    },
    sectionLabelWrap: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: Theme.cardWhite,
    },
    sectionLabel: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.55,
      textTransform: "uppercase",
      color: Theme.textMuted,
    },
    placeRowPrimary: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "600",
      color: Theme.textPrimaryDark,
    },
    placeRowSecondary: {
      fontSize: 9,
      lineHeight: 13,
      fontWeight: "500",
      color: Theme.textMuted,
    },
    customAddressText: {
      flex: 1,
      fontSize: 10,
      fontWeight: "600",
      color: Theme.primary,
    },
    loadingText: {
      fontSize: 10,
      color: Theme.textMuted,
    },
    emptyListSubtext: {
      fontSize: 9,
      color: Theme.textMuted,
      lineHeight: 13,
    },
  }),
};

/** Pulse signup palette — mirrors PULSE_SIGNUP without cross-feature import. */
const SIGNUP_SHEET = {
  ink: "#4D3636",
  title: "#1f2937",
  body: "#4b5563",
  muted: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  surface: "#f9fafb",
  wash: "#f3f4f6",
  white: "#ffffff",
} as const;

const signupSheetStyles = StyleSheet.create({
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SIGNUP_SHEET.border,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  sheetHead: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderColor: SIGNUP_SHEET.border,
    backgroundColor: SIGNUP_SHEET.white,
  },
  searchShell: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  placeRow: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomColor: SIGNUP_SHEET.border,
  },
  placeRowSelected: {
    backgroundColor: SIGNUP_SHEET.surface,
  },
  rowIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: SIGNUP_SHEET.wash,
  },
  customAddressRow: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 0,
    borderTopColor: SIGNUP_SHEET.border,
    backgroundColor: SIGNUP_SHEET.surface,
  },
  loadingWrap: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  emptyListWrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});

const signupSheetTypography = StyleSheet.create({
  sheetTitle: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
    color: SIGNUP_SHEET.title,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: 4,
    color: SIGNUP_SHEET.muted,
    lineHeight: 18,
  },
  sectionLabelWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: SIGNUP_SHEET.white,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: SIGNUP_SHEET.faint,
  },
  placeRowPrimary: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: SIGNUP_SHEET.title,
  },
  placeRowSecondary: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
    color: SIGNUP_SHEET.muted,
  },
  customAddressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: SIGNUP_SHEET.ink,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "400",
    color: SIGNUP_SHEET.muted,
  },
  emptyListSubtext: {
    fontSize: 12,
    fontWeight: "400",
    color: SIGNUP_SHEET.muted,
    lineHeight: 17,
    marginBottom: 0,
  },
});

type SignupSheetSearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  shellStyle?: ViewStyle;
  autoFocus?: boolean;
  /** Prefer form ScrollView scroll; skip document scrollIntoView when provided. */
  onFocusScroll?: () => void;
};

const SignupSheetSearchInput = forwardRef<TextInput, SignupSheetSearchInputProps>(
  function SignupSheetSearchInput(
    { value, onChangeText, placeholder, shellStyle, autoFocus, onFocusScroll },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const webCursor =
      Platform.OS === "web" ? ({ cursor: "text" } as TextStyle) : undefined;

    return (
      <View
        style={[
          signupSearchStyles.shell,
          focused && signupSearchStyles.shellFocused,
          shellStyle,
        ]}
      >
        <Search size={15} color={SIGNUP_SHEET.faint} strokeWidth={2} />
        <TextInput
          ref={ref}
          style={[signupSearchStyles.input, webCursor]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={SIGNUP_SHEET.faint}
          autoFocus={autoFocus}
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => {
            setFocused(true);
            if (onFocusScroll) {
              onFocusScroll();
              return;
            }
            if (Platform.OS === "web") scrollFocusedWebInputIntoView();
          }}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          accessibilityLabel="Search places"
        />
        {value.trim().length > 0 ? (
          <TouchableOpacity
            onPress={() => onChangeText("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={14} color={SIGNUP_SHEET.faint} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
);

const signupSearchStyles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SIGNUP_SHEET.border,
    backgroundColor: SIGNUP_SHEET.white,
    gap: 10,
  },
  shellFocused: {
    borderColor: "#d1d5db",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
      } as object,
      default: {},
    }),
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "400",
    color: SIGNUP_SHEET.title,
    paddingVertical: Platform.OS === "android" ? 2 : 0,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
});
