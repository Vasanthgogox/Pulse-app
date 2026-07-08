import INDIA_LOCATIONS from '@/lib/data/indiaLocations.json';
import { ChevronDown, MapPin, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS } from '../signUpPulseTheme';
import { PULSE_SIGNUP_TYPO, SIGNUP_TEXT } from '../signUpTypography';

type Zone = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTHEAST';
export type IndiaLocation = { city: string; state: string; zone: Zone };

const ALL_LOCATIONS = INDIA_LOCATIONS as IndiaLocation[];
const MAX_SEARCH_RESULTS = 80;

const ZONE_LABELS: Record<Zone, string> = {
  NORTH: 'North zone',
  SOUTH: 'South zone',
  EAST: 'East zone',
  WEST: 'West zone',
  NORTHEAST: 'Northeast zone',
};

const POPULAR_CITY_NAMES = [
  'Mumbai',
  'Delhi',
  'Bangalore',
  'Chennai',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'Surat',
  'Jaipur',
  'Nagpur',
  'Ludhiana',
  'Indore',
  'Kochi',
  'Coimbatore',
];

const POPULAR_CITIES_DATA = POPULAR_CITY_NAMES.map((name) =>
  (INDIA_LOCATIONS as IndiaLocation[]).find((l) => l.city === name),
).filter((l): l is IndiaLocation => !!l);

