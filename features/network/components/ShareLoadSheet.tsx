/**
 * ShareLoadSheet — light bottom sheet to broadcast an indent to the Q Pulse network.
 * Story broadcast (24h) + optional WhatsApp share with public story-detail URL (bidding page).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { LoadCardSpecsRow } from "@/components/LoadCardSpecsRow";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { type IndentRow, getIndentDisplayNumber } from "@/features/indents";
import { hubCardSectionDivider } from "@/features/network/components/networkHubListCardChrome";
import { createPost } from "@/features/network/services/posts.service";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { CheckCircle2, X, Zap } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

  return (
    <View style={styles.previewCard}>
      <LoadCardRouteRow
        origin={indent.pickup_area || "—"}
        destination={indent.drop_location || "—"}
        compact
        style={styles.previewRoute}
      />
      <View style={styles.previewDivider} />
      <Text style={styles.previewId} numberOfLines={1}>
        {getIndentDisplayNumber(indent)}
      </Text>
      <View style={styles.previewSpecsPanel}>
        <LoadCardSpecsRow
          vehicle={indent.vehicle_type || "—"}
          weight={weightDetail}
          loadType={indent.load_type || "—"}
        />
      </View>
      {indent.client_price ? (
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>Offer</Text>
          <Text style={styles.rateValue}>{formatINR(indent.client_price)}</Text>
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
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setNote("");
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
    if (!indent || loading) return;
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
      setError("Story posted but could not build share link. Try again.");
      return;
    }

    setSuccessPostId(newPostId);
    setSuccess(true);
    onSuccess?.("story");
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
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            enabled={Platform.OS !== "web"}
            style={styles.kvContainer}
          >
            <Animated.View
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
              ]}
            >
              <View style={styles.handle} />

              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIcon}>
                    <Zap size={14} color={Theme.warning} fill={Theme.warning} />
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
                    style={[
                      styles.broadcastBtn,
                      loading && styles.broadcastBtnDisabled,
                    ]}
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
    backgroundColor: Theme.driverOverlay,
    justifyContent: "flex-end",
  },
  kvContainer: { justifyContent: "flex-end" },

  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
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
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.warningMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontStyle: "normal",
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.1,
  },
  headerSub: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    lineHeight: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  previewCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 0,
  },
  previewRoute: {
    marginBottom: 0,
  },
  previewDivider: {
    ...hubCardSectionDivider,
    marginTop: 8,
    marginBottom: 8,
  },
  previewId: {
    ...FinanceTxnTypography.tripId,
    marginBottom: 6,
    lineHeight: 11,
  },
  previewSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  rateLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
  },
  rateValue: {
    ...FinanceTxnTypography.amount,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },

  storyOnlyHint: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 12,
    marginTop: -4,
  },

  noteSection: { gap: 6 },
  sectionLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    marginBottom: 0,
  },
  noteBox: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteInput: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    textAlignVertical: "top",
  },

  errorText: {
    fontSize: 10,
    color: Theme.teslaRed,
    fontWeight: "500",
    textAlign: "center",
  },

  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.primary,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  broadcastBtnDisabled: { opacity: 0.6 },
  broadcastBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
  },

  successView: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginBottom: 2,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  successSub: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontStyle: "normal",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 14,
    paddingHorizontal: 12,
  },
  successHintMuted: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 12,
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
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.4,
  },
  waHint: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 12,
    paddingHorizontal: 10,
  },
  linkPreview: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  routeMini: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    marginTop: 2,
  },
});
