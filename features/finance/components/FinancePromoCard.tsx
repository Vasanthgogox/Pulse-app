/**
 * Finance empty-state / promo card (borderless, aligned with network grow banner).
 */
import Theme from "@/constants/Theme";
import { HubPromoHeroLottie } from "@/components/hub/HubPromoLottie";
import {
  FINANCE_PROMO_PRESETS,
  fitFinanceIllustration,
  type FinancePromoBullet,
  type FinancePromoVariant,
} from "@/lib/financePromoAssets";
import {
  resolveFinancePromoHeroLottie,
  resolveFinancePromoHeroVisualScale,
} from "@/lib/financePromoLottieAssets";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

/** Subtle, staggered float + breathe so the bullet glyphs feel alive without distraction. */
function AnimatedBulletIcon({
  bullet,
  size,
  index,
}: {
  bullet: FinancePromoBullet;
  size: number;
  index: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const { Icon } = bullet;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 160),
        Animated.timing(progress, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [index, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
      <Icon size={size} color={Theme.primary} strokeWidth={2.1} />
    </Animated.View>
  );
}

export type FinancePromoCardProps = {
  variant: FinancePromoVariant;
  title?: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** Vertical stack for kanban column pipes (desktop cash). */
  layout?: "row" | "column";
  style?: StyleProp<ViewStyle>;
};

export function FinancePromoCard({
  variant,
  title,
  description,
  ctaLabel,
  onCtaPress,
  layout = "row",
  style,
}: FinancePromoCardProps) {
  const { width } = useWindowDimensions();
  const preset = FINANCE_PROMO_PRESETS[variant];
  const heroLottie = resolveFinancePromoHeroLottie(variant);
  const heroRenderScale = resolveFinancePromoHeroVisualScale(variant);
  const isColumn = layout === "column";
  const garageVisualBoost = variant === "garage" ? 1.22 : 1;
  const illusBoxW = Math.round(
    (isColumn ? 96 : width < 400 ? 108 : 124) * garageVisualBoost,
  );
  const illusBoxH = Math.round(
    (isColumn ? 72 : width < 400 ? 88 : 100) * garageVisualBoost,
  );
  const illusSize = fitFinanceIllustration(illusBoxW, illusBoxH, preset.aspect);

  const resolvedTitle = title ?? preset.title;
  const resolvedDescription = description ?? preset.description;
  const resolvedCta = ctaLabel ?? preset.ctaLabel;
  const showCta = Boolean(onCtaPress && resolvedCta);

  return (
    <View style={[styles.card, isColumn && styles.cardColumn, style]}>
      <View style={[styles.cardBody, isColumn && styles.cardBodyColumn]}>
        <View style={styles.textCol}>
          <Text style={[styles.title, isColumn && styles.titleColumn]}>
            {resolvedTitle}
          </Text>
          <Text style={[styles.description, isColumn && styles.descriptionColumn]}>
            {resolvedDescription}
          </Text>
          <View style={[styles.bulletGrid, isColumn && styles.bulletGridColumn]}>
            {preset.bullets.map((bullet, index) => (
              <View
                key={bullet.label}
                style={[styles.bulletRow, isColumn && styles.bulletRowColumn]}
              >
                <View style={[styles.bulletIconWrap, { backgroundColor: bullet.tint }]}>
                  <AnimatedBulletIcon
                    bullet={bullet}
                    size={isColumn ? 12 : 14}
                    index={index}
                  />
                </View>
                <Text style={[styles.bulletLabel, isColumn && styles.bulletLabelColumn]}>
                  {bullet.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.illusWrap, isColumn && styles.illusWrapColumn]}>
          <HubPromoHeroLottie
            source={heroLottie}
            width={illusSize.width}
            height={illusSize.height}
            renderScale={heroRenderScale}
          />
        </View>
      </View>
      {showCta ? (
        <>
          <View style={styles.divider} />
          <Pressable
            onPress={onCtaPress}
            style={({ pressed }) => [styles.ctaRow, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel={resolvedCta}
          >
            <Text style={styles.ctaText}>{resolvedCta}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  cardColumn: {
    backgroundColor: "transparent",
    borderRadius: 10,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 132,
  },
  cardBodyColumn: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 0,
    gap: 10,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  titleColumn: {
    fontSize: 13,
    lineHeight: 18,
  },
  description: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  descriptionColumn: {
    fontSize: 11,
    lineHeight: 16,
  },
  bulletGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  bulletGridColumn: {
    gap: 6,
    marginTop: 2,
  },
  bulletRow: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  bulletRowColumn: {
    width: "100%",
    gap: 6,
  },
  bulletIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bulletLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 15,
    letterSpacing: -0.1,
  },
  bulletLabelColumn: {
    fontSize: 10,
    lineHeight: 14,
  },
  illusWrap: {
    width: 112,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "visible",
  },
  illusWrapColumn: {
    width: "100%",
    height: 76,
    alignSelf: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  ctaRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ctaPressed: {
    backgroundColor: "rgba(79, 70, 229, 0.04)",
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
});