function HighlightText({
  text,
  query,
  baseStyle,
  matchStyle,
}: {
  text: string;
  query: string;
  baseStyle: StyleProp<TextStyle>;
  matchStyle: StyleProp<TextStyle>;
}) {
  const q = query.trim().toLowerCase();
  if (!q) return <Text style={baseStyle}>{text}</Text>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <Text style={baseStyle}>{text}</Text>;
  return (
    <Text style={baseStyle}>
      {text.slice(0, idx)}
      <Text style={matchStyle}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

function CityResultRow({
  item,
  query,
  selected,
  onSelect,
}: {
  item: IndiaLocation;
  query: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={onSelect}
      activeOpacity={0.75}
    >
      <View style={styles.resultIconWrap}>
        <MapPin size={14} color={PULSE_SIGNUP.muted} strokeWidth={2} />
      </View>
      <View style={styles.resultBody}>
        <HighlightText
          text={item.city}
          query={query}
          baseStyle={styles.resultCity}
          matchStyle={styles.resultCityMatch}
        />
        <Text style={styles.resultMeta}>
          {item.state} · {ZONE_LABELS[item.zone]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function CityPicker({
  value,
  onChange,
  attempted,
  error,
}: {
  value: IndiaLocation | null;
  onChange: (loc: IndiaLocation | null) => void;
  attempted: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  // Responsive cap instead of a fixed pixel height: a fixed 240px list left no
  // room for the picker on short devices once the keyboard and the fields
  // above it (locality search, street, area, PIN) are accounted for. 32% of
  // the window height scales with the device; the min/max bounds keep it from
  // becoming unusably short on small phones or absurdly tall on tablets.
  const resultsListMaxHeight = Math.max(160, Math.min(320, Math.round(windowHeight * 0.32)));

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const hasError = attempted && !!error;

  const filteredLocations = useMemo(() => {
    if (!hasQuery) return [];
    const q = trimmedQuery.toLowerCase();
    return ALL_LOCATIONS.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q),
    );
  }, [hasQuery, trimmedQuery]);

  const visibleResults = filteredLocations.slice(0, MAX_SEARCH_RESULTS);
  const hasMoreResults = filteredLocations.length > MAX_SEARCH_RESULTS;

  const selectLocation = (loc: IndiaLocation) => {
    onChange(loc);
    setOpen(false);
    setQuery('');
  };

  const closePicker = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      {!open ? (
        value ? (
          <View style={[styles.selectedCard, hasError && styles.fieldShellError]}>
            <TouchableOpacity
              style={styles.selectedBody}
              onPress={() => {
                setOpen(true);
                setQuery('');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.selectedCity}>{value.city}</Text>
              <Text style={styles.selectedMeta}>
                {value.state} · {ZONE_LABELS[value.zone]}
              </Text>
              <Text style={styles.changeHint}>Tap to change</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                onChange(null);
                setQuery('');
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear city"
            >
              <X size={16} color={PULSE_SIGNUP.placeholder} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.trigger, hasError && styles.fieldShellError]}
            onPress={() => setOpen(true)}
            activeOpacity={0.85}
          >
            <MapPin size={15} color={PULSE_SIGNUP.muted} strokeWidth={2} />
            <Text style={styles.triggerText}>Select city or district</Text>
            <ChevronDown size={15} color={PULSE_SIGNUP.placeholder} strokeWidth={2} />
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.panel}>
          <View
            style={[
              styles.searchShell,
              searchFocused && styles.searchShellFocused,
            ]}
          >
            <Search size={15} color={PULSE_SIGNUP.placeholder} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search city or district…"
              placeholderTextColor={PULSE_SIGNUP.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoFocus={Platform.OS !== 'web'}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <X size={14} color={PULSE_SIGNUP.placeholder} strokeWidth={2} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={closePicker} hitSlop={10}>
                <X size={14} color={PULSE_SIGNUP.placeholder} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {!hasQuery ? (
            <View style={styles.popularSection}>
              <Text style={styles.sectionLabel}>Popular cities</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularScroll}
                keyboardShouldPersistTaps="handled"
              >
                {POPULAR_CITIES_DATA.map((loc) => (
                  <TouchableOpacity
                    key={loc.city}
                    style={styles.popularChip}
                    onPress={() => selectLocation(loc)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.popularChipText}>{loc.city}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.popularHint}>
                Type above to search any city or district in India.
              </Text>
            </View>
          ) : (
            <>
              {filteredLocations.length > 0 ? (
                <Text style={styles.resultCount}>
                  {filteredLocations.length} result{filteredLocations.length !== 1 ? 's' : ''}
                  {hasMoreResults ? ` · showing first ${MAX_SEARCH_RESULTS}` : ''}
                </Text>
              ) : null}

              <ScrollView
                style={[styles.resultsList, { maxHeight: resultsListMaxHeight }]}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {visibleResults.length > 0 ? (
                  visibleResults.map((item, index) => {
                    const active =
                      value?.city === item.city && value?.state === item.state;
                    return (
                      <View key={`${item.city}-${item.state}-${index}`}>
                        {index > 0 ? <View style={styles.resultSep} /> : null}
                        <CityResultRow
                          item={item}
                          query={query}
                          selected={!!active}
                          onSelect={() => selectLocation(item)}
                        />
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <MapPin size={22} color={PULSE_SIGNUP.border} strokeWidth={1.75} />
                    <Text style={styles.emptyTitle}>No cities found</Text>
                    <Text style={styles.emptyHint}>
                      Try a different spelling or nearby district name.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {hasError ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: PULSE_SIGNUP_RADIUS.input,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
  },
  triggerText: {
    ...SIGNUP_TEXT.body,
    flex: 1,
    color: PULSE_SIGNUP.placeholder,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: PULSE_SIGNUP_RADIUS.input,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 14,
    gap: 8,
  },
  selectedBody: {
    flex: 1,
    minWidth: 0,
  },
  selectedCity: {
    ...SIGNUP_TEXT.input,
    letterSpacing: -0.15,
  },
  selectedMeta: {
    ...SIGNUP_TEXT.caption,
    marginTop: 3,
  },
  changeHint: {
    ...PULSE_SIGNUP_TYPO.pillSub,
    marginTop: 6,
    color: PULSE_SIGNUP.placeholder,
  },
  clearBtn: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  fieldShellError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  panel: {
    borderRadius: PULSE_SIGNUP_RADIUS.input,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
      web: {
        boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
      } as object,
    }),
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
  },
  searchShellFocused: {
    borderColor: '#d1d5db',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    ...SIGNUP_TEXT.body,
    paddingVertical: Platform.OS === 'android' ? 2 : 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  popularSection: {
    paddingBottom: 12,
  },
  sectionLabel: {
    ...PULSE_SIGNUP_TYPO.label,
    color: PULSE_SIGNUP.placeholder,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  popularScroll: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  popularChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.surface,
  },
  popularChipText: {
    ...SIGNUP_TEXT.captionMedium,
    color: PULSE_SIGNUP.text,
  },
  popularHint: {
    ...SIGNUP_TEXT.caption,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  resultCount: {
    ...PULSE_SIGNUP_TYPO.pillSub,
    color: PULSE_SIGNUP.muted,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  resultsList: {
    // maxHeight is set dynamically at the call site (resultsListMaxHeight) —
    // see the comment there for why a fixed pixel value doesn't work across
    // device sizes.
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  resultRowSelected: {
    backgroundColor: PULSE_SIGNUP.surface,
  },
  resultIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
  },
  resultCity: {
    ...SIGNUP_TEXT.body,
  },
  resultCityMatch: {
    fontWeight: '500',
    color: PULSE_SIGNUP.primaryDark,
  },
  resultMeta: {
    ...SIGNUP_TEXT.caption,
    marginTop: 2,
  },
  resultSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PULSE_SIGNUP.border,
    marginHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: SIGNUP_TEXT.bodyMedium,
  emptyHint: {
    ...SIGNUP_TEXT.caption,
    color: PULSE_SIGNUP.placeholder,
    textAlign: 'center',
    maxWidth: 220,
  },
  fieldError: {
    ...SIGNUP_TEXT.error,
    marginTop: 6,
  },
});
