/**
 * Trip detail — Ratings for own/asset, aggregate (OTP), and indent-based trips.
 * - Own trip (asset): Organization→Driver
 * - Aggregate (OTP): Client→Supplier, Client→Driver (when client_id), Supplier→Driver, Org→Driver (when no client_id)
 * - Indent-based: Client→Supplier, Client→Driver, Supplier→Driver
 */
import Theme from '@/constants/Theme';
import { VALIDATION } from '@/lib/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TripRow } from '@/features/trips/services/trips.service';
import {
  createRating,
  getRatingsForTrip,
  averageScore,
  type RatingRow,
} from '../services/ratings.service';
import type { RaterType, RatedType } from '../types';

export interface TripRatingsBlockProps {
  trip: TripRow;
  organizationId: string | null;
  /** Resolved supplier/partner display name */
  partnerName?: string | null;
  /** Resolved driver display name */
  driverName?: string | null;
  /** Resolved driver profile avatar uri (signed/public URL). */
  driverAvatarUri?: string | null;
  /** Called when trip ratings have been loaded (so parent can show driver rating in tracking block) */
  onRatingsLoaded?: (ratings: RatingRow[]) => void;
}

type RateFlow = { type: 'client_supplier' } | { type: 'supplier_driver' } | null;
type CommentPayload = { tags: string[]; note: string };

type QuickTag = { id: string; label: string };

const DRIVER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'safe_driving', label: 'Safe driving' },
  { id: 'on_time', label: 'On time' },
  { id: 'professional', label: 'Professional' },
  { id: 'good_communication', label: 'Good communication' },
  { id: 'well_maintained_vehicle', label: 'Well maintained vehicle' },
] as const;

const SUPPLIER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'reliable_service', label: 'Reliable service' },
  { id: 'on_time_assignment', label: 'On time assignment' },
  { id: 'good_coordination', label: 'Good coordination' },
  { id: 'quick_response', label: 'Quick response' },
  { id: 'professional', label: 'Professional' },
] as const;

const LEGACY_TAG_LABELS: Record<string, string> = {
  clean: 'Clean ride',
  navigation: 'Great navigation',
  communication: 'Good communication',
  safe: 'Safe driving',
  ontime: 'On time',
};

const COMMENT_TAG_PREFIX = '[[tags:';
const COMMENT_TAG_SUFFIX = ']]';

function getQuickTagsForRatedType(ratedType: RatedType): readonly QuickTag[] {
  return ratedType === 'supplier' ? SUPPLIER_RATING_TAGS : DRIVER_RATING_TAGS;
}

function getQuickTagLabel(tagId: string, ratedType: RatedType): string {
  return (
    getQuickTagsForRatedType(ratedType).find((item) => item.id === tagId)?.label ||
    LEGACY_TAG_LABELS[tagId] ||
    tagId
  );
}

function parseCommentPayload(raw: string | null): CommentPayload {
  if (!raw) return { tags: [], note: '' };
  if (!raw.startsWith(COMMENT_TAG_PREFIX)) {
    return { tags: [], note: raw.trim() };
  }
  const suffixIndex = raw.indexOf(COMMENT_TAG_SUFFIX);
  if (suffixIndex === -1) {
    return { tags: [], note: raw.trim() };
  }
  const encodedTags = raw.slice(COMMENT_TAG_PREFIX.length, suffixIndex);
  const tags = encodedTags
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  const note = raw.slice(suffixIndex + COMMENT_TAG_SUFFIX.length).trim();
  return { tags, note };
}

function buildCommentPayload(tags: string[], note: string): string | null {
  const trimmedNote = note.trim();
  if (tags.length === 0) {
    return trimmedNote || null;
  }
  const encoded = `${COMMENT_TAG_PREFIX}${tags.join('|')}${COMMENT_TAG_SUFFIX}`;
  return trimmedNote ? `${encoded}\n${trimmedNote}` : encoded;
}

