/**
 * Finance empty-state / promo card (borderless, aligned with network grow banner).
 */
import Theme from "@/constants/Theme";
import { PartyAddChip, type PartyAddChipIcon } from "@/components/PartyAddChip";
import {
  FINANCE_PROMO_PRESETS,
  type FinancePromoBullet,
  type FinancePromoVariant,
} from "@/lib/financePromoAssets";
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

const PROMO_PARTY_ICON: Partial<Record<FinancePromoVariant, PartyAddChipIcon>> = {
  customers: "building",
  suppliers: "warehouse",
  drivers: "user",
  garage: "truck",
  ledger: "receipt-text",
};

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
  const isDesktop = width >= 768;
  const preset = FINANCE_PROMO_PRESETS[variant];
  const isColumn = layout === "column";

  const resolvedTitle = title ?? preset.title;
  const resolvedDescription = description ?? preset.description;
  const resolvedCta = ctaLabel ?? preset.ctaLabel;
  const showCta = Boolean(onCtaPress && resolvedCta);
  const showHeroTextAction = showCta && Boolean(resolvedCta);

  return (
    <View style={[styles.card, isColumn && styles.cardColumn, style]}>
      <View
        style={[
          styles.cardBody,
          isColumn && (isDesktop ? styles.cardBodyColumnDesktop : styles.cardBodyColumn),
        ]}
      >
        <View style={styles.textCol}>
          <Text style={[styles.title, isColumn && !isDesktop && styles.titleColumn]}>
            {resolvedTitle}
          </Text>
          <Text style={[styles.description, isColumn && !isDesktop && styles.descriptionColumn]}>
            {resolvedDescription}
          </Text>
          <View style={[styles.bulletGrid, isColumn && !isDesktop && styles.bulletGridColumn]}>
            {preset.bullets.map((bullet, index) => (
              <View
                key={bullet.label}
                style={[styles.bulletRow, isColumn && !isDesktop && styles.bulletRowColumn]}
              >
                <View style={[styles.bulletIconWrap, { backgroundColor: bullet.tint }]}>
                  <AnimatedBulletIcon
                    bullet={bullet}
                    size={isColumn && !isDesktop ? 11 : 12}
                    index={index}
                  />
                </View>
                <Text style={[styles.bulletLabel, isColumn && !isDesktop && styles.bulletLabelColumn]}>
                  {bullet.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {showHeroTextAction ? (
          <View
            style={[
              styles.heroTextAction,
              isColumn && !isDesktop && styles.heroTextActionColumn,
              isDesktop && styles.heroTextActionDesktop,
              !isDesktop && !isColumn && styles.heroTextActionMobile,
            ]}
          >
            <PartyAddChip
              label={resolvedCta ?? ""}
              icon={PROMO_PARTY_ICON[variant]}
              onPress={onCtaPress}
              accessibilityLabel={resolvedCta}
              expandOnHover
              collapsedGlyph="icon"
              align={isColumn && !isDesktop ? "start" : "end"}
            />
          </View>
        ) : null}
      </View>
      {showCta && !showHeroTextAction ? (
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
    overflow: "visible",
  },
  cardColumn: {
    backgroundColor: "transparent",
    borderRadius: 10,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
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
  cardBodyColumnDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 14,
    minHeight: 0,
    gap: 20,
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
    gap: 7,
    minWidth: 0,
  },
  bulletRowColumn: {
    width: "100%",
    gap: 6,
  },
  bulletIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bulletLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 13,
    letterSpacing: -0.1,
  },
  bulletLabelColumn: {
    fontSize: 9,
    lineHeight: 12,
  },
  heroTextAction: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
    paddingLeft: 12,
  },
  heroTextActionDesktop: {
    paddingLeft: 20,
    alignSelf: "center",
    justifyContent: "center",
  },
  heroTextActionColumn: {
    alignItems: "flex-start",
    paddingLeft: 0,
    paddingTop: 8,
    alignSelf: "stretch",
  },
  heroTextActionMobile: {
    alignItems: "flex-end",
    alignSelf: "center",
    paddingLeft: 8,
    paddingTop: 0,
    flexShrink: 0,
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
