/**
 * Full-screen stage attachment flow (POD at drop, or LR/order/pickup proof before transit).
 * Preview lives inside this Modal (sibling Modals sit under fullscreen → eye would do nothing).
 */
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import {
  FLOW_EMERALD,
  FLOW_EMERALD_DARK,
  FLOW_MINT,
  TRIP_SHEET_BODY_PAD,
  TRIP_SHEET_BTN_HEIGHT,
} from '@/components/driver/DriverTripSheetLayout';
import type * as tripDocumentsService from '@/features/trips/services/tripDocuments.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, ChevronRight, Route } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DriverStageAttachmentVariant = 'pod' | 'lr';

export type DriverPodCompletionPageProps = {
  visible: boolean;
  variant?: DriverStageAttachmentVariant;
  onCloseToMap: () => void;
  /** Destination context — drop for POD, pickup for LR. */
  placeLabel: string;
  earnings: string;
  documents: tripDocumentsService.TripDocumentRow[];
  viewUrls: Record<string, string>;
  docsLoading: boolean;
  uploading: boolean;
  skipped: boolean;
  deletingId: string | null;
  actionBusy?: boolean;
  stepError: string | null;
  onUpload: (source: 'camera' | 'library') => void;
  onCancelUpload: () => void;
  onSkip: () => void;
  /** Resolves a signed preview URL (and caches on parent). */
  onResolvePreview: (
    doc: tripDocumentsService.TripDocumentRow,
  ) => Promise<string | null>;
  onDelete: (doc: tripDocumentsService.TripDocumentRow) => void;
  /** Runs after user confirms Complete in the dialog. */
  onConfirmAction: () => void;
};

const VARIANT_COPY = {
  pod: {
    eyebrow: 'FINISH DELIVERY',
    title: 'Almost done',
    subtitle: (place: string) =>
      `At ${place || 'drop-off'} · upload POD, then complete`,
    section: 'PROOF OF DELIVERY',
    uploadTitle: 'Upload POD',
    uploadHintEmpty: 'Receipt, stamp, or package',
    uploadHintReady: 'Add another photo if needed',
    skip: 'Skip POD',
    skipped: 'Skipped',
    action: 'Complete delivery',
    actionBusyLabel: 'Completing…',
    confirmTitle: 'Complete delivery?',
    confirmMessage: 'Finish this trip and mark delivery complete.',
    confirmAction: 'Complete',
    footerHint: 'Upload or skip POD to unlock complete',
    actionIcon: 'check-circle' as const,
    steps: [
      { id: 'pickup', label: 'Pickup' },
      { id: 'transit', label: 'Transit' },
      { id: 'pod', label: 'POD' },
      { id: 'done', label: 'Done' },
    ],
  },
  lr: {
    eyebrow: 'START TRANSIT',
    title: 'Attach pickup proof',
    subtitle: (place: string) =>
      `At ${place || 'pickup'} · LR, order copy, or pickup photo`,
    section: 'LR / ORDER COPY / PICKUP PROOF',
    uploadTitle: 'Upload attachment',
    uploadHintEmpty: 'LR, order copy, or pickup photo',
    uploadHintReady: 'Add another, or hold to start transit',
    skip: 'Skip attachment',
    skipped: 'Skipped',
    action: 'Start transit',
    actionBusyLabel: 'Starting…',
    confirmTitle: 'Start transit?',
    confirmMessage: 'Leave pickup and begin the trip to drop-off.',
    confirmAction: 'Start transit',
    footerHint: 'Upload or skip attachment to unlock transit',
    actionIcon: 'truck' as const,
    steps: [
      { id: 'arrive', label: 'Arrive' },
      { id: 'collect', label: 'Collect' },
      { id: 'attach', label: 'Attach' },
      { id: 'transit', label: 'Transit' },
    ],
  },
} as const;