function formatDate(s: string) {
  if (!s) return '—';
  const d = s.slice(0, 10);
  const [y, m, day] = d.split('-');
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

function getScoreLabel(value: number): string {
  if (value <= 0) return 'Select rating';
  if (value === 1) return 'Needs improvement';
  if (value === 2) return 'Below expectations';
  if (value === 3) return 'Good';
  if (value === 4) return 'Very good';
  return 'Excellent';
}

function getScoreEmoji(value: number): string {
  if (value <= 0) return '⭐';
  if (value === 1) return '😕';
  if (value === 2) return '🙁';
  if (value === 3) return '🙂';
  if (value === 4) return '😊';
  return '🤩';
}

export function TripRatingsBlock({
  trip,
  organizationId,
  partnerName,
  driverName,
  driverAvatarUri,
  onRatingsLoaded,
}: TripRatingsBlockProps) {
  const insets = useSafeAreaInsets();
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<RateFlow>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(24)).current;
  const composerOpacity = useRef(new Animated.Value(0)).current;
  const composerTranslateY = useRef(new Animated.Value(10)).current;
  const successScale = useRef(new Animated.Value(0.96)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const isCompleted =
    (trip.status || '').toLowerCase() === 'completed' ||
    !!(trip as { completed_at?: string }).completed_at;
  /** Client→Supplier: indent or aggregate with client_id. */
  const canRateSupplier =
    isCompleted &&
    !!trip.client_id &&
    !!trip.supplier_id &&
    !!organizationId;

  const hasRatedSupplier = ratings.some(
    (r) => r.rater_type === 'client' && r.rated_type === 'supplier'
  );
  const hasRatedDriver = ratings.some(
    (r) =>
      r.rated_type === 'driver' &&
      (r.rater_type === 'client' || r.rater_type === 'supplier' || r.rater_type === 'organization')
  );

  const isClientViewer = !!trip.organization_id && !!organizationId && trip.organization_id === organizationId;
  const hasSupplier = !!trip.supplier_id;
  const hasClient = !!trip.client_id;

  /** Client→Driver: indent or aggregate with client_id (trip owner). */
  const canRateDriverAsClient =
    isCompleted &&
    hasClient &&
    hasSupplier &&
    !!trip.driver_id &&
    !!organizationId &&
    isClientViewer;
  /** Supplier→Driver: aggregate/indent when viewing as supplier org. */
  const canRateDriverAsSupplier =
    isCompleted &&
    hasSupplier &&
    !!trip.driver_id &&
    !!organizationId &&
    !isClientViewer;
  /** Organization→Driver: own trip (asset) or aggregate without client_id (buyer org rates driver). */
  const canRateDriverAsOrg =
    isCompleted &&
    !!trip.driver_id &&
    !!organizationId &&
    isClientViewer &&
    (!hasSupplier || !hasClient);

  const canRateDriver = canRateDriverAsClient || canRateDriverAsSupplier || canRateDriverAsOrg;

  const loadRatings = useCallback(async () => {
    if (!trip.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { error, ratings: list } = await getRatingsForTrip(trip.id);
    setLoading(false);
    if (!error) {
      setRatings(list);
      onRatingsLoaded?.(list);
    }
  }, [trip.id, onRatingsLoaded]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  useEffect(() => {
    if (!flow) {
      modalOpacity.setValue(0);
      modalTranslateY.setValue(24);
      return;
    }
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
        mass: 0.9,
      }),
    ]).start();
  }, [flow, modalOpacity, modalTranslateY]);

  useEffect(() => {
    if (score <= 0 || submitSuccess) {
      composerOpacity.setValue(0);
      composerTranslateY.setValue(10);
      return;
    }
    Animated.parallel([
      Animated.timing(composerOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(composerTranslateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [score, submitSuccess, composerOpacity, composerTranslateY]);

  useEffect(() => {
    if (!submitSuccess) {
      successOpacity.setValue(0);
      successScale.setValue(0.96);
      return;
    }
    Animated.parallel([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 220,
        mass: 0.9,
      }),
    ]).start();
  }, [submitSuccess, successOpacity, successScale]);

  const nextFlowAfterSuccess: RateFlow =
    flow?.type === 'client_supplier'
      ? (canRateDriver && !hasRatedDriver ? { type: 'supplier_driver' } : null)
      : flow?.type === 'supplier_driver'
        ? (canRateSupplier && !hasRatedSupplier ? { type: 'client_supplier' } : null)
        : null;

  useEffect(() => {
    if (!submitSuccess) return;
    const timeout = setTimeout(() => {
      if (nextFlowAfterSuccess) {
        resetComposer(nextFlowAfterSuccess);
        return;
      }
      closeModal();
    }, nextFlowAfterSuccess ? 1200 : 2000);
    return () => clearTimeout(timeout);
  }, [submitSuccess, nextFlowAfterSuccess]);

  // Auto-popup rating modal when trip is completed and a rating is missing (once per mount)
  useEffect(() => {
    if (loading || !isCompleted || hasAutoOpenedRef.current) return;
    if (canRateSupplier && !hasRatedSupplier) {
      hasAutoOpenedRef.current = true;
      setFlow({ type: 'client_supplier' });
      setScore(0);
      setComment('');
      setSelectedTags([]);
      setShowCommentBox(false);
      setSubmitSuccess(false);
      return;
    }
    if (canRateDriver && !hasRatedDriver) {
      hasAutoOpenedRef.current = true;
      setFlow({ type: 'supplier_driver' });
      setScore(0);
      setComment('');
      setSelectedTags([]);
      setShowCommentBox(false);
      setSubmitSuccess(false);
    }
  }, [loading, isCompleted, canRateSupplier, canRateDriver, hasRatedSupplier, hasRatedDriver]);

  const resetComposer = (nextFlow: RateFlow) => {
    setFlow(nextFlow);
    setScore(0);
    setComment('');
    setSelectedTags([]);
    setShowCommentBox(false);
    setSubmitSuccess(false);
  };

  const openRateSupplier = () => {
    resetComposer({ type: 'client_supplier' });
  };
  const openRateDriver = () => {
    resetComposer({ type: 'supplier_driver' });
  };
  const closeModal = () => {
    setFlow(null);
    setSubmitting(false);
    setSubmitSuccess(false);
  };
  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = () => {
    if (!organizationId || !flow) return;
    if (score < 1 || score > 5) {
      Alert.alert('Select rating', 'Choose a star rating before submitting.');
      return;
    }
    const trimmedComment = comment.trim();
    if (trimmedComment.length > VALIDATION.NOTES_MAX_LENGTH) {
      Alert.alert(
        'Comment too long',
        `Comment must be at most ${VALIDATION.NOTES_MAX_LENGTH} characters.`,
      );
      return;
    }
    const isClientSupplier = flow.type === 'client_supplier';
    const rated_type: RatedType = isClientSupplier ? 'supplier' : 'driver';
    const rated_id = isClientSupplier ? trip.supplier_id! : trip.driver_id!;
    let rater_type: RaterType;
    let rater_id: string;
    if (isClientSupplier) {
      rater_type = 'client';
      rater_id = trip.client_id!;
    } else {
      if (canRateDriverAsClient) {
        rater_type = 'client';
        rater_id = trip.client_id!;
      } else if (canRateDriverAsSupplier) {
        rater_type = 'supplier';
        rater_id = trip.supplier_id!;
      } else {
        rater_type = 'organization';
        rater_id = organizationId;
      }
    }

    setSubmitting(true);
    const commentPayload = buildCommentPayload(
      selectedTags,
      trimmedComment.slice(0, VALIDATION.NOTES_MAX_LENGTH)
    );
    createRating(organizationId, {
      trip_id: trip.id,
      rater_type,
      rater_id,
      rated_type,
      rated_id,
      score,
      comment: commentPayload,
    }).then(({ error }) => {
      setSubmitting(false);
      if (!error) {
        setSubmitSuccess(true);
        loadRatings();
      } else {
        Alert.alert('Rating failed', error.message);
      }
    });
  };

  const supplierAvg = averageScore(
    ratings.filter((r) => r.rated_type === 'supplier')
  );
  const driverAvg = averageScore(
    ratings.filter((r) => r.rated_type === 'driver')
  );
  const activeSubjectName = flow?.type === 'client_supplier'
    ? (partnerName || 'Supplier')
    : (driverName || trip.driver_display_name || 'Driver');
  const activeSubjectMeta = flow?.type === 'client_supplier'
    ? (trip.display_trip_id || trip.trip_number || 'Supplier rating')
    : (trip.vehicle_display_number || trip.display_trip_id || trip.trip_number || 'Driver rating');
  const activeRoleLabel = flow?.type === 'client_supplier' ? 'Supplier' : 'Driver';
  const activePrompt = flow?.type === 'client_supplier' ? 'How was the supplier?' : 'How was your trip?';
  const activeQuickTags = flow?.type === 'client_supplier' ? SUPPLIER_RATING_TAGS : DRIVER_RATING_TAGS;
  const scoreLabel = getScoreLabel(score);
  const scoreEmoji = getScoreEmoji(score);

  if (!isCompleted) return null;
  if (!canRateSupplier && !canRateDriver && ratings.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIconWrap}>
          <Feather name="award" size={14} color={Theme.textOnPrimary} />
        </View>
        <View style={styles.sectionHeadingTextWrap}>
          <Text style={styles.sectionTitle}>Ratings</Text>
          <Text style={styles.sectionSubtitle}>Track service quality across completed trips</Text>
        </View>
      </View>
      <View style={styles.card}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={Theme.textMuted} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <>
            {ratings.length > 0 && (
              <View style={styles.summary}>
                {supplierAvg != null && (
                  <View style={styles.summaryPill}>
                    <Feather name="briefcase" size={12} color={Theme.textPrimaryDark} />
                    <Text style={styles.summaryText}>Supplier {supplierAvg.toFixed(1)} ★</Text>
                  </View>
                )}
                {driverAvg != null && (
                  <View style={styles.summaryPill}>
                    <Feather name="truck" size={12} color={Theme.textPrimaryDark} />
                    <Text style={styles.summaryText}>Driver {driverAvg.toFixed(1)} ★</Text>
                  </View>
                )}
              </View>
            )}
            {ratings.length > 0 && (
              <View style={styles.list}>
                {ratings.map((r) => (
                  (() => {
                    const parsed = parseCommentPayload(r.comment);
                    return (
                      <View key={r.id} style={styles.row}>
                        <Text style={styles.rowLabel}>
                          {r.rater_type === 'client'
                            ? 'Client'
                            : r.rater_type === 'organization'
                              ? 'Fleet'
                              : 'Supplier'}{' '}
                          →{' '}
                          {r.rated_type === 'supplier'
                            ? (partnerName || 'Supplier')
                            : (driverName || 'Driver')}
                        </Text>
                        <Text style={styles.rowScore}>{r.score} ★</Text>
                        {parsed.tags.length > 0 ? (
                          <View style={styles.rowTags}>
                            {parsed.tags.map((tagId) => {
                              const tagLabel = getQuickTagLabel(tagId, r.rated_type);
                              return (
                                <View key={`${r.id}-${tagId}`} style={styles.rowTagChip}>
                                  <Text style={styles.rowTagText}>{tagLabel}</Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                        {parsed.note ? (
                          <Text style={styles.rowComment} numberOfLines={2}>
                            {parsed.note}
                          </Text>
                        ) : null}
                        <Text style={styles.rowDate}>{formatDate(r.created_at)}</Text>
                      </View>
                    );
                  })()
                ))}
              </View>
            )}
            <View style={styles.actions}>
              {canRateSupplier && !hasRatedSupplier && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnSupplier]}
                  onPress={openRateSupplier}
                  activeOpacity={0.8}
                >
                  <Feather name="briefcase" size={14} color={Theme.darkGreen} />
                  <Text style={styles.btnText}>Rate supplier</Text>
                </TouchableOpacity>
              )}
              {canRateDriver && !hasRatedDriver && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnDriver]}
                  onPress={openRateDriver}
                  activeOpacity={0.8}
                >
                  <Feather name="truck" size={14} color={Theme.textPrimaryDark} />
                  <Text style={styles.btnText}>Rate driver</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      <Modal visible={flow !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <Animated.View
            style={[
              styles.modalCard,
              { opacity: modalOpacity, transform: [{ translateY: modalTranslateY }] },
            ]}
          >
            {submitSuccess ? (
              <Animated.View
                style={[
                  styles.successWrap,
                  { opacity: successOpacity, transform: [{ scale: successScale }] },
                ]}
              >
                <View style={styles.successIconWrap}>
                  <Feather name="check" size={30} color={Theme.positive} />
                </View>
                <Text style={styles.successTitle}>Thank you for the rating</Text>
                <Text style={styles.successSubtitle}>
                  Your feedback helps maintain service quality across the network.
                </Text>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={closeModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <>
                <View style={styles.heroHeader}>
                  <View style={styles.heroGlowOne} />
                  <View style={styles.heroGlowTwo} />
                  <View style={styles.heroTopRow}>
                    <View style={styles.avatarWrap}>
                      {driverAvatarUri ? (
                        <Image
                          source={{ uri: driverAvatarUri }}
                          style={styles.avatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.avatarText}>
                          {(activeSubjectName || activeRoleLabel).slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.heroTextWrap}>
                      <Text style={styles.heroEyebrow}>Trip feedback</Text>
                      <Text style={styles.heroName}>{activeSubjectName}</Text>
                      <Text style={styles.heroMeta}>{activeRoleLabel} • {activeSubjectMeta}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={closeModal}
                    activeOpacity={0.8}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color={Theme.textOnDarkMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.ratingIntro}>
                    <Text style={styles.ratingPrompt}>{activePrompt}</Text>
                    <View style={styles.scorePill}>
                      <Text style={styles.scoreEmoji}>{scoreEmoji}</Text>
                      <Text style={styles.scorePillText}>{scoreLabel}</Text>
                    </View>
                    <View style={styles.stars}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => setScore(n)}
                          style={styles.starBtn}
                          hitSlop={8}
                          activeOpacity={0.85}
                        >
                          <FontAwesome
                            name={n <= score ? 'star' : 'star-o'}
                            size={34}
                            color={n <= score ? Theme.driverGold : Theme.borderMedium}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {score > 0 ? (
                    <Animated.View
                      style={[
                        styles.composerSection,
                        {
                          opacity: composerOpacity,
                          transform: [{ translateY: composerTranslateY }],
                        },
                      ]}
                    >
                      <Text style={styles.tagsTitle}>What went well?</Text>
                      <View style={styles.tagsWrap}>
                        {activeQuickTags.map((tag) => {
                          const selected = selectedTags.includes(tag.id);
                          return (
                            <TouchableOpacity
                              key={tag.id}
                              onPress={() => handleTagToggle(tag.id)}
                              style={[styles.tagChip, selected ? styles.tagChipActive : styles.tagChipIdle]}
                              activeOpacity={0.85}
                            >
                              <Text style={[styles.tagChipText, selected ? styles.tagChipTextActive : styles.tagChipTextIdle]}>
                                {tag.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {!showCommentBox ? (
                        <TouchableOpacity
                          style={styles.noteToggle}
                          onPress={() => setShowCommentBox(true)}
                          activeOpacity={0.8}
                        >
                          <Feather name="message-square" size={15} color={Theme.textMuted} />
                          <Text style={styles.noteToggleText}>Add a note (optional)</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.commentBoxWrap}>
                          <TextInput
                            style={styles.commentInput}
                            value={comment}
                            onChangeText={setComment}
                            placeholder="Tell us more about the experience..."
                            placeholderTextColor={Theme.textMuted}
                            multiline
                            numberOfLines={4}
                            maxLength={VALIDATION.NOTES_MAX_LENGTH}
                            textAlignVertical="top"
                          />
                          <Text style={styles.commentCounter}>
                            {comment.length}/{VALIDATION.NOTES_MAX_LENGTH}
                          </Text>
                        </View>
                      )}

                        <TouchableOpacity
                          style={[
                            styles.modalSubmit,
                            (submitting || score === 0) ? styles.modalSubmitDisabled : null,
                          ]}
                          onPress={handleSubmit}
                          disabled={submitting || score === 0}
                          activeOpacity={0.85}
                        >
                          {submitting ? (
                            <ActivityIndicator size="small" color={Theme.textMuted} />
                          ) : (
                            <>
                              <Text style={[
                                styles.modalSubmitText,
                                (submitting || score === 0) ? { color: Theme.textMuted } : null
                              ]}>
                                Submit Rating
                              </Text>
                              <Feather 
                                name="chevron-right" 
                                size={20} 
                                color={(submitting || score === 0) ? Theme.textMuted : Theme.textOnPrimary} 
                              />
                            </>
                          )}
                        </TouchableOpacity>
                    </Animated.View>
                  ) : null}

                  {score === 0 ? (
                    <Text style={styles.helperText}>
                      Select a star rating to continue.
                    </Text>
                  ) : null}
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12, alignSelf: 'stretch' as const },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.textPrimaryDark,
  },
  sectionHeadingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'capitalize',
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 16,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  summary: {
    marginBottom: 12,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  list: { gap: 8, marginBottom: 12 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  rowLabel: { fontSize: 8, fontWeight: '700', color: Theme.textMutedDemo, textTransform: 'uppercase', letterSpacing: 0.8 },
  rowScore: { fontSize: 12, fontWeight: '700', color: Theme.driverGold, marginTop: 4 },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  rowTagChip: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rowTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  rowComment: { fontSize: 11, color: Theme.textSecondary, marginTop: 4 },
  rowDate: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSupplier: {
    backgroundColor: Theme.darkGreen + '22',
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  btnDriver: {
    backgroundColor: Theme.textPrimaryDark + '14',
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  heroHeader: {
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlowOne: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -78,
    top: -70,
    backgroundColor: Theme.primary + '33',
  },
  heroGlowTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    left: -62,
    top: 26,
    backgroundColor: Theme.driverGold + '22',
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 40,
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.driverGold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.textPrimaryDark,
  },
  heroTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  modalBody: {
    paddingTop: 24,
    backgroundColor: Theme.screenBackground,
  },
  ratingIntro: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  ratingPrompt: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  scorePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  scorePillText: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  starBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  composerSection: {
    overflow: 'hidden',
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  tagsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  tagChipIdle: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  tagChipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tagChipTextIdle: {
    color: Theme.textPrimary,
  },
  tagChipTextActive: {
    color: Theme.textOnPrimary,
  },
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  noteToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  commentBoxWrap: {
    marginBottom: 16,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    minHeight: 96,
    marginBottom: 8,
  },
  commentCounter: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'right',
  },
  modalSubmit: {
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSubmitDisabled: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderInput,
    borderWidth: 1,
  },
  modalSubmitText: { fontSize: 15, fontWeight: '800', color: Theme.textOnPrimary, textTransform: 'none' },
  helperText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 24,
  },
  successWrap: {
    paddingHorizontal: 24,
    paddingVertical: 36,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  doneButton: {
    width: '100%',
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
});
