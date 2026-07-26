import { Pressable, View, Text, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { NumericEntryPartyPreview } from "./NumericEntryPartyBanner";

export interface NumericEntryRecipientHeroProps {
  party: NumericEntryPartyPreview;
  /**
   * GPay-style line above the name (e.g. "Paying" → “Paying Rohit Kapoor”).
   * When set with `nameInline`, name is merged into one title line.
   */
  caption?: string;
  /** Merge caption + name into one title (“Paying {name}”). Default true when caption set. */
  nameInline?: boolean;
  /** Tighter block for allocation keypad steps above sticky footer. */
  compact?: boolean;
  /** Extra-dense for desktop popup sheets. */
  dense?: boolean;
  /** Tap recipient (e.g. change partner). */
  onPress?: () => void;
}

/**
 * Centered recipient block (Google Pay payout) above the amount field.
 */
export function NumericEntryRecipientHero({
  party,
  caption,
  nameInline = Boolean(caption),
  compact = false,
  dense = false,
  onPress,
}: NumericEntryRecipientHeroProps) {
  const avatarSize = dense ? 36 : compact ? 44 : 64;
  const title =
    caption && nameInline ? `${caption} ${party.name}`.trim() : party.name;

  const content = (
    <View
      style={[
        styles.root,
        compact && styles.rootCompact,
        dense && styles.rootDense,
      ]}
    >
      <PartyAvatar
        name={party.name}
        avatarUrl={party.avatarUrl ?? null}
        avatarSeed={party.avatarSeed ?? null}
        organizationImageUrl={party.organizationImageUrl ?? null}
        organizationAvatarSeed={party.organizationAvatarSeed ?? null}
        entityType={party.entityType ?? "client"}
        size={avatarSize}
        shape="circle"
      />
      {caption && !nameInline ? (
        <Text style={[styles.caption, dense && styles.captionDense]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.name,
            compact && styles.nameCompact,
            dense && styles.nameDense,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {onPress ? (
          <ChevronRight
            size={dense ? 14 : 16}
            color={Theme.textMuted}
            style={styles.chevron}
          />
        ) : null}
      </View>
      {party.subtitle ? (
        <Text
          style={[styles.subtitle, dense && styles.subtitleDense]}
          numberOfLines={2}
        >
          {party.subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change ${party.name}`}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    width: "100%",
  },
  rootCompact: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 4,
  },
  rootDense: {
    paddingTop: 2,
    paddingBottom: 0,
    paddingHorizontal: 16,
    gap: 3,
  },
  pressed: {
    opacity: 0.88,
  },
  caption: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  captionDense: {
    marginTop: 4,
    fontSize: 11,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    maxWidth: "100%",
    paddingHorizontal: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 18,
  },
  nameDense: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  chevron: {
    marginTop: 2,
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  subtitleDense: {
    fontSize: 11,
    lineHeight: 15,
    maxWidth: 280,
  },
});
