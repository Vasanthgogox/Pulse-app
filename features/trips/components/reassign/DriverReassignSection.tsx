import Theme from '@/constants/Theme';
import { SearchBar } from '@/components/SearchBar';
import type { DriverRow } from '@/features/drivers/services/drivers.service';
import { searchExistingDriversByPhone } from '@/features/drivers/services/drivers.service';
import {
  getDriverAvailabilityByPhone,
  getDriverAvailabilityByPhoneGlobal,
} from '@/features/trips/services/trips.service';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { formatMobileNumber } from '@/lib/format';
import { validatePhone } from '@/lib/phoneValidation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AddDriverForm } from './AddDriverForm';
import { ReassignSegmentedControl } from './ReassignSegmentedControl';
import {
  filterDriversForReassign,
  pilotCodeFromName,
} from './reassignMaster.util';
import { reassignStyles as s } from './reassign.styles';

export type DriverReassignMode = 'existing' | 'add' | 'phone';

type Props = {
  organizationId: string;
  driverAssignOrgId: string | null;
  tripId: string;
  isAggregate: boolean;
  currentDriverId: string | null;
  currentDriverName: string | null;
  drivers: DriverRow[];
  driversLoading: boolean;
  busyDriverIds: Set<string>;
  mode: DriverReassignMode;
  onModeChange: (mode: DriverReassignMode) => void;
  selectedDriverId: string | null;
  onSelectDriverId: (id: string | null) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneBusy: boolean;
  onPhoneBusyChange: (busy: boolean) => void;
};

export function DriverReassignSection({
  organizationId,
  driverAssignOrgId,
  tripId,
  isAggregate,
  currentDriverId,
  currentDriverName,
  drivers,
  driversLoading,
  busyDriverIds,
  mode,
  onModeChange,
  selectedDriverId,
  onSelectDriverId,
  phone,
  onPhoneChange,
  phoneBusy,
  onPhoneBusyChange,
}: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [phoneName, setPhoneName] = useState<string | null>(null);
  const [phoneBusyLabel, setPhoneBusyLabel] = useState<string | null>(null);
  const phoneLookupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneLookupRequestRef = useRef(0);

  const segmentOptions = useMemo(() => {
    const opts: { id: DriverReassignMode; label: string }[] = [
      { id: 'existing', label: 'From fleet' },
      { id: 'add', label: 'Add new' },
    ];
    if (isAggregate) {
      opts.push({ id: 'phone', label: 'Assign by phone' });
    }
    return opts;
  }, [isAggregate]);

  const filtered = useMemo(
    () => filterDriversForReassign(drivers, debouncedSearch),
    [drivers, debouncedSearch],
  );

  useEffect(() => {
    if (mode !== 'phone') {
      setPhoneName(null);
      onPhoneBusyChange(false);
      return;
    }
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneName(null);
      onPhoneBusyChange(false);
      setPhoneBusyLabel(null);
      return;
    }
    if (phoneLookupRef.current) clearTimeout(phoneLookupRef.current);
    const requestId = ++phoneLookupRequestRef.current;

    phoneLookupRef.current = setTimeout(() => {
      phoneLookupRef.current = null;
      const normalized = trimmed.replace(/\s+/g, '');
      if (normalized.length < 10) {
        if (requestId !== phoneLookupRequestRef.current) return;
        setPhoneName(null);
        onPhoneBusyChange(false);
        setPhoneBusyLabel(null);
        return;
      }
      void searchExistingDriversByPhone(normalized).then(async ({ matches }) => {
        if (requestId !== phoneLookupRequestRef.current) return;
        setPhoneName(matches[0]?.full_name ?? null);
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const { result } = driverAssignOrgId
          ? await getDriverAvailabilityByPhoneGlobal(normalized, {
              excludeTripId: tripId,
              anyOpenTripBlocks: true,
              requireAuthoritativeRpc: true,
            })
          : await getDriverAvailabilityByPhone(orgForDriver, normalized, {
              excludeTripId: tripId,
            });
        if (requestId !== phoneLookupRequestRef.current) return;
        onPhoneBusyChange(result.isBusy);
        setPhoneBusyLabel(result.ongoingTripLabel ?? null);
      });
    }, 400);

    return () => {
      phoneLookupRequestRef.current += 1;
      if (phoneLookupRef.current) clearTimeout(phoneLookupRef.current);
    };
  }, [
    mode,
    phone,
    driverAssignOrgId,
    organizationId,
    tripId,
    onPhoneBusyChange,
  ]);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Driver</Text>
      {currentDriverName ? (
        <View style={s.currentCard}>
          <Text style={s.currentName}>{currentDriverName}</Text>
          <Text style={s.currentMeta}>Currently assigned</Text>
        </View>
      ) : null}

      <ReassignSegmentedControl
        options={segmentOptions}
        value={mode}
        onChange={(id) => {
          onModeChange(id);
          if (id === 'phone') onSelectDriverId(null);
        }}
      />

      {mode === 'existing' ? (
        <>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search drivers…"
            style={{ marginBottom: 10 }}
          />
          {driversLoading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={Theme.primary} />
          ) : (
            <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyText}>No drivers match your search.</Text>
                  <TouchableOpacity
                    style={s.emptyCta}
                    onPress={() => onModeChange('add')}
                    activeOpacity={0.9}
                  >
                    <Text style={s.emptyCtaText}>Add new driver</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filtered.map((d) => {
                  const busy = busyDriverIds.has(d.id) && d.id !== currentDriverId;
                  const selected = selectedDriverId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.row, selected && s.rowSelected, busy && s.rowBusy]}
                      onPress={() => !busy && onSelectDriverId(d.id)}
                      disabled={busy}
                      activeOpacity={busy ? 1 : 0.85}
                    >
                      <View style={s.avatar}>
                        <Text style={s.avatarText}>{pilotCodeFromName(d.name ?? '?')}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[s.rowTitle, busy && s.rowTitleMuted]}
                          numberOfLines={1}
                        >
                          {d.name ?? '—'}
                        </Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {busy ? 'On another trip' : d.phone ?? 'No phone'}
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

      {mode === 'add' ? (
        <AddDriverForm
          organizationId={organizationId}
          onCreated={(id) => {
            onSelectDriverId(id);
            onModeChange('existing');
          }}
        />
      ) : null}

      {mode === 'phone' ? (
        <View style={s.form}>
          <Text style={s.label}>Driver phone</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={(v) => onPhoneChange(formatMobileNumber(v))}
            placeholder="e.g. +91 98765 43210"
            placeholderTextColor={Theme.textMuted}
            keyboardType="phone-pad"
          />
          {phoneName ? (
            <Text style={[s.rowSub, { marginTop: 4 }]}>Found: {phoneName}</Text>
          ) : null}
          {phoneBusy ? (
            <Text style={s.inlineError}>
              Driver on {phoneBusyLabel ?? 'another ongoing trip'} — choose another driver or
              confirm availability first.
            </Text>
          ) : null}
          {phone.trim() && validatePhone(phone.trim()) ? (
            <Text style={s.inlineError}>{validatePhone(phone.trim())}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
