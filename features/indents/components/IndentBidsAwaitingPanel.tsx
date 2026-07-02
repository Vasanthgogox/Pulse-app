import { LoadingIndicator } from "@/components/LoadingIndicator";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  IndentHubAuctionGlyph,
  IndentHubLivePulseDot,
  IndentHubTrophyGlyph,
} from "@/features/indents/components/IndentHubAnimatedGlyphs";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GIVE_LOAD_LOTTIE = require("@/assets/Animated folder/signals.json");

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;
const SKY_TRAY = Theme.loadStatusTabTrayBg;

export type IndentBidsAwaitingPanelProps = {
  compact?: boolean;
  /** Fill split-pane column height on desktop review hub. */
  paneFill?: boolean;
  /** Stacked below summary on narrow viewports — natural height, no pane fill. */
  stacked?: boolean;
  canBroadcast: boolean;
  isListening: boolean;
  isBroadcasting?: boolean;
  sharingDraft?: boolean;
  sharingStory?: boolean;
  broadcastError?: string | null;
  onBroadcast?: () => void;
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
};

const LISTENING_TIPS = [
  "Partners see your route, vehicle type, and target rate.",
  "Pulse story puts your load in front of your network for 24 hours.",
  "WhatsApp shares a one-tap bid link with your contacts.",
] as const;

function PulseRings({ size }: { size: number }) {
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2200,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
    const a = mk(ringA, 0);
    const b = mk(ringB, 700);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ringA, ringB]);

  const ringStyle = (v: Animated.Value) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1.5,
    borderColor: SKY,
    opacity: v.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0.55, 0.35, 0],
    }),
    transform: [
      {
        scale: v.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1.35],
        }),
      },
    ],
  });

  return (
    <>
      <Animated.View style={ringStyle(ringA)} />
      <Animated.View style={ringStyle(ringB)} />
    </>
  );
}

