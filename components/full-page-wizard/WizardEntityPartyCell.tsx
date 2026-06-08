import { memo, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { PartyAvatar, type PartyEntityType } from "@/components/PartyAvatar";
import { fullPageWizardStyles as styles, WIZARD_PARTY_AVATAR_SIZE } from "./fullPageWizardStyles";

export type WizardEntityPartyCellProps = {
  label: string;
  name: string;
  subtitle?: string | null;
  entityType?: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarSize?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Optional custom avatar (e.g. Avatar party blob). */
  avatar?: ReactNode;
};

/** Compact party tile for side-by-side wizard context rows (Driver · Shipper). */
export const WizardEntityPartyCell = memo(function WizardEntityPartyCell({
  label,
  name,
  subtitle,
  entityType = "client",
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  avatarSize = WIZARD_PARTY_AVATAR_SIZE,
  onPress,
  style,
  avatar,
}: WizardEntityPartyCellProps) {
  const content = (
    <View style={[styles.partyCard, style]}>
      {avatar ?? (
        <PartyAvatar
          name={name}
          avatarUrl={avatarUrl ?? null}
          avatarSeed={avatarSeed ?? null}
          organizationImageUrl={organizationImageUrl ?? null}
          organizationAvatarSeed={organizationAvatarSeed ?? null}
          entityType={entityType}
          size={avatarSize}
          shape="rounded"
        />
      )}
      <View style={styles.partyTextWrap}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.partySubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1, minWidth: 0 }}>
        {content}
      </Pressable>
    );
  }
  return content;
});
