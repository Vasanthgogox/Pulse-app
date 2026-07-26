import { memo, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import type { PartyEntityType } from "@/components/PartyAvatar";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

/** Matches old partner/client picker avatar density inside the new entity card. */
export const DESKTOP_ENTITY_AVATAR_SIZE = 40;
/** Dense party tiles on mobile create-trip / create-load. */
export const COMPACT_ENTITY_AVATAR_SIZE = 32;

export function entityInitials(name: string, fallback = "?"): string {
  const t = name.trim();
  if (!t) return fallback;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export const DesktopSectionHeading = memo(function DesktopSectionHeading({
  children,
}: {
  children: string;
}) {
  return <Text style={s.sectionHeading}>{children}</Text>;
});

export const DesktopFieldLabel = memo(function DesktopFieldLabel({
  children,
}: {
  children: string;
}) {
  return <Text style={s.desktopFieldLabel}>{children}</Text>;
});

export type DesktopStatusBadgeProps = {
  label: string;
  tone: "available" | "busy";
};

export const DesktopStatusBadge = memo(function DesktopStatusBadge({
  label,
  tone,
}: DesktopStatusBadgeProps) {
  return (
    <View
      style={[
        s.desktopStatusBadge,
        tone === "available" ? s.desktopStatusBadgeAvailable : s.desktopStatusBadgeBusy,
      ]}
    >
      <Text
        style={[
          s.desktopStatusBadgeText,
          tone === "available"
            ? s.desktopStatusBadgeTextAvailable
            : s.desktopStatusBadgeTextBusy,
        ]}
      >
        {label}
      </Text>
    </View>
  );
});

export type DesktopEntityCardProps = {
  title: string;
  subtitle?: string | null;
  /** Fallback initials when PartyAvatar is not used. */
  initials?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  /** Prefer circular PartyAvatar (old profile logic) over plain initials plate. */
  entityType?: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarSize?: number;
  /** Square initials plate only when `entityType` is omitted. */
  avatarSquare?: boolean;
  /** Green status dot when linked / integrated (network & finance parity). */
  isIntegrated?: boolean;
  /** Smaller avatar / typography for mobile enterprise density. */
  compact?: boolean;
};

export const DesktopEntityCard = memo(function DesktopEntityCard({
  title,
  subtitle,
  initials,
  selected = false,
  disabled = false,
  onPress,
  trailing,
  entityType,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  avatarSize,
  avatarSquare = false,
  isIntegrated = false,
  compact = false,
}: DesktopEntityCardProps) {
  const fallbackInitials = initials ?? entityInitials(title);
  const usePartyAvatar = entityType != null;
  const resolvedAvatarSize =
    avatarSize ?? (compact ? COMPACT_ENTITY_AVATAR_SIZE : DESKTOP_ENTITY_AVATAR_SIZE);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[
        s.desktopEntityCard,
        compact && s.compactDesktopEntityCard,
        selected && s.desktopEntityCardSelected,
        disabled && s.desktopEntityCardDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <View style={[s.desktopEntityCardLeft, compact && s.compactDesktopEntityCardLeft]}>
        {usePartyAvatar ? (
          <EntityAvatar
            name={title}
            entityType={entityType}
            avatarUrl={avatarUrl}
            avatarSeed={avatarSeed}
            organizationImageUrl={organizationImageUrl}
            organizationAvatarSeed={organizationAvatarSeed}
            size={resolvedAvatarSize}
            isIntegrated={isIntegrated}
            showIntegrationBadge
            badgeOverlay
          />
        ) : (
          <View
            style={[
              avatarSquare ? s.desktopEntityAvatarSquare : s.desktopEntityAvatar,
              { width: resolvedAvatarSize, height: resolvedAvatarSize },
              compact && { borderRadius: avatarSquare ? 8 : 999 },
              selected && s.desktopEntityAvatarSelected,
            ]}
          >
            <Text
              style={[
                s.desktopEntityAvatarText,
                compact && { fontSize: 11 },
                selected && s.desktopEntityAvatarTextSelected,
              ]}
            >
              {fallbackInitials}
            </Text>
          </View>
        )}
        <View style={s.desktopEntityCopy}>
          <Text
            style={[s.desktopEntityTitle, compact && s.compactDesktopEntityTitle]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                s.desktopEntitySubtitle,
                compact && s.compactDesktopEntitySubtitle,
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing}
    </Pressable>
  );
});

export type DesktopPillProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  flex?: boolean;
  /** Full-width pill (mobile stacked payment terms). */
  block?: boolean;
};

export const DesktopPill = memo(function DesktopPill({
  label,
  active = false,
  onPress,
  flex = false,
  block = false,
}: DesktopPillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.desktopPill,
        flex && s.desktopPillFlex,
        block && s.desktopPillBlock,
        active && s.desktopPillActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[s.desktopPillText, active && s.desktopPillTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export type DesktopInputShellProps = {
  children: ReactNode;
  error?: boolean;
};

export const DesktopInputShell = memo(function DesktopInputShell({
  children,
  error = false,
}: DesktopInputShellProps) {
  return (
    <View style={[s.inputBoxClean, error && s.inputBoxCleanError]}>{children}</View>
  );
});

export const DesktopCountBadge = memo(function DesktopCountBadge({
  count,
}: {
  count: number;
}) {
  return (
    <View style={s.desktopCountBadge}>
      <Text style={s.desktopCountBadgeText}>{count}</Text>
    </View>
  );
});

export const desktopWebPointer = Platform.select({
  web: { cursor: "pointer" as const },
  default: {},
});