function BidLifecycleStrip({
  canBroadcast,
  isListening,
  compact,
}: {
  canBroadcast: boolean;
  isListening: boolean;
  compact?: boolean;
}) {
  const steps = canBroadcast
    ? (["Ready", "Go live", "Collect bids"] as const)
    : (["Posted", "Listening", "Award"] as const);
  const activeIndex = canBroadcast ? 0 : isListening ? 1 : 0;

  return (
    <View style={[styles.lifecycleStrip, compact && styles.lifecycleStripCompact]}>
      {steps.map((label, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <View key={label} style={styles.lifecycleRowItem}>
            {index > 0 ? (
              <View
                style={[
                  styles.lifecycleConnector,
                  (done || active) && styles.lifecycleConnectorActive,
                ]}
              />
            ) : null}
            <View style={styles.lifecycleStep}>
              <View
                style={[
                  styles.lifecycleDot,
                  done && styles.lifecycleDotDone,
                  active && styles.lifecycleDotActive,
                ]}
              >
                {done ? (
                  <Feather name="check" size={8} color={Theme.textOnPrimary} />
                ) : active ? (
                  <View style={styles.lifecycleDotPulse} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.lifecycleLabel,
                  active && styles.lifecycleLabelActive,
                  done && styles.lifecycleLabelDone,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ListeningTipsCarousel({ compact }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (!finished) return;
        setIndex((i) => (i + 1) % LISTENING_TIPS.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      });
    }, 4200);
    return () => clearInterval(id);
  }, [fade]);

  return (
    <Animated.View
      style={[styles.tipsCard, compact && styles.tipsCardCompact, { opacity: fade }]}
    >
      <Feather name="info" size={11} color={INK} />
      <Text style={styles.tipsText} numberOfLines={2}>
        {LISTENING_TIPS[index]}
      </Text>
    </Animated.View>
  );
}

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

function ShareActionTile({
  label,
  hint,
  icon,
  gradientColors,
  borderColor,
  onPress,
  disabled,
  loading,
  compact,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  gradientColors: readonly [string, string];
  borderColor: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      style={({ pressed }) => [
        styles.shareTile,
        pressed && styles.shareTilePressed,
        (disabled || !onPress) && styles.shareTileDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.shareTileGradient,
          compact && styles.shareTileGradientCompact,
          { borderColor },
        ]}
      >
        <View style={[styles.shareTileIconHalo, compact && styles.shareTileIconHaloCompact]}>
          {loading ? (
            <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
          ) : (
            icon
          )}
        </View>
        <View style={styles.shareTileCopy}>
          <Text
            style={[styles.shareTileLabel, compact && styles.shareTileLabelCompact]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={[styles.shareTileHint, compact && styles.shareTileHintCompact]}
            numberOfLines={2}
          >
            {hint}
          </Text>
        </View>
        <Feather name="chevron-right" size={14} color={MUTED} />
      </LinearGradient>
    </Pressable>
  );
}

function ShareDock({
  compact,
  stacked,
  onShareStory,
  onShareWhatsApp,
  sharingStory,
}: {
  compact?: boolean;
  stacked?: boolean;
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
  sharingStory?: boolean;
}) {
  const hasStory = Boolean(onShareStory);
  const hasWhatsApp = Boolean(onShareWhatsApp);
  if (!hasStory && !hasWhatsApp) return null;

  return (
    <View
      style={[
        styles.shareDock,
        compact && styles.shareDockCompact,
        stacked && styles.shareDockStacked,
        !stacked && styles.shareDockCentered,
      ]}
    >
      {stacked ? (
        <Text style={[styles.shareDockKicker, styles.shareDockKickerStacked]}>
          Spread reach
        </Text>
      ) : (
        <View style={styles.shareDockDividerRow}>
          <View style={styles.shareDockLine} />
          <Text style={styles.shareDockKicker}>Spread reach</Text>
          <View style={styles.shareDockLine} />
        </View>
      )}

      <View style={[styles.shareTileRow, compact && styles.shareTileRowCompact]}>
        {hasStory ? (
          <ShareActionTile
            label="Pulse story"
            hint="24h network post"
            gradientColors={["rgba(205,233,247,0.55)", "rgba(255,255,255,0.95)"]}
            borderColor="rgba(77,54,54,0.12)"
            icon={<Feather name="zap" size={compact ? 15 : 17} color={INK} />}
            onPress={onShareStory}
            loading={sharingStory}
            disabled={sharingStory}
            compact={compact}
          />
        ) : null}
        {hasWhatsApp ? (
          <ShareActionTile
            label="WhatsApp"
            hint="Route & bid link"
            gradientColors={["rgba(37,211,102,0.14)", "rgba(255,255,255,0.96)"]}
            borderColor="rgba(37,211,102,0.22)"
            icon={
              <FontAwesome
                name="whatsapp"
                size={compact ? 16 : 18}
                color="#128C7E"
              />
            }
            onPress={onShareWhatsApp}
            compact={compact}
          />
        ) : null}
      </View>

      <View style={styles.shareLockPill}>
        <Feather name="lock" size={10} color={MUTED} />
        <Text style={styles.shareLockPillText}>Editing locked while bids are open</Text>
      </View>
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
        <IndentHubTrophyGlyph size={18} />
      ) : isListening && count === 0 ? (
        <View style={styles.listeningChip}>
          <IndentHubLivePulseDot />
          <Text style={styles.listeningChipText}>LIVE</Text>
        </View>
      ) : count > 0 ? (
        <IndentHubAuctionGlyph size={18} />
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
  paneFill = false,
  stacked = false,
  canBroadcast,
  isListening,
  isBroadcasting = false,
  sharingDraft = false,
  sharingStory = false,
  broadcastError,
  onBroadcast,
  onShareStory,
  onShareWhatsApp,
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

  const showLiveKicker = isListening;
  const showShareActions = isListening && (onShareStory || onShareWhatsApp);

  const lottieSize = paneFill
    ? compact
      ? 80
      : 96
    : stacked
      ? compact
        ? 60
        : 72
      : compact
        ? 72
        : 88;
  const lottieRenderScale = paneFill ? 2.4 : stacked ? 2 : 2.2;
  const lottieStageSize = paneFill ? (compact ? 136 : 156) : undefined;

  const inner = (
    <View
      style={[
        styles.contentStack,
        paneFill && styles.contentStackPaneFill,
        stacked && styles.contentStackStacked,
      ]}
    >
      <View
        style={[
          styles.contentColumn,
          compact && styles.contentColumnCompact,
          stacked && styles.contentColumnStacked,
          paneFill && !stacked && styles.contentColumnPane,
        ]}
      >
      <BidLifecycleStrip
        canBroadcast={canBroadcast}
        isListening={isListening}
        compact={compact || stacked}
      />

      {showLiveKicker ? (
        <View style={[styles.liveBanner, stacked && styles.liveBannerStacked]}>
          <View style={styles.livePulseDot} />
          <View style={styles.liveBannerIcon}>
            <Feather name="radio" size={10} color={INK} />
          </View>
          <Text style={styles.liveBannerText}>On Pulse network</Text>
          <ListeningDots />
        </View>
      ) : null}

      <View
        style={[
          styles.hero,
          compact && styles.heroCompact,
          stacked && styles.heroStacked,
        ]}
      >
        <View
          style={[
            styles.lottieStage,
            compact && styles.lottieStageCompact,
            stacked && styles.lottieStageStacked,
            stacked && compact && styles.lottieStageStackedCompact,
            paneFill && styles.lottieStagePane,
            paneFill && compact && styles.lottieStagePaneCompact,
            lottieStageSize != null && {
              width: lottieStageSize,
              height: lottieStageSize,
            },
          ]}
        >
          {isListening ? <PulseRings size={lottieStageSize ?? 112} /> : null}
          <LinearGradient
            colors={["#F8FCFF", "#EAF6FD"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[
              styles.lottieWrap,
              compact && styles.lottieWrapCompact,
              stacked && styles.lottieWrapStacked,
              stacked && compact && styles.lottieWrapStackedCompact,
            ]}
          >
            <TinyEmptyLottie
              source={GIVE_LOAD_LOTTIE}
              size={lottieSize}
              speed={0.88}
              renderScale={lottieRenderScale}
            />
          </LinearGradient>
        </View>

        <View style={[styles.heroCopy, stacked && styles.heroCopyStacked]}>
          <Text
            style={[
              styles.title,
              compact && styles.titleCompact,
              stacked && styles.titleStacked,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.body,
              compact && styles.bodyCompact,
              stacked && styles.bodyStacked,
            ]}
            numberOfLines={stacked ? 2 : 3}
          >
            {body}
          </Text>
        </View>
      </View>

      {isListening && paneFill && !stacked ? (
        <ListeningTipsCarousel compact={compact} />
      ) : null}

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
      ) : showShareActions ? (
        <ShareDock
          compact={compact}
          stacked={stacked}
          onShareStory={onShareStory}
          onShareWhatsApp={onShareWhatsApp}
          sharingStory={sharingStory}
        />
      ) : isListening ? (
        <View style={[styles.listeningFooter, compact && styles.listeningFooterCompact]}>
          <Feather name="lock" size={11} color={INK} />
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
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        paneFill && styles.cardPaneFill,
        paneFill && isListening && styles.cardPaneFillListening,
        stacked && styles.cardStacked,
        stacked && compact && styles.cardStackedCompact,
        isListening && styles.cardListening,
      ]}
    >
      {isListening ? (
        <>
          <LinearGradient
            colors={["rgba(205,233,247,0.42)", "rgba(255,255,255,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardGlow}
            pointerEvents="none"
          />
          <View style={styles.cardOrbTop} pointerEvents="none" />
          <View style={styles.cardOrbBottom} pointerEvents="none" />
        </>
      ) : null}
      {inner}
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
    backgroundColor: SKY_TRAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  listeningChipText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: INK,
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
    backgroundColor: SKY_TRAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
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
    color: INK,
  },
  countBadgeTextActive: {
    color: Theme.positive,
  },
  card: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
    gap: 0,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 6px 24px rgba(15,23,42,0.06)" } as object,
    }),
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    gap: 8,
    borderRadius: 12,
  },
  cardPaneFill: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 0,
    marginTop: 0,
    flex: 1,
    minHeight: 320,
    borderRadius: 20,
    paddingVertical: 20,
  },
  cardPaneFillListening: {
    paddingTop: 14,
    paddingBottom: 12,
  },
  cardStacked: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  cardStackedCompact: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  cardListening: {
    borderColor: Theme.loadStatusTabTrayBorder,
    backgroundColor: Theme.cardWhite,
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  cardOrbTop: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: SKY,
    opacity: 0.35,
  },
  cardOrbBottom: {
    position: "absolute",
    bottom: -50,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Theme.pulseIndigoWash,
    opacity: 0.5,
  },
  contentStack: {
    width: "100%",
    alignItems: "center",
    zIndex: 1,
  },
  contentStackPaneFill: {
    width: "100%",
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  contentStackStacked: {
    alignItems: "stretch",
  },
  contentColumn: {
    width: "100%",
    maxWidth: 340,
    alignItems: "stretch",
    gap: 14,
  },
  contentColumnCompact: {
    gap: 12,
  },
  contentColumnStacked: {
    maxWidth: undefined,
    gap: 12,
  },
  contentColumnPane: {
    alignSelf: "center",
    maxWidth: 440,
    gap: 16,
  },
  lifecycleStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  lifecycleStripCompact: {
    marginBottom: 0,
  },
  lifecycleRowItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  lifecycleStep: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  lifecycleConnector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.borderLight,
    marginTop: 9,
    minWidth: 8,
  },
  lifecycleConnectorActive: {
    backgroundColor: SKY,
  },
  lifecycleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  lifecycleDotDone: {
    backgroundColor: Theme.positive,
    borderColor: Theme.positive,
  },
  lifecycleDotActive: {
    borderColor: INK,
    backgroundColor: SKY,
  },
  lifecycleDotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  lifecycleLabel: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  lifecycleLabelActive: {
    color: INK,
    fontWeight: "800",
  },
  lifecycleLabelDone: {
    color: Theme.positive,
  },
  tipsCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(205,233,247,0.35)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  tipsCardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tipsText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    color: MUTED,
  },
  lottieStagePane: {
    width: 156,
    height: 156,
  },
  lottieStagePaneCompact: {
    width: 136,
    height: 136,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  liveBannerStacked: {
    alignSelf: "flex-start",
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  liveBannerIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SKY,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBannerText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: INK,
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
    backgroundColor: INK,
  },
  hero: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  heroCompact: {
    gap: 10,
  },
  heroStacked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroCopy: {
    width: "100%",
    alignItems: "center",
    gap: 5,
    alignSelf: "stretch",
  },
  heroCopyStacked: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    maxWidth: undefined,
    paddingHorizontal: 0,
    gap: 4,
  },
  lottieStage: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  lottieStageCompact: {
    width: 96,
    height: 96,
  },
  lottieStageStacked: {
    width: 88,
    height: 88,
    flexShrink: 0,
  },
  lottieStageStackedCompact: {
    width: 76,
    height: 76,
  },
  lottieWrap: {
    width: 104,
    height: 104,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  lottieWrapCompact: {
    width: 88,
    height: 88,
    borderRadius: 22,
  },
  lottieWrapStacked: {
    width: 76,
    height: 76,
    borderRadius: 20,
  },
  lottieWrapStackedCompact: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  title: {
    ...indentReviewHubText.partyTitle,
    fontSize: 13,
    width: "100%",
    textAlign: "center",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  titleCompact: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  titleStacked: {
    textAlign: "left",
    fontSize: 12,
    letterSpacing: 0.45,
  },
  body: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 11,
    lineHeight: 16,
    width: "100%",
    textAlign: "center",
    color: MUTED,
  },
  bodyCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
  bodyStacked: {
    textAlign: "left",
    fontSize: 10,
    lineHeight: 14,
  },
  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 40,
    minWidth: 200,
    maxWidth: 260,
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
  shareDock: {
    width: "100%",
    gap: 10,
    marginTop: 2,
    alignSelf: "stretch",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  shareDockCompact: {
    gap: 8,
    paddingTop: 10,
  },
  shareDockStacked: {
    paddingTop: 10,
    gap: 8,
  },
  shareDockCentered: {
    alignItems: "stretch",
  },
  shareDockDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  shareDockLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
  },
  shareDockKicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  shareDockKickerStacked: {
    alignSelf: "flex-start",
  },
  shareTileRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  shareTileRowCompact: {
    gap: 6,
  },
  shareTile: {
    flex: 1,
    minWidth: 0,
  },
  shareTilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  shareTileDisabled: {
    opacity: 0.55,
  },
  shareTileGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    minHeight: 68,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 8px rgba(15,23,42,0.04)" } as object,
    }),
  },
  shareTileGradientCompact: {
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 7,
    borderRadius: 12,
  },
  shareTileIconHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(77,54,54,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  shareTileIconHaloCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  shareTileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  shareTileLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    textAlign: "left",
  },
  shareTileLabelCompact: {
    fontSize: 11,
  },
  shareTileHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    textAlign: "left",
  },
  shareTileHintCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  shareLockPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  shareLockPillText: {
    fontSize: 9,
    fontWeight: "600",
    color: MUTED,
    lineHeight: 12,
    textAlign: "center",
    flexShrink: 1,
  },
  listeningFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SKY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    width: "100%",
    maxWidth: 280,
  },
  listeningFooterCompact: {
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  listeningFooterText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 13,
    color: INK,
    textAlign: "left",
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
