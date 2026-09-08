import { memo, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronRight, RefreshCw } from "lucide-react-native";

import { PartyAvatar, type PartyEntityType } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
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
  /** Show trailing affordance when pressable (default true). */
  showChevron?: boolean;
  /**
   * `change` = refresh icon (e.g. change partner on Rates).
   * `chevron` = default drill-in.
   */
  changeAffordance?: "chevron" | "change";
  /** Optional custom avatar (e.g. Avatar party blob). */
  avatar?: ReactNode;
  /** Dense chrome for allocation steps (driver name, load, …). */
  compact?: boolean;
  /** Fill parent width when rendered alone (not in a row). */
  solo?: boolean;
  /** Horizontal scroll strip — content-sized tiny chip. */
  strip?: boolean;
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
  showChevron = true,
  changeAffordance = "chevron",
  avatar,
  compact = false,
  solo = false,
  strip = false,
}: WizardEntityPartyCellProps) {
  const dense = compact || strip;
  const resolvedAvatarSize = strip
    ? Math.min(avatarSize, 18)
    : dense
      ? Math.min(avatarSize, 22)
      : avatarSize;
  const content = (
    <View
      style={[
        styles.partyCardFlat,
        dense && styles.partyCardFlatCompact,
        strip && styles.partyCardFlatStrip,
        solo && styles.partyCardFlatSolo,
        onPress && styles.partyCardPressable,
        style,
      ]}
    >
      {avatar ?? (
        <PartyAvatar
          name={name}
          avatarUrl={avatarUrl ?? null}
          avatarSeed={avatarSeed ?? null}
          organizationImageUrl={organizationImageUrl ?? null}
          organizationAvatarSeed={organizationAvatarSeed ?? null}
          entityType={entityType}
          size={resolvedAvatarSize}
          shape="rounded"
        />
      )}
      <View
        style={[
          styles.partyTextWrap,
          strip && styles.partyTextWrapStrip,
        ]}
      >
        <Text
          style={[
            styles.partyLabel,
            dense && styles.partyLabelCompact,
            strip && styles.partyLabelStrip,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.partyName,
            dense && styles.partyNameCompact,
            strip && styles.partyNameStrip,
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {subtitle && !dense ? (
          <Text style={styles.partySubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress && showChevron ? (
        changeAffordance === "change" ? (
          <RefreshCw
            size={strip ? 11 : dense ? 13 : 15}
            color={Theme.textMuted}
            strokeWidth={2.2}
            style={styles.partyChangeIcon}
          />
        ) : (
          <ChevronRight
            size={strip ? 11 : dense ? 12 : 14}
            color={Theme.textMuted}
            style={styles.partyChangeIcon}
          />
        )
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.partyCardPressableHit,
          solo && styles.partyCardFlatSolo,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Change ${label.toLowerCase()}`}
      >
        {content}
      </Pressable>
    );
  }
  return content;
});
