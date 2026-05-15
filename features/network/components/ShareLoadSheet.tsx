/**
 * ShareLoadSheet — dark bottom sheet to broadcast an indent to the Q Pulse network.
 * Story broadcast (24h) + optional WhatsApp share with public story-detail URL (bidding page).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from '@/constants/Theme';
import { type IndentRow } from '@/features/indents';
import { createPost } from '@/features/network/services/posts.service';
import { formatINR } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import {
  ArrowRight,
  CheckCircle2,
  Package,
  Truck,
  X,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function buildPulseStoryPublicUrl(
  postId: string,
  orgId: string,
  storyType: 'LOAD',
): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, '') || '';
  const params = new URLSearchParams({
    postId,
    orgId,
    storyType,
    queue: postId,
  });
  const qs = params.toString();
  if (webBase !== '') {
    return `${webBase}/story-detail?${qs}`;
  }
  return Linking.createURL(`/story-detail?${qs}`);
}

interface ShareLoadSheetProps {
  visible: boolean;
  indent: IndentRow | null;
  orgId: string;
  onClose: () => void;
  onSuccess?: (type: 'feed' | 'story') => void;
}

function LoadPreviewCard({ indent }: { indent: IndentRow }) {
  const weight = indent.weight != null ? (indent.weight / 1000).toFixed(1) : null;

  return (
    <View style={styles.previewCard}>
      {/* Route */}
      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: '#10b981' }]} />
          <Text style={styles.routeCity} numberOfLines={1}>
            {(indent.pickup_area || '—').toUpperCase()}
          </Text>
        </View>
        <View style={styles.routeArrowWrap}>
          <View style={styles.routeLine} />
          <ArrowRight size={14} color="rgba(255,255,255,0.35)" />
        </View>
        <View style={[styles.routePoint, { alignItems: 'flex-end' }]}>
          <View style={[styles.routeDot, { backgroundColor: '#6366f1' }]} />
          <Text style={styles.routeCity} numberOfLines={1}>
            {(indent.drop_location || '—').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Chips */}
      <View style={styles.chipRow}>
        {indent.vehicle_type ? (
          <View style={styles.chip}>
            <Truck size={9} color="rgba(255,255,255,0.45)" />
            <Text style={styles.chipText}>{indent.vehicle_type}</Text>
          </View>
        ) : null}
        {weight ? (
          <View style={styles.chip}>
            <Package size={9} color="rgba(255,255,255,0.45)" />
            <Text style={styles.chipText}>{weight}T</Text>
          </View>
        ) : null}
        {indent.load_type ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{indent.load_type}</Text>
          </View>
        ) : null}
        {indent.client_price ? (
          <View style={[styles.chip, styles.rateChip]}>
            <Text style={styles.rateChipText}>{formatINR(indent.client_price)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SuccessView({
  indent,
  orgId,
  postId,
  onShareWhatsApp,
}: {
  indent: IndentRow;
  orgId: string;
  postId: string;
  onShareWhatsApp: () => void;
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const color = '#f59e0b';
  const storyUrl = buildPulseStoryPublicUrl(postId, orgId, 'LOAD');
  const hasWebBase =
    (process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, '') || '') !== '';

  return (
    <Animated.View style={[styles.successView, { opacity, transform: [{ scale }] }]}>
      <View style={[styles.successIcon, { backgroundColor: color + '18' }]}>
        <Zap size={36} color={color} strokeWidth={1.5} />
      </View>
      <Text style={[styles.successTitle, { color }]}>Story live</Text>
      <Text style={styles.successSub}>
        Your load is in the story reel and expires in 24 hours. Partners can bid and message.
      </Text>
      {!hasWebBase ? (
        <Text style={styles.successHintMuted}>
          Set EXPO_PUBLIC_WEB_BASE_URL for a public https link (e.g. Netlify) when sharing outside the app.
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.waBtn, pressed && { opacity: 0.9 }]}
        onPress={onShareWhatsApp}
        accessibilityRole="button"
        accessibilityLabel="Share story bidding link on WhatsApp"
      >
        <FontAwesome name="whatsapp" size={20} color="#fff" />
        <Text style={styles.waBtnText}>Share link on WhatsApp</Text>
      </Pressable>
      <Text style={styles.waHint}>
        Opens WhatsApp with your bidding page link — paste to Status or send to a chat.
      </Text>
      <Text style={styles.linkPreview} numberOfLines={2} selectable>
        {storyUrl}
      </Text>
      <Text style={styles.routeMini} numberOfLines={1}>
        {(indent.pickup_area || '—').toUpperCase()} → {(indent.drop_location || '—').toUpperCase()}
      </Text>
    </Animated.View>
  );
}

export function ShareLoadSheet({
  visible,
  indent,
  orgId,
  onClose,
  onSuccess,
}: ShareLoadSheetProps) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setNote('');
      setError(null);
      setSuccess(false);
      setSuccessPostId(null);
      setLoading(false);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const shareStoryLinkOnWhatsApp = useCallback(async () => {
    if (!indent || !successPostId) return;
    const storyUrl = buildPulseStoryPublicUrl(successPostId, orgId, 'LOAD');
    const routeLabel = `${(indent.pickup_area || '—').toUpperCase()} → ${(indent.drop_location || '—').toUpperCase()}`;
    const message = `Load broadcast · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    const encoded = encodeURIComponent(message);
    const waWeb = `https://wa.me/?text=${encoded}`;
    const waNative = `whatsapp://send?text=${encoded}`;
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(waWeb);
        return;
      }
      // iOS: canOpenURL is false unless whatsapp is in LSApplicationQueriesSchemes — fall back to wa.me.
      const canNative = await Linking.canOpenURL(waNative);
      await Linking.openURL(canNative ? waNative : waWeb);
    } catch {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(storyUrl, { dialogTitle: message });
        }
      } catch {
        // ignore
      }
    }
  }, [indent, successPostId, orgId]);

  const handleBroadcast = async () => {
    if (!indent || loading) return;
    setLoading(true);
    setError(null);

    const weight = indent.weight != null ? indent.weight / 1000 : undefined;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: err, postId: newPostId } = await createPost({
      organizationId: orgId,
      type: 'LOAD',
      content: note.trim() || undefined,
      origin: indent.pickup_area || undefined,
      destination: indent.drop_location || undefined,
      loadDate: indent.pickup_date ?? undefined,
      vehicleType: indent.vehicle_type ?? undefined,
      weightTonnes: weight,
      rateOffer: indent.client_price ?? undefined,
      material: indent.load_type ?? undefined,
      expiresAt,
      sourceIndentId: indent.id,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    if (!newPostId) {
      setError('Story posted but could not build share link. Try again.');
      return;
    }

    setSuccessPostId(newPostId);
    setSuccess(true);
    onSuccess?.('story');
  };

  if (!indent) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.kvContainer}
          >
            <Animated.View
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 20, transform: [{ translateY }] },
              ]}
            >
              {/* Handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIcon}>
                    <Zap size={16} color="#f59e0b" fill="#f59e0b" />
                  </View>
                  <View>
                    <Text style={styles.headerTitle}>Broadcast Load</Text>
                    <Text style={styles.headerSub}>Share to your Pulse network</Text>
                  </View>
                </View>
                <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                  <X size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>

              {success && indent && successPostId ? (
                <SuccessView
                  indent={indent}
                  orgId={orgId}
                  postId={successPostId}
                  onShareWhatsApp={shareStoryLinkOnWhatsApp}
                />
              ) : !success ? (
                <>
                  <LoadPreviewCard indent={indent} />
                  <Text style={styles.storyOnlyHint}>
                    Broadcasts to the story reel only · 24 hour expiry · No public timeline
                  </Text>

                  {/* Optional note */}
                  <View style={styles.noteSection}>
                    <Text style={styles.sectionLabel}>ADD A NOTE (OPTIONAL)</Text>
                    <View style={styles.noteBox}>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Add context for your partners..."
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        value={note}
                        onChangeText={setNote}
                        multiline
                        numberOfLines={2}
                        returnKeyType="done"
                        blurOnSubmit
                      />
                    </View>
                  </View>

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}

                  {/* Broadcast button */}
                  <Pressable
                    style={[
                      styles.broadcastBtn,
                      styles.broadcastBtnStory,
                      loading && styles.broadcastBtnDisabled,
                    ]}
                    onPress={handleBroadcast}
                    disabled={loading}
                  >
                    {loading ? (
                      <LoadingIndicator color="#0F172A" />
                    ) : (
                      <>
                        <Zap size={16} color="#0F172A" fill="#0F172A" />
                        <Text style={[styles.broadcastBtnText, styles.broadcastBtnTextStory]}>
                          Broadcast to story (24h)
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : null}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  kvContainer: { justifyContent: 'flex-end' },

  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(99,102,241,0.2)',
  },

  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f59e0b18',
    borderWidth: 1,
    borderColor: '#f59e0b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Load preview
  previewCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routePoint: { flex: 1, gap: 5 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeCity: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  routeArrowWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 4 },
  routeLine: { width: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  rateChip: { backgroundColor: '#6366f120', borderColor: '#6366f135' },
  rateChipText: { fontSize: 10, fontWeight: '800', color: '#a5b4fc' },

  storyOnlyHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 4,
  },
  // Options
  optionsSection: { gap: 8 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  optionSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Note
  noteSection: { gap: 8 },
  noteBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 64,
    padding: 12,
  },
  noteInput: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 20,
    textAlignVertical: 'top',
  },

  errorText: { fontSize: 12, color: '#f87171', fontWeight: '600', textAlign: 'center' },

  // Broadcast button
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 17,
    shadowColor: '#6366f1',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  broadcastBtnStory: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
  },
  broadcastBtnDisabled: { opacity: 0.6 },
  broadcastBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  broadcastBtnTextStory: { color: '#0F172A' },

  // Success
  successView: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  successSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  successHintMuted: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
    marginTop: -4,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 8,
    width: '100%',
  },
  waBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  waHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  linkPreview: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.28)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  routeMini: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
  },
});
