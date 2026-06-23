/**
 * Load Center — full-page empty state when no integrated supplier/client.
 * Borderless white canvas; hero illustration top-right; copy left-aligned.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  fitLoadCenterIntegratedPartiesIllustration,
  LOAD_CENTER_INTEGRATED_PARTIES_PROMO,
  type LoadCenterIntegratedPartyMode,
} from "@/lib/loadCenterIntegratedPartiesPromoAssets";
import { ArrowUpRight } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type LoadCenterIntegratedPartiesBannerProps = {
  mode: LoadCenterIntegratedPartyMode;
  onExploreNetwork: () => void;
  style?: StyleProp<ViewStyle>;
};

const DESKTOP_BREAKPOINT = 768;

export function LoadCenterIntegratedPartiesBanner({
  mode,
  onExploreNetwork,
  style,
}: LoadCenterIntegratedPartiesBannerProps) {
  const { width } = useWindowDimensions();
  const preset = LOAD_CENTER_INTEGRATED_PARTIES_PROMO[mode];
  const Illustration = preset.illustration;
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;

  const illusBoxW = isDesktop
    ? Math.min(280, Math.round(width * 0.3))
    : compact
      ? 112
      : 156;
  const illusBoxH = isDesktop
    ? Math.min(240, Math.round(width * 0.26))
    : compact
      ? 96
      : 132;
  const illusSize = fitLoadCenterIntegratedPartiesIllustration(
    illusBoxW,
    illusBoxH,
    preset.aspect,
  );
  const featureIconSize = isDesktop ? 14 : compact ? 11 : 12;

  return (
    <View style={[styles.shell, style]}>
      <View
        style={[
          styles.heroRow,
          compact && styles.heroRowCompact,
          isDesktop && styles.heroRowDesktop,
        ]}
      >
        <View style={[styles.copyCol, compact && styles.copyColCompact]}>
          <Text style={[styles.chip, { color: preset.chipColor }]}>
            {preset.chip}
          </Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            {preset.title}
          </Text>
          <Text
            style={[styles.description, compact && styles.descriptionCompact]}
          >
            {preset.description}
          </Text>

          <View style={[styles.bulletGrid, compact && styles.bulletGridCompact]}>
            {preset.bullets.map(({ label, Icon, tint }) => (
              <View
                key={label}
                style={[styles.bulletRow, compact && styles.bulletRowCompact]}
              >
                <View style={[styles.bulletIconWrap, { backgroundColor: tint }]}>
                  <Icon
                    size={featureIconSize}
                    color={preset.chipColor}
                    strokeWidth={2.1}
                  />
                </View>
                <Text
                  style={[styles.bulletLabel, compact && styles.bulletLabelCompact]}
                  numberOfLines={2}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={onExploreNetwork}
            style={({ pressed }) => [
              styles.ctaRow,
              pressed && styles.ctaPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${preset.ctaLabel} — send invites and grow on Pulse Network`}
          >
            <Text style={[styles.ctaText, { color: preset.chipColor }]}>
              {preset.ctaLabel}
            </Text>
            <ArrowUpRight
              size={compact ? 14 : 15}
              color={preset.chipColor}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.heroWrap,
            compact && styles.heroWrapCompact,
            isDesktop && styles.heroWrapDesktop,
          ]}
        >
          <Illustration width={illusSize.width} height={illusSize.height} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    flexGrow: 1,
    backgroundColor: Theme.cardWhite,
  },
  heroRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
    paddingBottom: 28,
    minHeight: 320,
  },
  heroRowCompact: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 10,
    minHeight: 0,
  },
  heroRowDesktop: {
    maxWidth: 820,
    alignSelf: "center",
    width: "100%",
    paddingTop: 32,
    paddingBottom: 36,
    minHeight: 380,
  },
  copyCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    paddingTop: 2,
    alignItems: "flex-start",
  },
  copyColCompact: {
    gap: 6,
    paddingTop: 0,
  },
  chip: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    lineHeight: 21,
    textAlign: "left",
  },
  titleCompact: {
    fontSize: 14,
    lineHeight: 18,
  },
  description: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 18,
    textAlign: "left",
    maxWidth: 440,
  },
  descriptionCompact: {
    fontSize: 11,
    lineHeight: 16,
    maxWidth: "100%",
  },
  bulletGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    maxWidth: 400,
  },
  bulletGridCompact: {
    gap: 6,
    marginTop: 4,
    maxWidth: "100%",
  },
  bulletRow: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(148, 163, 184, 0.07)",
  },
  bulletRowCompact: {
    width: "100%",
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  bulletIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bulletLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
    letterSpacing: -0.05,
    textAlign: "left",
  },
  bulletLabelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 4,
    paddingRight: 4,
    alignSelf: "flex-start",
  },
  ctaPressed: {
    opacity: 0.75,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
  heroWrap: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    paddingTop: 0,
    marginTop: -4,
    marginRight: 0,
    overflow: "visible",
  },
  heroWrapCompact: {
    marginTop: 0,
    paddingTop: 2,
  },
  heroWrapDesktop: {
    marginTop: -12,
    minWidth: 220,
    minHeight: 200,
    alignItems: "center",
    justifyContent: "flex-start",
  },
});
