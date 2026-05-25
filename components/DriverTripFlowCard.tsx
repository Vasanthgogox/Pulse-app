import Theme from '@/constants/Theme';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverChat } from '@/features/chat/contexts/DriverChatContext';
import { sendDocumentShareMessage } from '@/features/chat/services/chat.service';
import type { DriverFlowStepId as StepId } from '@/features/driver/utils/driverTripStatusNotes.util';
import { deriveDriverFlowStepFromTrip } from '@/features/driver/utils/driverTripStatusNotes.util';
import { isAggregateTrip } from '@/features/drivers/utils/driverUtils.util';
import { formatINR } from '@/lib/format';
import * as tripDocumentsService from '@/services/tripDocumentsService';
import * as tripsService from '@/features/trips/services/trips.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
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
import { Pressable as HoldPressable } from 'react-native-gesture-handler';
import { compressImage } from '@/lib/pod/imageCompression';

const HOLD_DURATION_MS = 1500;
/** So finger drift / parent scroll do not end the hold (sheet / ScrollView). */
const HOLD_PRESS_RETENTION = 100;
const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';
const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POD_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1280;
const CHAT_IMAGE_QUALITY = 0.72;
const POD_IMAGE_QUALITY = 0.82;

const holdCompleteWebStyle = {
  touchAction: 'none' as 'none' | 'auto' | 'manipulation',
  userSelect: 'none' as 'none' | 'auto' | 'text' | 'contain' | 'all',
};

