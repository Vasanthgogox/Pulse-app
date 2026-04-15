/**
 * Add Vehicle Entry modal — vehicle-specific ledger (IN/OUT, category, amount, payment, trip, notes).
 * Vehicle-relevant categories only; optional subcategory, payment mode, driver, odometer, vendor.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { formatIndianVehicleNumber } from '@/lib/format';
import { VALIDATION, dateISO } from '@/lib/validation';
import type { CreateLedgerEntryData } from '@/features/finance';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type VehicleEntryType = 'in' | 'out';

/** Main expense categories (Debit) — simple English for Indian fleet owners. */
const VEHICLE_EXPENSE_MAIN: { id: string; name: string; sub?: { id: string; name: string }[] }[] = [
  { id: 'FUEL', name: 'Fuel', sub: [{ id: 'DIESEL', name: 'Diesel' }, { id: 'FUEL_ADVANCE', name: 'Fuel advance (driver)' }, { id: 'FUEL_CARD', name: 'Fuel card' }] },
  { id: 'TOLL', name: 'Toll', sub: [{ id: 'FASTAG', name: 'FASTag' }, { id: 'CASH_TOLL', name: 'Cash toll' }, { id: 'STATE_TAX', name: 'State tax' }, { id: 'CHECKPOST', name: 'Checkpost' }] },
  { id: 'DRIVER_EXPENSE', name: 'Driver', sub: [{ id: 'DRIVER_FOOD', name: 'Driver food' }, { id: 'DRIVER_ALLOWANCE', name: 'Driver allowance' }, { id: 'DRIVER_ADVANCE', name: 'Driver advance' }, { id: 'DRIVER_PHONE', name: 'Driver phone' }] },
  { id: 'LOADING', name: 'Load unload', sub: [{ id: 'LOADING_CHARGE', name: 'Loading' }, { id: 'UNLOADING_CHARGE', name: 'Unloading' }, { id: 'LABOUR', name: 'Labour' }, { id: 'PARKING', name: 'Parking' }, { id: 'ROUTE_EXPENSE', name: 'Route' }] },
  { id: 'REPAIRS', name: 'Repair', sub: [{ id: 'MINOR_REPAIR', name: 'Minor repair' }, { id: 'MAJOR_REPAIR', name: 'Major repair' }, { id: 'SERVICE', name: 'Service' }, { id: 'BREAKDOWN', name: 'Breakdown' }] },
  { id: 'TYRES', name: 'Tyre', sub: [{ id: 'NEW_TYRE', name: 'New tyre' }, { id: 'REPLACEMENT', name: 'Replacement' }, { id: 'RETREAD', name: 'Retread' }, { id: 'PUNCTURE', name: 'Puncture' }] },
  { id: 'INSURANCE', name: 'Insurance', sub: [{ id: 'PREMIUM', name: 'Premium' }, { id: 'ACCIDENT_REPAIR', name: 'Accident repair' }, { id: 'CLAIM_DEDUCTION', name: 'Claim' }] },
  { id: 'PERMIT_TAX', name: 'Permit & tax', sub: [{ id: 'NATIONAL_PERMIT', name: 'National permit' }, { id: 'ROAD_TAX', name: 'Road tax' }, { id: 'FITNESS', name: 'Fitness' }, { id: 'POLLUTION', name: 'Pollution' }] },
  { id: 'FINE', name: 'Fine', sub: [{ id: 'RTO_FINE', name: 'RTO fine' }, { id: 'PENALTY', name: 'Other penalty' }] },
  { id: 'VEHICLE_HIRE', name: 'Vehicle hire', sub: [{ id: 'MARKET_HIRE', name: 'Market hire' }, { id: 'VEHICLE_RENT', name: 'Rent' }] },
  { id: 'MISC', name: 'Other' },
];

/** Income categories (Credit) — simple English. */
const VEHICLE_INCOME_MAIN: { id: string; name: string }[] = [
  { id: 'RENTAL_INCOME', name: 'Rental income' },
  { id: 'DETENTION', name: 'Detention' },
  { id: 'EXTRA_LOAD', name: 'Extra load' },
  { id: 'MISC_INCOME', name: 'Other income' },
];

