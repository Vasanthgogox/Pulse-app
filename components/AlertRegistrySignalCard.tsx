/**
 * Single notification row — Metronic-style feed item (avatar + rich text + actions).
 */
import React from "react";
import { alertRegistryActionStyles } from "@/components/AlertRegistryCardActions";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type {
  RegistryStatusTone,
  RegistryTag,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import {
  formatRegistryLabel,
  formatRegistryStatusLabel,
  registryStatusStyle,
  registryTagStyle,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import type { RegistryNotificationAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";
import { Pressable, StyleSheet, Text, View } from "react-native";

/** Metronic demo2 tokens — notifications dropdown + privacy-settings buttons. */
const METRONIC = {
  border: "#EFF2F5",
  muted: "#A1A5B7",
  quoteBg: "#F5F8FA",
  primaryBtn: "#181C32",
  ghostBorder: "#DBDFE9",
  link: Theme.primary,
  unreadDot: "#50CD89",
} as const;

const TAG = {
  height: 18,
  paddingHorizontal: 7,
  borderRadius: 4,
  borderWidth: 1,
} as const;

export type RegistryCardMode = "active" | "completed";

export type AlertRegistrySignalCardProps = {
  avatar: RegistryNotificationAvatar;
  actorName: string;
  actionText: string;
  highlightText?: string;
  trailingText?: string;
  /** Plain detail line inside the gray card (legacy). */
  detail?: string;
  /** Bold primary line in the detail card — e.g. amount or trip ref. */
  detailTitle?: string;
  /** Secondary line in the detail card — e.g. category or note. */
  detailSubtitle?: string;
  timeLabel: string;
  contextLabel?: string;
  tags?: RegistryTag[];
  statusPill?: { label: string; tone: RegistryStatusTone };
  mode?: RegistryCardMode;
  isUnread?: boolean;
  onPress?: () => void;
  footer?: React.ReactNode;
  /** Contained card for horizontal grids (no feed divider). */
  variant?: "feed" | "tile";
  /** Tighter padding and typography for hub tile grids. */
  compact?: boolean;
};

function NotificationAvatar({
  avatar,
  isUnread,
  mode,
  size = AVATAR_SIZE,
  compact = false,
}: {
  avatar: RegistryNotificationAvatar;
  isUnread?: boolean;
  mode: RegistryCardMode;
  size?: number;
  compact?: boolean;
}) {
  const showUnread = mode === "active" && isUnread;
  const dotSize = compact ? 7 : 8;
  const slot = size + dotSize;
  return (
    <View style={[styles.avatarWrap, { width: slot, height: slot }]}>
      <View style={[styles.avatarCore, { width: size, height: size }]}>
        <PartyAvatar
          name={avatar.name}
          entityType={avatar.entityType ?? "client"}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          size={size}
          shape="circle"
        />
      </View>
      <View
        style={[
          styles.statusDot,
          compact && styles.statusDotCompact,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
          },
          showUnread ? styles.statusDotUnread : styles.statusDotRead,
        ]}
      />
    </View>
  );
}

export function RegistryStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: RegistryStatusTone;
}) {
  const palette = registryStatusStyle(tone);
  return (
    <View
      style={[
        alertRegistryActionStyles.statusPill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[alertRegistryActionStyles.statusPillText, { color: palette.text }]}>
        {formatRegistryStatusLabel(label)}
      </Text>
    </View>
  );
}

export function RegistryTagPill({ tag }: { tag: RegistryTag }) {
  const palette = registryTagStyle(tag.variant ?? "default");
  return (
    <View
      style={[
        styles.tagPill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.tagText, { color: palette.text }]} numberOfLines={1}>
        {formatRegistryLabel(tag.label)}
      </Text>
    </View>
  );
}

const AVATAR_SIZE = 36;
const COMPACT_AVATAR_SIZE = 28;

export function AlertRegistrySignalCard({
  avatar,
  actorName,
  actionText,
  highlightText,
  trailingText,
  detail,
  detailTitle,
  detailSubtitle,
  timeLabel,
  contextLabel,
  tags,
  statusPill,
  mode = "active",
  isUnread = false,
  onPress,
  footer,
  variant = "feed",
  compact = false,
}: AlertRegistrySignalCardProps) {
  const showDetailCard = Boolean(detailTitle || detailSubtitle || detail);
  const avatarSize = compact && variant === "tile" ? COMPACT_AVATAR_SIZE : AVATAR_SIZE;

  const content = (
    <View
      style={[
        styles.row,
        variant === "tile" && styles.rowTile,
        compact && variant === "tile" && styles.rowTileCompact,
        mode === "completed" && styles.rowCompleted,
      ]}
    >
      <NotificationAvatar
        avatar={avatar}
        isUnread={isUnread}
        mode={mode}
        size={avatarSize}
        compact={compact && variant === "tile"}
      />

      <View style={[styles.body, compact && variant === "tile" && styles.bodyCompact]}>
        <Text
          style={[styles.headline, compact && variant === "tile" && styles.headlineCompact]}
          numberOfLines={compact ? 2 : 4}
        >
          <Text style={styles.actorName}>{actorName}</Text>
          <Text style={styles.actionText}> {actionText}</Text>
          {highlightText ? (
            <Text style={styles.highlightText}> {highlightText}</Text>
          ) : null}
          {trailingText ? (
            <Text style={styles.actionText}> {trailingText}</Text>
          ) : null}
        </Text>

        <Text
          style={[styles.metaLine, compact && variant === "tile" && styles.metaLineCompact]}
          numberOfLines={1}
        >
          {timeLabel}
          {contextLabel ? <Text style={styles.metaContext}> · {contextLabel}</Text> : null}
        </Text>

        {showDetailCard ? (
          <View
            style={[
              styles.detailCard,
              compact && variant === "tile" && styles.detailCardCompact,
            ]}
          >
            {detailTitle ? (
              <Text
                style={[
                  styles.detailTitle,
                  compact && variant === "tile" && styles.detailTitleCompact,
                ]}
                numberOfLines={2}
              >
                {detailTitle}
              </Text>
            ) : null}
            {detailSubtitle ? (
              <Text
                style={[
                  styles.detailSubtitle,
                  compact && variant === "tile" && styles.detailSubtitleCompact,
                ]}
                numberOfLines={2}
              >
                {detailSubtitle}
              </Text>
            ) : null}
            {!detailTitle && detail ? (
              <Text style={styles.detailBody} numberOfLines={4}>
                {detail}
              </Text>
            ) : null}
          </View>
        ) : null}

        {tags?.length || statusPill || footer ? (
          <View
            style={[
              styles.metaBlock,
              compact && variant === "tile" && styles.metaBlockCompact,
            ]}
          >
            <View style={styles.metaLeft}>
              {tags?.map((tag) => (
                <RegistryTagPill key={tag.label} tag={tag} />
              ))}
              {statusPill ? (
                <RegistryStatusPill label={statusPill.label} tone={statusPill.tone} />
              ) : null}
            </View>
            {footer ? (
              <View
                style={[
                  styles.metaActions,
                  compact && variant === "tile" && styles.metaActionsCompact,
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
        accessibilityRole={footer ? "none" : "button"}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
  },
  pressablePressed: {
    opacity: 0.92,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  rowCompleted: {
    backgroundColor: "#FCFCFD",
  },
  rowTile: {
    borderBottomWidth: 0,
    flex: 1,
    minHeight: 0,
  },
  rowTileCompact: {
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  avatarWrap: {
    flexShrink: 0,
    position: "relative",
  },
  avatarCore: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  statusDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  statusDotUnread: {
    backgroundColor: METRONIC.unreadDot,
  },
  statusDotRead: {
    backgroundColor: METRONIC.muted,
  },
  statusDotCompact: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  bodyCompact: {
    gap: 3,
  },
  headline: {
    fontSize: 13,
    lineHeight: 19,
    color: METRONIC.primaryBtn,
  },
  headlineCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  actorName: {
    fontWeight: "600",
    color: METRONIC.primaryBtn,
  },
  actionText: {
    fontWeight: "400",
    color: METRONIC.primaryBtn,
  },
  highlightText: {
    fontWeight: "600",
    color: METRONIC.link,
  },
  metaLine: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  metaLineCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  metaContext: {
    color: "#78829D",
    fontWeight: "500",
  },
  detailCard: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: METRONIC.quoteBg,
    gap: 2,
  },
  detailCardCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  },
  detailTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: METRONIC.primaryBtn,
  },
  detailTitleCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  detailSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#78829D",
  },
  detailSubtitleCompact: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: METRONIC.link,
  },
  detailBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#78829D",
  },
  tagPill: {
    ...TAG,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tagText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
  },
  metaBlock: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
    alignSelf: "stretch",
  },
  metaBlockCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
    marginTop: 2,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    marginLeft: "auto",
  },
  metaActionsCompact: {
    width: "100%",
    marginLeft: 0,
    justifyContent: "stretch",
  },
});
