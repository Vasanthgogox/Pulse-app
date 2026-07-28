import Theme from '@/constants/Theme';
import { SearchBar } from '@/components/SearchBar';
import type { VehicleRow } from '@/features/vehicles/services/vehicles.service';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { formatIndianVehicleNumberInput } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AddVehicleForm } from './AddVehicleForm';
import { ReassignSegmentedControl } from './ReassignSegmentedControl';
import {
  filterVehiclesForReassign,
  vehicleRowLabel,
} from './reassignMaster.util';
import { reassignStyles as s } from './reassign.styles';

export type VehicleReassignMode = 'existing' | 'add';

type Props = {
  organizationId: string;
  isAggregate: boolean;
  driverModeIsPhone: boolean;
  currentVehicleId: string | null;
  currentVehicleLabel: string | null;
  vehicles: VehicleRow[];
  vehiclesLoading: boolean;
  busyVehicleIds: Set<string>;
  mode: VehicleReassignMode;
  onModeChange: (mode: VehicleReassignMode) => void;
  selectedVehicleId: string | null;
  onSelectVehicleId: (id: string | null) => void;
  adHocPlate: string;
  onAdHocPlateChange: (value: string) => void;
  /** Hide title / current card / segment — parent workspace owns chrome. */
  embedded?: boolean;
};

export function VehicleReassignSection({
  organizationId,
  isAggregate,
  driverModeIsPhone,
  currentVehicleId,
  currentVehicleLabel,
  vehicles,
  vehiclesLoading,
  busyVehicleIds,
  mode,
  onModeChange,
  selectedVehicleId,
  onSelectVehicleId,
  adHocPlate,
  onAdHocPlateChange,
  embedded = false,
}: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(
    () => filterVehiclesForReassign(vehicles, debouncedSearch),
    [vehicles, debouncedSearch],
  );

  const showAdHocPlate =
    isAggregate && (driverModeIsPhone || !selectedVehicleId);

  return (
    <View style={[s.section, embedded && { marginBottom: 0 }]}>
      {embedded ? null : <Text style={s.sectionTitle}>Vehicle</Text>}
      {!embedded && currentVehicleLabel ? (
        <View style={s.currentCard}>
          <Text style={s.currentName}>{currentVehicleLabel}</Text>
          <Text style={s.currentMeta}>Currently assigned</Text>
        </View>
      ) : null}

      {!embedded && !isAggregate ? (
        <ReassignSegmentedControl
          options={[
            { id: 'existing' as const, label: 'From fleet' },
            { id: 'add' as const, label: 'Add new' },
          ]}
          value={mode}
          onChange={onModeChange}
        />
      ) : null}

      {!isAggregate && mode === 'existing' ? (
        <>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search vehicles…"
            style={{ marginBottom: 10 }}
          />
          {vehiclesLoading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={Theme.primary} />
          ) : (
            <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyText}>No vehicles match your search.</Text>
                  <TouchableOpacity
                    style={s.emptyCta}
                    onPress={() => onModeChange('add')}
                    activeOpacity={0.9}
                  >
                    <Text style={s.emptyCtaText}>Add new vehicle</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filtered.map((v) => {
                  const busy =
                    busyVehicleIds.has(v.id) && v.id !== currentVehicleId;
                  const selected = selectedVehicleId === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[s.row, selected && s.rowSelected, busy && s.rowBusy]}
                      onPress={() => !busy && onSelectVehicleId(v.id)}
                      disabled={busy}
                      activeOpacity={busy ? 1 : 0.85}
                    >
                      <View style={[s.avatar, { backgroundColor: Theme.textSecondary }]}>
                        <FontAwesome name="truck" size={16} color={Theme.textOnPrimary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[s.rowTitle, busy && s.rowTitleMuted]}
                          numberOfLines={1}
                        >
                          {vehicleRowLabel(v)}
                        </Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {busy ? 'On another trip' : 'Available'}
                        </Text>
                      </View>
                      {selected ? (
                        <FontAwesome name="check-circle" size={20} color={Theme.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </>
      ) : null}

      {!isAggregate && mode === 'add' ? (
        <AddVehicleForm
          organizationId={organizationId}
          onCreated={(id) => {
            onSelectVehicleId(id);
            onModeChange('existing');
          }}
        />
      ) : null}

      {showAdHocPlate ? (
        <View style={[s.form, { marginTop: 12 }]}>
          <Text style={s.label}>
            {driverModeIsPhone
              ? 'Vehicle plate (required if no fleet vehicle selected)'
              : 'Or enter plate without fleet vehicle'}
          </Text>
          <TextInput
            style={s.input}
            value={adHocPlate}
            onChangeText={(t) => onAdHocPlateChange(formatIndianVehicleNumberInput(t))}
            placeholder="e.g. TN 01 AB 1234"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
          />
        </View>
      ) : null}
    </View>
  );
}
