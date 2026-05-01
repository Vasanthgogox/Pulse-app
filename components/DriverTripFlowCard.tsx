import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { isAggregateTrip } from '@/lib/driverUtils';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import * as tripDocumentsService from '@/services/tripDocumentsService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable as HoldPressable } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type StepId = 'accepted' | 'pickup' | 'transit' | 'reached' | 'completed';

const HOLD_DURATION_MS = 1500;
/** So finger drift / parent scroll do not end the hold (sheet / ScrollView). */
const HOLD_PRESS_RETENTION = 100;
const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';

const holdCompleteWebStyle = {
  touchAction: 'none' as 'none' | 'auto' | 'manipulation',
  userSelect: 'none' as 'none' | 'auto' | 'text' | 'contain' | 'all',
};

const PREDEFINED_UPDATES: Record<StepId, string[]> = {
  accepted: [
    'On my way to pickup',
    'Arrived at pickup location',
    'Loading in progress',
    'Slight delay — will arrive soon',
    'Waiting at gate',
  ],
  pickup: [
    'Loading complete',
    'Documents collected',
    'Package secured',
    'Ready to depart',
    'Waiting for documents',
  ],
  transit: [
    'En route to destination',
    'Traffic ahead — slight delay',
    'Taking alternate route',
    'Approaching destination',
    'Stopped for mandatory break',
  ],
  reached: [
    'Arrived at destination',
    'Unloading in progress',
    'Delivery confirmed by recipient',
    'Recipient not available',
    'Documents handed over',
  ],
  completed: [],
};

// Parse [UPDATE|step|timestamp|message] entries from trip.notes
function parseDriverUpdates(notes: string | null): { step: string; timestamp: string; message: string }[] {
  if (!notes) return [];
  return notes
    .split('\n')
    .filter((l) => l.startsWith('[UPDATE|'))
    .map((l) => {
      const inner = l.slice(8, -1);
      const [step, timestamp, ...msgParts] = inner.split('|');
      return { step, timestamp, message: msgParts.join('|') };
    })
    .reverse(); // newest first
}

function deriveStepFromTrip(t: tripsService.TripRow): StepId {
  const s = String(t.status ?? '').toLowerCase();
  const hasStarted = !!t.started_at;
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'completed';
  if (s === 'at_drop') return 'reached';
  if (s === 'in_transit' || s === 'transit' || (s === 'in_progress' && hasStarted)) return 'transit';
  if (s === 'picked_up' || s === 'pickup' || s === 'in_progress') return 'pickup';
  return 'accepted';
}

function progressForStep(step: StepId): number {
  if (step === 'completed') return 100;
  // Keep POD/reached internal, but visually remain on Transit until completion.
  if (step === 'reached') return 60;
  if (step === 'transit') return 60;
  if (step === 'pickup') return 40;
  if (step === 'accepted') return 20;
  return 0;
}

function stageForStep(step: StepId): 1 | 2 | 3 | 4 {
  if (step === 'accepted') return 1;
  if (step === 'pickup') return 2;
  if (step === 'reached') return 3;
  if (step === 'transit') return 3;
  return 4;
}

function titleForStep(step: StepId): string {
  if (step === 'accepted') return 'Head to Pickup';
  if (step === 'pickup') return 'At Pickup Location';
  if (step === 'transit') return 'Head to Drop-off';
  if (step === 'reached') return 'At Drop-off Location';
  return 'Trip completed';
}

function subtitleForStep(step: StepId, trip: tripsService.TripRow): string {
  if (step === 'accepted') return trip.pickup_area?.trim() || 'Proceed to pickup';
  if (step === 'pickup') return 'Collect the package';
  if (step === 'transit') return trip.drop_location?.trim() || 'Proceed to drop-off';
  if (step === 'reached') return 'Deliver the package';
  return 'Nice work — you’re done.';
}