/** RN Alert.alert is unreliable on web; use window.confirm so POD delete always prompts. */
function confirmRemovePod(): Promise<boolean> {
  const message =
    'Delete this file? You can upload again before completing delivery.';
  if (Platform.OS === 'web') {
    const w = typeof globalThis !== 'undefined' ? (globalThis as { confirm?: (msg: string) => boolean }).confirm : undefined;
    return Promise.resolve(typeof w === 'function' && w(`Remove POD\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert('Remove POD', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function normalizeImageFileName(fileName: string | null | undefined): string {
  const base = (fileName ?? '').trim();
  if (!base) return `img-${Date.now()}.jpg`;
  const noExt = base.replace(/\.[^/.]+$/, '');
  return `${noExt || `img-${Date.now()}`}.jpg`;
}

async function readArrayBufferFromUri(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

async function optimizeImageForUpload(
  uri: string,
  quality: number,
): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    const compressed = await compressImage(blob, IMAGE_MAX_DIMENSION);
    return {
      arrayBuffer: await compressed.arrayBuffer(),
      mimeType: 'image/jpeg',
    };
  }

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: IMAGE_MAX_DIMENSION } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  return {
    arrayBuffer: await readArrayBufferFromUri(manipulated.uri),
    mimeType: 'image/jpeg',
  };
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
  /** Live driver GPS (e.g. map / truck position) — pairs with driverLocationLabel. */
  driverLatitude?: number | null;
  driverLongitude?: number | null;
  /** Reverse-geocoded place for current GPS (no raw lat/long in UI). */
  driverLocationLabel?: string | null;
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

function PodDocumentRow({
  doc,
  index,
  colors,
  podDeletingId,
  canDelete = true,
  onView,
  onDelete,
}: {
  doc: tripDocumentsService.TripDocumentRow;
  index: number;
  colors: { emerald: string; emeraldMuted?: string };
  podDeletingId: string | null;
  /** After delivery is completed, list stays view-only. */
  canDelete?: boolean;
  onView: (d: tripDocumentsService.TripDocumentRow) => void;
  onDelete: (d: tripDocumentsService.TripDocumentRow) => void | Promise<void>;
}) {
  return (
    <View
      style={[
        styles.podListItem,
        { borderColor: Theme.border },
        index === 0 && styles.podListItemFirst,
      ]}
    >
      <Text style={[styles.podListFileName, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
        {doc.file_name || doc.storage_path.split('/').pop() || 'POD'}
      </Text>
      <View style={styles.podListActions}>
        <TouchableOpacity
          style={[
            styles.podViewIconBtn,
            {
              backgroundColor: colors.emeraldMuted ?? Theme.surfaceLight,
              borderColor: colors.emerald,
            },
          ]}
          onPress={() => onView(doc)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`View ${doc.file_name || 'POD'}`}
        >
          <FontAwesome name="eye" size={14} color={colors.emerald} />
        </TouchableOpacity>
        {canDelete ? (
          <TouchableOpacity
            style={[
              styles.podDeleteIconBtn,
              { backgroundColor: Theme.negativeMuted, borderColor: Theme.negative },
            ]}
            onPress={() => void onDelete(doc)}
            disabled={podDeletingId === doc.id}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${doc.file_name || 'POD'}`}
          >
            {podDeletingId === doc.id ? (
              <LoadingIndicator size="small" color={Theme.negative} />
            ) : (
              <FontAwesome name="trash-o" size={14} color={Theme.negative} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function DriverTripFlowCard({
  trip,
  commissionAmount,
  distanceToTargetKm,
  driverLatitude = null,
  driverLongitude = null,
  driverLocationLabel = null,
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
  const router = useRouter();
  const { conversations, ensureDriverTripConversation, refreshConversations } = useDriverChat();

  const [localTrip, setLocalTrip] = useState<tripsService.TripRow>(trip);
  const [step, setStep] = useState<StepId>(() => deriveDriverFlowStepFromTrip(trip));
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
  const [podDeletingId, setPodDeletingId] = useState<string | null>(null);
  const podUploadCancelledRef = useRef(false);

  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);

  // Quick update panel state
  const [stagePhotoUploading, setStagePhotoUploading] = useState(false);

  useEffect(() => {
    setLocalTrip(trip);
    setStep(deriveDriverFlowStepFromTrip(trip));
  }, [trip]);

  const tripIsAggregate = useMemo(() => isAggregateTrip(localTrip), [localTrip]);

  const tripChatUnread = useMemo(() => {
    const id = String(localTrip?.id ?? '');
    if (!id) return 0;
    const conv = conversations.find((c) => String(c.trip_id) === id);
    return Math.max(0, conv?.unread_dispatcher_count ?? 0);
  }, [conversations, localTrip?.id]);

  const driverLivePlaceText = useMemo(() => {
    const hasCoords =
      driverLatitude != null &&
      driverLongitude != null &&
      Number.isFinite(driverLatitude) &&
      Number.isFinite(driverLongitude);
    const label = driverLocationLabel?.trim();
    if (!hasCoords && !label) return null;
    return label || (hasCoords ? 'Getting address…' : null);
  }, [driverLatitude, driverLongitude, driverLocationLabel]);

  const shareTripDocumentInChat = useCallback(
    async (
      doc: { storage_path: string; file_name: string; mime_type: string | null },
      documentTypeLabel: string,
    ) => {
      const tripId = localTrip.id;
      const orgId = localTrip.organization_id;
      const driverId = localTrip.driver_id;
      const uid = profile?.uid;
      if (!tripId || !orgId || !driverId || !uid) return;
      const convId = await ensureDriverTripConversation(tripId);
      if (!convId) return;
      const senderName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';
      try {
        await sendDocumentShareMessage({
          conversationId: convId,
          organizationId: orgId,
          senderRole: 'driver',
          senderName,
          senderUserId: uid,
          metadata: {
            document_type: documentTypeLabel,
            storage_path: doc.storage_path,
            document_name: doc.file_name,
            mime_type: doc.mime_type ?? null,
            entity_type: 'driver',
            entity_id: driverId,
          },
        });
        // INSERT hits trip_messages realtime → DriverChatContext debounced refresh; skip duplicate full refetch here.
      } catch {
        // Upload already succeeded; chat share is best-effort.
      }
    },
    [ensureDriverTripConversation, localTrip.driver_id, localTrip.id, localTrip.organization_id, profile],
  );

  const openPodPreview = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
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
    },
    [podViewUrls],
  );

  const cancelPodUpload = useCallback(() => {
    podUploadCancelledRef.current = true;
    setPodUploading(false);
  }, []);

  const confirmDeletePod = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      const ok = await confirmRemovePod();
      if (!ok) return;
      setPodDeletingId(doc.id);
      setStepError(null);
      const { error } = await tripDocumentsService.deleteTripDocument(doc);
      setPodDeletingId(null);
      if (error) {
        setStepError(error.message);
        return;
      }
      setPodDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setPodViewUrls((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      podViewUrlsRequestedRef.current.delete(doc.id);
      onRefresh?.();
    },
    [onRefresh],
  );

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
    try {
      const { arrayBuffer, mimeType } = await optimizeImageForUpload(uri, CHAT_IMAGE_QUALITY);
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        setStagePhotoUploading(false);
        return;
      }
      if (arrayBuffer.byteLength > MAX_CHAT_IMAGE_BYTES) {
        setStepError(
          `Image too large (${formatBytes(arrayBuffer.byteLength)}). Max allowed is ${formatBytes(MAX_CHAT_IMAGE_BYTES)}.`,
        );
        setStagePhotoUploading(false);
        return;
      }
      const stageLabel =
        step === 'accepted'
          ? 'Trip photo (pickup)'
          : step === 'transit'
            ? 'Trip photo (en route)'
            : step === 'reached'
              ? 'Trip photo (drop-off)'
              : 'Trip photo';
      const { result: chatUpload, error: chatUploadError } =
        await tripDocumentsService.uploadTripChatImage(id, {
          arrayBuffer,
          fileName,
          mimeType,
        });
      if (chatUploadError) {
        setStepError(chatUploadError.message);
      } else if (chatUpload) {
        await shareTripDocumentInChat(
          {
            storage_path: chatUpload.storagePath,
            file_name: chatUpload.fileName,
            mime_type: chatUpload.mimeType,
          },
          stageLabel,
        );
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
    podUploadCancelledRef.current = false;
    setPodUploading(true);
    const uri = result.assets[0].uri;
    const fileName = normalizeImageFileName(result.assets[0].fileName ?? `pod-${Date.now()}`);
    try {
      const { arrayBuffer, mimeType } = await optimizeImageForUpload(uri, POD_IMAGE_QUALITY);

      if (podUploadCancelledRef.current) {
        return;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        return;
      }
      if (arrayBuffer.byteLength > MAX_POD_IMAGE_BYTES) {
        setStepError(
          `Image too large (${formatBytes(arrayBuffer.byteLength)}). Max allowed is ${formatBytes(MAX_POD_IMAGE_BYTES)}.`,
        );
        return;
      }

      if (podUploadCancelledRef.current) {
        return;
      }

      const { doc, error } = await tripDocumentsService.uploadTripDocument(id, profile.uid, {
        arrayBuffer,
        fileName,
        mimeType,
      });
      if (error) {
        setStepError(error.message);
        return;
      }
      if (doc && podUploadCancelledRef.current) {
        await tripDocumentsService.deleteTripDocument(doc);
        return;
      }
      if (doc) {
        setPodDocuments((prev) => [doc, ...prev]);
        tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((u) => {
          setPodViewUrls((prev) => ({ ...prev, [doc.id]: u }));
        });
        await shareTripDocumentInChat(doc, 'Proof of delivery');
      }
      onRefresh?.();
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      podUploadCancelledRef.current = false;
      setPodUploading(false);
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

      {/* Route: one tight row + thin strip with truck icon + live GPS when available */}
      {step !== 'completed' && (localTrip.pickup_area || localTrip.drop_location) ? (
        <View
          style={[styles.routeCompactOuter, { borderColor: Theme.border, backgroundColor: Theme.surfaceLight }]}
        >
          <View style={styles.routeOneRow}>
            <View style={[styles.routeCompactDot, { backgroundColor: colors.emerald }]} />
            <Text style={[styles.routePlaceText, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
              {localTrip.pickup_area?.trim() || '—'}
            </Text>
            <Text style={[styles.routeCompactSep, { color: Theme.textMuted }]}>→</Text>
            <View style={[styles.routeCompactDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={[styles.routePlaceText, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
              {(localTrip.drop_location || (localTrip as any).drop_area)?.trim() || '—'}
            </Text>
            <View style={styles.routeTrail}>
              {(localTrip.distance != null && Number(localTrip.distance) > 0) || localTrip.estimated_duration ? (
                <Text style={[styles.routeTripMeta, { color: Theme.textMuted }]} numberOfLines={1}>
                  {localTrip.distance != null && Number(localTrip.distance) > 0 ? fmtKm(Number(localTrip.distance)) : ''}
                  {localTrip.distance != null && Number(localTrip.distance) > 0 && localTrip.estimated_duration ? ' · ' : ''}
                  {localTrip.estimated_duration ? String(localTrip.estimated_duration) : ''}
                </Text>
              ) : null}
              {driverLivePlaceText ? (
                <View style={styles.routeGpsPill}>
                  <FontAwesome name="truck" size={10} color={colors.emerald} />
                  <Text
                    style={[styles.routeDriverCoords, { color: Theme.textMuted }]}
                    selectable={!!driverLocationLabel?.trim()}
                    numberOfLines={2}
                  >
                    {driverLivePlaceText}
                  </Text>
                </View>
              ) : null}
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

            {/* Trip messages — full-screen driver chat (same UI as Messages tab) */}
            <View style={styles.actionIconBtnWrap}>
              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border }]}
                activeOpacity={0.8}
                onPress={() => router.push(`/(driver)/chat?tripId=${encodeURIComponent(localTrip.id)}`)}
                accessibilityLabel="Open trip messages"
              >
                <FontAwesome name="comment-o" size={20} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
              {tripChatUnread > 0 ? (
                <View style={[styles.messageBadge, { backgroundColor: colors.emerald }]}>
                  <Text style={styles.messageBadgeText}>{tripChatUnread > 99 ? '99+' : String(tripChatUnread)}</Text>
                </View>
              ) : null}
            </View>

            {/* POD / stage photo — uploads also post to the trip message thread */}
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border }]}
              activeOpacity={0.8}
              onPress={step === 'reached' ? uploadPod : uploadStagePhoto}
              disabled={stagePhotoUploading || podUploading}
              accessibilityLabel={step === 'reached' ? 'Upload proof of delivery' : 'Send photo to trip chat'}
            >
              {stagePhotoUploading || podUploading ? (
                <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
              ) : (
                <FontAwesome name="camera" size={20} color={Theme.textPrimaryDark} />
              )}
            </TouchableOpacity>
          </View>
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
                <LoadingIndicator size="small" color={colors.emerald} />
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
            {podUploading ? (
              <TouchableOpacity onPress={cancelPodUpload} activeOpacity={0.8} style={styles.podCancelLink}>
                <Text style={[styles.podCancelLinkText, { color: Theme.textMuted }]}>Cancel upload</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setPodSkipped(true)} activeOpacity={0.8} style={styles.skipLink}>
              <Text style={[styles.skipLinkText, { color: colors.emerald }]}>Skip POD</Text>
            </TouchableOpacity>
            {podDocuments.length >= 1 ? (
              <View style={[styles.podListWrap, { borderColor: Theme.border }]}>
                {podDocuments.map((doc, index) => (
                  <PodDocumentRow
                    key={doc.id}
                    doc={doc}
                    index={index}
                    colors={colors}
                    podDeletingId={podDeletingId}
                    onView={openPodPreview}
                    onDelete={confirmDeletePod}
                  />
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
                <LoadingIndicator size="small" color={colors.emerald} />
              ) : (
                <Text style={[styles.podCount, { color: Theme.textMuted }]}>
                  {podDocuments.length} file{podDocuments.length === 1 ? '' : 's'}
                </Text>
              )}
            </View>
            {podDocuments.length >= 1 ? (
              <View style={[styles.podListWrap, { borderColor: Theme.border }]}>
                {podDocuments.map((doc, index) => (
                  <PodDocumentRow
                    key={doc.id}
                    doc={doc}
                    index={index}
                    colors={colors}
                    podDeletingId={podDeletingId}
                    canDelete={false}
                    onView={openPodPreview}
                    onDelete={confirmDeletePod}
                  />
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
                <LoadingIndicator size="large" color={colors.emerald} />
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
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 8,
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
  progressSegments: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 8 },
  progressSegment: { height: 6, flex: 1, borderRadius: 999 },
  titleBlock: { alignItems: 'center', paddingBottom: 6 },
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
  routeCompactOuter: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
    marginTop: 2,
    overflow: 'hidden',
  },
  routeOneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: '100%',
    flexWrap: 'nowrap',
  },
  routeCompactDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  routePlaceText: {
    fontSize: 10,
    fontWeight: '700',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 40,
  },
  routeCompactSep: { fontSize: 10, fontWeight: '800', flexShrink: 0, opacity: 0.85 },
  routeTrail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 4,
    gap: 5,
    maxWidth: '46%',
    rowGap: 2,
  },
  routeTripMeta: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 0,
    maxWidth: '100%',
  },
  routeGpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  routeDriverCoords: {
    fontSize: 9,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  actionIconsRow: { flexDirection: 'row', gap: 12, paddingTop: 2, paddingBottom: 4 },
  actionIconBtnWrap: { flex: 1, position: 'relative' },
  messageBadge: {
    position: 'absolute',
    top: -4,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
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
  podCancelLink: { alignSelf: 'center', paddingTop: 6, paddingBottom: 2 },
  podCancelLinkText: { fontSize: 13, fontWeight: '800' },
  podListWrap: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  podListItem: {
    minHeight: 46,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  podListItemFirst: { borderTopWidth: 0 },
  podListFileName: { flex: 1, fontSize: 13, fontWeight: '700', minWidth: 0 },
  podListActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  podViewIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podDeleteIconBtn: {
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

