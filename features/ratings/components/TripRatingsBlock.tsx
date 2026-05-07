/**
 * Trip detail — Ratings for own/asset, aggregate (OTP), and indent-based trips.
 * - Own trip (asset): Organization→Driver
 * - Aggregate (OTP): Client→Supplier (clients.id or org when no client_id), Client→Driver (when client_id), Supplier→Driver, Org→Driver (when no client_id)
 * - Indent-based: Client→Supplier, Client→Driver, Supplier→Driver
 */
import Theme from '@/constants/Theme';
import { TripFeedbackModal } from '@/components/TripFeedbackModal';
import {
  getClientById,
  getClientDetails,
  getLinkedOrgProfile,
} from '@/features/clients/services/clients.service';
import {
  getSupplierById,
  getSupplierDetails,
  getLinkedOrgProfileForSupplier,
} from '@/features/suppliers/services/suppliers.service';
import {
  getDriverById,
  getDriversByOrganization,
} from '@/features/drivers/services/drivers.service';
import { getSignedAvatarUrl } from '@/lib/avatarUpload';
import { VALIDATION } from '@/lib/validation';
import { useOrganization } from '@/contexts/OrganizationContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Feather from '@expo/vector-icons/Feather';
import type { TripRow } from '@/features/trips/services/trips.service';
import {
  createRating,
  getRatingsForTrip,
  getRatingsForClient,
  getRatingsForDriver,
  getRatingsForSupplier,
  averageScore,
  resolveRatedClientIdForTrip,
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
  /** Resolved client display name for settlement feedback prompt. */
  clientName?: string | null;
  /** True when customer payment has been captured on this trip. */
  paymentCaptured?: boolean;
  /**
   * Web trip detail: large “workspace” ratings panel (stakeholder cards + audit list).
   * Default keeps the compact layout used on native.
   */
  layoutVariant?: 'default' | 'workspace' | 'registry';
}

type RateFlow = { type: 'client_supplier' } | { type: 'supplier_driver' } | null;
type CommentPayload = { tags: string[]; note: string };
type LocalClientFeedback = {
  score: number;
  tags: string[];
  note: string;
  created_at: string;
};

type QuickTag = { id: string; label: string };

const DRIVER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'on_time', label: 'On time' },
  { id: 'professional', label: 'Professional' },
  { id: 'safe_driving', label: 'Safe driving' },
  { id: 'good_communication', label: 'Helpful' },
  { id: 'well_maintained_vehicle', label: 'Well maintained vehicle' },
] as const;