export interface DriverTripFlowCardProps {
  trip: tripsService.TripRow;
  /** Precomputed commission for non-aggregate trips (to match existing dashboard calc). */
  commissionAmount?: number;
  /** Road distance in km from driver's current position to the active target (pickup or drop). */
  distanceToTargetKm?: number | null;
  /** Called after any server write succeeds (so dashboard can refetch). */
  onRefresh?: () => void;
  /** Optional: collapse/expand toggle (UI only). */
  onToggleCollapse?: () => void;
  /** Optional: whether the card is currently collapsed (for chevron state + disabling actions). */
  collapsed?: boolean;
  /** Called when user finishes and returns to waiting state. */
  onBackToDashboard?: () => void;
  /** Called when trip is completed (after server confirms). */
  onTripCompleted?: () => void;
  /** When true, remove horizontal margins so the card fits inside edge-to-edge bottom sheet. */
  edgeToEdge?: boolean;
  /**
   * Visual mode.
   * - "card": default rounded card frame (used elsewhere)
   * - "page": frameless page inside the existing bottom sheet container
   */
  variant?: 'card' | 'page';
}

function fmtKm(km: number): string {
  if (km >= 100) return `${Math.round(km)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(1)} km`;
}

export function DriverTripFlowCard({
  trip,
  commissionAmount,
  distanceToTargetKm,
  onRefresh,
  onToggleCollapse,
  collapsed = false,
  onBackToDashboard,
  onTripCompleted,
  edgeToEdge = false,
  variant = 'card',
}: DriverTripFlowCardProps) {
  const colors = useDriverThemeColors();
  const { profile } = useAuth();

  const [localTrip, setLocalTrip] = useState<tripsService.TripRow>(trip);
  const [step, setStep] = useState<StepId>(() => deriveStepFromTrip(trip));
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [podDocuments, setPodDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [podLoading, setPodLoading] = useState(false);
  const [podUploading, setPodUploading] = useState(false);
  const [podSkipped, setPodSkipped] = useState(false);
  const [podViewUrls, setPodViewUrls] = useState<Record<string, string>>({});
  const podViewUrlsRequestedRef = useRef<Set<string>>(new Set());
  const lastPodTripIdRef = useRef<string | null>(null);
  const [viewingPodUrl, setViewingPodUrl] = useState<string | null>(null);
  const [viewingPodLoading, setViewingPodLoading] = useState(false);
  const [viewingPodError, setViewingPodError] = useState(false);

  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);

  // Quick update panel state
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [updateSending, setUpdateSending] = useState(false);
  const [stagePhotoUploading, setStagePhotoUploading] = useState(false);
  // Optimistic local updates list (merged with parsed trip.notes entries)
  const [localUpdates, setLocalUpdates] = useState<{ step: string; timestamp: string; message: string }[]>([]);

  useEffect(() => {
    setLocalTrip(trip);
    setStep(deriveStepFromTrip(trip));
    // Sync notes-based updates when trip refreshes
    setLocalUpdates(parseDriverUpdates(trip.notes));
  }, [trip]);

  const tripIsAggregate = useMemo(() => isAggregateTrip(localTrip), [localTrip]);
  const earnings = useMemo(() => {
    const n = Math.max(0, Number(commissionAmount ?? 0) || 0);
    if (n > 0) return formatINR(n);
    if (tripIsAggregate) return 'SALARY';
    return formatINR(0);
  }, [tripIsAggregate, commissionAmount]);

  const progressPct = useMemo(() => progressForStep(step), [step]);
  const stage = useMemo(() => stageForStep(step), [step]);
  const title = useMemo(() => titleForStep(step), [step]);
  const subtitle = useMemo(() => subtitleForStep(step, localTrip), [step, localTrip]);

  const loadPodDocuments = useCallback(
    (opts?: { silent?: boolean }) => {
      const id = localTrip?.id;
      if (!id) return;
      if (!opts?.silent) setPodLoading(true);
      tripDocumentsService.getDocumentsByTripId(id).then(({ documents, error }) => {
        setPodLoading(false);
        if (!error) {
          setPodDocuments(documents);
          lastPodTripIdRef.current = id;
        }
      });
    },
    [localTrip?.id],
  );

  useEffect(() => {
    if (step !== 'reached' && step !== 'completed') {
      setPodSkipped(false);
      return;
    }
    const id = localTrip?.id;
    if (!id) return;
    if (id !== lastPodTripIdRef.current) setPodDocuments([]);
    const hasCache = lastPodTripIdRef.current === id;
    loadPodDocuments(hasCache ? { silent: true } : undefined);
  }, [step, localTrip?.id, loadPodDocuments]);

  useEffect(() => {
    if (podDocuments.length === 0) return;
    podDocuments.forEach((doc) => {
      if (podViewUrlsRequestedRef.current.has(doc.id)) return;
      podViewUrlsRequestedRef.current.add(doc.id);
      tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) => {
        setPodViewUrls((prev) => (prev[doc.id] ? prev : { ...prev, [doc.id]: url }));
      });
    });
  }, [podDocuments]);

  const confirmArrival = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    const now = new Date().toISOString();
    setStepError(null);
    setStepLoading(true);
    setStep('pickup');
    setLocalTrip((prev) => ({
      ...prev,
      status: 'in_progress',
      started_at: prev.started_at ?? now,
      updated_at: now,
    }));
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: 'in_progress',
      started_at: localTrip?.started_at ?? now,
    });
    setStepLoading(false);
    if (error) {
      setStepError(error.message);
      setStep('accepted');
      setLocalTrip((prev) => ({ ...prev, status: 'assigned' }));
      return;
    }
    if (updated) setLocalTrip(updated);
    onRefresh?.();
  };

  const engageTransit = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const now = new Date().toISOString();
    setStep('transit');
    setLocalTrip((prev) => ({ ...prev, status: 'in_transit', updated_at: now }));
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: 'in_transit',
    });
    setStepLoading(false);
    if (error) {
      setStepError(error.message);
      setStep('pickup');
      return;
    }
    if (updated) setLocalTrip(updated);
    onRefresh?.();
  };

  const confirmReached = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const { error, trip: updated } = await tripsService.updateTripStatus(id, { status: 'at_drop' });
    setStepLoading(false);
    if (error) {
      const isStatusCheckError = /trips_status_check|check constraint/i.test(error.message);
      if (isStatusCheckError) {
        setStep('reached');
        setLocalTrip((prev) => ({ ...prev, updated_at: new Date().toISOString() }));
        setStepError(null);
        return;
      }
      setStepError(error.message);
      return;
    }
    setStep('reached');
    if (updated) setLocalTrip(updated);
    onRefresh?.();
  };

  const sendPredefinedUpdate = async (message: string) => {
    const id = localTrip?.id;
    if (!id || updateSending) return;
    setUpdateSending(true);
    const now = new Date().toISOString();
    const entry = `[UPDATE|${step}|${now}|${message}]`;
    try {
      const existing = localTrip.notes?.trim() || '';
      await supabase()
        .from('trips')
        .update({ notes: existing ? `${existing}\n${entry}` : entry })
        .eq('id', id);
      // Optimistic update
      setLocalUpdates((prev) => [{ step, timestamp: now, message }, ...prev]);
      setLocalTrip((prev) => ({ ...prev, notes: existing ? `${existing}\n${entry}` : entry }));
    } finally {
      setUpdateSending(false);
      setShowUpdatePanel(false);
    }
  };

  const uploadStagePhoto = async () => {
    const id = localTrip?.id;
    if (!id || !profile?.uid || stagePhotoUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setStepError('Permission to access photos is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setStepError(null);
    setStagePhotoUploading(true);
    const uri = result.assets[0].uri;
    const fileName = `stage-${step}-${Date.now()}.jpg`;
    const mimeType = result.assets[0].mimeType ?? 'image/jpeg';
    try {
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
        arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
      }
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        setStagePhotoUploading(false);
        return;
      }
      const { error } = await tripDocumentsService.uploadTripDocument(id, profile.uid, {
        arrayBuffer,
        fileName,
        mimeType,
      });
      if (error) setStepError(error.message);
      else {
        // Post a quick update noting the photo was sent
        await sendPredefinedUpdate(`📷 Photo sent — ${step === 'accepted' ? 'at pickup area' : step === 'transit' ? 'en route' : step === 'reached' ? 'at drop-off' : 'stage photo'}`);
        onRefresh?.();
      }
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setStagePhotoUploading(false);
    }
  };

  const uploadPod = async () => {
    const id = localTrip?.id;
    if (!id || !profile?.uid || podUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setStepError('Permission to access photos is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setStepError(null);
    setPodUploading(true);
    const uri = result.assets[0].uri;
    const fileName = result.assets[0].fileName ?? `pod-${Date.now()}.jpg`;
    const mimeType = result.assets[0].mimeType ?? 'image/jpeg';
    try {
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
        arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
      }
      
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        setPodUploading(false);
        return;
      }
      const { doc, error } = await tripDocumentsService.uploadTripDocument(id, profile.uid, {
        arrayBuffer,
        fileName,
        mimeType,
      });
      setPodUploading(false);
      if (error) {
        setStepError(error.message);
        return;
      }
      if (doc) {
        setPodDocuments((prev) => [doc, ...prev]);
        tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) => {
          setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
        });
      }
      onRefresh?.();
    } catch (e) {
      setPodUploading(false);
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const completeTrip = async () => {
    const id = localTrip?.id;
    if (!id) return;
    const now = new Date().toISOString();
    setHoldProgress(0);
    setIsHolding(false);
    setStep('completed');
    setLocalTrip((prev) => ({ ...prev, status: 'completed', completed_at: now, updated_at: now }));
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: 'completed',
      completed_at: now,
    });
    if (error) {
      setStepError(error.message);
      setStep('reached');
      return;
    }
    if (updated) setLocalTrip(updated);
    await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
    onTripCompleted?.();
  };

  const startHold = () => {
    setIsHolding(true);
    setHoldProgress(0);
    setStepError(null);
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        completeTrip();
      }
    }, 20);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
    setIsHolding(false);
  };

  return (
    <View
      style={[
        variant === 'page'
          ? styles.page
          : [
              styles.sheet,
              styles.shadow,
              {
                marginHorizontal: edgeToEdge ? 0 : undefined,
              },
            ],
      ]}
    >
      {variant === 'card' ? (
        <View style={styles.handleWrap}>
          <View style={[styles.handleBar, { backgroundColor: Theme.border }]} />
        </View>
      ) : null}

      {step !== 'completed' ? (
        <View style={styles.progressSegments}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                { backgroundColor: i <= stage ? colors.emerald : Theme.surfaceGray },
              ]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: Theme.textMuted }]} numberOfLines={2}>
          {subtitle}
        </Text>
        {distanceToTargetKm != null && (step === 'accepted' || step === 'transit') ? (
          <View style={[styles.distanceChip, { backgroundColor: colors.emeraldMuted }]}>
            <FontAwesome name="location-arrow" size={10} color={colors.emerald} />
            <Text style={[styles.distanceChipText, { color: colors.emerald }]}>
              {fmtKm(distanceToTargetKm)}{' '}
              <Text style={{ opacity: 0.7 }}>{step === 'accepted' ? 'to pickup' : 'to drop-off'}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      {/* Route summary: FROM → total distance + ETA → TO */}
      {step !== 'completed' && (localTrip.pickup_area || localTrip.drop_location) ? (
        <View style={[styles.routeSummary, { borderColor: Theme.border }]}>
          <View style={styles.routeSummaryRow}>
            <View style={[styles.routeSummaryDot, { backgroundColor: colors.emerald }]} />
            <View style={styles.routeSummaryTexts}>
              <Text style={[styles.routeSummaryLabel, { color: Theme.textMuted }]}>FROM</Text>
              <Text style={[styles.routeSummaryPlace, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
                {localTrip.pickup_area?.trim() || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.routeSummaryConnector}>
            <View style={[styles.routeSummaryLine, { backgroundColor: Theme.border }]} />
            {(localTrip.distance != null || localTrip.estimated_duration) ? (
              <View style={[styles.routeSummaryMeta, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}>
                <Text style={[styles.routeSummaryMetaText, { color: Theme.textMuted }]}>
                  {localTrip.distance != null && Number(localTrip.distance) > 0
                    ? `${fmtKm(Number(localTrip.distance))}`
                    : null}
                  {localTrip.distance != null && Number(localTrip.distance) > 0 && localTrip.estimated_duration ? '  ·  ' : null}
                  {localTrip.estimated_duration ? String(localTrip.estimated_duration) : null}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.routeSummaryRow}>
            <View style={[styles.routeSummaryDot, { backgroundColor: '#f59e0b' }]} />
            <View style={styles.routeSummaryTexts}>
              <Text style={[styles.routeSummaryLabel, { color: Theme.textMuted }]}>TO</Text>
              <Text style={[styles.routeSummaryPlace, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
                {(localTrip.drop_location || (localTrip as any).drop_area)?.trim() || '—'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {stepError ? (
        <View style={[styles.errorWrap, { backgroundColor: Theme.negativeMuted, borderColor: Theme.negative }]}>
          <FontAwesome name="exclamation-circle" size={14} color={Theme.negative} />
          <Text style={[styles.errorText, { color: Theme.negative }]} numberOfLines={3}>
            {stepError}
          </Text>
        </View>
      ) : null}

      {step !== 'completed' ? (
        <>
          {/* Communication action row */}
          <View style={styles.actionIconsRow}>
            {/* Phone — placeholder, disabled */}
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border, opacity: 0.35 }]}
              activeOpacity={0.8}
              disabled
              accessibilityLabel="Call (not available)"
            >
              <FontAwesome name="phone" size={20} color={Theme.textPrimaryDark} />
            </TouchableOpacity>

            {/* Quick update panel trigger */}
            <TouchableOpacity
              style={[
                styles.actionIconBtn,
                { backgroundColor: showUpdatePanel ? colors.emeraldMuted : Theme.surfaceLight, borderColor: showUpdatePanel ? colors.emerald : Theme.border },
              ]}
              activeOpacity={0.8}
              onPress={() => setShowUpdatePanel((v) => !v)}
              accessibilityLabel="Send quick update"
            >
              {updateSending ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <FontAwesome name="comment-o" size={20} color={showUpdatePanel ? colors.emerald : Theme.textPrimaryDark} />
              )}
            </TouchableOpacity>

            {/* Stage photo */}
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border }]}
              activeOpacity={0.8}
              onPress={uploadStagePhoto}
              disabled={stagePhotoUploading}
              accessibilityLabel="Send photo update"
            >
              {stagePhotoUploading ? (
                <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
              ) : (
                <FontAwesome name="camera" size={20} color={Theme.textPrimaryDark} />
              )}
            </TouchableOpacity>
          </View>

          {/* Quick update panel */}
          {showUpdatePanel ? (
            <View style={[styles.updatePanel, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}>
              <Text style={[styles.updatePanelHeader, { color: Theme.textMuted }]}>QUICK UPDATE</Text>
              {(PREDEFINED_UPDATES[step] ?? []).map((msg) => (
                <TouchableOpacity
                  key={msg}
                  style={[styles.updateOption, { borderColor: Theme.border }]}
                  onPress={() => sendPredefinedUpdate(msg)}
                  activeOpacity={0.75}
                  disabled={updateSending}
                >
                  <View style={[styles.updateOptionDot, { backgroundColor: colors.emerald }]} />
                  <Text style={[styles.updateOptionText, { color: Theme.textPrimaryDark }]}>{msg}</Text>
                  <FontAwesome name="send-o" size={13} color={colors.emerald} style={{ opacity: 0.7 }} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.updatePhotoRow, { borderColor: Theme.border }]}
                onPress={() => { setShowUpdatePanel(false); uploadStagePhoto(); }}
                activeOpacity={0.75}
              >
                <FontAwesome name="camera" size={14} color={colors.emerald} />
                <Text style={[styles.updatePhotoText, { color: colors.emerald }]}>Add photo update</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Recent updates feed (show up to 3) */}
          {localUpdates.length > 0 ? (
            <View style={styles.recentUpdates}>
              {localUpdates.slice(0, 3).map((u, i) => (
                <View key={i} style={[styles.recentUpdateRow, { borderColor: Theme.border }]}>
                  <View style={[styles.recentUpdateDot, { backgroundColor: colors.emerald }]} />
                  <View style={styles.recentUpdateBody}>
                    <Text style={[styles.recentUpdateMsg, { color: Theme.textPrimaryDark }]} numberOfLines={2}>{u.message}</Text>
                    <Text style={[styles.recentUpdateTime, { color: Theme.textMuted }]}>
                      {new Date(u.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {step === 'accepted' ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: Theme.textPrimaryDark }, stepLoading && styles.btnDisabled]}
          onPress={confirmArrival}
          disabled={stepLoading}
          activeOpacity={0.9}
        >
          <FontAwesome name="check-circle" size={18} color={Theme.textOnPrimary} />
          <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Arrived at pickup'}</Text>
        </TouchableOpacity>
      ) : null}

      {step === 'pickup' ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: Theme.textPrimaryDark }, stepLoading && styles.btnDisabled]}
          onPress={engageTransit}
          disabled={stepLoading}
          activeOpacity={0.9}
        >
          <FontAwesome name="archive" size={18} color={Theme.textOnPrimary} />
          <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Package collected'}</Text>
        </TouchableOpacity>
      ) : null}

      {step === 'transit' ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: Theme.textPrimaryDark }, stepLoading && styles.btnDisabled]}
          onPress={confirmReached}
          disabled={stepLoading}
          activeOpacity={0.9}
        >
          <FontAwesome name="map-marker" size={18} color={Theme.textOnPrimary} />
          <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Arrived at drop-off'}</Text>
        </TouchableOpacity>
      ) : null}

      {step === 'reached' ? (
        <View style={styles.reachedBlock}>
          <View style={[styles.podCard, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}>
            <View style={styles.podHeaderRow}>
              <Text style={[styles.podTitle, { color: Theme.textPrimaryDark }]}>Proof of delivery (POD)</Text>
              {podLoading ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <Text style={[styles.podCount, { color: Theme.textMuted }]}>
                  {podDocuments.length} file{podDocuments.length === 1 ? '' : 's'}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.podUploadBtn, { backgroundColor: Theme.textPrimaryDark }, podUploading && styles.btnDisabled]}
              onPress={uploadPod}
              disabled={podUploading}
              activeOpacity={0.9}
            >
              <FontAwesome name="cloud-upload" size={18} color={Theme.textOnPrimary} />
              <Text style={styles.podUploadText}>{podUploading ? 'Uploading…' : 'Upload POD'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPodSkipped(true)} activeOpacity={0.8} style={styles.skipLink}>
              <Text style={[styles.skipLinkText, { color: colors.emerald }]}>Skip POD</Text>
            </TouchableOpacity>
            {podDocuments.length >= 1 ? (
              <View style={[styles.podListWrap, { borderColor: Theme.border }]}>
                {podDocuments.map((doc, index) => (
                  <View
                    key={doc.id}
                    style={[
                      styles.podListItem,
                      { borderColor: Theme.border },
                      index === 0 && styles.podListItemFirst,
                    ]}
                  >
                    <Text style={[styles.podListFileName, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
                      {doc.file_name || doc.storage_path.split('/').pop() || 'POD'}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.podViewIconBtn,
                        { backgroundColor: colors.emeraldMuted ?? Theme.surfaceLight, borderColor: colors.emerald },
                      ]}
                      onPress={async () => {
                        setViewingPodError(false);
                        const cached = podViewUrls[doc.id];
                        if (cached) {
                          setViewingPodUrl(cached);
                          return;
                        }
                        setViewingPodLoading(true);
                        const url = await tripDocumentsService.getDocumentViewUrl(doc.storage_path);
                        if (!cached) {
                          setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
                        }
                        setViewingPodLoading(false);
                        setViewingPodUrl(url);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${doc.file_name || 'POD'}`}
                    >
                      <FontAwesome name="eye" size={14} color={colors.emerald} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {(podDocuments.length >= 1 || podSkipped) ? (
            <HoldPressable
              onPressIn={startHold}
              onPressOut={cancelHold}
              pressRetentionOffset={HOLD_PRESS_RETENTION}
              android_ripple={{ color: 'transparent' }}
              style={[
                styles.holdBtnWrap,
                { backgroundColor: colors.emeraldMuted ?? Theme.surfaceLight },
                Platform.OS === 'web' && holdCompleteWebStyle,
              ]}
            >
              <View style={[styles.holdFill, { width: `${holdProgress}%`, backgroundColor: colors.emerald }]} />
              <View style={[styles.holdContent, { pointerEvents: 'none' }]}>
                <FontAwesome name="check-circle" size={18} color={holdProgress > 20 ? Theme.textOnPrimary : colors.emerald} />
                <Text
                  style={[
                    styles.holdText,
                    { color: holdProgress > 20 ? Theme.textOnPrimary : colors.emerald },
                  ]}
                  numberOfLines={1}
                >
                  Hold to Complete Delivery
                </Text>
              </View>
            </HoldPressable>
          ) : (
            <Text style={[styles.podRequired, { color: Theme.textMuted }]}>
              Upload at least one POD to complete the trip.
            </Text>
          )}
        </View>
      ) : null}

      {step === 'completed' ? (
        <View style={styles.completedBlock}>
          <View style={[styles.earningsCard, { borderColor: Theme.border, backgroundColor: Theme.screenBackground }]}>
            <FontAwesome name="check-circle" size={46} color={colors.emerald} />
            <Text style={[styles.completedTitle, { color: Theme.textPrimaryDark }]}>Delivery Complete!</Text>
            <Text style={[styles.completedSubtitle, { color: Theme.textMuted }]}>Earnings for this trip</Text>
            <View style={[styles.earningsPill, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border }]}>
              <Text style={[styles.earningsLabel, { color: Theme.textMuted }]}>Your earnings</Text>
              <Text style={[styles.earningsValue, { color: colors.emerald }]}>{earnings}</Text>
            </View>
          </View>

          <View
            style={[
              styles.podCard,
              {
                marginTop: 14,
                backgroundColor: Theme.screenBackground,
                borderColor: Theme.border,
              },
            ]}
          >
            <View style={styles.podHeaderRow}>
              <Text style={[styles.podTitle, { color: Theme.textPrimaryDark }]}>Proof of delivery (POD)</Text>
              {podLoading ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <Text style={[styles.podCount, { color: Theme.textMuted }]}>
                  {podDocuments.length} file{podDocuments.length === 1 ? '' : 's'}
                </Text>
              )}
            </View>
            {podDocuments.length >= 1 ? (
              <View style={[styles.podListWrap, { borderColor: Theme.border }]}>
                {podDocuments.map((doc, index) => (
                  <View
                    key={doc.id}
                    style={[
                      styles.podListItem,
                      { borderColor: Theme.border },
                      index === 0 && styles.podListItemFirst,
                    ]}
                  >
                    <Text style={[styles.podListFileName, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
                      {doc.file_name || doc.storage_path.split('/').pop() || 'POD'}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.podViewIconBtn,
                        { backgroundColor: colors.emeraldMuted ?? Theme.surfaceLight, borderColor: colors.emerald },
                      ]}
                      onPress={async () => {
                        setViewingPodError(false);
                        const cached = podViewUrls[doc.id];
                        if (cached) {
                          setViewingPodUrl(cached);
                          return;
                        }
                        setViewingPodLoading(true);
                        const url = await tripDocumentsService.getDocumentViewUrl(doc.storage_path);
                        setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
                        setViewingPodLoading(false);
                        setViewingPodUrl(url);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${doc.file_name || 'POD'}`}
                    >
                      <FontAwesome name="eye" size={14} color={colors.emerald} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : !podLoading ? (
              <Text style={[styles.podRequired, { color: Theme.textMuted, marginTop: 4 }]}>
                No POD files on record for this trip.
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: Theme.textPrimaryDark }]}
            onPress={onBackToDashboard}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={!!(viewingPodUrl || viewingPodLoading)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setViewingPodUrl(null);
          setViewingPodLoading(false);
          setViewingPodError(false);
        }}
      >
        <Pressable
          style={styles.podModalBackdrop}
          onPress={() => {
            setViewingPodUrl(null);
            setViewingPodLoading(false);
            setViewingPodError(false);
          }}
        >
          <Pressable style={styles.podModalContent} onPress={() => {}}>
            <TouchableOpacity
              style={[styles.podModalClose, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}
              onPress={() => {
                setViewingPodUrl(null);
                setViewingPodLoading(false);
                setViewingPodError(false);
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="times" size={18} color={Theme.textPrimaryDark} />
              <Text style={[styles.podModalCloseText, { color: Theme.textPrimaryDark }]}>Close</Text>
            </TouchableOpacity>
            {viewingPodLoading ? (
              <View style={styles.podModalImage}>
                <ActivityIndicator size="large" color={colors.emerald} />
                <Text style={[styles.podModalLoadingText, { color: Theme.textMuted }]}>Loading...</Text>
              </View>
            ) : viewingPodUrl ? (
              <>
                <Image
                  source={{ uri: viewingPodUrl }}
                  style={styles.podModalImage}
                  resizeMode="contain"
                  onError={() => setViewingPodError(true)}
                  onLoad={() => setViewingPodError(false)}
                />
                {viewingPodError ? (
                  <View style={[styles.podModalFallback, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}>
                    <Text style={[styles.podModalFallbackText, { color: Theme.textMuted }]}>
                      Preview not available. Open in browser to view.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colors.emerald, marginTop: 12 }]}
                      onPress={() => viewingPodUrl && Linking.openURL(viewingPodUrl)}
                      activeOpacity={0.8}
                    >
                      <FontAwesome name="external-link" size={16} color={Theme.textOnPrimary} />
                      <Text style={styles.primaryBtnText}>Open in browser</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 24,
    paddingBottom: 18,
    paddingTop: 12,
  },
  /** Frameless container so the bottom sheet itself becomes the only "panel". */
  page: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 12,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  handleWrap: { alignItems: 'center', paddingBottom: 8 },
  handleBar: { width: 36, height: 4, borderRadius: 999, opacity: 0.5 },
  progressSegments: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 12 },
  progressSegment: { height: 6, flex: 1, borderRadius: 999 },
  titleBlock: { alignItems: 'center', paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: '600', textAlign: 'center', opacity: 0.8 },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  distanceChipText: { fontSize: 12, fontWeight: '800' },
  routeSummary: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  routeSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeSummaryDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeSummaryTexts: { flex: 1, minWidth: 0 },
  routeSummaryLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  routeSummaryPlace: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  routeSummaryConnector: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginVertical: 6, gap: 8 },
  routeSummaryLine: { width: 2, height: 20 },
  routeSummaryMeta: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  routeSummaryMetaText: { fontSize: 11, fontWeight: '700' },
  actionIconsRow: { flexDirection: 'row', gap: 12, paddingTop: 4, paddingBottom: 8 },
  updatePanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    gap: 2,
  },
  updatePanelHeader: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  updateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  updateOptionDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  updateOptionText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 18 },
  updatePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  updatePhotoText: { fontSize: 13, fontWeight: '700' },
  recentUpdates: { gap: 6, marginBottom: 8 },
  recentUpdateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentUpdateDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0, marginTop: 4 },
  recentUpdateBody: { flex: 1, minWidth: 0 },
  recentUpdateMsg: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  recentUpdateTime: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  actionIconBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 15,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.2, color: Theme.textOnPrimary },
  btnDisabled: { opacity: 0.7 },

  reachedBlock: { paddingTop: 2 },
  podCard: { borderWidth: 1, borderRadius: 18, padding: 12 },
  podHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  podTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  podCount: { fontSize: 12, fontWeight: '800' },
  podUploadBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  podUploadText: { fontSize: 16, fontWeight: '900', color: Theme.textOnPrimary },
  skipLink: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  skipLinkText: { fontSize: 14, fontWeight: '800' },
  podListWrap: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  podListItem: {
    minHeight: 46,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  podListItemFirst: { borderTopWidth: 0 },
  podListFileName: { flex: 1, fontSize: 13, fontWeight: '700' },
  podViewIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 28, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  podModalContent: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  podModalClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  podModalCloseText: {
    fontSize: 12,
    fontWeight: '800',
  },
  podModalImage: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
  podModalLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  podModalFallback: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  podModalFallbackText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  podRequired: { marginTop: 8, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  holdBtnWrap: { height: 58, borderRadius: 18, overflow: 'hidden', marginTop: 10, justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  holdText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  errorWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: { fontSize: 12, fontWeight: '700', flex: 1 },
  completedBlock: { paddingTop: 2 },
  earningsCard: { borderWidth: 1, borderRadius: 18, padding: 14, alignItems: 'center' },
  completedTitle: { marginTop: 8, fontSize: 17, fontWeight: '900' },
  completedSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  earningsPill: { marginTop: 10, borderWidth: 1, borderRadius: 14, padding: 10, width: '100%', alignItems: 'center' },
  earningsLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  earningsValue: { marginTop: 4, fontSize: 24, fontWeight: '900' },
});