export function DriverPodCompletionPage({
  visible,
  variant = 'pod',
  onCloseToMap,
  placeLabel,
  earnings,
  documents,
  viewUrls,
  docsLoading,
  uploading,
  skipped,
  deletingId,
  actionBusy = false,
  stepError,
  onUpload,
  onCancelUpload,
  onSkip,
  onResolvePreview,
  onDelete,
  onConfirmAction,
}: DriverPodCompletionPageProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const copy = VARIANT_COPY[variant];
  const canComplete = documents.length >= 1 || skipped;
  const flowSteps = copy.steps;
  const pulse = useSharedValue(0);
  const swipeHint = useSharedValue(0);

  /** Index into `documents` while gallery is open; null = closed. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewResolvingId, setPreviewResolvingId] = useState<string | null>(null);
  const [previewFailedIds, setPreviewFailedIds] = useState<Record<string, boolean>>({});
  const [hasSwipedPreview, setHasSwipedPreview] = useState(false);
  const galleryRef = useRef<FlatList<tripDocumentsService.TripDocumentRow>>(null);
  const thumbStripRef = useRef<ScrollView>(null);

  const closePreview = useCallback(() => {
    setPreviewIndex(null);
    setPreviewResolvingId(null);
    setPreviewFailedIds({});
    setHasSwipedPreview(false);
    swipeHint.value = 0;
  }, [swipeHint]);

  useEffect(() => {
    if (!visible) closePreview();
  }, [visible, closePreview]);

  useEffect(() => {
    if (!visible || canComplete) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [visible, canComplete, pulse]);

  const uploadPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.012 }],
  }));

  const swipeHintStyle = useAnimatedStyle(() => ({
    opacity: swipeHint.value,
    transform: [{ translateX: (1 - swipeHint.value) * -6 }],
  }));

  const ensurePreviewUrl = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      if (viewUrls[doc.id]) return viewUrls[doc.id];
      setPreviewResolvingId(doc.id);
      try {
        const url = await onResolvePreview(doc);
        if (!url) {
          setPreviewFailedIds((prev) => ({ ...prev, [doc.id]: true }));
          return null;
        }
        setPreviewFailedIds((prev) => {
          if (!prev[doc.id]) return prev;
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
        return url;
      } catch {
        setPreviewFailedIds((prev) => ({ ...prev, [doc.id]: true }));
        return null;
      } finally {
        setPreviewResolvingId((cur) => (cur === doc.id ? null : cur));
      }
    },
    [onResolvePreview, viewUrls],
  );

  const openPreview = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      const idx = documents.findIndex((d) => d.id === doc.id);
      const nextIndex = idx >= 0 ? idx : 0;
      setPreviewIndex(nextIndex);
      setHasSwipedPreview(false);
      if (documents.length > 1) {
        swipeHint.value = withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(1, { duration: 1400 }),
          withTiming(0, { duration: 420 }),
        );
      }
      await ensurePreviewUrl(doc);
    },
    [documents, ensurePreviewUrl, swipeHint],
  );

  // Prefetch current + neighbours whenever the gallery page changes.
  useEffect(() => {
    if (previewIndex == null) return;
    const targets = [previewIndex - 1, previewIndex, previewIndex + 1]
      .filter((i) => i >= 0 && i < documents.length)
      .map((i) => documents[i])
      .filter(Boolean);
    for (const doc of targets) {
      void ensurePreviewUrl(doc);
    }
  }, [previewIndex, documents, ensurePreviewUrl]);

  // Keep index valid if the list shrinks (delete while open).
  useEffect(() => {
    if (previewIndex == null) return;
    if (documents.length === 0) {
      closePreview();
      return;
    }
    if (previewIndex >= documents.length) {
      setPreviewIndex(documents.length - 1);
    }
  }, [documents.length, previewIndex, closePreview]);

  // Keep thumbnail strip scrolled to the active doc.
  useEffect(() => {
    if (previewIndex == null || documents.length < 2) return;
    const thumbW = 56;
    thumbStripRef.current?.scrollTo({
      x: Math.max(0, previewIndex * (thumbW + 8) - windowWidth / 2 + thumbW),
      animated: true,
    });
  }, [previewIndex, documents.length, windowWidth]);

  const requestConfirmAction = useCallback(() => {
    if (actionBusy) return;
    const title = copy.confirmTitle;
    const message = copy.confirmMessage;
    if (Platform.OS === 'web') {
      const w =
        typeof globalThis !== 'undefined'
          ? (globalThis as { confirm?: (msg: string) => boolean }).confirm
          : undefined;
      if (typeof w === 'function' && w(`${title}\n\n${message}`)) {
        onConfirmAction();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Back', style: 'cancel' },
      {
        text: copy.confirmAction,
        onPress: () => onConfirmAction(),
      },
    ]);
  }, [
    actionBusy,
    copy.confirmAction,
    copy.confirmMessage,
    copy.confirmTitle,
    onConfirmAction,
  ]);

  const previewOpen = previewIndex != null;
  const activeDoc =
    previewIndex != null && previewIndex >= 0 && previewIndex < documents.length
      ? documents[previewIndex]
      : null;
  const activeUrl = activeDoc ? viewUrls[activeDoc.id] ?? null : null;
  const canGoPrev = previewIndex != null && previewIndex > 0;
  const canGoNext =
    previewIndex != null && previewIndex < documents.length - 1;

  const goToPreviewIndex = useCallback(
    (index: number, animated = true) => {
      if (index < 0 || index >= documents.length) return;
      setPreviewIndex(index);
      galleryRef.current?.scrollToIndex({ index, animated });
      if (!hasSwipedPreview) {
        setHasSwipedPreview(true);
        swipeHint.value = withTiming(0, { duration: 200 });
      }
    },
    [documents.length, hasSwipedPreview, swipeHint],
  );

  const onGalleryScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(windowWidth, 1));
      if (next === previewIndex) return;
      if (next < 0 || next >= documents.length) return;
      setPreviewIndex(next);
      if (!hasSwipedPreview) {
        setHasSwipedPreview(true);
        swipeHint.value = withTiming(0, { duration: 200 });
      }
    },
    [documents.length, hasSwipedPreview, previewIndex, swipeHint, windowWidth],
  );

  const galleryGetItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: windowWidth,
      offset: windowWidth * index,
      index,
    }),
    [windowWidth],
  );

  const renderGalleryItem = useCallback(
    ({ item }: { item: tripDocumentsService.TripDocumentRow }) => {
      const url = viewUrls[item.id];
      const failed = !!previewFailedIds[item.id];
      const loading = !url && !failed && previewResolvingId === item.id;
      return (
        <View style={[styles.galleryPage, { width: windowWidth }]}>
          <View style={styles.galleryFrame}>
            {url ? (
              <Image
                source={{ uri: url }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() =>
                  setPreviewFailedIds((prev) => ({ ...prev, [item.id]: true }))
                }
              />
            ) : (
              <View style={styles.previewBody}>
                {failed ? (
                  <>
                    <Text style={styles.previewFallbackText}>
                      Preview not available.
                    </Text>
                    <TouchableOpacity
                      style={styles.previewBrowserBtn}
                      onPress={() => void ensurePreviewUrl(item)}
                    >
                      <Text style={styles.previewBrowserBtnText}>Retry</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <LoadingIndicator size="large" color={FLOW_EMERALD} />
                    <Text style={styles.previewLoadingText}>
                      {loading ? 'Loading…' : 'Opening…'}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      ensurePreviewUrl,
      previewFailedIds,
      previewResolvingId,
      viewUrls,
      windowWidth,
    ],
  );

  const previewCounterLabel = useMemo(() => {
    if (previewIndex == null || documents.length === 0) return '';
    return `${previewIndex + 1} / ${documents.length}`;
  }, [documents.length, previewIndex]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={previewOpen ? closePreview : onCloseToMap}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[FLOW_EMERALD_DARK, FLOW_EMERALD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroChrome}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onCloseToMap}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to map"
              hitSlop={8}
            >
              <ChevronLeft size={20} color="#fff" strokeWidth={2.4} />
              <Text style={styles.backText}>Map</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Route size={11} color={FLOW_MINT} strokeWidth={2.5} />
              <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{copy.title}</Text>
            <Text style={styles.heroSubtitle} numberOfLines={2}>
              {copy.subtitle(placeLabel)}
            </Text>

            <View style={styles.flowRail}>
              {flowSteps.map((s, index) => {
                const done = index < 2 || (index === 2 && canComplete);
                const current = index === 2 && !canComplete;
                return (
                  <React.Fragment key={s.id}>
                    {index > 0 ? (
                      <View
                        style={[styles.flowLine, (done || current) && styles.flowLineOn]}
                      />
                    ) : null}
                    <View style={styles.flowStep}>
                      <View
                        style={[
                          styles.flowDot,
                          done && styles.flowDotDone,
                          current && styles.flowDotCurrent,
                          index === 3 && canComplete && styles.flowDotReady,
                        ]}
                      >
                        {done ? (
                          <Check size={10} color={FLOW_EMERALD} strokeWidth={3} />
                        ) : (
                          <Text
                            style={[
                              styles.flowDotNum,
                              current && styles.flowDotNumCurrent,
                            ]}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.flowLabel,
                          (done || current) && styles.flowLabelOn,
                        ]}
                      >
                        {s.label}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

          </View>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stepError ? (
            <View style={styles.errorWrap}>
              <FontAwesome name="exclamation-circle" size={12} color={Theme.negative} />
              <Text style={styles.errorText} numberOfLines={3}>
                {stepError}
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{copy.section}</Text>
            {docsLoading ? (
              <LoadingIndicator size="small" color={FLOW_EMERALD} />
            ) : (
              <Text style={styles.fileCount}>
                {documents.length} file{documents.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>

          <Text style={styles.uploadLead} numberOfLines={1}>
            {uploading
              ? 'Uploading…'
              : canComplete
                ? copy.uploadHintReady
                : copy.uploadHintEmpty}
          </Text>

          <Animated.View style={[styles.uploadTilesRow, uploadPulseStyle]}>
            <TouchableOpacity
              style={[styles.uploadTile, uploading && styles.uploadZoneBusy]}
              onPress={() => onUpload('camera')}
              disabled={uploading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
            >
              <View style={styles.uploadIconPlate}>
                {uploading ? (
                  <LoadingIndicator size="small" color={FLOW_EMERALD} />
                ) : (
                  <FontAwesome name="camera" size={16} color={FLOW_EMERALD} />
                )}
              </View>
              <Text style={styles.uploadTitle}>Camera</Text>
              <Text style={styles.uploadHint} numberOfLines={1}>
                Live photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadTile, uploading && styles.uploadZoneBusy]}
              onPress={() => onUpload('library')}
              disabled={uploading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Choose from photo library"
            >
              <View style={styles.uploadIconPlate}>
                {uploading ? (
                  <LoadingIndicator size="small" color={FLOW_EMERALD} />
                ) : (
                  <FontAwesome name="image" size={16} color={FLOW_EMERALD} />
                )}
              </View>
              <Text style={styles.uploadTitle}>Library</Text>
              <Text style={styles.uploadHint} numberOfLines={1}>
                Existing photo
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.secondaryActions}>
            {uploading ? (
              <TouchableOpacity onPress={onCancelUpload} style={styles.skipBtn} hitSlop={6}>
                <Text style={styles.skipMuted}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onSkip}
                style={styles.skipBtn}
                disabled={skipped}
                hitSlop={6}
              >
                <Text style={[styles.skipEm, skipped && { opacity: 0.45 }]}>
                  {skipped ? copy.skipped : copy.skip}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {documents.length > 0 ? (
            <View style={styles.fileList}>
              {documents.map((doc) => {
                const thumb = viewUrls[doc.id];
                return (
                  <View key={doc.id} style={styles.fileRow}>
                    <Pressable
                      onPress={() => void openPreview(doc)}
                      style={styles.fileThumbWrap}
                      accessibilityLabel={`View ${doc.file_name || 'POD'}`}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.fileThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.fileThumbFallback}>
                          <FontAwesome
                            name="file-image-o"
                            size={13}
                            color={Theme.textMuted}
                          />
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.fileTextCol}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {doc.file_name || 'POD'}
                      </Text>
                      <Text style={styles.fileMeta}>Ready</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => void openPreview(doc)}
                      style={styles.fileIconBtn}
                      accessibilityLabel="View POD"
                      hitSlop={4}
                    >
                      <FontAwesome name="eye" size={13} color={FLOW_EMERALD} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDelete(doc)}
                      style={[styles.fileIconBtn, styles.fileDeleteBtn]}
                      disabled={deletingId === doc.id}
                      accessibilityLabel="Delete POD"
                      hitSlop={4}
                    >
                      {deletingId === doc.id ? (
                        <LoadingIndicator size="small" color={Theme.negative} />
                      ) : (
                        <FontAwesome name="trash-o" size={13} color={Theme.negative} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              // Web keeps the floating driver tab dock above RN Modals; native
              // fullScreen covers it — only pad the dock height on web.
              paddingBottom:
                Math.max(insets.bottom, 10) +
                (Platform.OS === 'web' ? Layout.tabBarDockHeight + 8 : 12),
              backgroundColor: Theme.surface,
            },
          ]}
        >
          <View style={styles.footerEarnRow}>
            <View style={styles.earnIcon}>
              <FontAwesome name="money" size={12} color={FLOW_EMERALD} />
            </View>
            <View style={styles.earnTextCol}>
              <Text style={styles.earnLabel}>EST. EARNINGS</Text>
              <Text style={styles.earnValue} numberOfLines={1}>
                {earnings}
              </Text>
            </View>
          </View>

          {canComplete ? (
            <TouchableOpacity
              onPress={requestConfirmAction}
              disabled={actionBusy}
              activeOpacity={0.9}
              style={[styles.primaryActionBtn, actionBusy && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={copy.action}
            >
              <LinearGradient
                colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryActionGradient}
              >
                {actionBusy ? (
                  <LoadingIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name={copy.actionIcon} size={16} color="#fff" />
                )}
                <Text style={styles.primaryActionText} numberOfLines={1}>
                  {actionBusy ? copy.actionBusyLabel : copy.action}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerHint}>
              <Text style={styles.footerHintText}>{copy.footerHint}</Text>
            </View>
          )}
        </View>

        {previewOpen && previewIndex != null ? (
          <View style={styles.previewLayer}>
            <View style={styles.previewBackdrop} />
            <View
              style={[
                styles.previewSheet,
                {
                  paddingBottom: Math.max(insets.bottom, 10),
                  paddingTop: Math.max(insets.top, 8),
                },
              ]}
            >
              <View style={styles.previewTopBar}>
                <TouchableOpacity
                  style={styles.previewClose}
                  onPress={closePreview}
                  activeOpacity={0.85}
                  accessibilityLabel="Close preview"
                >
                  <FontAwesome name="times" size={14} color="#fff" />
                  <Text style={styles.previewCloseText}>Close</Text>
                </TouchableOpacity>
                <View style={styles.previewCounterPill}>
                  <Text style={styles.previewCounterText}>{previewCounterLabel}</Text>
                </View>
                {activeUrl ? (
                  <TouchableOpacity
                    style={styles.previewOpenBtn}
                    onPress={() => void Linking.openURL(activeUrl)}
                    accessibilityLabel="Open in browser"
                  >
                    <FontAwesome name="external-link" size={12} color={FLOW_MINT} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.previewOpenBtnGhost} />
                )}
              </View>

              <Text style={styles.previewFileName} numberOfLines={1}>
                {activeDoc?.file_name || (variant === 'lr' ? 'Attachment' : 'POD')}
              </Text>

              <View style={styles.galleryWrap}>
                <FlatList
                  key={`gallery-${documents.map((d) => d.id).join('|')}`}
                  ref={galleryRef}
                  data={documents}
                  horizontal
                  pagingEnabled
                  bounces
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => item.id}
                  renderItem={renderGalleryItem}
                  getItemLayout={galleryGetItemLayout}
                  initialScrollIndex={Math.min(previewIndex, Math.max(0, documents.length - 1))}
                  onMomentumScrollEnd={onGalleryScrollEnd}
                  onScrollToIndexFailed={({ index }) => {
                    requestAnimationFrame(() => {
                      galleryRef.current?.scrollToIndex({ index, animated: false });
                    });
                  }}
                />

                {documents.length > 1 ? (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.navChevron,
                        styles.navChevronLeft,
                        !canGoPrev && styles.navChevronDisabled,
                      ]}
                      disabled={!canGoPrev}
                      onPress={() => goToPreviewIndex((previewIndex ?? 0) - 1)}
                      accessibilityLabel="Previous document"
                    >
                      <ChevronLeft size={22} color="#fff" strokeWidth={2.4} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.navChevron,
                        styles.navChevronRight,
                        !canGoNext && styles.navChevronDisabled,
                      ]}
                      disabled={!canGoNext}
                      onPress={() => goToPreviewIndex((previewIndex ?? 0) + 1)}
                      accessibilityLabel="Next document"
                    >
                      <ChevronRight size={22} color="#fff" strokeWidth={2.4} />
                    </TouchableOpacity>
                  </>
                ) : null}

                {documents.length > 1 && !hasSwipedPreview ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.swipeHint, swipeHintStyle]}
                  >
                    <ChevronLeft size={14} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.swipeHintText}>Swipe</Text>
                    <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
                  </Animated.View>
                ) : null}
              </View>

              {documents.length > 1 ? (
                <View style={styles.dotsRow}>
                  {documents.map((doc, i) => (
                    <Pressable
                      key={doc.id}
                      onPress={() => goToPreviewIndex(i)}
                      hitSlop={6}
                      style={[
                        styles.dot,
                        i === previewIndex ? styles.dotActive : null,
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              {documents.length > 1 ? (
                <ScrollView
                  ref={thumbStripRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbStripContent}
                  style={styles.thumbStrip}
                >
                  {documents.map((doc, i) => {
                    const thumb = viewUrls[doc.id];
                    const active = i === previewIndex;
                    return (
                      <Pressable
                        key={doc.id}
                        onPress={() => goToPreviewIndex(i)}
                        style={[
                          styles.thumbChip,
                          active && styles.thumbChipActive,
                        ]}
                      >
                        {thumb ? (
                          <Image
                            source={{ uri: thumb }}
                            style={styles.thumbImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.thumbFallback}>
                            <FontAwesome
                              name="file-image-o"
                              size={12}
                              color="rgba(255,255,255,0.55)"
                            />
                          </View>
                        )}
                        {active ? <View style={styles.thumbActiveBar} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  heroChrome: {
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    minWidth: 56,
    minHeight: 40,
  },
  backText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  headerEyebrow: {
    color: FLOW_MINT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSpacer: { minWidth: 56 },
  heroBody: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    gap: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FLOW_MINT,
    lineHeight: 18,
  },
  flowRail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  flowStep: {
    alignItems: 'center',
    gap: 4,
    minWidth: 40,
  },
  flowDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowDotDone: {
    backgroundColor: '#fff',
  },
  flowDotCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fff',
  },
  flowDotReady: {
    borderWidth: 2,
    borderColor: FLOW_MINT,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  flowDotNum: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
  },
  flowDotNumCurrent: {
    color: '#fff',
  },
  flowLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  flowLabelOn: {
    color: '#fff',
  },
  flowLine: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginTop: 10,
    marginHorizontal: 2,
  },
  flowLineOn: {
    backgroundColor: '#fff',
  },
  footerEarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  earnIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  earnValue: {
    fontSize: 17,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
  },
  earnLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.55,
    color: Theme.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 14,
    gap: 10,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.negativeMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.negative,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: Theme.textMuted,
  },
  fileCount: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  uploadLead: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  uploadTilesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  uploadTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: FLOW_EMERALD,
    backgroundColor: Theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  uploadZoneBusy: {
    opacity: 0.72,
  },
  uploadIconPlate: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.driverEmeraldMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  uploadHint: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  skipBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: 6,
  },
  skipEm: {
    fontSize: 13,
    fontWeight: '700',
    color: FLOW_EMERALD,
  },
  skipMuted: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  fileList: {
    gap: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  fileThumbWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  fileThumb: {
    width: '100%',
    height: '100%',
  },
  fileThumbFallback: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  fileMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: FLOW_EMERALD,
  },
  fileIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.driverEmeraldMuted,
  },
  fileDeleteBtn: {
    backgroundColor: Theme.negativeMuted,
  },
  footer: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  primaryActionBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryActionGradient: {
    minHeight: TRIP_SHEET_BTN_HEIGHT + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
    color: '#fff',
  },
  footerHint: {
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
  },
  footerHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMuted,
    textAlign: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  previewLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 18, 14, 0.94)',
  },
  previewSheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 10,
  },
  previewClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  previewCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  previewCounterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,243,208,0.45)',
  },
  previewCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: FLOW_MINT,
    letterSpacing: 0.4,
  },
  previewOpenBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  previewOpenBtnGhost: {
    width: 40,
    height: 40,
  },
  previewFileName: {
    marginTop: 8,
    marginHorizontal: 18,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },
  galleryWrap: {
    flex: 1,
    marginTop: 10,
    justifyContent: 'center',
  },
  galleryPage: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  galleryFrame: {
    flex: 1,
    maxHeight: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  navChevron: {
    position: 'absolute',
    top: '46%',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.88)',
    zIndex: 5,
  },
  navChevronLeft: {
    left: 10,
  },
  navChevronRight: {
    right: 10,
  },
  navChevronDisabled: {
    opacity: 0.28,
  },
  swipeHint: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swipeHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    width: 16,
    backgroundColor: FLOW_EMERALD,
  },
  thumbStrip: {
    maxHeight: 64,
    marginBottom: 4,
  },
  thumbStripContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  thumbChip: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumbChipActive: {
    borderColor: FLOW_EMERALD,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActiveBar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: FLOW_EMERALD,
  },
  previewBody: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  previewLoadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0b1220',
  },
  previewFallbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  previewBrowserBtn: {
    backgroundColor: FLOW_EMERALD,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  previewBrowserBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
