/**
 * Full-page Salary Request screen (driver).
 * Matches reference: header, balance card, fleet, type, period, amount, note, sticky submit, success state.
 * Safe area and Theme/Layout compliant.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { tripEarningsForDriver } from '@/lib/driverUtils';
import { VALIDATION } from '@/lib/validation';
import * as driversService from '@/services/driversService';
import * as salaryRequestsService from '@/services/salaryRequestsService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
  Image,
    KeyboardAvoidingView,
  Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
}

function formatLedgerDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KEYPAD_KEYS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'delete'];

function formatSalaryDateDisplay(d: Date): string {
  return `${MONTH_SHORT_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRupeeDisplay(raw: string): string {
  const cleaned = raw.replace(/[^0-9]/g, '');
  const amount = Number(cleaned || '0');
  return amount.toLocaleString('en-IN');
}

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const REQUEST_TYPES: { type: salaryRequestsService.SalaryRequestType; label: string; hint: string }[] = [
  { type: 'monthly', label: 'Monthly', hint: 'Full monthly pay' },
  { type: 'advance', label: 'Advance', hint: 'Before payday' },
  { type: 'trip_based', label: 'Trip-based', hint: 'Completed trips' },
];

export default function SalaryRequestScreen() {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const router = useRouter();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);

  const [salaryRequestOrg, setSalaryRequestOrg] = useState<{
    driverId: string;
    orgId: string;
    orgName: string;
    avatarUrl: string | null;
  } | null>(null);
  const [salaryRequestType, setSalaryRequestType] = useState<salaryRequestsService.SalaryRequestType | null>(null);
  const [salaryRequestAmount, setSalaryRequestAmount] = useState('');
  const [salaryRequestNote, setSalaryRequestNote] = useState('');
  const [salaryRequestSubmitting, setSalaryRequestSubmitting] = useState(false);
  const [selectedSalaryTripIds, setSelectedSalaryTripIds] = useState<string[]>([]);
  const [salaryRequestDate, setSalaryRequestDate] = useState<Date | null>(null);
  const [showSalaryMonthDropdown, setShowSalaryMonthDropdown] = useState(false);
  const [showRequestTypeMenu, setShowRequestTypeMenu] = useState(false);
  const [blink, setBlink] = useState(true);

  /** Success state: show full-screen success and stored submission details */
  const [isSuccess, setIsSuccess] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    requestType: salaryRequestsService.SalaryRequestType;
    amount: string;
    orgName: string;
  } | null>(null);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ]).then(([driversRes, invRes]) => {
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      setInvites(invRes.invites ?? []);
      setLinkedDrivers(drivers);
      if (drivers.length > 0) {
        const driverIds = drivers.map((d) => d.id);
        Promise.all([
          tripsService.getTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setBlink((prev) => !prev), 600);
    return () => clearInterval(interval);
  }, []);

  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    return linkedDrivers
      .filter((d) => accepted.some((i) => String(i.from_organization_id || '') === String(d.organization_id || '')))
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || '')
        );
        const rawName =
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).from_org_name) ||
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).fromOrgName) ||
          null;
        const avatarCandidate =
          (inv && (inv as { from_org_avatar_url?: string | null }).from_org_avatar_url) ||
          (inv && (inv as { from_org_logo_url?: string | null }).from_org_logo_url) ||
          (inv && (inv as { from_org_image_url?: string | null }).from_org_image_url) ||
          (inv && (inv as { from_org_photo_url?: string | null }).from_org_photo_url) ||
          (inv && (inv as { from_org_logo?: string | null }).from_org_logo) ||
          null;
        const avatarUrl = avatarCandidate && String(avatarCandidate).trim() ? String(avatarCandidate).trim() : null;
        const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : null;
        return {
          driverId: d.id,
          orgId: d.organization_id,
          orgName: name || 'Fleet',
          avatarUrl,
        };
      });
  }, [linkedDrivers, invites]);

  const effectiveSalaryOrg = salaryRequestOrg ?? (salaryRequestOrgOptions.length === 1 ? salaryRequestOrgOptions[0] : null);

  const completedTrips = useMemo(() => {
    const list = trips.filter((t) => isCompleted(t.status));
    return [...list].sort((a, b) => {
      const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
      const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
      return db - da;
    });
  }, [trips]);

  const receivedByTripId = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const e of ledgerEntries) {
      const amt = Number(e.amount) || 0;
      const tid = e.trip_id?.trim() || null;
      if (tid) byTrip[tid] = (byTrip[tid] ?? 0) + amt;
    }
    return byTrip;
  }, [ledgerEntries]);

  const pendingTripsForSalaryOrg = useMemo(() => {
    if (!effectiveSalaryOrg) return [];
    return completedTrips.filter(
      (t) => t.driver_id === effectiveSalaryOrg.driverId && (receivedByTripId[t.id] ?? 0) === 0
    );
  }, [effectiveSalaryOrg, completedTrips, receivedByTripId]);

  const pendingTotalForSalaryOrg = useMemo(
    () => Math.round(pendingTripsForSalaryOrg.reduce((s, t) => s + tripEarnings(t), 0)),
    [pendingTripsForSalaryOrg]
  );

  const selectedTripTotal = useMemo(() => {
    if (selectedSalaryTripIds.length === 0) return 0;
    return Math.round(
      pendingTripsForSalaryOrg
        .filter((t) => selectedSalaryTripIds.includes(t.id))
        .reduce((s, t) => s + tripEarnings(t), 0)
    );
  }, [pendingTripsForSalaryOrg, selectedSalaryTripIds]);

  const defaultSalaryRequestDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  }, []);

  const salaryCurrentYear = new Date().getFullYear();

  useEffect(() => {
    if (salaryRequestOrgOptions.length === 1) {
      setSalaryRequestOrg(salaryRequestOrgOptions[0]);
    } else {
      setSalaryRequestOrg(null);
    }
  }, [salaryRequestOrgOptions]);

  /** Sync amount field when user selects/deselects trips (trip-based only). No auto-select of trips. */
  useEffect(() => {
    if (salaryRequestType === 'trip_based') {
      setSalaryRequestAmount(selectedSalaryTripIds.length > 0 ? String(selectedTripTotal) : '');
    }
  }, [salaryRequestType, selectedSalaryTripIds, selectedTripTotal]);

  useEffect(() => {
    if (salaryRequestType === 'monthly') {
      const y = salaryCurrentYear;
      const base = salaryRequestDate ?? defaultSalaryRequestDate;
      if (!salaryRequestDate) setSalaryRequestDate(new Date(y, base.getMonth(), 1));
      else if (salaryRequestDate.getFullYear() !== y || salaryRequestDate.getDate() !== 1) {
        setSalaryRequestDate(new Date(y, salaryRequestDate.getMonth(), 1));
      }
      setShowSalaryMonthDropdown(false);
    }
  }, [salaryRequestType, salaryRequestDate, defaultSalaryRequestDate, salaryCurrentYear]);

  const toggleSalaryTripSelection = useCallback((tripId: string) => {
    setSelectedSalaryTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  }, []);

  const handleAmountKeyPress = useCallback((key: string) => {
    if (salaryRequestType === 'trip_based') return;
    if (key === '.') return;
    if (key === 'delete') {
      setSalaryRequestAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    setSalaryRequestAmount((prev) => {
      const current = prev.replace(/[^0-9]/g, '') || '0';
      if (current === '0') return key;
      if (current.length >= 9) return current;
      return `${current}${key}`;
    });
  }, [salaryRequestType]);

  const selectAllSalaryTrips = useCallback(() => {
    setSelectedSalaryTripIds(pendingTripsForSalaryOrg.map((t) => t.id));
    setSalaryRequestAmount(String(pendingTotalForSalaryOrg));
  }, [pendingTripsForSalaryOrg, pendingTotalForSalaryOrg]);

  const deselectAllSalaryTrips = useCallback(() => {
    setSelectedSalaryTripIds([]);
    setSalaryRequestAmount('');
  }, []);

  const isAllTripsSelected =
    salaryRequestType === 'trip_based' &&
    pendingTripsForSalaryOrg.length > 0 &&
    selectedSalaryTripIds.length === pendingTripsForSalaryOrg.length;

  const submitSalaryRequest = useCallback(async () => {
    const org = salaryRequestOrg ?? (salaryRequestOrgOptions.length === 1 ? salaryRequestOrgOptions[0] : null);
    if (!org) {
      Alert.alert('Select fleet', 'Choose which fleet to request salary from.');
      return;
    }
    if (!salaryRequestType) {
      Alert.alert('Select type', 'Choose Monthly salary, Advance, or Trip-based.');
      return;
    }
    if (salaryRequestType === 'monthly' && !salaryRequestDate) {
      Alert.alert('Select month & year', 'Choose which month and year this salary is for.');
      return;
    }
    if (salaryRequestType === 'trip_based' && selectedSalaryTripIds.length === 0) {
      Alert.alert('Select trips', 'Select at least one trip to request payment for, or use Select all.');
      return;
    }
    const amount = Number(salaryRequestAmount.replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter amount', 'Enter a valid amount in ₹.');
      return;
    }
    if (amount > VALIDATION.AMOUNT_MAX) {
      Alert.alert(
        'Amount too large',
        `Amount cannot exceed ₹${VALIDATION.AMOUNT_MAX.toLocaleString('en-IN')}.`,
      );
      return;
    }
    const trimmedNote = salaryRequestNote.trim();
    if (trimmedNote.length > VALIDATION.NOTES_MAX_LENGTH) {
      Alert.alert(
        'Note too long',
        `Note must be at most ${VALIDATION.NOTES_MAX_LENGTH} characters.`,
      );
      return;
    }

    setSalaryRequestSubmitting(true);
    const { error } = await salaryRequestsService.createSalaryRequest(
      org.driverId,
      org.orgId,
      salaryRequestType,
      amount,
      {
        note: trimmedNote.slice(0, VALIDATION.NOTES_MAX_LENGTH) || null,
        createdBy: profile?.uid ?? null,
        tripIds: salaryRequestType === 'trip_based' && selectedSalaryTripIds.length > 0 ? selectedSalaryTripIds : undefined,
        salaryMonth: salaryRequestType === 'monthly' && salaryRequestDate ? toISODate(salaryRequestDate) : undefined,
      }
    );
    setSalaryRequestSubmitting(false);
    if (error) {
      Alert.alert('Request failed', error.message);
      return;
    }
    setSuccessPayload({
      requestType: salaryRequestType,
      amount: String(amount),
      orgName: org.orgName,
    });
    setIsSuccess(true);
    load();
  }, [
    salaryRequestOrg,
    salaryRequestOrgOptions,
    salaryRequestType,
    salaryRequestAmount,
    salaryRequestNote,
    salaryRequestDate,
    selectedSalaryTripIds,
    profile?.uid,
    load,
  ]);

  const goBack = useCallback(() => {
    if (isSuccess) {
      setIsSuccess(false);
      setSuccessPayload(null);
      setSalaryRequestAmount('');
    }
    router.back();
  }, [isSuccess, router]);

  // —— Success state (premium full-screen confirmation) ——
  if (isSuccess && successPayload) {
    return (
      <View style={[styles.successContainer, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.successIconWrap, { backgroundColor: colors.emeraldMuted }]}>
            <FontAwesome name="check-circle" size={48} color={colors.emerald} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>Request submitted</Text>
          <Text style={[styles.successMessage, { color: colors.textMuted }]}>
            Your {successPayload.requestType === 'monthly' ? 'monthly' : successPayload.requestType === 'advance' ? 'advance' : 'trip-based'} salary request for ₹
            {Number(successPayload.amount).toLocaleString('en-IN')} has been sent to {successPayload.orgName}. You’ll be notified once it’s processed.
          </Text>
          <TouchableOpacity
            style={[styles.successButton, { backgroundColor: colors.emerald }]}
            onPress={goBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to Dashboard"
          >
            <Text style={styles.successButtonText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.emerald} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  // —— Main form ——
  const contentPadding = Layout.screenPaddingHorizontal;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Header — clean MNC-style */}
        <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, paddingHorizontal: Layout.driverHeaderHorizontalPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={goBack}
            style={[styles.backBtn, { backgroundColor: colors.surface }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <FontAwesome name="chevron-left" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Salary account</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowRequestTypeMenu((v) => !v)}
            style={[styles.backBtn, { backgroundColor: colors.surface }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open request type menu"
          >
            <FontAwesome name="bars" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
        {showRequestTypeMenu && (
          <>
            <Pressable style={styles.requestTypeMenuBackdrop} onPress={() => setShowRequestTypeMenu(false)} />
            <View
              style={[
                styles.requestTypeMenu,
                {
                  top: insets.top + Layout.driverHeaderTopOffset + 56,
                  right: Layout.driverHeaderHorizontalPadding,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.requestTypeMenuTitle, { color: colors.textMuted }]}>Request type</Text>
              {REQUEST_TYPES.map(({ type, label, hint }) => {
                const active = salaryRequestType === type;
                return (
                  <TouchableOpacity
                    key={`menu-${type}`}
                    style={[
                      styles.requestTypeMenuItem,
                      { borderBottomColor: colors.border },
                      active && { backgroundColor: colors.emeraldMuted },
                    ]}
                    onPress={() => {
                      setSalaryRequestType(type);
                      setShowRequestTypeMenu(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.requestTypeMenuTextWrap}>
                      <Text style={[styles.requestTypeMenuItemLabel, { color: active ? colors.emerald : colors.text }]}>{label}</Text>
                      <Text style={[styles.requestTypeMenuItemHint, { color: colors.textMuted }]}>{hint}</Text>
                    </View>
                    {active ? <FontAwesome name="check" size={14} color={colors.emerald} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (Platform.OS === 'android' ? 140 : 120) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={Platform.OS === 'android'}
          scrollEnabled={Platform.OS === 'android'}
          nestedScrollEnabled
        >
          {salaryRequestOrgOptions.length === 0 ? (
            <View style={[styles.emptyStateWrap, { paddingHorizontal: contentPadding }]}>
              <View style={[styles.emptyStateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.emptyStateIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                  <FontAwesome name="building-o" size={32} color={colors.emerald} />
                </View>
                <Text style={[styles.emptyStateTitle, { color: colors.text }]}>Connect a fleet first</Text>
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  Go to Requests to accept a fleet invite. Then you can request salary here.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyStateButton, { backgroundColor: colors.emerald }]}
                  onPress={() => router.push('/(driver)/requests')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyStateButtonText}>Go to Requests</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Fleet owner profile chips */}
              <View style={[styles.section, styles.fleetProfilesSection, { borderBottomColor: colors.border }]}>
                <View style={[styles.fleetProfilesRow, { paddingHorizontal: contentPadding }]}>
                  {salaryRequestOrgOptions.map((opt) => {
                    const active = effectiveSalaryOrg?.orgId === opt.orgId;
                    return (
                      <TouchableOpacity
                        key={opt.orgId}
                        style={styles.fleetProfileChip}
                        onPress={() => setSalaryRequestOrg(opt)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.fleetAvatarRing, { borderColor: active ? colors.emerald : 'transparent' }]}>
                          {opt.avatarUrl ? (
                            <Image source={{ uri: opt.avatarUrl }} style={styles.fleetAvatar} resizeMode="cover" />
                          ) : (
                            <View style={[styles.fleetAvatar, { backgroundColor: colors.surface, borderColor: colors.text, borderWidth: 1 }]}>
                              <Text style={[styles.fleetAvatarText, { color: colors.text }]}>
                                {getInitials(opt.orgName)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.fleetProfileName, { color: active ? colors.emerald : colors.text }]} numberOfLines={2}>
                          {opt.orgName}
                        </Text>
                        {active ? <View style={[styles.fleetProfileUnderline, { backgroundColor: colors.emerald }]} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.section, { paddingHorizontal: contentPadding, marginBottom: 8 }]}>
                <Text style={[styles.requestTypeSelectedText, { color: colors.textMuted }]}>
                  Request type: {salaryRequestType === 'monthly' ? 'Monthly' : salaryRequestType === 'advance' ? 'Advance' : salaryRequestType === 'trip_based' ? 'Trip-based' : 'Not selected'}
                </Text>
              </View>

              {/* Salary period (monthly only) */}
              {salaryRequestType === 'monthly' && (
                <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Salary period</Text>
                  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.monthYearRow}>
                    <View style={[styles.monthBlock, styles.monthDropdownWrap]}>
                      <TouchableOpacity
                        style={[
                          styles.monthTrigger,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                          showSalaryMonthDropdown && { borderColor: colors.emerald },
                        ]}
                        onPress={() => setShowSalaryMonthDropdown((v) => !v)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.monthTriggerText, { color: colors.text }]} numberOfLines={1}>
                          {salaryRequestDate != null ? MONTH_SHORT_NAMES[salaryRequestDate.getMonth()] : 'Month'}
                        </Text>
                        <FontAwesome name={showSalaryMonthDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.yearBlock}>
                      <View style={[styles.monthTrigger, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.monthTriggerText, { color: colors.text }]}>{salaryCurrentYear}</Text>
                      </View>
                    </View>
                  </View>
                  {salaryRequestDate != null && (
                    <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>
                      Selected: {formatSalaryDateDisplay(salaryRequestDate)}
                    </Text>
                  )}
                  </View>
                </View>
              )}

              {/* Trip-based: pending trips list */}
              {salaryRequestType === 'trip_based' && (
                <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                  <View style={styles.tripListHeader}>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Pending trips</Text>
                    {effectiveSalaryOrg && pendingTripsForSalaryOrg.length > 0 && (
                      <TouchableOpacity onPress={isAllTripsSelected ? deselectAllSalaryTrips : selectAllSalaryTrips} hitSlop={8} activeOpacity={0.7}>
                        <Text style={[styles.selectAllText, { color: colors.emerald }]}>
                          {isAllTripsSelected ? 'Deselect all' : 'Select all'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {!effectiveSalaryOrg ? (
                    <Text style={[styles.hint, { color: colors.textMuted }]}>Select a fleet above to see trips with pending payment.</Text>
                  ) : pendingTripsForSalaryOrg.length === 0 ? (
                    <View style={[styles.tripListEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <FontAwesome name="check-circle" size={20} color={colors.textMuted} />
                      <Text style={[styles.tripListEmptyText, { color: colors.textMuted }]}>
                        No pending trips for {effectiveSalaryOrg.orgName}. All completed trips are already paid.
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.card, styles.tripList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <ScrollView
                        style={styles.tripListScroll}
                        contentContainerStyle={styles.tripListContent}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={true}
                      >
                      {pendingTripsForSalaryOrg.map((t) => {
                        const earned = tripEarnings(t);
                        const date = formatLedgerDate(t.completed_at ?? t.updated_at ?? t.created_at);
                        const isSelected = selectedSalaryTripIds.includes(t.id);
                        return (
                          <TouchableOpacity
                            key={t.id}
                            style={[
                              styles.tripRow,
                              { borderBottomColor: colors.border },
                              isSelected && { backgroundColor: colors.emeraldMuted },
                            ]}
                            onPress={() => toggleSalaryTripSelection(t.id)}
                            activeOpacity={0.8}
                          >
                            <View style={[styles.tripCheckWrap, { borderColor: colors.border }, isSelected && { borderColor: colors.emerald }]}>
                              <FontAwesome name={isSelected ? 'check-square' : 'square-o'} size={20} color={isSelected ? colors.emerald : colors.textMuted} />
                            </View>
                            <View style={[styles.tripIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                              <FontAwesome name="truck" size={14} color={colors.emerald} />
                            </View>
                            <View style={styles.tripInfo}>
                              <Text style={[styles.tripId, { color: colors.text }]} numberOfLines={1}>{tripsService.getTripDisplayNumber(t)}</Text>
                              <Text style={[styles.tripDate, { color: colors.textMuted }]}>{date} · Completed</Text>
                            </View>
                            <Text style={[styles.tripAmount, { color: colors.emerald }]}>+₹{earned.toLocaleString('en-IN')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      </ScrollView>
                      <View style={[styles.tripTotalRow, { borderTopColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
                        <Text style={[styles.tripTotalLabel, { color: colors.text }]}>
                          {selectedSalaryTripIds.length > 0 ? `Selected (${selectedSalaryTripIds.length})` : 'Total pending'}
                        </Text>
                        <Text style={[styles.tripTotalAmount, { color: colors.emerald }]}>
                          ₹{(selectedSalaryTripIds.length > 0 ? selectedTripTotal : pendingTotalForSalaryOrg).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Amount */}
              <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Amount (₹)</Text>
                <View style={[styles.card, styles.amountDisplayWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.amountPrefix, { color: colors.textMuted }]}>₹</Text>
                  <Text style={[styles.amountDisplay, { color: colors.text }]} numberOfLines={1}>
                    {formatRupeeDisplay(salaryRequestAmount || '0')}
                  </Text>
                  <Text style={[styles.amountDecimals, { color: colors.textMuted }]}>.00</Text>
                  <View style={[styles.amountCursor, { backgroundColor: colors.emerald, opacity: blink ? 1 : 0 }]} />
                </View>
                {salaryRequestType === 'trip_based' && effectiveSalaryOrg && pendingTotalForSalaryOrg > 0 && (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    You have ₹{pendingTotalForSalaryOrg.toLocaleString('en-IN')} pending from {pendingTripsForSalaryOrg.length} trip{pendingTripsForSalaryOrg.length === 1 ? '' : 's'} for this fleet.
                  </Text>
                )}
              </View>

              {salaryRequestType !== 'trip_based' && (
                <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Enter amount</Text>
                  <View style={[styles.card, styles.keypadCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.keypadGrid}>
                      {KEYPAD_KEYS.map((key) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.keypadButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                          onPress={() => handleAmountKeyPress(key)}
                          activeOpacity={0.85}
                          disabled={salaryRequestSubmitting}
                        >
                          {key === 'delete' ? (
                            <FontAwesome name="backward" size={18} color={colors.text} />
                          ) : (
                            <Text style={[styles.keypadButtonText, { color: colors.text }]}>{key}</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Note */}
              <View style={[styles.section, { paddingHorizontal: contentPadding }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Note (optional)</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.noteInput, { backgroundColor: 'transparent', borderColor: 'transparent', color: colors.text }]}
                  placeholder="Ex: Emergency medical expenses..."
                  placeholderTextColor={colors.placeholder}
                  value={salaryRequestNote}
                  onChangeText={setSalaryRequestNote}
                  multiline
                  numberOfLines={3}
                  editable={!salaryRequestSubmitting}
                />
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <Modal
          transparent
          visible={showSalaryMonthDropdown}
          animationType="fade"
          onRequestClose={() => setShowSalaryMonthDropdown(false)}
        >
          <Pressable style={styles.monthModalBackdrop} onPress={() => setShowSalaryMonthDropdown(false)}>
            <Pressable
              style={[styles.monthModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {}}
            >
              <Text style={[styles.monthModalTitle, { color: colors.text }]}>Select month</Text>
              <ScrollView style={styles.monthModalList} keyboardShouldPersistTaps="handled">
                {MONTH_SHORT_NAMES.map((label, monthIndex) => {
                  const selected = salaryRequestDate != null && salaryRequestDate.getMonth() === monthIndex;
                  return (
                    <TouchableOpacity
                      key={monthIndex}
                      style={[
                        styles.monthModalRow,
                        { borderBottomColor: colors.border },
                        monthIndex === MONTH_SHORT_NAMES.length - 1 && styles.monthDropdownRowLast,
                        selected && { backgroundColor: colors.emeraldMuted },
                      ]}
                      onPress={() => {
                        setSalaryRequestDate(new Date(salaryCurrentYear, monthIndex, 1));
                        setShowSalaryMonthDropdown(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.monthModalRowText, { color: selected ? colors.emerald : colors.text }]}>{label}</Text>
                      {selected ? <FontAwesome name="check" size={16} color={colors.emerald} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Sticky footer — primary CTA */}
        {salaryRequestOrgOptions.length > 0 && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === 'android' ? 10 : 16), paddingHorizontal: contentPadding, borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: colors.emerald },
                (!salaryRequestAmount.trim() || salaryRequestSubmitting) && {
                  backgroundColor: colors.surface,
                  opacity: 0.9,
                  shadowOpacity: 0,
                  elevation: 0,
                },
              ]}
              onPress={submitSalaryRequest}
              disabled={!salaryRequestAmount.trim() || salaryRequestSubmitting}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={salaryRequestSubmitting ? 'Submitting' : 'Request Salary'}
            >
              {salaryRequestSubmitting ? (
                <ActivityIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <>
                  <Text style={[styles.submitBtnText, { color: (!salaryRequestAmount.trim() || salaryRequestSubmitting) ? colors.textMuted : Theme.textOnPrimary }]}>
                    Request Salary
                  </Text>
                  <FontAwesome name="arrow-right" size={18} color={(!salaryRequestAmount.trim() || salaryRequestSubmitting) ? colors.textMuted : Theme.textOnPrimary} />
                </>
              )}
            </TouchableOpacity>
            <Text style={[styles.footerHint, { color: colors.textMuted }]}>
              Usually processed within 24–48 business hours.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const CARD_RADIUS = 16;
const CARD_ELEVATION = 3;
const CARD_SHADOW_OPACITY = 0.06;
const CARD_SHADOW_RADIUS = 12;
const BUTTON_RADIUS = 14;
const MIN_TOUCH = Layout.minTouchTargetSize;

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  loadingCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  successCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  successButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Layout.driverHeaderBottomPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 10,
    paddingHorizontal: 0,
  },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  emptyStateWrap: { paddingTop: 24 },
  emptyStateCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  emptyStateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BUTTON_RADIUS,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  emptyStateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: 18,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW_OPACITY,
    shadowRadius: CARD_SHADOW_RADIUS,
    elevation: CARD_ELEVATION,
  },
  fleetProfilesSection: {
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    paddingBottom: 10,
  },
  fleetProfilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
  },
  fleetProfileChip: {
    width: 104,
    alignItems: 'center',
  },
  fleetAvatarRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fleetProfileName: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
  fleetProfileUnderline: {
    width: 28,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
  },
  requestTypeSelectedText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
    alignSelf: 'center',
    width: '100%',
  },
  requestTypeMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  requestTypeMenu: {
    position: 'absolute',
    width: 240,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  requestTypeMenuTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  requestTypeMenuItem: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestTypeMenuTextWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
  requestTypeMenuItemLabel: { fontSize: 14, fontWeight: '700' },
  requestTypeMenuItemHint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  monthYearRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  monthBlock: { flex: 1, minWidth: 0 },
  monthDropdownWrap: { position: 'relative' as const, zIndex: 10 },
  monthTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  monthTriggerText: { fontSize: 15, fontWeight: '600', flex: 1 },
  monthDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthDropdownRowLast: { borderBottomWidth: 0 },
  monthModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 20, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  monthModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  monthModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  monthModalList: { maxHeight: 360 },
  monthModalRow: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthModalRowText: { fontSize: 15, fontWeight: '600' },
  yearBlock: { width: 100 },
  tripListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectAllText: { fontSize: 13, fontWeight: '700' },
  tripListEmpty: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tripListEmptyText: { flex: 1, fontSize: 14, lineHeight: 20 },
  tripList: { overflow: 'hidden', padding: 0, maxHeight: Platform.OS === 'android' ? 286 : 300 },
  tripListScroll: { maxHeight: Platform.OS === 'android' ? 226 : 238 },
  tripListContent: { paddingBottom: 0 },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  tripCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripInfo: { flex: 1, minWidth: 0 },
  tripId: { fontSize: 14, fontWeight: '700' },
  tripDate: { fontSize: 11, fontWeight: '500', marginTop: 2, lineHeight: 14 },
  tripAmount: { fontSize: 14, fontWeight: '700', minWidth: 90, textAlign: 'right' },
  tripTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tripTotalLabel: { fontSize: 13, fontWeight: '700' },
  tripTotalAmount: { fontSize: 15, fontWeight: '800' },
  amountDisplayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 10,
    minHeight: 58,
  },
  amountPrefix: { fontSize: 28, fontWeight: '800', marginRight: 6, letterSpacing: -0.5 },
  amountDisplay: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    paddingVertical: 8,
    minHeight: 48,
    letterSpacing: -0.5,
    textAlignVertical: 'center',
  },
  amountDecimals: { fontSize: 22, fontWeight: '700', marginTop: 1 },
  amountCursor: {
    width: 3,
    height: 38,
    borderRadius: 2,
    marginLeft: 6,
  },
  keypadCard: { padding: 10, borderRadius: 28 },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  keypadButton: {
    width: '31%',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  noteInput: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 15,
    fontWeight: '500',
    minHeight: 96,
    textAlignVertical: 'top',
  },
  footer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: BUTTON_RADIUS,
    minHeight: MIN_TOUCH,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  submitBtnText: { fontSize: 17, fontWeight: '700' },
  footerHint: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 14,
  },
});
