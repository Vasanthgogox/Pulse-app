/**
 * FeatureBanner — production-grade contextual banner.
 *
 * Layout (reference: HubSpot / Notion feature cards):
 *   ┌─────────────────────────────────────────────┐
 *   │  Title                         ┌──────────┐ │
 *   │  Description                   │  Illus.  │ │
 *   │                                └──────────┘ │
 *   │  ✓ Bullet one   ✓ Bullet two               │
 *   │  ✓ Bullet three ✓ Bullet four              │
 *   ├─────────────────────────────────────────────┤
 *   │  ·· CTA label ──────────────────────────·· │
 *   └─────────────────────────────────────────────┘
 *
 * Used as empty-state banners throughout the app:
 *   - Trips list (no trips yet)
 *   - Finance ledger (no transactions)
 *   - Network connections (no connections)
 *   - Trip expenses section
 *   - Drivers / vehicles zero-state
 */
import Theme from "@/constants/Theme";
import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface FeatureBannerBullet {
  label: string;
  done?: boolean;
}

export interface FeatureBannerProps {
  title: string;
  description?: string;
  /** Max 4 bullets rendered in a 2-column grid. */
  bullets?: FeatureBannerBullet[];
  /** Large emoji used as the illustration (e.g. "🚚", "📊", "🤝"). */
  illustration: string;
  /** Accent color for the illustration tile and CTA. Defaults to Theme.primary. */
  accentColor?: string;
  cta?: {
    label: string;
    onPress: () => void;
  };
  style?: StyleProp<ViewStyle>;
  /** Compact variant for tight spaces (e.g. trip detail sections). */
  compact?: boolean;
}

export const FeatureBanner = memo(function FeatureBanner({
  title,
  description,
  bullets = [],
  illustration,
  accentColor = Theme.primary,
  cta,
  style,
  compact = false,
}: FeatureBannerProps) {
  const hasBullets = bullets.length > 0;

  return (
    <View style={[s.card, compact && s.cardCompact, style]}>
      {/* ── Body ─────────────────────────────────────────────────────── */}
      <View style={[s.body, compact && s.bodyCompact]}>
        {/* Left: text content */}
        <View style={s.textCol}>
          <Text style={[s.title, compact && s.titleCompact]}>{title}</Text>
          {description ? (
            <Text style={[s.description, compact && s.descriptionCompact]}>
              {description}
            </Text>
          ) : null}

          {hasBullets ? (
            <View style={[s.bulletGrid, compact && s.bulletGridCompact]}>
              {bullets.slice(0, 4).map((b, i) => (
                <View key={i} style={s.bulletRow}>
                  <View
                    style={[
                      s.bulletCheck,
                      b.done === false
                        ? s.bulletCheckPending
                        : { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` },
                    ]}
                  >
                    <Text
                      style={[
                        s.bulletCheckMark,
                        b.done === false
                          ? { color: Theme.textMuted }
                          : { color: accentColor },
                      ]}
                    >
                      {b.done === false ? "·" : "✓"}
                    </Text>
                  </View>
                  <Text style={[s.bulletLabel, compact && s.bulletLabelCompact]}>
                    {b.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Right: illustration tile */}
        <View
          style={[
            s.illustrationTile,
            compact && s.illustrationTileCompact,
            { backgroundColor: `${accentColor}0d` },
          ]}
        >
          <Text
            style={[
              s.illustrationEmoji,
              compact && s.illustrationEmojiCompact,
            ]}
          >
            {illustration}
          </Text>
        </View>
      </View>

      {/* ── Footer CTA ───────────────────────────────────────────────── */}
      {cta ? (
        <>
          <View style={s.divider} />
          <Pressable
            onPress={cta.onPress}
            style={({ pressed }) => [s.ctaRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={cta.label}
          >
            <Text style={[s.ctaText, { color: accentColor }]}>{cta.label}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite ?? "#ffffff",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium ?? "#e5e7eb",
    overflow: "hidden",
  },
  cardCompact: {
    borderRadius: 13,
  },

  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
  },
  bodyCompact: {
    padding: 14,
    gap: 12,
  },

  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },

  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark ?? "#111827",
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  titleCompact: {
    fontSize: 14,
    lineHeight: 19,
  },

  description: {
    fontSize: 13,
    color: Theme.textSecondary ?? "#6b7280",
    lineHeight: 19,
    fontWeight: "500",
  },
  descriptionCompact: {
    fontSize: 12,
    lineHeight: 17,
  },

  bulletGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  bulletGridCompact: {
    gap: 5,
    marginTop: 1,
  },

  bulletRow: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  bulletCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bulletCheckPending: {
    backgroundColor: Theme.surfaceGray ?? "#f4f4f4",
    borderColor: Theme.borderLight ?? "#e5e7eb",
  },
  bulletCheckMark: {
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },
  bulletLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary ?? "#6b7280",
    flex: 1,
    flexShrink: 1,
    lineHeight: 16,
  },
  bulletLabelCompact: {
    fontSize: 11,
  },

  illustrationTile: {
    width: 80,
    height: 80,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "center",
  },
  illustrationTileCompact: {
    width: 58,
    height: 58,
    borderRadius: 14,
  },
  illustrationEmoji: {
    fontSize: 38,
    lineHeight: 46,
    textAlign: "center",
  },
  illustrationEmojiCompact: {
    fontSize: 28,
    lineHeight: 34,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight ?? "#e5e7eb",
    marginHorizontal: 0,
  },

  ctaRow: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
  },
});
