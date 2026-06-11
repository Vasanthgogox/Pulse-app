/**
 * Invitation-style profile hero — decorative cover, centered avatar, meta chips.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { PartyEntityAvatarGlow } from "@/components/PartyEntityAvatarGlow";
import Theme from "@/constants/Theme";
import { networkProfileInviteStyles as s } from "@/features/network/components/networkProfileInvite.styles";
import { publicProfileInviteCompact as compactS } from "@/features/party/components/publicProfileMobile.styles";
import {
  partyAccentFromConnectionRole,
  type PartyRoleLabel,
} from "@/lib/partyEntityAccent";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { MapPin, Phone, Verified } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

export type NetworkProfileInviteHeroProps = {
  name: string;
  subtitle: string;
  roleLabel: PartyRoleLabel;
  linkLabel: string;
  linkLive?: boolean;
  ratingDisplay: string;
  ratingEmpty?: boolean;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  showVerified?: boolean;
  metaChips?: { label: string }[];
  phone?: string | null;
  onPressPhone?: () => void;
  avatarSize?: number;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  /** Narrow phones — tighter cover, type, and stat band. */
  compact?: boolean;
};

function roleToEntityType(role: PartyRoleLabel): PartyEntityType {
  if (role === "DRIVER") return "driver";
  if (role === "SUPPLIER") return "supplier";
  return "client";
}

export function NetworkProfileInviteHero({
  name,
  subtitle,
  roleLabel,
  linkLabel,
  linkLive = false,
  ratingDisplay,
  ratingEmpty = false,
  entityType,
  avatarUrl,
  avatarSeed,
  showVerified = false,
  metaChips,
  phone,
  onPressPhone,
  avatarSize = 80,
  style,
  footer,
  compact = false,
}: NetworkProfileInviteHeroProps) {
  const accent = partyAccentFromConnectionRole(roleLabel);
  const resolvedEntity = entityType ?? roleToEntityType(roleLabel);
  const resolvedAvatarSize = compact ? Math.min(avatarSize, 68) : avatarSize;
  const chips =
    metaChips ??
    (subtitle.trim().length > 0
      ? [{ label: subtitle }]
      : []);

  return (
    <View style={[s.card, compact && compactS.card, style]}>
      <View style={[s.inviteCover, compact && compactS.inviteCover]}>
        <View style={s.coverOrbLarge} />
        <View style={s.coverOrbSmall} />
        <View style={s.coverPlane} />
        <View
          style={[
            s.coverRatingNode,
            ratingEmpty && s.coverRatingNodeEmpty,
          ]}
        >
          <Text
            style={[
              s.coverRatingText,
              ratingEmpty && s.coverRatingTextEmpty,
            ]}
          >
            {ratingDisplay}
          </Text>
        </View>
        <View style={s.cardHeader}>
          <View style={s.roleBadge}>
            <Text style={[s.roleBadgeText, compact && compactS.roleBadgeText]}>
              ROLE {roleLabel}
            </Text>
          </View>
          <View style={[s.statusPill, linkLive && s.statusPillLive]}>
            <Text style={[s.statusPillText, compact && compactS.statusPillText]}>
              {linkLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={[s.inviteBody, compact && compactS.inviteBody]}>
        <View style={[s.avatarLift, compact && compactS.avatarLift, { position: "relative" }]}>
          <PartyEntityAvatarGlow accent={accent} size={resolvedAvatarSize}>
            <PartyAvatar
              name={name}
              avatarUrl={avatarUrl}
              avatarSeed={avatarSeed}
              entityType={resolvedEntity}
              size={resolvedAvatarSize}
              borderStyle={{ borderWidth: 0 }}
            />
          </PartyEntityAvatarGlow>
          {showVerified ? (
            <View style={s.verifiedDot} pointerEvents="none">
              <Verified size={10} color={Theme.textOnPrimary} strokeWidth={2.6} />
            </View>
          ) : null}
        </View>

        <View style={s.innerText}>
          <Text style={[s.name, compact && compactS.name]} numberOfLines={1}>
            {name.toUpperCase()}
          </Text>
          {subtitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
              <MapPin size={compact ? 8 : 9} color={Theme.textMutedDemo} strokeWidth={2} />
              <Text style={[s.subtitle, compact && compactS.subtitle]} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
          ) : null}
          {chips.length > 0 ? (
            <View style={s.metaRow}>
              {chips.map((chip) => (
                <View key={chip.label} style={s.metaChip}>
                  <Text style={[s.metaChipText, compact && compactS.metaChipText]} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {phone ? (
        <Pressable
          onPress={onPressPhone}
          disabled={!onPressPhone}
          style={({ pressed }) => [
            s.innerBand,
            s.innerBandPhone,
            pressed && onPressPhone && { opacity: 0.9 },
          ]}
          accessibilityRole={onPressPhone ? "button" : undefined}
          accessibilityLabel={onPressPhone ? `Call ${phone}` : undefined}
        >
          <View style={s.phoneBandIcon}>
            <Phone size={14} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <View style={s.phoneBandCol}>
            <Text style={s.phoneBandLabel}>PHONE</Text>
            <Text style={[s.phoneBandValue, compact && compactS.phoneBandValue]} numberOfLines={1}>
              {phone}
            </Text>
          </View>
        </Pressable>
      ) : null}
      {footer}
    </View>
  );
}

export type NetworkProfileInviteStatsProps = {
  items: { label: string; value: string; live?: boolean }[];
  style?: StyleProp<ViewStyle>;
};

export function NetworkProfileInviteStats({
  items,
  style,
  compact = false,
}: NetworkProfileInviteStatsProps & { compact?: boolean }) {
  return (
    <View style={[s.statsBand, compact && compactS.statsBand, style]}>
      {items.map((item, idx) => (
        <View key={item.label} style={{ flex: 1, flexDirection: "row", minWidth: 0 }}>
          {idx > 0 ? <View style={s.statCellDivider} /> : null}
          <View style={[s.statCell, compact && compactS.statCell]}>
            <Text style={[s.statLabel, compact && compactS.statLabel]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text
              style={[s.statValue, compact && compactS.statValue, item.live && s.statValueLive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
