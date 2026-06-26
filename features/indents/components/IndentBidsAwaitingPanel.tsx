import { LoadingIndicator } from "@/components/LoadingIndicator";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type IndentBidsAwaitingPanelProps = {
  compact?: boolean;
  canBroadcast: boolean;
  isListening: boolean;
  isBroadcasting?: boolean;
  sharingDraft?: boolean;
  broadcastError?: string | null;
  onBroadcast?: () => void;
};

function ListeningDots() {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 900,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => {
        const opacity = a.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange:
            i === 0
              ? [0.35, 1, 0.35, 0.35]
              : i === 1
                ? [0.35, 0.35, 1, 0.35]
                : [1, 0.35, 0.35, 1],
        });
        return (
          <Animated.View key={i} style={[styles.dot, { opacity }]} />
        );
      })}
    </View>
  );
}

export function LiveBidsSectionHeader({
  title,
  count,
  isListening,
  showTrophy,
}: {
  title: string;
  count: number;
  isListening: boolean;
  showTrophy?: boolean;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {showTrophy ? (
        <FontAwesome name="trophy" size={14} color={Theme.driverGold} />
      ) : isListening && count === 0 ? (
        <View style={styles.listeningChip}>
          <View style={styles.listeningDot} />
          <Text style={styles.listeningChipText}>LIVE</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.countBadge,
          isListening && count === 0 && styles.countBadgeListening,
          count > 0 && styles.countBadgeActive,
        ]}
      >
        <Text
          style={[
            styles.countBadgeText,
            isListening && count === 0 && styles.countBadgeTextListening,
            count > 0 && styles.countBadgeTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

export function IndentBidsAwaitingPanel({
  compact = false,
  canBroadcast,
  isListening,
  isBroadcasting = false,
  sharingDraft = false,
  broadcastError,
  onBroadcast,
}: IndentBidsAwaitingPanelProps) {
  const title = canBroadcast
    ? "Ready to go live"
    : isListening
      ? "Listening for bids"
      : "No bids received";

  const body = canBroadcast
    ? "Broadcast this load to your network — transporters can quote in real time."
    : isListening
      ? "Your load is on the network. Quotes land here as partners respond."
      : "Waiting for transporters to respond on this load.";

  return (
    <View style={[styles.card, compact && styles.cardCompact, isListening && styles.cardListening]}>
      {isListening ? (
        <View style={styles.liveBanner}>
          <Feather name="radio" size={11} color={Theme.pulseIndigo} />
          <Text style={styles.liveBannerText}>On Pulse network</Text>
          <ListeningDots />
        </View>
      ) : null}

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={[styles.lottieWrap, compact && styles.lottieWrapCompact]}>
          <TinyEmptyLottie
            source={EMPTY_STATE_LOTTIE.auction}
            size={compact ? 44 : 52}
            speed={0.9}
          />
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={[styles.body, compact && styles.bodyCompact]} numberOfLines={compact ? 3 : 4}>
          {body}
        </Text>
      </View>

      {canBroadcast && onBroadcast ? (
        <TouchableOpacity
          style={[styles.broadcastBtn, compact && styles.broadcastBtnCompact]}
          onPress={onBroadcast}
          activeOpacity={0.9}
          disabled={isBroadcasting || sharingDraft}
          accessibilityRole="button"
          accessibilityLabel="Broadcast load to network"
        >
          {isBroadcasting || sharingDraft ? (
            <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
          ) : (
            <>
              <Feather name="share-2" size={14} color={Theme.buttonPrimaryText} />
              <Text style={styles.broadcastBtnText}>Broadcast now</Text>
            </>
          )}
        </TouchableOpacity>
      ) : isListening ? (
        <View style={[styles.listeningFooter, compact && styles.listeningFooterCompact]}>
          <Feather name="lock" size={11} color={Theme.pulseIndigo} />
          <Text style={styles.listeningFooterText} numberOfLines={2}>
            Shared — editing locked while bids are open
          </Text>
        </View>
      ) : (
        <View style={[styles.lockedFooter, compact && styles.lockedFooterCompact]}>
          <Feather name="lock" size={11} color={Theme.textMuted} />
          <Text style={styles.lockedFooterText} numberOfLines={2}>
            Broadcast unavailable for current status
          </Text>
        </View>
      )}

      {broadcastError ? (
        <Text style={styles.errorText}>{broadcastError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: indentReviewHubText.sectionTitle,
  listeningChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  listeningDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  listeningChipText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.pulseIndigo,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeListening: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  countBadgeActive: {
    backgroundColor: "rgba(21,128,61,0.12)",
    borderWidth: 1,
    borderColor: "rgba(21,128,61,0.28)",
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  countBadgeTextListening: {
    color: Theme.pulseIndigo,
  },
  countBadgeTextActive: {
    color: Theme.positive,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
    gap: 10,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: { boxShadow: "0 2px 12px rgba(15,23,42,0.06)" } as object,
    }),
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    gap: 8,
    borderRadius: 12,
  },
  cardListening: {
    borderColor: "rgba(99,102,241,0.22)",
    backgroundColor: "rgba(99,102,241,0.03)",
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  liveBannerText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.pulseIndigo,
  },
  hero: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  heroCompact: {
    gap: 4,
  },
  lottieWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  lottieWrapCompact: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  title: {
    ...indentReviewHubText.partyTitle,
    fontSize: 12,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  body: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 9,
    lineHeight: 13,
    textAlign: "center",
    maxWidth: 280,
  },
  bodyCompact: {
    fontSize: 8,
    lineHeight: 12,
  },
  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 38,
    alignSelf: "stretch",
  },
  broadcastBtnCompact: {
    minHeight: 34,
    paddingVertical: 7,
  },
  broadcastBtnText: {
    ...indentReviewHubText.buttonLabel,
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.6,
  },
  listeningFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    alignSelf: "stretch",
  },
  listeningFooterCompact: {
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  listeningFooterText: {
    flex: 1,
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 12,
    color: Theme.pulseIndigo,
  },
  lockedFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignSelf: "stretch",
  },
  lockedFooterCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  lockedFooterText: {
    flex: 1,
    ...indentReviewHubText.bodyMuted,
    fontSize: 8,
  },
  errorText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.teslaRed,
    textAlign: "center",
  },
});
