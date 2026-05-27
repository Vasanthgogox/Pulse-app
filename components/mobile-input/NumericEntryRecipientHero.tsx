import { View, Text, StyleSheet } from "react-native";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { NumericEntryPartyPreview } from "./NumericEntryPartyBanner";

export interface NumericEntryRecipientHeroProps {
  party: NumericEntryPartyPreview;
  /** e.g. "Client sale price" — shown above the party name */
  caption?: string;
}

/**
 * Centered recipient block (GPay-style) above the amount field.
 */
export function NumericEntryRecipientHero({
  party,
  caption,
}: NumericEntryRecipientHeroProps) {
  return (
    <View style={styles.root}>
      <PartyAvatar
        name={party.name}
        avatarUrl={party.avatarUrl ?? null}
        avatarSeed={party.avatarSeed ?? null}
        organizationImageUrl={party.organizationImageUrl ?? null}
        organizationAvatarSeed={party.organizationAvatarSeed ?? null}
        entityType={party.entityType ?? "client"}
        size={56}
      />
      {caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
      <Text style={styles.name} numberOfLines={2}>
        {party.name}
      </Text>
      {party.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {party.subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  caption: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
});