/** Flat list for picker — expense. */
export const VEHICLE_ENTRY_CATEGORIES = VEHICLE_EXPENSE_MAIN.flatMap((c) =>
  c.sub ? c.sub.map((s) => ({ id: s.id, name: `${c.name} → ${s.name}` })) : [{ id: c.id, name: c.name }]
);

/** Payment modes. */
export const PAYMENT_MODES = [
  { id: 'CASH', name: 'Cash' },
  { id: 'UPI', name: 'UPI' },
  { id: 'BANK', name: 'Bank Transfer' },
  { id: 'CHEQUE', name: 'Cheque' },
  { id: 'FUEL_CARD', name: 'Fuel Card' },
  { id: 'FASTAG', name: 'FASTag' },
  { id: 'CREDIT', name: 'Credit' },
] as const;

export interface TripOption {
  id: string;
  trip_number: string;
  route_label?: string | null;
  trip_date?: string | null;
  /** When trip is selected, driver can be auto-filled for driver-related categories. */
  driver_id?: string | null;
}

export interface DriverOption {
  id: string;
  name: string;
}

export interface AddVehicleEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateLedgerEntryData) => void;
  vehicleNumber: string;
  entryContextLabel?: string;
  trips: TripOption[];
  /** Optional: show Driver dropdown when adding entry (e.g. from ledger-sync). */
  drivers?: DriverOption[];
  fullPage?: boolean;
}

/** Categories that show odometer field (fuel, repairs, tyres). */
const ODOMETER_CATEGORY_IDS = new Set([
  'FUEL', 'DIESEL', 'FUEL_ADVANCE', 'FUEL_CARD',
  'REPAIRS', 'MINOR_REPAIR', 'MAJOR_REPAIR', 'SERVICE', 'BREAKDOWN',
  'TYRES', 'NEW_TYRE', 'REPLACEMENT', 'RETREAD', 'PUNCTURE',
]);

/** Show Driver field only for these categories (driver-related). */
const DRIVER_RELATED_CATEGORY_IDS = new Set([
  'DRIVER_EXPENSE', 'DRIVER_FOOD', 'DRIVER_ALLOWANCE', 'DRIVER_ADVANCE', 'DRIVER_PHONE',
  'FUEL_ADVANCE',
]);

