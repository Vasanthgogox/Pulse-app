import INDIA_LOCATIONS from '@/lib/data/indiaLocations.json';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { C, styles } from '../businessSignUp.styles';

type Zone = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTHEAST';
export type IndiaLocation = { city: string; state: string; zone: Zone };

const ALL_LOCATIONS = INDIA_LOCATIONS as IndiaLocation[];
const MAX_SEARCH_RESULTS = 80;

const ZONE_LABELS: Record<Zone, string> = {
  NORTH: 'North Zone',
  SOUTH: 'South Zone',
  EAST: 'East Zone',
  WEST: 'West Zone',
  NORTHEAST: 'Northeast Zone',
};

const ZONE_COLORS: Record<Zone, { bg: string; text: string; border: string; bar: string }> = {
  NORTH: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', bar: '#3b82f6' },
  SOUTH: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', bar: '#22c55e' },
  EAST: { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff', bar: '#a855f7' },
  WEST: { bg: '#fffbeb', text: '#92400e', border: '#fde68a', bar: '#f59e0b' },
  NORTHEAST: { bg: '#f0fdfa', text: '#134e4a', border: '#99f6e4', bar: '#14b8a6' },
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
  const zc = ZONE_COLORS[item.zone];
  return (
    <TouchableOpacity
      style={[styles.cityResultItem, selected && styles.cityResultItemActive]}
      onPress={onSelect}
    >
      <View style={[styles.cityResultBar, { backgroundColor: zc.bar }]} />
      <View style={styles.cityResultBody}>
        <HighlightText
          text={item.city}
          query={query}
          baseStyle={[styles.cityResultName, selected && { color: C.accent }]}
          matchStyle={styles.cityResultNameMatch}
        />
        <Text style={styles.cityResultState}>{item.state}</Text>
      </View>
      <View
        style={[styles.cityResultZonePill, { backgroundColor: zc.bg, borderColor: zc.border }]}
      >
        <Text style={[styles.cityResultZoneText, { color: zc.text }]}>{item.zone}</Text>
      </View>
      {selected ? (
        <FontAwesome name="check-circle" size={16} color={C.accent} style={localStyles.checkIcon} />
      ) : null}
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

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

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
    <View>
      {!open ? (
        value ? (
          <TouchableOpacity
            style={[styles.citySelectedCard, { borderLeftColor: ZONE_COLORS[value.zone].bar }]}
            onPress={() => {
              setOpen(true);
              setQuery('');
            }}
            activeOpacity={0.82}
          >
            <View style={styles.citySelectedInfo}>
              <Text style={styles.citySelectedName}>{value.city}</Text>
              <View style={styles.citySelectedMeta}>
                <Text style={styles.citySelectedState}>{value.state}</Text>
                <View
                  style={[
                    styles.cityZonePill,
                    {
                      backgroundColor: ZONE_COLORS[value.zone].bg,
                      borderColor: ZONE_COLORS[value.zone].border,
                    },
                  ]}
                >
                  <Text style={[styles.cityZonePillText, { color: ZONE_COLORS[value.zone].text }]}>
                    {ZONE_LABELS[value.zone]}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.cityClearBtn}
              onPress={() => {
                onChange(null);
                setQuery('');
              }}
              hitSlop={12}
            >
              <FontAwesome name="times-circle" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.cityTrigger, attempted && error ? styles.cityTriggerError : null]}
            onPress={() => setOpen(true)}
            activeOpacity={0.7}
          >
            <FontAwesome name="map-marker" size={15} color={C.muted} />
            <Text style={styles.cityTriggerText}>Search & select city</Text>
            <FontAwesome name="chevron-down" size={12} color={C.muted} />
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.cityPickerPanel}>
          <View style={styles.citySearchRow}>
            <FontAwesome name="search" size={14} color={C.muted} />
            <TextInput
              style={styles.citySearchInput}
              placeholder="Search city or district..."
              placeholderTextColor={C.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoFocus={Platform.OS !== 'web'}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <FontAwesome name="times-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={closePicker} hitSlop={10}>
                <FontAwesome name="times" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {!hasQuery ? (
            <View style={styles.popularSection}>
              <Text style={styles.pickerSectionLabel}>Popular freight hubs</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {POPULAR_CITIES_DATA.map((loc) => (
                  <TouchableOpacity
                    key={loc.city}
                    style={[styles.popularChip, { borderColor: ZONE_COLORS[loc.zone].border }]}
                    onPress={() => selectLocation(loc)}
                  >
                    <View
                      style={[styles.popularChipDot, { backgroundColor: ZONE_COLORS[loc.zone].bar }]}
                    />
                    <Text style={styles.popularChipText}>{loc.city}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={localStyles.searchHint}>
                Type in the search box to find your city or district.
              </Text>
            </View>
          ) : (
            <>
              {filteredLocations.length > 0 ? (
                <Text style={styles.resultCount}>
                  {filteredLocations.length} result{filteredLocations.length !== 1 ? 's' : ''}
                  {hasMoreResults ? ` — showing first ${MAX_SEARCH_RESULTS}` : ''}
                </Text>
              ) : null}

              <ScrollView
                style={styles.cityResultsList}
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
                        {index > 0 ? <View style={styles.cityResultSep} /> : null}
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
                  <View style={styles.cityEmptyState}>
                    <FontAwesome name="map-o" size={28} color={C.border} />
                    <Text style={styles.cityEmptyTitle}>No cities found</Text>
                    <Text style={styles.cityEmptyHint}>
                      Try a different spelling or district name.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {attempted && error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  checkIcon: { marginLeft: 8 },
  searchHint: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
