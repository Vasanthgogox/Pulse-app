/**
 * ShareLoadSheet — light bottom sheet to broadcast an indent to the Pulse network.
 * Story broadcast (24h) + optional WhatsApp share with public story-detail URL (bidding page).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { type IndentRow, getIndentDisplayNumber, resolveSupplierTargetDisplayRate } from "@/features/indents";
import { createPost } from "@/features/network/services/posts.service";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { ArrowRight, CheckCircle2, X, Zap } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IS_WEB = Platform.OS === "web";
const SHEET_MAX_WIDTH = 440;

function routeLabel(value: string): string {
  const trimmed = (value || "—").trim();
  return trimmed ? trimmed.toUpperCase() : "—";
}

function BroadcastRoutePreview({
  origin,
  destination,
}: {
  origin: string;
  destination: string;
}) {
  const originParts = splitHubRouteLocationDisplay(origin);
  const destParts = splitHubRouteLocationDisplay(destination);

  return (
    <View style={styles.routePreview}>
      <View style={styles.routeLeg}>
        <View style={[styles.routeDot, styles.routeDotOrigin]} />
        <View style={styles.routeLegText}>
          <Text style={styles.routeCity} numberOfLines={1}>
            {routeLabel(originParts.city)}
          </Text>
          <Text style={styles.routeState} numberOfLines={1}>
            {originParts.state ? routeLabel(originParts.state) : "\u00a0"}
          </Text>
        </View>
      </View>

      <View style={styles.routeArrowWrap}>
        <ArrowRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
      </View>

      <View style={[styles.routeLeg, styles.routeLegEnd]}>
        <View style={styles.routeLegText}>
          <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
            {routeLabel(destParts.city)}
          </Text>
          <Text style={[styles.routeState, styles.routeStateEnd]} numberOfLines={1}>
            {destParts.state ? routeLabel(destParts.state) : "\u00a0"}
          </Text>
        </View>
        <View style={[styles.routeDot, styles.routeDotDest]} />
      </View>
    </View>
  );
}

function BroadcastSpecsGrid({
  vehicle,
  loadType,
  weight,
}: {
  vehicle: string;
  loadType: string;
  weight: string;
}) {
  const items = [
    { label: "Vehicle", value: vehicle },
    { label: "Load", value: loadType },
    { label: "Weight", value: weight },
  ] as const;

  return (
    <View style={styles.specsGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.specCell}>
          <Text style={styles.specLabel}>{item.label}</Text>
          <Text style={styles.specValue} numberOfLines={3}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function buildPulseStoryPublicUrl(
  postId: string,
  orgId: string,
  storyType: "LOAD",
): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
  const params = new URLSearchParams({
    postId,
    orgId,
    storyType,
    queue: postId,
  });
  const qs = params.toString();
  if (webBase !== "") {
    return `${webBase}/story-detail?${qs}`;
  }
  return Linking.createURL(`/story-detail?${qs}`);
}

interface ShareLoadSheetProps {
  visible: boolean;
  indent: IndentRow | null;
  orgId: string;
  onClose: () => void;
  onSuccess?: (type: "feed" | "story") => void;
}

function LoadPreviewCard({ indent }: { indent: IndentRow }) {
  const weightValue = Number(indent.weight);
  const weightDetail =
    Number.isFinite(weightValue) && weightValue > 0 ? `${weightValue} KG` : "—";
  const displayRate =
    resolveSupplierTargetDisplayRate(indent.supplier_target, indent.client_price) ??
    indent.client_price;

  return (
    <View style={styles.previewCard}>
      <BroadcastRoutePreview
        origin={indent.pickup_area || "—"}
        destination={indent.drop_location || "—"}
      />
      <View style={styles.previewIdRow}>
        <Text style={styles.previewId} numberOfLines={1}>
          {getIndentDisplayNumber(indent)}
        </Text>
      </View>
      <View style={styles.previewSpecsPanel}>
        <BroadcastSpecsGrid
          vehicle={indent.vehicle_type || "—"}
          loadType={indent.load_type || "—"}
          weight={weightDetail}
        />
      </View>
      {displayRate ? (
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>Offer</Text>
          <Text style={styles.rateValue}>{formatINR(displayRate)}</Text>
        </View>
      ) : null}
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

  const storyUrl = buildPulseStoryPublicUrl(postId, orgId, "LOAD");
  const hasWebBase =
    (process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "") !== "";

  return (
    <Animated.View style={[styles.successView, { opacity, transform: [{ scale }] }]}>
      <View style={styles.successIcon}>
        <CheckCircle2 size={32} color={Theme.darkGreen} strokeWidth={2} />
      </View>
      <Text style={styles.successTitle}>Story live</Text>
      <Text style={styles.successSub}>
        Your load is in the story reel and expires in 24 hours. Partners can bid and message.
      </Text>
      {!hasWebBase ? (
        <Text style={styles.successHintMuted}>
          Set EXPO_PUBLIC_WEB_BASE_URL for a public https link (e.g. Netlify) when sharing outside
          the app.
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.waBtn, pressed && { opacity: 0.9 }]}
        onPress={onShareWhatsApp}
        accessibilityRole="button"
        accessibilityLabel="Share story bidding link on WhatsApp"
      >
        <FontAwesome name="whatsapp" size={18} color="#fff" />
        <Text style={styles.waBtnText}>Share link on WhatsApp</Text>
      </Pressable>
      <Text style={styles.waHint}>
        Opens WhatsApp with your bidding page link — paste to Status or send to a chat.
      </Text>
      <Text style={styles.linkPreview} numberOfLines={2} selectable>
        {storyUrl}
      </Text>
      <Text style={styles.routeMini} numberOfLines={1}>
        {(indent.pickup_area || "—").toUpperCase()} → {(indent.drop_location || "—").toUpperCase()}
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
  const { status: authStatus } = useAuth();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(IS_WEB ? 0 : 500)).current;
  const sheetOpacity = useRef(new Animated.Value(IS_WEB ? 0 : 1)).current;

  useEffect(() => {
    if (visible) {
      setNote("");
      setError(null);
      setSuccess(false);
      setSuccessPostId(null);
      setLoading(false);
      if (IS_WEB) {
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      }
    } else if (IS_WEB) {
      sheetOpacity.setValue(0);
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, sheetOpacity, translateY]);

  const shareStoryLinkOnWhatsApp = useCallback(async () => {
    if (!indent || !successPostId) return;
    const storyUrl = buildPulseStoryPublicUrl(successPostId, orgId, "LOAD");
    const routeLabel = `${(indent.pickup_area || "—").toUpperCase()} → ${(indent.drop_location || "—").toUpperCase()}`;
    const message = `Load broadcast · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    const encoded = encodeURIComponent(message);
    const waWeb = `https://wa.me/?text=${encoded}`;
    const waNative = `whatsapp://send?text=${encoded}`;
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(waWeb);
        return;
      }
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
    if (!indent || loading || authStatus === "restoring") return;
    setLoading(true);
    setError(null);

    const weight = indent.weight != null ? indent.weight / 1000 : undefined;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: err, postId: newPostId } = await createPost({
      organizationId: orgId,
      type: "LOAD",
      content: note.trim() || undefined,
      origin: indent.pickup_area || undefined,
      destination: indent.drop_location || undefined,
      loadDate: indent.pickup_date ?? undefined,
      vehicleType: indent.vehicle_type ?? undefined,
      weightTonnes: weight,
      rateOffer:
        resolveSupplierTargetDisplayRate(indent.supplier_target, indent.client_price) ??
        undefined,
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
      setError("Story posted but could not build share link. Try again.");
      return;
    }

    setSuccessPostId(newPostId);
    setSuccess(true);
    onSuccess?.("story");
  };

  if (!indent) return null;

  const sheetBody = (
    <>
      {!IS_WEB ? <View style={styles.handle} /> : null}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Zap size={16} color={Theme.warning} fill={Theme.warning} />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>Broadcast Load</Text>
            <Text style={styles.headerSub}>Share to your Pulse network</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <X size={16} color={Theme.textMuted} strokeWidth={2.2} />
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

          <View style={styles.noteSection}>
            <Text style={styles.sectionLabel}>Add a note (optional)</Text>
            <View style={styles.noteBox}>
              <TextInput
                style={styles.noteInput}
                placeholder="Add context for your partners..."
                placeholderTextColor={Theme.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
                returnKeyType="done"
                blurOnSubmit
              />
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[styles.broadcastBtn, loading && styles.broadcastBtnDisabled]}
            onPress={handleBroadcast}
            disabled={loading}
          >
            {loading ? (
              <LoadingIndicator color={Theme.textOnPrimary} />
            ) : (
              <>
                <Zap size={14} color={Theme.textOnPrimary} fill={Theme.textOnPrimary} />
                <Text style={styles.broadcastBtnText}>Broadcast to story (24h)</Text>
              </>
            )}
          </Pressable>
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, IS_WEB && styles.backdropWeb]}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close broadcast sheet"
        />

        <Animated.View
          style={[
            styles.sheet,
            IS_WEB && styles.sheetWeb,
            {
              paddingBottom: insets.bottom + (IS_WEB ? 20 : 16),
              opacity: IS_WEB ? sheetOpacity : 1,
            },
            !IS_WEB ? { transform: [{ translateY }] } : null,
          ]}
        >
          {IS_WEB ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              {sheetBody}
            </ScrollView>
          ) : (
            <KeyboardAvoidingView behavior="padding" enabled style={styles.sheetInner}>
              {sheetBody}
            </KeyboardAvoidingView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.driverOverlay,
    justifyContent: "flex-end",
  },
  backdropWeb: {
    position: "fixed" as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: { cursor: "pointer" as const },
      default: {},
    }),
  },

  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignSelf: "stretch",
    position: "relative",
    maxHeight: IS_WEB ? "92%" : "88%",
    ...(IS_WEB
      ? {
          width: "100%",
          maxWidth: SHEET_MAX_WIDTH,
          boxShadow: "0 16px 48px rgba(15, 23, 42, 0.14)",
        }
      : {}),
  },
  sheetWeb: {
    overflow: "hidden",
  },
  sheetInner: {
    width: "100%",
    gap: 14,
  },
  sheetScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },

  handle: {
    width: 40,
    height: 4,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 6,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  headerTextCol: { flex: 1, minWidth: 0, gap: 2 },
  headerIcon: {
    width: 36,
    height: 36,
    backgroundColor: Theme.warningMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    lineHeight: 18,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textMuted,
    lineHeight: 16,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  previewCard: {
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 12,
  },
  routePreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  routeLeg: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  routeLegEnd: {
    justifyContent: "flex-end",
  },
  routeLegText: {
    flex: 1,
    minWidth: 0,
  },
  routeDot: {
    width: 7,
    height: 7,
    marginTop: 6,
    flexShrink: 0,
  },
  routeDotOrigin: {
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.75,
  },
  routeDotDest: {
    backgroundColor: Theme.positive,
  },
  routeCity: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    lineHeight: 18,
  },
  routeCityEnd: {
    textAlign: "right",
  },
  routeState: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  routeStateEnd: {
    textAlign: "right",
  },
  routeArrowWrap: {
    paddingTop: 4,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: 24,
  },
  previewIdRow: {
    marginTop: -2,
  },
  previewId: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.primary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    backgroundColor: Theme.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: "hidden",
  },
  previewSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  specsGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  specCell: {
    flex: 1,
    minWidth: 0,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.55,
    marginBottom: 5,
  },
  specValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rateValue: {
    fontSize: 18,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.primary,
    letterSpacing: -0.2,
  },

  storyOnlyHint: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },

  noteSection: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  noteBox: {
    backgroundColor: Theme.cardWhite,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    fontSize: 14,
    fontWeight: "400",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
    textAlignVertical: "top",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },

  errorText: {
    fontSize: 12,
    color: Theme.teslaRed,
    fontWeight: "500",
    textAlign: "center",
  },

  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 14,
    minHeight: 48,
  },
  broadcastBtnDisabled: { opacity: 0.6 },
  broadcastBtnText: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  successView: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  successIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginBottom: 2,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  successSub: {
    fontSize: 13,
    fontWeight: "400",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  successHintMuted: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 12,
    marginTop: -4,
  },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 4,
    width: "100%",
    minHeight: 44,
  },
  waBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.3,
  },
  waHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  linkPreview: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  routeMini: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
});