export function AddVehicleEntryModal({
  visible,
  onClose,
  onSubmit,
  vehicleNumber,
  entryContextLabel,
  trips = [],
  drivers = [],
  fullPage = false,
}: AddVehicleEntryModalProps) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<VehicleEntryType>('out');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string>(PAYMENT_MODES[0].id);
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [odometerStr, setOdometerStr] = useState('');
  const [vendorStr, setVendorStr] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);

  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const amount = Math.round(parseFloat(amountStr) || 0);
  const selectedTrip = tripId ? trips.find((t) => t.id === tripId) ?? null : null;
  const tripNumber = selectedTrip?.trip_number ?? null;
  const isOut = type === 'out';

  const categoryList = isOut ? VEHICLE_ENTRY_CATEGORIES : VEHICLE_INCOME_MAIN.map((c) => ({ id: c.id, name: c.name }));
  const categoryLabel = categoryId ? (categoryList.find((c) => c.id === categoryId)?.name ?? categoryId) : null;
  const showOdometer = isOut && categoryId != null && ODOMETER_CATEGORY_IDS.has(categoryId);
  const showDriverField = isOut && drivers.length > 0 && categoryId != null && DRIVER_RELATED_CATEGORY_IDS.has(categoryId);
  const canSubmit =
    amount > 0 &&
    amount <= VALIDATION.AMOUNT_MAX &&
    (!isOut || categoryId != null);

  useEffect(() => {
    if (!visible) {
      setShowCategoryPicker(false);
      setShowTripPicker(false);
      setShowPaymentPicker(false);
      setShowDriverPicker(false);
      return;
    }
    setEntryDate(new Date().toISOString().slice(0, 10));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setCategoryId(null);
  }, [type, visible]);

  /** When trip is selected and category is driver-related, auto-fill driver from trip if present in list. */
  useEffect(() => {
    if (!visible || !showDriverField || !selectedTrip?.driver_id || drivers.length === 0) return;
    const tripDriverId = selectedTrip.driver_id;
    const driverInList = drivers.some((d) => d.id === tripDriverId);
    if (driverInList && driverId !== tripDriverId) setDriverId(tripDriverId);
  }, [visible, showDriverField, selectedTrip?.driver_id, drivers, driverId]);

  /** Clear driver when category is no longer driver-related (so we don't tag wrong category). */
  useEffect(() => {
    if (!visible || showDriverField) return;
    if (driverId != null) setDriverId(null);
  }, [visible, showDriverField, driverId]);

  const buildDescription = () => {
    const parts: string[] = [];
    if (categoryLabel) parts.push(categoryLabel);
    const paymentName = PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name;
    if (paymentName) parts.push(`Payment: ${paymentName}`);
    if (paymentReference.trim()) parts.push(`UTR: ${paymentReference.trim()}`);
    if (odometerStr.trim()) parts.push(`Odo: ${odometerStr.trim()}`);
    if (vendorStr.trim()) parts.push(vendorStr.trim());
    if (notes.trim()) parts.push(`Notes: ${notes.trim()}`);
    return parts.length > 0 ? parts.join(' | ') : 'ENTRY';
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const entryDateErr = entryDate.trim() ? dateISO()(entryDate) : null;
    const date =
      entryDate.trim() && !entryDateErr && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
        ? entryDate
        : new Date().toISOString().slice(0, 10);
    const data: CreateLedgerEntryData = {
      trip_id: tripId ?? null,
      trip_number: tripNumber ?? null,
      party_name: categoryLabel ?? '—',
      description: buildDescription(),
      amount_in: isOut ? 0 : amount,
      amount_out: isOut ? amount : 0,
      transaction_date: date,
      contact_id: driverId ?? null,
      contact_type: driverId ? 'driver' : null,
      vehicle_number: vehicleNumber || null,
      driver_name: driverId ? (drivers.find((d) => d.id === driverId)?.name ?? null) : null,
    };
    onSubmit(data);
    setAmountStr('');
    setCategoryId(null);
    setTripId(null);
    setPaymentReference('');
    setNotes('');
    setDriverId(null);
    setOdometerStr('');
    setVendorStr('');
    onClose();
  };

  const handleClose = () => {
    setShowCategoryPicker(false);
    setShowTripPicker(false);
    setShowPaymentPicker(false);
    setShowDriverPicker(false);
    setCategoryId(null);
    setTripId(null);
    onClose();
  };

  if (!visible && !fullPage) return null;

  const windowHeight = Dimensions.get('window').height;
  const panelHeight = fullPage
    ? undefined
    : Math.min(
        windowHeight * Layout.ledgerPanelHeightRatio,
        Layout.ledgerPanelMaxHeight
      );
  const scrollContentPaddingBottom = fullPage ? 24 : 280;

  const submitButton = (
    <TouchableOpacity
      style={[
        styles.submitBtn,
        type === 'in' ? styles.submitBtnIn : styles.submitBtnOut,
        !canSubmit && styles.submitBtnDisabled,
      ]}
      onPress={handleSubmit}
      disabled={!canSubmit}
      activeOpacity={0.9}
    >
      <Text style={styles.submitBtnText}>SAVE ENTRY</Text>
    </TouchableOpacity>
  );

  const formContent = (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoid, fullPage && styles.keyboardAvoidFullPage]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={fullPage ? 56 : insets.top + 16}
    >
      <View
        style={[
          styles.panel,
          fullPage && styles.panelFullPage,
          {
            paddingBottom: fullPage ? 0 : insets.bottom + Layout.modalBottomPadding,
            ...(panelHeight != null ? { height: panelHeight, maxHeight: panelHeight } : {}),
          },
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEnabled={!showCategoryPicker && !showTripPicker && !showPaymentPicker && !showDriverPicker}
          style={styles.panelScroll}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={[
            styles.panelScrollContent,
            fullPage && styles.panelScrollContentFullPage,
            { paddingBottom: fullPage ? 16 : scrollContentPaddingBottom },
          ]}
        >
          <View style={styles.panelScrollInner}>
            <View style={styles.headerRow}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>LEDGER SYNC</Text>
                {entryContextLabel ? (
                  <Text style={styles.entryContextLabel} numberOfLines={1}>
                    Entry for {entryContextLabel}
                  </Text>
                ) : null}
              </View>
              <View style={styles.toggleWrap}>
                <TouchableOpacity
                  style={[styles.toggleBtn, type === 'in' && styles.toggleBtnIn]}
                  onPress={() => setType('in')}
                  activeOpacity={0.8}
                  accessibilityLabel={type === 'in' ? 'Money in — selected' : 'Money in — tap to record income'}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      type === 'in' && styles.toggleBtnTextActive,
                    ]}
                  >
                    IN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, type === 'out' && styles.toggleBtnOut]}
                  onPress={() => setType('out')}
                  activeOpacity={0.8}
                  accessibilityLabel={type === 'out' ? 'Money out — selected' : 'Money out — tap to record expense'}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      type === 'out' && styles.toggleBtnTextActive,
                    ]}
                  >
                    OUT
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <FontAwesome name="times" size={10} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>AMOUNT (INR)</Text>
              <View style={styles.amountRow}>
                <Text
                  style={[
                    styles.amountSymbol,
                    type === 'in' ? styles.amountSymbolIn : styles.amountSymbolOut,
                  ]}
                >
                  ₹
                </Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={visible}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelWrap}>
                <Text style={styles.fieldLabel} numberOfLines={1}>ENTRY DATE</Text>
              </View>
              <TextInput
                style={styles.fieldInput}
                value={entryDate}
                onChangeText={setEntryDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Theme.textMutedDemo}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                accessibilityLabel="Entry date — when the money was received or paid"
              />
            </View>

            <Text style={styles.sectionLabel}>CATEGORY & AMOUNT</Text>
            <View style={styles.twoCol}>
              <TouchableOpacity
                style={styles.fieldBlock}
                onPress={() => {
                  setShowTripPicker(false);
                  setShowPaymentPicker(false);
                  setShowDriverPicker(false);
                  setShowCategoryPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.fieldLabelWrapCol}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>{type === 'out' ? 'EXPENSE TYPE' : 'INCOME TYPE'}</Text>
                </View>
                <View style={styles.fieldValueWrap}>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {categoryLabel ?? (type === 'out' ? 'Select category...' : 'Select (optional)...')}
                  </Text>
                  <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} style={styles.fieldChevron} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fieldBlock}
                onPress={() => {
                  setShowCategoryPicker(false);
                  setShowPaymentPicker(false);
                  setShowDriverPicker(false);
                  setShowTripPicker((v) => !v);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.fieldLabelWrapCol}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>TRIP (optional)</Text>
                </View>
                <View style={styles.fieldValueWrap}>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {tripNumber || 'No trip'}
                  </Text>
                  <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} style={styles.fieldChevron} />
                </View>
              </TouchableOpacity>
            </View>

            {showCategoryPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator nestedScrollEnabled>
                  <TouchableOpacity style={[styles.pickerItem, !categoryId && styles.pickerItemActive]} onPress={() => { setCategoryId(null); setShowCategoryPicker(false); }}>
                    <Text style={styles.pickerItemText}>{type === 'out' ? 'Select category...' : 'None'}</Text>
                  </TouchableOpacity>
                  {categoryList.map((cat) => (
                    <TouchableOpacity key={cat.id} style={[styles.pickerItem, categoryId === cat.id && styles.pickerItemActive]} onPress={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}>
                      <Text style={styles.pickerItemText} numberOfLines={2}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => {
                setShowCategoryPicker(false);
                setShowTripPicker(false);
                setShowDriverPicker(false);
                setShowPaymentPicker((v) => !v);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.fieldLabelWrap}>
                <Text style={styles.fieldLabel} numberOfLines={1}>PAYMENT MODE</Text>
              </View>
              <View style={styles.fieldValueWrap}>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {PAYMENT_MODES.find((p) => p.id === paymentModeId)?.name ?? 'Cash'}
                </Text>
                <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} style={styles.fieldChevron} />
              </View>
            </TouchableOpacity>

            {paymentModeId !== 'CASH' && (
              <View style={styles.fieldRow}>
                <View style={styles.fieldLabelWrap}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>REFERENCE NO / UTR</Text>
                </View>
                <TextInput
                  style={styles.fieldInput}
                  value={paymentReference}
                  onChangeText={setPaymentReference}
                  placeholder="Refer the bank to validate"
                  placeholderTextColor={Theme.textMutedDemo}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  accessibilityLabel="Reference Number or UTR"
                />
              </View>
            )}

            {type === 'out' && (
              <View style={[styles.fieldRow, styles.fieldRowVehicle]}>
                <View style={styles.fieldLabelWrap}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>VEHICLE</Text>
                </View>
                <View style={styles.fieldValueWrap}>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {formatIndianVehicleNumber(vehicleNumber)}
                  </Text>
                </View>
              </View>
            )}

            {showPaymentPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator nestedScrollEnabled>
                  {PAYMENT_MODES.map((p) => (
                    <TouchableOpacity key={p.id} style={[styles.pickerItem, paymentModeId === p.id && styles.pickerItemActive]} onPress={() => { setPaymentModeId(p.id); setShowPaymentPicker(false); }}>
                      <Text style={styles.pickerItemText}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showTripPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator nestedScrollEnabled>
                  <TouchableOpacity style={[styles.pickerItem, !tripId && styles.pickerItemActive]} onPress={() => { setTripId(null); setShowTripPicker(false); }} activeOpacity={0.6}>
                    <Text style={styles.pickerItemText}>General</Text>
                  </TouchableOpacity>
                  {trips.map((t) => {
                    const routeAndDate = [t.route_label, t.trip_date].filter(Boolean).join(' · ');
                    return (
                      <TouchableOpacity key={t.id} style={[styles.pickerItem, tripId === t.id && styles.pickerItemActive]} onPress={() => { setTripId(t.id); setShowTripPicker(false); }} activeOpacity={0.6}>
                        <View style={styles.pickerItemTripContent}>
                          <Text style={styles.pickerItemText} numberOfLines={1}>{t.trip_number}</Text>
                          {routeAndDate ? <Text style={styles.pickerItemSubtext} numberOfLines={1}>{routeAndDate}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {showDriverPicker && drivers.length > 0 && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator nestedScrollEnabled>
                  <TouchableOpacity style={[styles.pickerItem, !driverId && styles.pickerItemActive]} onPress={() => { setDriverId(null); setShowDriverPicker(false); }}>
                    <Text style={styles.pickerItemText}>None</Text>
                  </TouchableOpacity>
                  {drivers.map((d) => (
                    <TouchableOpacity key={d.id} style={[styles.pickerItem, driverId === d.id && styles.pickerItemActive]} onPress={() => { setDriverId(d.id); setShowDriverPicker(false); }}>
                      <Text style={styles.pickerItemText} numberOfLines={1}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            {showDriverField && (
              <TouchableOpacity
                style={styles.fieldRow}
                onPress={() => { setShowCategoryPicker(false); setShowTripPicker(false); setShowPaymentPicker(false); setShowDriverPicker((v) => !v); }}
                activeOpacity={0.8}
              >
                <View style={styles.fieldLabelWrap}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>DRIVER</Text>
                </View>
                <View style={styles.fieldValueWrap}>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {driverId ? (drivers.find((d) => d.id === driverId)?.name ?? '') : 'None'}
                  </Text>
                  <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} style={styles.fieldChevron} />
                </View>
              </TouchableOpacity>
            )}
            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelWrap}>
                <Text style={styles.fieldLabel} numberOfLines={1}>NOTES</Text>
              </View>
              <TextInput
                style={styles.notesInput}
                placeholder="Vendor, location, bill no..."
                placeholderTextColor={Theme.textMutedDemo}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                maxLength={VALIDATION.NOTES_MAX_LENGTH}
              />
            </View>

            {showOdometer && (
              <View style={styles.fieldRow}>
                <View style={styles.fieldLabelWrap}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>ODOMETER (km)</Text>
                </View>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 45000"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={odometerStr}
                  onChangeText={setOdometerStr}
                  keyboardType="number-pad"
                />
              </View>
            )}
            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelWrap}>
                <Text style={styles.fieldLabel} numberOfLines={1}>VENDOR / LOCATION</Text>
              </View>
              <TextInput
                style={styles.fieldInput}
                placeholder="Fuel station, workshop..."
                placeholderTextColor={Theme.textMutedDemo}
                value={vendorStr}
                onChangeText={setVendorStr}
                maxLength={200}
              />
            </View>

            {!fullPage && submitButton}
          </View>
        </ScrollView>
        {fullPage ? (
          <View style={[styles.fullPageFooter, { paddingBottom: insets.bottom + 16 }]}>
            {submitButton}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );

  if (fullPage) return formContent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          activeOpacity={1}
        />
        {formContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  keyboardAvoid: {
    width: '100%',
  },
  keyboardAvoidFullPage: {
    flex: 1,
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  panelFullPage: {
    flex: 1,
    borderTopWidth: 0,
  },
  fullPageFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
  },
  panelScroll: { flex: 1, minHeight: 0 },
  panelScrollInner: { gap: 16 },
  panelScrollContent: { gap: 16, paddingBottom: 8 },
  panelScrollContentFullPage: { gap: 20, paddingTop: 8 },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize + 4,
  },
  fieldRowVehicle: {
    marginTop: 4,
  },
  fieldLabelWrap: {
    width: 100,
    paddingRight: 10,
    flexShrink: 0,
  },
  fieldLabelWrapCol: {
    width: 72,
    paddingRight: 6,
    flexShrink: 0,
  },
  fieldValueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  notesInput: {
    flex: 1,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    paddingVertical: 6,
    minHeight: 40,
    minWidth: 0,
    textAlignVertical: 'top',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: Theme.surfaceLight,
    padding: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    flexShrink: 0,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  toggleBtnIn: { backgroundColor: Theme.darkGreen },
  toggleBtnOut: { backgroundColor: Theme.teslaRed },
  toggleBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleBtnTextActive: { color: Theme.textOnPrimary },
  entryContextLabel: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  amountBlock: {
    backgroundColor: Theme.surfaceLight,
    padding: 16,
    minHeight: 56,
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  amountSymbol: {
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  amountSymbolIn: { color: Theme.darkGreen },
  amountSymbolOut: { color: Theme.teslaRed },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  fieldBlock: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize + 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldValue: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    minWidth: 0,
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  fieldChevron: { marginLeft: 4, flexShrink: 0 },
  pickerList: {
    height: 220,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    overflow: 'hidden',
  },
  pickerScroll: {
    flex: 1,
    height: 220,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  pickerItemActive: { backgroundColor: Theme.surfaceLight },
  pickerItemTripContent: { flex: 1 },
  pickerItemText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  pickerItemSubtext: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 2,
    textTransform: 'none',
  },
  submitBtn: {
    paddingVertical: 16,
    minHeight: Layout.minTouchTargetSize + 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnIn: { backgroundColor: Theme.darkGreen },
  submitBtnOut: { backgroundColor: Theme.buttonPrimary },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
});