const SUPPLIER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'reliable_service', label: 'Reliable' },
  { id: 'on_time_assignment', label: 'Good pricing' },
  { id: 'good_coordination', label: 'Accurate paperwork' },
  { id: 'quick_response', label: 'Quick response' },
  { id: 'professional', label: 'Professional' },
] as const;
const CLIENT_RATING_TAGS: readonly QuickTag[] = [
  { id: 'prompt_payment', label: 'Prompt payment' },
  { id: 'clear_docs', label: 'Clear docs' },
  { id: 'smooth_coordination', label: 'Smooth coordination' },
  { id: 'quick_approval', label: 'Quick approvals' },
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
  if (ratedType === 'client') return CLIENT_RATING_TAGS;
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

async function resolveAvatarUri(raw: string | null | undefined): Promise<string | null> {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return (await getSignedAvatarUrl(t)) ?? null;
}

function PartyAvatar({
  uri,
  name,
  size = 40,
  initialTextStyle,
  containerStyle,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  initialTextStyle?: TextStyle;
  containerStyle?: ViewStyle;
}) {
  const initial = (name || '—').trim().slice(0, 1).toUpperCase() || '—';
  return (
    <View
      style={[
        styles.partyAvatarWrap,
        { width: size, height: size, borderRadius: size / 2 },
        containerStyle,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.partyAvatarImage, { width: size, height: size }]}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.partyAvatarInitial,
            { fontSize: Math.max(12, size * 0.38) },
            initialTextStyle,
          ]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

function isSupplierRatingForTrip(r: RatingRow, trip: TripRow): boolean {
  if (r.rated_type !== 'supplier' || !trip.supplier_id) return false;
  return r.rated_id === trip.supplier_id;
}

/** Who submits “rate the client” for this trip: fleet org on own trips; supplier when viewing as partner. */
function resolveClientRatingRater(
  trip: TripRow,
  effectiveOrganizationId: string,
  isClientViewer: boolean,
): { rater_type: RaterType; rater_id: string } {
  const orgId = trip.organization_id?.trim();
  if (isClientViewer) {
    return {
      rater_type: 'organization',
      rater_id: orgId ?? effectiveOrganizationId,
    };
  }
  const supId = trip.supplier_id?.trim();
  if (supId) {
    return { rater_type: 'supplier', rater_id: supId };
  }
  return { rater_type: 'organization', rater_id: effectiveOrganizationId };
}

/** Trip-level client score row for the current viewer (org vs supplier can both exist on one trip). */
function resolveClientTripRating(
  ratings: RatingRow[],
  trip: TripRow,
  isClientViewer: boolean,
  effectiveOrganizationId: string,
): RatingRow | undefined {
  const cid = trip.client_id?.trim();
  const rows = ratings.filter((r) => {
    if (r.rated_type !== 'client') return false;
    if (cid) return r.rated_id === cid;
    return true;
  });
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0];
  const expected = resolveClientRatingRater(trip, effectiveOrganizationId, isClientViewer);
  return (
    rows.find((r) => r.rater_type === expected.rater_type && r.rater_id === expected.rater_id) ??
    rows[0]
  );
}

type RatedPartyKind = 'client' | 'supplier' | 'driver';

function RatedPartyBadge({ kind }: { kind: RatedPartyKind }) {
  const style =
    kind === 'client'
      ? styles.wsRatedTagClient
      : kind === 'supplier'
        ? styles.wsRatedTagSupplier
        : styles.wsRatedTagDriver;
  const label = kind === 'client' ? 'Client' : kind === 'supplier' ? 'Supplier' : 'Driver';
  return (
    <View style={[styles.wsRatedTag, style]}>
      <Text style={styles.wsRatedTagText}>{label}</Text>
    </View>
  );
}

/** Pulse-style modal variant: supplier = client→supplier rating; driver = supplier/org→driver. */
type FeedbackPresentationKind = 'DRIVER' | 'SUPPLIER';

function presentationKindFromFlow(flow: RateFlow): FeedbackPresentationKind {
  if (!flow) return 'DRIVER';
  return flow.type === 'client_supplier' ? 'SUPPLIER' : 'DRIVER';
}

const FEEDBACK_PRESENTATION: Record<
  FeedbackPresentationKind,
  {
    headerBg: string;
    eyebrow: string;
    promptWord: string;
    badgeIcon: 'truck' | 'briefcase';
    glowStrong: string;
    glowSoft: string;
  }
> = {
  DRIVER: {
    headerBg: Theme.feedbackModalHeaderDriver,
    eyebrow: 'Trip feedback',
    promptWord: 'driver',
    badgeIcon: 'truck',
    glowStrong: 'rgba(99, 102, 241, 0.35)',
    glowSoft: 'rgba(245, 158, 11, 0.18)',
  },
  SUPPLIER: {
    headerBg: Theme.feedbackModalHeaderSupplier,
    eyebrow: 'Partner audit',
    promptWord: 'supplier',
    badgeIcon: 'briefcase',
    glowStrong: 'rgba(16, 185, 129, 0.38)',
    glowSoft: 'rgba(255, 255, 255, 0.12)',
  },
};

export function TripRatingsBlock({
  trip,
  organizationId,
  partnerName,
  driverName,
  driverAvatarUri,
  onRatingsLoaded,
  clientName,
  paymentCaptured = false,
  layoutVariant = 'default',
}: TripRatingsBlockProps) {
  const { width } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  void paymentCaptured;
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [clientAvatarUri, setClientAvatarUri] = useState<string | null>(null);
  const [supplierAvatarUri, setSupplierAvatarUri] = useState<string | null>(null);
  const [resolvedDriverAvatarUri, setResolvedDriverAvatarUri] = useState<string | null>(driverAvatarUri ?? null);
  /** All-time average from `ratings` for this client (all trips). */
  const [histClientAvg, setHistClientAvg] = useState<number | null>(null);
  /** All-time average from `ratings` for this driver (all trips). */
  const [histDriverAvg, setHistDriverAvg] = useState<number | null>(null);
  /** All-time average from `ratings` for this supplier (all trips). */
  const [histSupplierAvg, setHistSupplierAvg] = useState<number | null>(null);
  /** When trip has supplier_id but no denormalized/display name yet. */
  const [supplierResolvedLabel, setSupplierResolvedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<RateFlow>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showClientFeedbackModal, setShowClientFeedbackModal] = useState(false);
  const [clientScore, setClientScore] = useState(0);
  const [clientTags, setClientTags] = useState<string[]>([]);
  const [clientComment, setClientComment] = useState('');
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientFeedback, setClientFeedback] = useState<LocalClientFeedback | null>(null);
  const [clientFeedbackLoaded, setClientFeedbackLoaded] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const hasAutoOpenedClientRef = useRef(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(24)).current;
  const composerOpacity = useRef(new Animated.Value(0)).current;
  const composerTranslateY = useRef(new Animated.Value(10)).current;
  const successScale = useRef(new Animated.Value(0.96)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const isCompleted =
    (trip.status || '').toLowerCase() === 'completed' ||
    !!(trip as { completed_at?: string }).completed_at;
  const effectiveOrganizationId =
    organizationId || currentOrganization?.id || trip.organization_id || null;
  const isClientViewer =
    !!trip.organization_id && !!effectiveOrganizationId && trip.organization_id === effectiveOrganizationId;
  /**
   * Client→Supplier when a clients row exists (rater_id = clients.id), or
   * fleet (trip owner) rates supplier when there is no client_id on the trip.
   */
  const canRateSupplier =
    !!trip.supplier_id &&
    !!effectiveOrganizationId &&
    (!!trip.client_id || (isClientViewer && !!trip.organization_id));

  const hasRatedSupplier = ratings.some(
    (r) =>
      isSupplierRatingForTrip(r, trip) &&
      ((r.rater_type === 'client' &&
        !!trip.client_id &&
        r.rater_id === trip.client_id) ||
        (r.rater_type === 'organization' &&
          !!trip.organization_id &&
          r.rater_id === trip.organization_id)),
  );
  const hasRatedDriver = ratings.some(
    (r) =>
      r.rated_type === 'driver' &&
      (r.rater_type === 'client' || r.rater_type === 'supplier' || r.rater_type === 'organization')
  );
  const hasRatedClient =
    !!effectiveOrganizationId &&
    ratings.some((r) => {
      if (r.rated_type !== 'client') return false;
      if (trip.client_id && r.rated_id !== trip.client_id) return false;
      const exp = resolveClientRatingRater(trip, effectiveOrganizationId, isClientViewer);
      return r.rater_type === exp.rater_type && r.rater_id === exp.rater_id;
    });

  const hasSupplier = !!trip.supplier_id;
  const hasClient = !!trip.client_id;

  /** Client→Driver: indent or aggregate with client_id (trip owner). */
  const canRateDriverAsClient =
    hasClient &&
    hasSupplier &&
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    isClientViewer;
  /** Supplier→Driver: aggregate/indent when viewing as supplier org. */
  const canRateDriverAsSupplier =
    hasSupplier &&
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    !isClientViewer;
  /** Organization→Driver: own trip (asset) or aggregate without client_id (buyer org rates driver). */
  const canRateDriverAsOrg =
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    isClientViewer &&
    (!hasSupplier || !hasClient);

  const canRateDriver = canRateDriverAsClient || canRateDriverAsSupplier || canRateDriverAsOrg;
  // Client feedback should be allowed anytime once trip has a client link,
  // independent of transaction/payment capture state or client name resolution.
  const canRateClient =
    (!!trip.client_id || !!trip.client_name?.trim()) &&
    !!effectiveOrganizationId;

  const clientFeedbackStorageKey = `trip_client_feedback:${trip.id}`;

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
    let cancelled = false;
    const id = trip.driver_id?.trim();
    if (!id) {
      setHistDriverAvg(null);
      return;
    }
    getRatingsForDriver(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistDriverAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.driver_id]);

  useEffect(() => {
    let cancelled = false;
    const id = trip.supplier_id?.trim();
    if (!id) {
      setHistSupplierAvg(null);
      return;
    }
    getRatingsForSupplier(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistSupplierAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.supplier_id]);

  useEffect(() => {
    let cancelled = false;
    const id = trip.client_id?.trim();
    if (!id) {
      setHistClientAvg(null);
      return;
    }
    getRatingsForClient(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistClientAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.client_id]);

  useEffect(() => {
    let cancelled = false;
    const sid = trip.supplier_id?.trim();
    if (!sid) {
      setSupplierResolvedLabel(null);
      return;
    }
    const fromTrip = (trip.supplier_name ?? '').trim();
    const fromPartner = (partnerName ?? "").trim();
    if (fromTrip || fromPartner) {
      setSupplierResolvedLabel(null);
      return;
    }
    const ownerOrg = trip.organization_id;
    const pickSupplierDisplayName = (s: {
      company_name?: string | null;
      name?: string | null;
      contact_person?: string | null;
    } | null) => (s?.company_name || s?.name || s?.contact_person || "").trim() || null;

    void (async () => {
      const { supplier: fromRpc } = await getSupplierDetails(sid);
      if (cancelled) return;
      let label = pickSupplierDisplayName(fromRpc);
      if (!label && ownerOrg) {
        const { supplier } = await getSupplierById(ownerOrg, sid);
        if (cancelled) return;
        label = pickSupplierDisplayName(supplier);
      }
      const viewerOrgId = currentOrganization?.id;
      if (!label && viewerOrgId && viewerOrgId !== ownerOrg) {
        const { supplier: supViewer } = await getSupplierById(viewerOrgId, sid);
        if (cancelled) return;
        label = pickSupplierDisplayName(supViewer);
      }
      if (!cancelled) setSupplierResolvedLabel(label);
    })();

    return () => {
      cancelled = true;
    };
  }, [trip.supplier_id, trip.organization_id, partnerName, trip.supplier_name, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(clientFeedbackStorageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as LocalClientFeedback;
            if (parsed && typeof parsed.score === 'number') {
              setClientFeedback(parsed);
            }
          } catch {
            // ignore bad local payload
          }
        }
        setClientFeedbackLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setClientFeedbackLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientFeedbackStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const ownerOrg = trip.organization_id;
    const tripAny = trip as unknown as Record<string, unknown>;
    const tripClientAvatar =
      typeof tripAny.client_avatar_url === 'string'
        ? tripAny.client_avatar_url
        : typeof tripAny.client_avatar === 'string'
          ? tripAny.client_avatar
          : null;
    const tripSupplierAvatar =
      typeof tripAny.supplier_avatar_url === 'string'
        ? tripAny.supplier_avatar_url
        : typeof tripAny.supplier_avatar === 'string'
          ? tripAny.supplier_avatar
          : null;
    setClientAvatarUri(tripClientAvatar?.trim() ? tripClientAvatar : null);
    setSupplierAvatarUri(tripSupplierAvatar?.trim() ? tripSupplierAvatar : null);
    if (!ownerOrg) return;

    void (async () => {
      if (trip.client_id) {
        let rawAvatar = '';
        const d1 = await getClientDetails(trip.client_id);
        if (!cancelled && d1.client?.avatar_url) rawAvatar = d1.client.avatar_url;
        if (!rawAvatar && d1.client?.linked_organization_id) {
          const linked = await getLinkedOrgProfile(d1.client.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const { client } = await getClientById(ownerOrg, trip.client_id);
          if (!cancelled && client?.avatar_url) rawAvatar = client.avatar_url;
          if (!rawAvatar && client?.linked_organization_id) {
            const linked = await getLinkedOrgProfile(client.linked_organization_id);
            if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
          }
        }
        const u = await resolveAvatarUri(rawAvatar || null);
        if (!cancelled) setClientAvatarUri(u);
      }

      if (trip.supplier_id) {
        let rawAvatar = '';
        const d1 = await getSupplierDetails(trip.supplier_id);
        if (!cancelled && d1.supplier?.avatar_url) rawAvatar = d1.supplier.avatar_url;
        if (!rawAvatar && d1.supplier?.linked_organization_id) {
          const linked = await getLinkedOrgProfileForSupplier(d1.supplier.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const s2 = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!cancelled && s2.supplier?.avatar_url) rawAvatar = s2.supplier.avatar_url ?? '';
          if (!rawAvatar && s2.supplier?.linked_organization_id) {
            const linked = await getLinkedOrgProfileForSupplier(s2.supplier.linked_organization_id);
            if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
          }
        }
        const viewerId = currentOrganization?.id;
        if (!rawAvatar && viewerId && viewerId !== ownerOrg) {
          const s3 = await getSupplierById(viewerId, trip.supplier_id);
          if (!cancelled && s3.supplier?.avatar_url) rawAvatar = s3.supplier.avatar_url ?? '';
        }
        const u = await resolveAvatarUri(rawAvatar || null);
        if (!cancelled) setSupplierAvatarUri(u);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.client_id, trip.supplier_id, trip.organization_id, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    const tripAny = trip as unknown as Record<string, unknown>;
    const tripDriverAvatar =
      typeof tripAny.driver_avatar_url === 'string'
        ? tripAny.driver_avatar_url
        : typeof tripAny.driver_avatar === 'string'
          ? tripAny.driver_avatar
          : null;
    setResolvedDriverAvatarUri(driverAvatarUri ?? tripDriverAvatar ?? null);
    if (driverAvatarUri || !trip.driver_id) return;

    void (async () => {
      const candidateOrgIds = Array.from(
        new Set([currentOrganization?.id, trip.organization_id].filter(Boolean) as string[]),
      );
      for (const candidateOrgId of candidateOrgIds) {
        const { drivers } = await getDriversByOrganization(candidateOrgId);
        if (cancelled) return;
        const joinedDriver = drivers.find((item) => item.id === trip.driver_id);
        const joinedResolved = await resolveAvatarUri(joinedDriver?.avatar_url);
        if (joinedResolved) {
          if (!cancelled) setResolvedDriverAvatarUri(joinedResolved);
          return;
        }
        const { driver } = await getDriverById(candidateOrgId, trip.driver_id!);
        if (cancelled) return;
        const resolved = await resolveAvatarUri(driver?.avatar_url);
        if (resolved) {
          if (!cancelled) setResolvedDriverAvatarUri(resolved);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, driverAvatarUri, trip.driver_id, trip.organization_id]);

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
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
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
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(composerTranslateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
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
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
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
  const openRateSupplierAtScore = (nextScore: number) => {
    resetComposer({ type: 'client_supplier' });
    setScore(nextScore);
  };
  const openRateDriverAtScore = (nextScore: number) => {
    resetComposer({ type: 'supplier_driver' });
    setScore(nextScore);
  };
  const openRateClientAtScore = (nextScore: number) => {
    setClientScore(nextScore);
    setShowClientFeedbackModal(true);
  };
  const canOpenSupplierRate = canRateSupplier;
  const canOpenDriverRate = canRateDriver;
  const canOpenClientRate = canRateClient;
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
  const handleClientTagToggle = (tagId: string) => {
    setClientTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = () => {
    if (!flow) return;
    if (!effectiveOrganizationId) {
      Alert.alert('Rating failed', 'Organization context is missing. Please refresh and try again.');
      return;
    }
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
      if (trip.client_id) {
      rater_type = 'client';
        rater_id = trip.client_id;
      } else {
        rater_type = 'organization';
        rater_id = trip.organization_id!;
      }
    } else {
      if (canRateDriverAsClient) {
        rater_type = 'client';
        rater_id = trip.client_id!;
      } else if (canRateDriverAsSupplier) {
        rater_type = 'supplier';
        rater_id = trip.supplier_id!;
      } else {
        rater_type = 'organization';
        rater_id = effectiveOrganizationId;
      }
    }

    setSubmitting(true);
    const commentPayload = buildCommentPayload(
      selectedTags,
      trimmedComment.slice(0, VALIDATION.NOTES_MAX_LENGTH)
    );
    createRating(effectiveOrganizationId, {
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
        if (rated_type === 'supplier') {
          getRatingsForSupplier(rated_id).then(({ ratings: rows }) => {
            setHistSupplierAvg(averageScore(rows));
          });
        } else if (rated_type === 'driver') {
          getRatingsForDriver(rated_id).then(({ ratings: rows }) => {
            setHistDriverAvg(averageScore(rows));
          });
        }
      } else {
        Alert.alert('Rating failed', error.message);
      }
    });
  };

  const supplierTripRating = ratings.find((r) => isSupplierRatingForTrip(r, trip));
  const driverTripRating = ratings.find(
    (r) => r.rated_type === 'driver' && (!trip.driver_id || r.rated_id === trip.driver_id),
  );
  const clientTripRating =
    effectiveOrganizationId != null
      ? resolveClientTripRating(ratings, trip, isClientViewer, effectiveOrganizationId)
      : undefined;
  const supplierTripAvg = supplierTripRating?.score ?? null;
  const driverTripAvg = driverTripRating?.score ?? null;
  const clientTripAvg = clientTripRating?.score ?? clientFeedback?.score ?? null;

  useEffect(() => {
    if (loading || !isCompleted || !clientFeedbackLoaded) return;
    if (hasAutoOpenedClientRef.current) return;
    if (!canRateClient) return;
    // Only auto-open if no rating has been given yet (DB or local)
    if (clientTripRating || clientFeedback || hasRatedClient) return;
    hasAutoOpenedClientRef.current = true;
    setShowClientFeedbackModal(true);
  }, [
    loading,
    isCompleted,
    canRateClient,
    clientFeedbackLoaded,
    clientTripRating,
    clientFeedback,
    hasRatedClient,
  ]);

  const displaySupplierAvg = histSupplierAvg;
  const displayDriverAvg = histDriverAvg;
  const displayClientAvg = histClientAvg;
  const clientDisplayName = (clientName || trip.client_name || 'Client').trim();
  const resolvedPartnerLabel =
    (partnerName ?? '').trim() ||
    (trip.supplier_name ?? '').trim() ||
    (supplierResolvedLabel ?? '').trim() ||
    'Supplier';
  const hasSupplierParty = !!trip.supplier_id?.trim();
  const supplierDisplayName = hasSupplierParty ? resolvedPartnerLabel : 'No supplier';
  const driverDisplayName = (
    driverName ||
    trip.driver_display_name ||
    'Driver'
  ).trim();
  const clientFeedbackSourceLabel = isClientViewer
    ? 'Fleet'
    : trip.supplier_id?.trim()
      ? 'Supplier'
      : 'Fleet';
  const isWorkspace = layoutVariant === 'workspace';
  const isRegistry = layoutVariant === 'registry';
  const isWidePanel = isWorkspace || isRegistry;
  const isCompactWorkspace = isWidePanel && width < 1100;
  const activeSubjectName = flow?.type === 'client_supplier'
    ? resolvedPartnerLabel
    : (driverName || trip.driver_display_name || 'Driver');
  const activeSubjectMeta = flow?.type === 'client_supplier'
    ? (trip.display_trip_id || trip.trip_number || 'Trip')
    : (trip.vehicle_display_number || trip.display_trip_id || trip.trip_number || 'Trip');
  const activeQuickTags = flow?.type === 'client_supplier' ? SUPPLIER_RATING_TAGS : DRIVER_RATING_TAGS;
  const presentationKind = flow ? presentationKindFromFlow(flow) : 'DRIVER';
  const pulseUi = FEEDBACK_PRESENTATION[presentationKind];
  const renderPartyScores = (
    tripScore: number | null,
    globalScore: number | null,
  ) => (
    <View style={[styles.wsPartyMetricsRow, isCompactWorkspace && styles.wsPartyMetricsRowCompact]}>
      <View style={styles.wsPartyScoreBlock}>
        <View style={styles.wsPartyScoreRow}>
          <Text style={[styles.wsPartyScore, isCompactWorkspace && styles.wsPartyScoreCompact]}>
            {tripScore != null ? tripScore.toFixed(1) : '—'}
          </Text>
          <FontAwesome name="star" size={isCompactWorkspace ? 9 : 12} color={Theme.feedbackModalStarActive} />
        </View>
        <Text style={[styles.wsPartyAvgCaption, isCompactWorkspace && styles.wsPartyAvgCaptionCompact]}>This trip</Text>
      </View>
      <View style={[styles.wsPartyScoreBlock, styles.wsPartyScoreBlockRight]}>
        <View style={styles.wsPartyScoreRow}>
          <Text style={[styles.wsPartyScore, isCompactWorkspace && styles.wsPartyScoreCompact]}>
            {globalScore != null ? globalScore.toFixed(1) : '—'}
          </Text>
          <FontAwesome name="star" size={isCompactWorkspace ? 9 : 12} color={Theme.feedbackModalStarActive} />
        </View>
        <Text style={[styles.wsPartyAvgCaption, isCompactWorkspace && styles.wsPartyAvgCaptionCompact]}>Global avg</Text>
      </View>
    </View>
  );

  if (
    layoutVariant !== 'registry' &&
    layoutVariant !== 'workspace' &&
    !canRateSupplier &&
    !canRateDriver &&
    !canRateClient &&
    ratings.length === 0 &&
    !clientFeedback
  ) {
    return null;
  }

  const summaryPillsEl = (
    <>
      {displaySupplierAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="briefcase" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Supplier {displaySupplierAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
      {displayDriverAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="truck" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Driver {displayDriverAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
                {displayClientAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="user" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Client {displayClientAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
    </>
  );

  const ratingsList =
    ratings.length > 0 ? (
    <View style={[styles.list, isWidePanel && styles.wsList]}>
      {ratings.map((r) => {
                    const parsed = parseCommentPayload(r.comment);
        const fromLabel =
          r.rater_type === 'client' ? 'Client' : r.rater_type === 'organization' ? 'Fleet' : 'Supplier';
        const toLabel =
          r.rated_type === 'client'
            ? clientDisplayName
            : r.rated_type === 'supplier'
              ? supplierDisplayName
              : driverDisplayName;
        const ratedAvatarUri =
          r.rated_type === 'client'
            ? clientAvatarUri
            : r.rated_type === 'supplier'
              ? supplierAvatarUri
              : resolvedDriverAvatarUri;
                    return (
          <View key={r.id} style={[styles.row, isWidePanel && styles.wsAuditCard]}>
            {isWorkspace ? (
              <View style={styles.wsAuditMainRow}>
                <PartyAvatar uri={ratedAvatarUri} name={toLabel} size={44} />
                <View style={styles.wsAuditLeft}>
                  <RatedPartyBadge kind={r.rated_type} />
                  <Text style={styles.wsAuditFromTo}>
                    {fromLabel} → {toLabel}
                  </Text>
                  <View style={styles.wsScoreRow}>
                    <Text style={styles.wsAuditScore}>{r.score}</Text>
                    <FontAwesome name="star" size={16} color={Theme.feedbackModalStarActive} />
                  </View>
                </View>
                <Text style={styles.wsAuditDate}>{formatDate(r.created_at)}</Text>
              </View>
            ) : (
              <View style={styles.rowTopWithAvatar}>
                <PartyAvatar uri={ratedAvatarUri} name={toLabel} size={36} />
                <View style={styles.rowTopTextCol}>
                        <Text style={styles.rowLabel}>
                    {fromLabel} → {toLabel}
                        </Text>
                        <Text style={styles.rowScore}>{r.score} ★</Text>
                </View>
              </View>
            )}
                        {parsed.tags.length > 0 ? (
              <View style={[styles.rowTags, isWorkspace && styles.wsRowTags]}>
                            {parsed.tags.map((tagId) => {
                              const tagLabel = getQuickTagLabel(tagId, r.rated_type);
                              return (
                    <View key={`${r.id}-${tagId}`} style={[styles.rowTagChip, isWorkspace && styles.wsTagChip]}>
                      <Text style={[styles.rowTagText, isWorkspace && styles.wsTagChipText]}>{tagLabel}</Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                        {parsed.note ? (
              <Text style={[styles.rowComment, isWorkspace && styles.wsRowComment]} numberOfLines={2}>
                            {parsed.note}
                          </Text>
                        ) : null}
            {!isWorkspace ? <Text style={styles.rowDate}>{formatDate(r.created_at)}</Text> : null}
                      </View>
                    );
      })}
              </View>
  ) : null;

  const clientFeedbackList = clientFeedback != null ? (
    <View style={[styles.list, isWidePanel && styles.wsList]}>
      <View style={[styles.row, isWidePanel && styles.wsAuditCard]}>
        {isWorkspace ? (
          <View style={styles.wsAuditMainRow}>
            <PartyAvatar uri={clientAvatarUri} name={clientDisplayName} size={44} />
            <View style={styles.wsAuditLeft}>
              <RatedPartyBadge kind="client" />
              <Text style={styles.wsAuditFromTo}>
                {clientFeedbackSourceLabel} → {clientDisplayName}
              </Text>
              <View style={styles.wsScoreRow}>
                <Text style={styles.wsAuditScore}>{clientFeedback.score}</Text>
                <FontAwesome name="star" size={16} color={Theme.feedbackModalStarActive} />
              </View>
            </View>
            <Text style={styles.wsAuditDate}>{formatDate(clientFeedback.created_at)}</Text>
          </View>
        ) : (
          <View style={styles.rowTopWithAvatar}>
            <PartyAvatar uri={clientAvatarUri} name={clientDisplayName} size={36} />
            <View style={styles.rowTopTextCol}>
              <Text style={styles.rowLabel}>
                {clientFeedbackSourceLabel} → {clientDisplayName}
              </Text>
                  <Text style={styles.rowScore}>{clientFeedback.score} ★</Text>
            </View>
          </View>
        )}
                  {clientFeedback.tags.length > 0 ? (
          <View style={[styles.rowTags, isWorkspace && styles.wsRowTags]}>
                      {clientFeedback.tags.map((tagId) => {
              const tagLabel = CLIENT_RATING_TAGS.find((t) => t.id === tagId)?.label || tagId;
                        return (
                <View key={`client-${tagId}`} style={[styles.rowTagChip, isWorkspace && styles.wsTagChip]}>
                  <Text style={[styles.rowTagText, isWorkspace && styles.wsTagChipText]}>{tagLabel}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  {clientFeedback.note ? (
          <Text style={[styles.rowComment, isWorkspace && styles.wsRowComment]} numberOfLines={2}>
                      {clientFeedback.note}
                    </Text>
                  ) : null}
        {!isWorkspace ? (
                  <Text style={styles.rowDate}>{formatDate(clientFeedback.created_at)}</Text>
        ) : null}
                </View>
              </View>
  ) : null;
  void ratingsList;
  void clientFeedbackList;

  const driverRegistryFeedback = parseCommentPayload(driverTripRating?.comment ?? null);
  const supplierRegistryFeedback = parseCommentPayload(supplierTripRating?.comment ?? null);
  const clientRegistryFeedback: CommentPayload = clientTripRating
    ? parseCommentPayload(clientTripRating.comment)
    : clientFeedback
      ? { tags: clientFeedback.tags, note: clientFeedback.note }
      : { tags: [], note: '' };

  const renderRegistryCard = (
    roleKicker: string,
    tag: string,
    partyName: string,
    avatarUri: string | null | undefined,
    tripScore: number | null,
    globalScore: number | null,
    onAudit: () => void,
    auditDisabled: boolean,
    onSelectScore: ((score: number) => void) | undefined,
    feedback: CommentPayload,
    ratedTypeForTags: RatedType,
  ) => {
    const filledStars =
      tripScore != null ? Math.min(5, Math.max(0, Math.round(Number(tripScore)))) : 0;
    const perfUp =
      tripScore != null &&
      globalScore != null &&
      Number(tripScore) >= Number(globalScore);
    const perfLabel =
      tripScore == null || globalScore == null
        ? 'Baseline pending'
        : perfUp
          ? 'Above global avg'
          : 'Below global avg';
    const perfColor =
      tripScore == null || globalScore == null
        ? Theme.textMuted
        : perfUp
          ? Theme.positive
          : Theme.warning;
    const noteTrimmed = (feedback.note ?? '').trim();
    const hasFeedbackBody = feedback.tags.length > 0 || !!noteTrimmed;

    return (
      <View style={styles.regCard}>
        <View style={styles.regCardDecor} />
        <View style={styles.regCardTop}>
          <View style={styles.regCardLeft}>
            <PartyAvatar
              uri={avatarUri}
              name={partyName}
              size={34}
              containerStyle={styles.regInitialMark}
              initialTextStyle={{ color: Theme.textOnPrimary }}
            />
            <View style={styles.regCardLeftText}>
              <Text style={styles.regKicker} numberOfLines={1}>
                {roleKicker.toUpperCase()} NODE
              </Text>
              <Text style={styles.regPartyName} numberOfLines={1}>
                {partyName}
              </Text>
              <View style={styles.regTagRow}>
                <View style={styles.regTagPill}>
                  <Text style={styles.regTagPillText}>{tag}</Text>
                </View>
                <View style={styles.regGlobalAvgCluster}>
                  <Text style={styles.regMetricEyebrowMuted}>GLOBAL AVG</Text>
                  <View style={styles.regGlobalPill}>
                    <FontAwesome name="star" size={9} color={Theme.feedbackModalStarActive} />
                    <Text style={styles.regGlobalPillText}>
                      {globalScore != null ? globalScore.toFixed(1) : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.regCardRight}>
            <Text style={styles.regMetricEyebrowMuted}>THIS TRIP</Text>
            <View style={styles.regScoreRow}>
              <Text style={styles.regTripBig}>
                {tripScore != null ? tripScore.toFixed(1) : '—'}
              </Text>
              <View style={styles.regScoreStarCol}>
                <FontAwesome name="star" size={14} color={Theme.textPrimaryDark} />
                <Text style={styles.regScoreWord}>SCORE</Text>
              </View>
            </View>
            <Text style={[styles.regPerfLbl, { color: perfColor }]} numberOfLines={1}>
              {perfLabel}
            </Text>
          </View>
        </View>
        {hasFeedbackBody ? (
          <View style={styles.regFeedbackSection}>
            <Text style={styles.regFeedbackHeading}>Given feedback</Text>
            {feedback.tags.length > 0 ? (
              <View style={styles.regFeedbackTags}>
                {feedback.tags.map((tagId) => (
                  <View key={tagId} style={styles.regFeedbackTagChip}>
                    <Text style={styles.regFeedbackTagText}>
                      {getQuickTagLabel(tagId, ratedTypeForTags)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {noteTrimmed ? (
              <Text style={styles.regFeedbackNote} numberOfLines={4}>
                {noteTrimmed}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.regCardFoot}>
          <View style={styles.regStarsRow}>
            {[1, 2, 3, 4, 5].map((step) => {
              const filled = tripScore != null && step <= filledStars;
              return (
                <TouchableOpacity
                  key={step}
                  disabled={auditDisabled || !onSelectScore}
                  activeOpacity={0.8}
                  onPress={() => onSelectScore?.(step)}
                  style={[styles.regStarHit, auditDisabled || !onSelectScore ? null : styles.regRungDotTap]}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                >
                  <FontAwesome
                    name={filled ? 'star' : 'star-o'}
                    size={15}
                    color={filled ? Theme.feedbackModalStarActive : Theme.borderMedium}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            disabled={auditDisabled}
            onPress={onAudit}
            activeOpacity={0.85}
            style={styles.regAuditTap}
          >
            <Text style={[styles.regAuditTxt, auditDisabled && styles.regAuditTxtDis]}>
              {auditDisabled ? 'Unavailable' : 'Rate now'}
            </Text>
            <Feather name="arrow-up-right" size={12} color={auditDisabled ? Theme.textMuted : Theme.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, isWidePanel && styles.wsWrapper]}>
      {!isWidePanel ? (
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIconWrap}>
            <Feather name="award" size={14} color={Theme.textOnPrimary} />
          </View>
          <View style={styles.sectionHeadingTextWrap}>
            <Text style={styles.sectionTitle}>Ratings</Text>
            <Text style={styles.sectionSubtitle}>Track service quality across completed trips</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.card, isWidePanel && styles.wsCard]}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={Theme.textMuted} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <>
            {isRegistry ? (
              <View style={styles.regWrap}>
                <View style={styles.regSectionHead}>
                  <View>
                    <Text style={styles.regSectionTitle}>Feedback Registry</Text>
                    <Text style={styles.regSectionSub}>Bilateral Quality Audit</Text>
                  </View>
                  <View style={styles.regMsgIconWrap}>
                    <Feather name="message-square" size={20} color={Theme.primary} />
                  </View>
                </View>
                <View style={styles.regStack}>
                  {renderRegistryCard(
                    'Authorized Pilot',
                    'Precision pilot',
                    driverDisplayName,
                    resolvedDriverAvatarUri,
                    driverTripAvg,
                    displayDriverAvg,
                    () => {
                      if (canOpenDriverRate) openRateDriver();
                    },
                    !canOpenDriverRate,
                    canOpenDriverRate ? openRateDriverAtScore : undefined,
                    driverRegistryFeedback,
                    'driver',
                  )}
                  {renderRegistryCard(
                    'Client Hub',
                    'Billing party',
                    clientDisplayName,
                    clientAvatarUri,
                    clientTripAvg,
                    displayClientAvg,
                    () => {
                      if (canOpenClientRate) setShowClientFeedbackModal(true);
                    },
                    !canOpenClientRate,
                    canOpenClientRate ? openRateClientAtScore : undefined,
                    clientRegistryFeedback,
                    'client',
                  )}
                  {renderRegistryCard(
                    'Supplier Node',
                    'Fleet partner',
                    supplierDisplayName,
                    supplierAvatarUri,
                    supplierTripAvg,
                    displaySupplierAvg,
                    () => {
                      if (canOpenSupplierRate) openRateSupplier();
                    },
                    !canOpenSupplierRate || !hasSupplierParty,
                    canOpenSupplierRate ? openRateSupplierAtScore : undefined,
                    supplierRegistryFeedback,
                    'supplier',
                  )}
                </View>
              </View>
            ) : null}

            {isWorkspace ? (
              <View style={[styles.wsHeaderRow, isCompactWorkspace && styles.wsHeaderRowCompact]}>
                <View style={styles.wsTitleCluster}>
                  <View style={styles.wsAwardCircle}>
                    <Feather name="award" size={28} color={Theme.primary} />
                  </View>
                  <View style={styles.wsTitleTextWrap}>
                    <Text style={styles.wsTitle}>Ratings</Text>
                    <Text style={styles.wsSubtitle}>Track service quality across completed trips</Text>
                  </View>
                </View>
                <View style={[styles.wsPillRow, isCompactWorkspace && styles.wsPillRowCompact]}>
                  {summaryPillsEl}
                </View>
              </View>
            ) : null}

            {!isWidePanel && ratings.length > 0 && (
              <View style={styles.summary}>{summaryPillsEl}</View>
            )}

            {isWorkspace ? (
              <View style={[styles.wsPartyGrid, isCompactWorkspace && styles.wsPartyGridCompact]}>
                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateClient) setShowClientFeedbackModal(true);
                  }}
                  activeOpacity={canRateClient ? 0.85 : 1}
                  disabled={!canRateClient}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconDark, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar
                      uri={clientAvatarUri}
                      name={clientDisplayName}
                      size={isCompactWorkspace ? 40 : 72}
                      initialTextStyle={{ color: Theme.textOnPrimary }}
                      containerStyle={{ borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.12)' }}
                    />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Client</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {clientDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(clientTripAvg, displayClientAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateClient ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateSupplier && !hasRatedSupplier) openRateSupplier();
                  }}
                  activeOpacity={canRateSupplier && !hasRatedSupplier ? 0.85 : 1}
                  disabled={!canRateSupplier || hasRatedSupplier}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconMuted, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar uri={supplierAvatarUri} name={supplierDisplayName} size={isCompactWorkspace ? 40 : 72} />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Supplier</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {supplierDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(supplierTripAvg, displaySupplierAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateSupplier && !hasRatedSupplier ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : hasRatedSupplier ? (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>Recorded</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateDriver && !hasRatedDriver) openRateDriver();
                  }}
                  activeOpacity={canRateDriver && !hasRatedDriver ? 0.85 : 1}
                  disabled={!canRateDriver || hasRatedDriver}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconDriver, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar
                      uri={resolvedDriverAvatarUri}
                      name={driverDisplayName}
                      size={isCompactWorkspace ? 40 : 72}
                      initialTextStyle={{ color: Theme.primary }}
                      containerStyle={{ borderWidth: 0, backgroundColor: 'transparent' }}
                    />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Driver</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {driverDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(driverTripAvg, displayDriverAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateDriver && !hasRatedDriver ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : hasRatedDriver ? (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>Recorded</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isRegistry ? (
              <View style={[styles.actions, isWorkspace && styles.wsActions]}>
                {canRateSupplier && !hasRatedSupplier && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSupplier, isWorkspace && styles.wsPrimaryCta]}
                    onPress={openRateSupplier}
                    activeOpacity={0.8}
                  >
                    <Feather name="briefcase" size={14} color={isWorkspace ? Theme.textOnPrimary : Theme.darkGreen} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsPrimaryCtaText]}>Rate supplier</Text>
                  </TouchableOpacity>
                )}
                {canRateDriver && !hasRatedDriver && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDriver, isWorkspace && styles.wsPrimaryCta]}
                    onPress={openRateDriver}
                    activeOpacity={0.8}
                  >
                    <Feather name="truck" size={14} color={Theme.textOnPrimary} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsPrimaryCtaText]}>Rate driver</Text>
                  </TouchableOpacity>
                )}
                {canRateClient && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDriver, isWorkspace && styles.wsOutlineCta]}
                    onPress={() => setShowClientFeedbackModal(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="user" size={14} color={Theme.textPrimaryDark} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsOutlineCtaText]}>
                      Rate client performance
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </>
        )}
      </View>

      <TripFeedbackModal
        visible={flow !== null}
        onRequestClose={closeModal}
        animatedCardStyle={{
          opacity: modalOpacity,
          transform: [{ translateY: modalTranslateY }],
        }}
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
                <View style={[styles.heroHeaderPulse, { backgroundColor: pulseUi.headerBg }]}>
                  <View style={[styles.heroGlowOnePulse, { backgroundColor: pulseUi.glowStrong }]} />
                  <View style={[styles.heroGlowTwoPulse, { backgroundColor: pulseUi.glowSoft }]} />
                  <View style={styles.heroTopRowPulse}>
                    <View style={styles.avatarWrapPulse}>
                      {flow?.type === 'supplier_driver' && resolvedDriverAvatarUri ? (
                        <Image
                          source={{ uri: resolvedDriverAvatarUri }}
                          style={styles.avatarImagePulse}
                          resizeMode="cover"
                        />
                      ) : flow?.type === 'client_supplier' && supplierAvatarUri ? (
                        <Image
                          source={{ uri: supplierAvatarUri }}
                          style={styles.avatarImagePulse}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.avatarTextPulse}>
                          {(activeSubjectName || '—').slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                      <View
                        style={[
                          styles.avatarBadgePulse,
                          { borderColor: pulseUi.headerBg },
                        ]}
                      >
                        <Feather
                          name={pulseUi.badgeIcon}
                          size={12}
                          color={Theme.textOnPrimary}
                        />
                      </View>
                    </View>
                    <View style={styles.heroTextWrapPulse}>
                      <Text style={styles.heroEyebrowPulse}>{pulseUi.eyebrow}</Text>
                      <Text style={styles.heroNamePulse} numberOfLines={2}>
                        {activeSubjectName}
                      </Text>
                      <Text style={styles.heroMetaPulse} numberOfLines={1}>
                        {activeSubjectMeta}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.closeButtonPulse}
                    onPress={closeModal}
                    activeOpacity={0.8}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color={Theme.textOnPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBodyPulse}>
                  <Text style={styles.ratingHeadlinePulse}>
                    How was your{' '}
                    <Text style={styles.ratingHeadlineAccent}>{pulseUi.promptWord}</Text>
                    ?
                  </Text>

                  <View style={styles.starsPulse}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setScore(n)}
                        style={[
                          styles.starBtnPulse,
                          { transform: [{ scale: n <= score ? 1.18 : 1 }] },
                        ]}
                        hitSlop={8}
                        activeOpacity={0.85}
                      >
                        <FontAwesome
                          name={n <= score ? 'star' : 'star-o'}
                          size={32}
                          color={
                            n <= score
                              ? Theme.feedbackModalStarActive
                              : Theme.borderMedium
                          }
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  {score > 0 ? (
                    <Animated.View
                      style={[
                        styles.composerSectionPulse,
                        {
                          opacity: composerOpacity,
                          transform: [{ translateY: composerTranslateY }],
                        },
                      ]}
                    >
                      <View style={styles.tagsWrapPulse}>
                        {activeQuickTags.map((tag) => {
                          const selected = selectedTags.includes(tag.id);
                          return (
                            <TouchableOpacity
                              key={tag.id}
                              onPress={() => handleTagToggle(tag.id)}
                              style={[
                                styles.tagChipPulse,
                                selected ? styles.tagChipPulseActive : styles.tagChipPulseIdle,
                              ]}
                              activeOpacity={0.85}
                            >
                              <Text
                                style={[
                                  styles.tagChipTextPulse,
                                  selected
                                    ? styles.tagChipTextPulseActive
                                    : styles.tagChipTextPulseIdle,
                                ]}
                              >
                                {tag.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {!showCommentBox ? (
                        <TouchableOpacity
                          style={styles.noteTogglePulse}
                          onPress={() => setShowCommentBox(true)}
                          activeOpacity={0.8}
                        >
                          <Feather name="message-square" size={15} color={Theme.textMuted} />
                          <Text style={styles.noteToggleTextPulse}>
                            Add a note (optional)
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.commentBoxWrapPulse}>
                          <TextInput
                            style={styles.commentInputPulse}
                            value={comment}
                            onChangeText={setComment}
                            placeholder="Tell us more about the experience..."
                            placeholderTextColor={Theme.textMuted}
                            multiline
                            numberOfLines={4}
                            maxLength={VALIDATION.NOTES_MAX_LENGTH}
                            textAlignVertical="top"
                          />
                          <Text style={styles.commentCounterPulse}>
                            {comment.length}/{VALIDATION.NOTES_MAX_LENGTH}
                          </Text>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.modalSubmitPulse}
                        onPress={handleSubmit}
                        disabled={submitting}
                        activeOpacity={0.85}
                      >
                        {submitting ? (
                          <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                        ) : (
                          <>
                            <Text style={styles.modalSubmitTextPulse}>Post review</Text>
                            <FontAwesome
                              name="thumbs-up"
                              size={18}
                              color={Theme.textOnPrimary}
                            />
                          </>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  ) : (
                    <Text style={styles.helperTextPulse}>
                      Select a star rating to continue.
                    </Text>
                  )}
                </View>
              </>
            )}
      </TripFeedbackModal>
      <TripFeedbackModal
        visible={showClientFeedbackModal}
        onRequestClose={() => setShowClientFeedbackModal(false)}
      >
            <View style={[styles.heroHeaderPulse, { backgroundColor: Theme.primary }]}>
              <TouchableOpacity
                style={styles.closeButtonPulse}
                onPress={() => setShowClientFeedbackModal(false)}
                activeOpacity={0.8}
              >
                <Feather name="x" size={20} color={Theme.textOnPrimary} />
              </TouchableOpacity>
              <Text style={styles.heroEyebrowPulse}>Settlement feedback</Text>
              <Text style={styles.heroNamePulse}>{clientName || 'Client'}</Text>
              <Text style={styles.heroMetaPulse}>Payment captured</Text>
            </View>
            <View style={styles.modalBodyPulse}>
              <Text style={styles.ratingHeadlinePulse}>How was this client?</Text>
              <View style={styles.starsPulse}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={`client-rate-${n}`}
                    onPress={() => setClientScore(n)}
                    style={styles.starBtnPulse}
                    activeOpacity={0.85}
                  >
                    <FontAwesome
                      name={n <= clientScore ? 'star' : 'star-o'}
                      size={32}
                      color={n <= clientScore ? Theme.feedbackModalStarActive : Theme.borderMedium}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.tagsWrapPulse, styles.clientTagsWrapPulse]}>
                {CLIENT_RATING_TAGS.map((tag) => {
                  const selected = clientTags.includes(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => handleClientTagToggle(tag.id)}
                      style={[
                        styles.tagChipPulse,
                        styles.clientTagChipPulse,
                        selected ? styles.tagChipPulseActive : styles.tagChipPulseIdle,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.tagChipTextPulse,
                          selected
                            ? styles.tagChipTextPulseActive
                            : styles.tagChipTextPulseIdle,
                        ]}
                        numberOfLines={1}
                      >
                        {tag.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.commentBoxWrapPulse}>
                <TextInput
                  style={styles.commentInputPulse}
                  value={clientComment}
                  onChangeText={setClientComment}
                  placeholder="Optional note"
                  placeholderTextColor={Theme.textMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={VALIDATION.NOTES_MAX_LENGTH}
                  textAlignVertical="top"
                />
              </View>
              <TouchableOpacity
                style={styles.modalSubmitPulse}
                disabled={clientScore < 1 || clientSubmitting}
                onPress={async () => {
                  if (clientScore < 1) return;
                  if (!effectiveOrganizationId) {
                    Alert.alert('Rating failed', 'Organization context is missing for this trip.');
                    return;
                  }
                  setClientSubmitting(true);
                  const payload: LocalClientFeedback = {
                    score: clientScore,
                    tags: clientTags,
                    note: clientComment.trim(),
                    created_at: new Date().toISOString(),
                  };
                  const commentPayload = buildCommentPayload(
                    clientTags,
                    clientComment.trim().slice(0, VALIDATION.NOTES_MAX_LENGTH),
                  );
                  let error: { message: string } | null = null;
                  let usedSchemaFallback = false;

                  // Client rows / name→id resolution live under the trip owner's org.
                  const tripOwnerOrgForClientResolution =
                    trip.organization_id?.trim() ?? effectiveOrganizationId ?? '';
                  // Ratings RLS: INSERT must use an org the current user belongs to (see ratings policies).
                  const ratingsRowOrganizationId = effectiveOrganizationId;
                  let ratedClientId = trip.client_id?.trim() ?? null;
                  if (!ratedClientId && tripOwnerOrgForClientResolution) {
                    ratedClientId = await resolveRatedClientIdForTrip(
                      trip,
                      tripOwnerOrgForClientResolution,
                    );
                  }

                  if (ratingsRowOrganizationId && ratedClientId) {
                    const { rater_type, rater_id } = resolveClientRatingRater(
                      trip,
                      effectiveOrganizationId,
                      isClientViewer,
                    );
                    const submitRes = await createRating(ratingsRowOrganizationId, {
                      trip_id: trip.id,
                      rater_type,
                      rater_id,
                      rated_type: 'client',
                      rated_id: ratedClientId,
                      score: clientScore,
                      comment: commentPayload,
                    });
                    error = submitRes.error;
                    const allowLocalClientFallback =
                      !!error &&
                      (error.message.toLowerCase().includes('ratings_rated_type_check') ||
                        error.message.toLowerCase().includes('check constraint') ||
                        error.message.toLowerCase().includes('rated_type'));
                    if (allowLocalClientFallback) usedSchemaFallback = true;
                    if (error && !allowLocalClientFallback) {
                      setClientSubmitting(false);
                      Alert.alert('Rating failed', error.message);
                      return;
                    }
                  } else if (!ratedClientId && (trip.client_name?.trim() || trip.client_id)) {
                    setClientSubmitting(false);
                    Alert.alert(
                      'Cannot save customer rating',
                      'Match this trip to a customer in Customers (same name as on the trip), or set the trip’s customer so ratings sync to the database.',
                    );
                    return;
                  }
                  await AsyncStorage.setItem(clientFeedbackStorageKey, JSON.stringify(payload));
                  setClientFeedback(payload);
                  await loadRatings();
                  if (ratedClientId) {
                    const { ratings: clientRatings } = await getRatingsForClient(ratedClientId);
                    setHistClientAvg(averageScore(clientRatings));
                  }
                  if (usedSchemaFallback) {
                    Alert.alert(
                      'Saved on this device only',
                      'The database rejected client ratings (missing rated_type “client”). Apply migration ratings_add_client_rated_type on Supabase, then submit again to sync.',
                    );
                  }
                  setClientSubmitting(false);
                  setShowClientFeedbackModal(false);
                }}
                activeOpacity={0.85}
              >
                {clientSubmitting ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <Text style={styles.modalSubmitTextPulse}>Submit</Text>
                    <FontAwesome name="check" size={16} color={Theme.textOnPrimary} />
                  </>
                )}
              </TouchableOpacity>
            </View>
      </TripFeedbackModal>
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
  // ── Workspace layout (web trip detail) ─────────────────────────────────────
  wsWrapper: {
    marginBottom: 20,
  },
  wsCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderRadius: 36,
    padding: 24,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: '0 40px 100px rgba(15, 23, 42, 0.06)',
      },
      default: {},
    }),
  },
  wsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  wsHeaderRowCompact: {
    gap: 10,
  },
  wsTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 200,
  },
  wsAwardCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsTitleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  wsTitle: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: -0.3,
  },
  wsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  wsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
  wsPillRowCompact: {
    width: '100%',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
  },
  wsSummaryPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  wsSummaryPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsPartyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  wsPartyGridCompact: {
    gap: 6,
    marginBottom: 10,
  },
  wsPartyCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 140,
    maxWidth: 360,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: Theme.surface,
    alignItems: 'center',
  },
  wsPartyCardCompact: {
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1.4,
  },
  wsPartyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  wsPartyIconCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  wsPartyIconDark: {
    backgroundColor: Theme.textPrimaryDark,
  },
  wsPartyIconMuted: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  wsPartyIconDriver: {
    backgroundColor: Theme.primary + '22',
    borderWidth: 1,
    borderColor: Theme.primary + '44',
  },
  wsPartyRole: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  wsPartyRoleCompact: {
    fontSize: 7,
    marginBottom: 3,
    letterSpacing: 0.55,
  },
  wsPartyName: {
    fontSize: 13,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  wsPartyNameCompact: {
    fontSize: 9,
    marginBottom: 4,
    lineHeight: 11,
  },
  wsPartyDividerCompact: {
    marginVertical: 5,
  },
  wsPartyMetricsRowCompact: {
    gap: 6,
    paddingTop: 0,
  },
  wsPartyScoreCompact: {
    fontSize: 11,
  },
  wsPartyAvgCaptionCompact: {
    fontSize: 7,
    letterSpacing: 0.45,
  },
  wsRateCtaCompact: {
    fontSize: 8,
  },
  wsRateCtaMutedCompact: {
    fontSize: 11,
  },
  wsPartyDivider: {
    width: '100%',
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 8,
  },
  wsPartyFooter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  wsPartyMetricsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 2,
  },
  wsPartyScoreBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 2,
  },
  wsPartyScoreBlockRight: {
    alignItems: 'flex-end',
  },
  wsPartyAvgCaption: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  wsPartyScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wsPartyScore: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
  },
  wsRateCta: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsRateCtaMuted: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  wsList: {
    gap: 12,
    marginBottom: 16,
  },
  wsAuditCard: {
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  wsAuditMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  rowTopWithAvatar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  rowTopTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partyAvatarWrap: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  partyAvatarImage: {
    borderRadius: 999,
  },
  partyAvatarInitial: {
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  wsAuditLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  wsRatedTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  wsRatedTagClient: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1.5,
    borderColor: Theme.textPrimaryDark,
  },
  wsRatedTagSupplier: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  wsRatedTagDriver: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.primary + '55',
  },
  wsRatedTagText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Theme.textPrimaryDark,
  },
  wsAuditFromTo: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  wsScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wsAuditScore: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
  },
  wsAuditDate: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wsRowTags: {
    marginTop: 4,
  },
  wsTagChip: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 999,
  },
  wsTagChipText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsRowComment: {
    marginTop: 8,
  },
  wsEmptyAudits: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  wsActions: {
    marginTop: 8,
    justifyContent: 'center',
    gap: 12,
  },
  regWrap: { gap: 16 },
  regSectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  regSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textTransform: 'uppercase',
  },
  regSectionSub: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  regMsgIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regStack: { gap: 10 },
  regCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 14,
    overflow: 'hidden',
  },
  regCardDecor: {
    position: 'absolute',
    right: -32,
    top: -32,
    width: 112,
    height: 112,
    borderBottomLeftRadius: 999,
    backgroundColor: Theme.surfaceGray,
    opacity: 0.55,
  },
  regCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    zIndex: 1,
  },
  regCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  regInitialMark: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    ...Platform.select({
      web: { boxShadow: '0 10px 30px rgba(15,23,42,0.12)' },
      default: {},
    }),
  },
  regInitialText: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textOnPrimary,
  },
  regCardLeftText: { flex: 1, minWidth: 0, gap: 2 },
  regKicker: {
    fontSize: 7,
    fontWeight: '900',
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  regPartyName: {
    fontSize: 12,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  regTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  regTagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: Theme.surface,
  },
  regTagPillText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  regGlobalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceGray,
  },
  regGlobalAvgCluster: {
    alignItems: 'flex-start',
    gap: 3,
  },
  regMetricEyebrowMuted: {
    fontSize: 6,
    fontWeight: '900',
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  regGlobalPillText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.textSecondary,
  },
  regCardRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    minWidth: 72,
    gap: 3,
  },
  regScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  regTripBig: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.6,
  },
  regScoreStarCol: { alignItems: 'center', gap: 1 },
  regScoreWord: {
    fontSize: 6,
    fontWeight: '900',
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  regPerfLbl: {
    marginTop: 3,
    fontSize: 6.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  regCardFoot: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    zIndex: 1,
  },
  regStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regStarHit: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regFeedbackSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 6,
    zIndex: 1,
  },
  regFeedbackHeading: {
    fontSize: 7,
    fontWeight: '900',
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  regFeedbackTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  regFeedbackTagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  regFeedbackTagText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  regFeedbackNote: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    fontStyle: 'italic',
  },
  regAuditTap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  regAuditTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  regAuditTxtDis: { color: Theme.textMuted },
  wsPrimaryCta: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
    minWidth: 160,
    paddingVertical: 12,
    borderRadius: 14,
  },
  wsPrimaryCtaText: {
    color: Theme.textOnPrimary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wsOutlineCta: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 2,
    borderColor: Theme.textPrimaryDark,
    minWidth: 220,
    paddingVertical: 14,
    borderRadius: 16,
  },
  wsOutlineCtaText: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroHeaderPulse: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlowOnePulse: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    right: -56,
    top: -48,
  },
  heroGlowTwoPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    left: -40,
    top: 40,
  },
  closeButtonPulse: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroTopRowPulse: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingRight: 52,
  },
  avatarWrapPulse: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Theme.onPrimaryMuted,
  },
  avatarTextPulse: {
    fontSize: 24,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
  },
  avatarImagePulse: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  avatarBadgePulse: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.feedbackModalBadgeRing,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  heroTextWrapPulse: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 2,
  },
  heroEyebrowPulse: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: Theme.textOnDarkMuted,
  },
  heroNamePulse: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textOnPrimary,
    letterSpacing: -0.4,
    textTransform: 'uppercase',
  },
  heroMetaPulse: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(248, 250, 252, 0.45)',
  },
  modalBodyPulse: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
  },
  ratingHeadlinePulse: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    marginBottom: 14,
    lineHeight: 26,
  },
  ratingHeadlineAccent: {
    color: Theme.primary,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  starsPulse: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  starBtnPulse: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  composerSectionPulse: {
    width: '100%',
    marginTop: 4,
    gap: 12,
    alignItems: 'stretch',
  },
  tagsWrapPulse: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  clientTagsWrapPulse: {
    width: '100%',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 0,
  },
  tagChipPulse: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  clientTagChipPulse: {
    width: '48%',
    minHeight: 40,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipPulseIdle: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  tagChipPulseActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  tagChipTextPulse: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tagChipTextPulseIdle: {
    color: Theme.textSecondary,
  },
  tagChipTextPulseActive: {
    color: Theme.textOnPrimary,
  },
  noteTogglePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  noteToggleTextPulse: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  commentBoxWrapPulse: {
    marginBottom: 0,
    width: '100%',
  },
  commentInputPulse: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    minHeight: 76,
    marginBottom: 4,
  },
  commentCounterPulse: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'right',
  },
  modalSubmitPulse: {
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  modalSubmitTextPulse: {
    fontSize: 13,
    fontWeight: '900',
    color: Theme.textOnPrimary,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  helperTextPulse: {
    fontSize: 11,
    fontWeight: '700',
    fontStyle: 'italic',
    color: Theme.textMuted,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  successWrap: {
    paddingHorizontal: 22,
    paddingVertical: 28,
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
