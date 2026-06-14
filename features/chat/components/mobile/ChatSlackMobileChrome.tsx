import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatDriverSwapInboxPreview } from "@/features/chat/components/shared/ChatDriverSwapInboxPreview";
import { ChatInboxImagePreviewStrip } from "@/features/chat/components/shared/ChatInboxImagePreviewStrip";
import { ChatListPreviewText } from "@/features/chat/components/shared/ChatListPreviewText";
import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { ChatLocationPingInboxPreview } from "@/features/chat/components/shared/ChatLocationPingInboxPreview";
import { ChatSlackDocumentAttachmentCompact } from "@/features/chat/components/shared/ChatSlackDocumentAttachment";
import type { ConversationImagePreview } from "@/features/chat/utils/conversationImagePreview.util";
import { ChatSlackMirrorToggle } from "@/features/chat/components/shared/ChatSlackMirrorToggle";
import { SLACK_STREAM_TABS } from "@/features/chat/components/shared/chatSlackStreamTabs";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  CircleDashed,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInput as TextInputType,
  type ViewStyle,
} from "react-native";
import { memo, useState } from "react";
import {
  CHAT_SLACK_BOTTOM_NAV_BAR,
  PULSE_CHAT,
  slackMobileStyles as st,
  SLACK_AVATAR,
  SLACK_ICON,
  SLACK_MOBILE,
} from "./chatSlackMobile.styles";

export { CHAT_SLACK_BOTTOM_NAV_BAR };

export type SlackStreamTabId = "network" | "trips" | "indent";

export type SlackPeopleItem = {
  id: string;
  name: string;
  identity: ResolvedPartyAvatarIdentity;
  unread?: number;
  online?: boolean;
  onPress: () => void;
};

export type SlackFilterChipDef = {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

export function ChatSlackListHeader({
  streamLabel,
  orgName,
  topInset,
  onBack,
  onCompose,
  profileIdentity,
  profileName,
  profileAvatarUrl,
  profileAvatarSeed,
  profileOrgLogoUrl,
}: {
  /** Active stream tab — DMs, Trips, Integrated. */
  streamLabel: string;
  orgName?: string;
  topInset: number;
  onBack: () => void;
  onCompose?: () => void;
  profileIdentity?: ResolvedPartyAvatarIdentity | null;
  profileName?: string;
  profileAvatarUrl?: string | null;
  profileAvatarSeed?: string | null;
  profileOrgLogoUrl?: string | null;
}) {
  const contextLine = [streamLabel, orgName?.trim()].filter(Boolean).join(" · ");
  return (
    <View style={[st.listHeader, { paddingTop: topInset + 8 }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(255, 255, 255, 0.14)",
          "rgba(255, 255, 255, 0.04)",
          "rgba(255, 255, 255, 0)",
        ]}
        locations={[0, 0.35, 0.72]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={st.listHeaderMirrorSheen}
      />
      <View style={st.listHeaderMirrorGlow} pointerEvents="none" />
      <View style={st.listHeaderAccentLine} pointerEvents="none" />
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        style={[st.listHeaderMirrorBtn, st.listHeaderCloseBtn]}
        accessibilityRole="button"
        accessibilityLabel="Close chat"
      >
        <X
          size={SLACK_ICON.sizeClose}
          color="#FFFFFF"
          strokeWidth={SLACK_ICON.strokeHeader}
        />
      </TouchableOpacity>
      <View style={st.listHeaderTextCol}>
        <View style={st.listHeaderBrandRow}>
          <Text style={st.listHeaderTitle} numberOfLines={1}>
            pulse chat
          </Text>
          <Text style={st.listHeaderBrandDot}>.</Text>
        </View>
        {contextLine ? (
          <Text style={st.listHeaderSubtitle} numberOfLines={1}>
            {contextLine}
          </Text>
        ) : null}
      </View>
      <View style={st.listHeaderActions}>
        {onCompose ? (
          <TouchableOpacity
            onPress={onCompose}
            hitSlop={8}
            style={st.listHeaderActionBtn}
            accessibilityRole="button"
            accessibilityLabel="New message"
          >
            <PenLine size={17} color="#FFFFFF" strokeWidth={SLACK_ICON.strokeHeader} />
          </TouchableOpacity>
        ) : null}
        <View style={st.listHeaderAvatarWrap}>
          <View style={st.peopleAvatarCircle}>
            <ChatPartyAvatar
              identity={
                profileIdentity ?? {
                  displayName: profileName ?? "You",
                  entityType: "client",
                }
              }
              isOwnUser
              userName={profileName}
              userAvatarUrl={profileAvatarUrl}
              userAvatarSeed={profileAvatarSeed}
              userOrgLogoUrl={profileOrgLogoUrl}
              size={SLACK_AVATAR.listHeader}
            />
          </View>
          <View style={st.listHeaderOnlineDot} />
        </View>
      </View>
    </View>
  );
}

export function ChatSlackBottomNav({
  activeTab,
  unreadByTab,
  onSelect,
  bottomInset,
  onOpenStories,
}: {
  activeTab: SlackStreamTabId;
  unreadByTab: Partial<Record<SlackStreamTabId, number>>;
  onSelect: (tab: SlackStreamTabId) => void;
  bottomInset: number;
  onOpenStories?: () => void;
}) {
  return (
    <View style={[st.bottomNav, { paddingBottom: Math.max(bottomInset, 6) }]}>
      <ChatSlackMirrorToggle
        variant="bottomNav"
        activeId={activeTab}
        onSelect={(id) => onSelect(id as SlackStreamTabId)}
        items={SLACK_STREAM_TABS.map((tab) => ({
          id: tab.id,
          label: tab.shortLabel,
          Icon: tab.Icon,
          badge: unreadByTab[tab.id] ?? 0,
        }))}
      />
      {onOpenStories ? (
        <TouchableOpacity
          style={st.bottomNavSearch}
          onPress={onOpenStories}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open stories"
        >
          <CircleDashed
            size={19}
            color={SLACK_MOBILE.textPrimary}
            strokeWidth={SLACK_ICON.strokeInactive}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ChatSlackPeopleStrip({
  items,
  selectedId,
  sectionLabel = "Recent",
  onCompose,
}: {
  items: SlackPeopleItem[];
  selectedId?: string | null;
  sectionLabel?: string;
  onCompose?: () => void;
}) {
  if (items.length === 0 && !onCompose) return null;
  return (
    <View style={st.peopleStrip}>
      <View style={st.peopleStripHeader}>
        <Text style={st.peopleStripLabel}>{sectionLabel}</Text>
        {items.length > 6 ? (
          <Text style={st.peopleStripHint}>{items.length} people</Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.peopleStripContent}
        keyboardShouldPersistTaps="handled"
      >
        {onCompose ? (
          <TouchableOpacity
            style={st.peopleItem}
            onPress={onCompose}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="New conversation"
          >
            <View style={st.peopleNewTile}>
              <Plus size={18} color={SLACK_MOBILE.textTertiary} strokeWidth={SLACK_ICON.strokeInactive} />
            </View>
            <Text style={st.peopleName} numberOfLines={1}>
              New
            </Text>
          </TouchableOpacity>
        ) : null}
        {items.map((item) => {
          const active = selectedId === item.id;
          const hasUnread = (item.unread ?? 0) > 0;
          return (
            <TouchableOpacity
              key={item.id}
              style={st.peopleItem}
              onPress={item.onPress}
              activeOpacity={0.82}
            >
              <View style={st.peopleAvatarWrap}>
                <View
                  style={[
                    st.peopleAvatarRing,
                    hasUnread && st.peopleAvatarRingUnread,
                    active && st.peopleAvatarRingActive,
                  ]}
                >
                  <View style={st.peopleAvatarCircle}>
                    <ChatPartyAvatar identity={item.identity} size={SLACK_AVATAR.people} />
                  </View>
                </View>
                {hasUnread ? (
                  <View style={st.peopleUnreadBadge}>
                    <Text style={st.peopleUnreadBadgeText}>
                      {(item.unread ?? 0) > 9 ? "9+" : String(item.unread)}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      st.peopleOnlineDot,
                      item.online === false && st.peopleOfflineDot,
                    ]}
                  />
                )}
              </View>
              <Text
                style={[st.peopleName, active && st.peopleNameActive]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ChatSlackFilterRow({
  chips,
  inline,
}: {
  chips: SlackFilterChipDef[];
  /** When true, sits beside search in one toolbar row (no outer margins). */
  inline?: boolean;
}) {
  if (chips.length === 0) return null;
  const activeId = chips.find((c) => c.active)?.id ?? chips[0].id;
  return (
    <ChatSlackMirrorToggle
      variant="filter"
      activeId={activeId}
      onSelect={(id) => {
        chips.find((c) => c.id === id)?.onPress();
      }}
      items={chips.map((chip) => ({
        id: chip.id,
        label: chip.label,
        showFilterIcon: chip.id === "all" || chip.id === "active",
      }))}
      style={
        inline
          ? [st.inboxToolbarFilter, st.inboxToolbarFilterInline, { marginHorizontal: 0, marginBottom: 0 }]
          : [st.inboxToolbarFilter, st.inboxToolbarFilterStandalone, { marginHorizontal: 12, marginBottom: 8 }]
      }
    />
  );
}

export function ChatSlackInboxChrome({ children }: { children: React.ReactNode }) {
  return <View style={st.inboxChrome}>{children}</View>;
}

export function ChatSlackListSeparator() {
  return <View style={st.listRowSeparator} />;
}

export function ChatSlackPartyRecommendedHeader({
  partyName,
  count,
}: {
  partyName: string;
  count: number;
}) {
  return (
    <View style={st.partyRecommendedHeader}>
      <Text style={st.partyRecommendedHeaderTitle} numberOfLines={1}>
        Recommended · {partyName}
      </Text>
      <Text style={st.partyRecommendedHeaderMeta}>
        {count} chat{count === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

export function ChatSlackPartyRecommendedDivider() {
  return (
    <View style={st.partyRecommendedDivider}>
      <Text style={st.partyRecommendedDividerText}>All conversations</Text>
    </View>
  );
}

export function ChatSlackTripSearchStrip({
  value,
  onChangeText,
  onClear,
  inputRef,
  placeholder = "Search trips, routes…",
  inline,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  inputRef?: React.RefObject<TextInputType | null>;
  placeholder?: string;
  /** When true, shares a row with filter chips (flexes to fill remaining width). */
  inline?: boolean;
}) {
  return (
    <View style={inline ? st.searchToolbarInline : st.searchToolbar}>
      <View style={[st.tripSearchStrip, inline && st.tripSearchStripInline]}>
        <Search
          size={14}
          color={SLACK_MOBILE.textTertiary}
          strokeWidth={SLACK_ICON.strokeInactive}
        />
        <TextInput
          ref={inputRef}
          style={st.tripSearchInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={SLACK_MOBILE.textTertiary}
          autoCapitalize="none"
        />
        {value.length > 0 ? (
          <TouchableOpacity onPress={onClear} hitSlop={8}>
            <X size={14} color={SLACK_MOBILE.textTertiary} strokeWidth={SLACK_ICON.strokeInactive} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function ChatSlackInboxToolbar({
  peopleItems,
  selectedPeopleId,
  peopleSectionLabel,
  networkStoryStrip,
  onCompose,
  filterChips,
  searchValue,
  onSearchChange,
  onSearchClear,
  searchPlaceholder,
  searchInputRef,
  showSearch,
}: {
  peopleItems: SlackPeopleItem[];
  selectedPeopleId?: string | null;
  peopleSectionLabel?: string;
  networkStoryStrip?: React.ReactNode;
  onCompose?: () => void;
  filterChips: SlackFilterChipDef[];
  searchValue: string;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  searchPlaceholder: string;
  searchInputRef?: React.RefObject<TextInputType | null>;
  showSearch: boolean;
}) {
  return (
    <ChatSlackInboxChrome>
      <ChatSlackPeopleStrip
        items={peopleItems}
        selectedId={selectedPeopleId}
        sectionLabel={peopleSectionLabel}
        onCompose={onCompose}
      />
      {networkStoryStrip ? (
        <>
          <View style={st.chromeDivider} />
          {networkStoryStrip}
        </>
      ) : null}
      {(peopleItems.length > 0 || onCompose) ? <View style={st.chromeDivider} /> : null}
      {showSearch && filterChips.length > 0 ? (
        <View style={st.inboxToolbarRow}>
          <ChatSlackFilterRow chips={filterChips} inline />
          <View style={st.inboxToolbarSearch}>
            <ChatSlackTripSearchStrip
              value={searchValue}
              onChangeText={onSearchChange}
              onClear={onSearchClear}
              inputRef={searchInputRef}
              placeholder={searchPlaceholder}
              inline
            />
          </View>
        </View>
      ) : (
        <>
          <ChatSlackFilterRow chips={filterChips} />
          {showSearch ? (
            <ChatSlackTripSearchStrip
              value={searchValue}
              onChangeText={onSearchChange}
              onClear={onSearchClear}
              inputRef={searchInputRef}
              placeholder={searchPlaceholder}
            />
          ) : null}
        </>
      )}
    </ChatSlackInboxChrome>
  );
}

function ChatSlackListRowInner({
  identity,
  title,
  time,
  preview,
  previewKind = "default",
  previewImagePreviews,
  previewDriverSwap,
  documentExtension,
  documentIsImage,
  partyLine,
  active,
  recommended,
  unread,
  onPress,
}: {
  identity: ResolvedPartyAvatarIdentity;
  title: string;
  time?: string;
  preview?: string | null;
  previewKind?: "default" | "system" | "image" | "document" | "driver_swap" | "location";
  previewImagePreviews?: ConversationImagePreview[];
  previewDriverSwap?: DriverSwapPair | null;
  documentExtension?: string | null;
  documentIsImage?: boolean;
  partyLine?: string | null;
  active?: boolean;
  /** Highlighted in the party-recommendation section after people-strip selection. */
  recommended?: boolean;
  unread?: number;
  onPress: () => void;
}) {
  const badgeLabel =
    previewKind === "system"
      ? "System Update"
      : previewKind === "image"
        ? "Image"
        : null;
  const badgeStyle =
    previewKind === "image"
      ? st.listRowPreviewBadgeImage
      : st.listRowPreviewBadgeSystem;
  const badgeTextStyle =
    previewKind === "image"
      ? st.listRowPreviewBadgeTextImage
      : st.listRowPreviewBadgeTextSystem;
  const hasImageStrip =
    Boolean(previewImagePreviews && previewImagePreviews.length > 0);
  const hasDriverSwapPreview =
    previewKind === "driver_swap" && Boolean(previewDriverSwap);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.listRow,
        (hasImageStrip || hasDriverSwapPreview) && st.listRowWithMedia,
        recommended && st.listRowRecommended,
        active && st.listRowActive,
        pressed && st.listRowPressed,
      ]}
    >
      <View style={st.listRowAvatarWrap}>
        <View style={st.listRowAvatarCircle}>
          <ChatPartyAvatar identity={identity} size={SLACK_AVATAR.list} />
        </View>
        {unread && unread > 0 && !active ? <View style={st.listRowUnreadDot} /> : null}
      </View>
      <View style={st.listRowBody}>
        <View style={st.listRowTop}>
          <Text style={st.listRowTitle} numberOfLines={1}>
            {title}
          </Text>
          {time ? (
            <Text style={st.listRowTime} numberOfLines={1}>
              {time}
            </Text>
          ) : null}
        </View>
        {partyLine ? (
          <Text style={st.listRowPartyLine} numberOfLines={1}>
            {partyLine}
          </Text>
        ) : null}
        {hasDriverSwapPreview ? (
          <ChatDriverSwapInboxPreview
            swap={previewDriverSwap!}
            text={preview ?? ""}
            variant="mobile"
          />
        ) : hasImageStrip ? (
          <>
            <ChatInboxImagePreviewStrip
              items={previewImagePreviews!}
              variant="mobile"
            />
            {preview ? (
              <ChatListPreviewText
                text={preview}
                style={[st.listRowPreview, st.listRowPreviewBelowMedia]}
                numberOfLines={3}
              />
            ) : null}
          </>
        ) : preview ? (
          previewKind === "location" ? (
            <ChatLocationPingInboxPreview text={preview} />
          ) : previewKind === "document" ? (
            <ChatSlackDocumentAttachmentCompact
              display={{
                documentName: preview,
                extension: documentExtension ?? "",
                isImage: documentIsImage ?? false,
              }}
            />
          ) : previewKind !== "default" ? (
            <View style={st.listRowSystemPreviewWrap}>
              <Text style={[st.listRowPreviewBadge, badgeStyle, badgeTextStyle]}>
                {badgeLabel}
              </Text>
              <ChatListPreviewText
                text={preview}
                style={st.listRowPreview}
                numberOfLines={2}
              />
            </View>
          ) : (
            <ChatListPreviewText
              text={preview}
              style={st.listRowPreview}
              numberOfLines={2}
            />
          )
        ) : null}
      </View>
    </Pressable>
  );
}

export const ChatSlackListRow = memo(ChatSlackListRowInner);

export function ChatSlackFab({
  onPress,
  bottom,
  style,
}: {
  onPress: () => void;
  bottom: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[st.fab, { bottom }, style]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="New conversation"
    >
      <Plus size={SLACK_ICON.sizeFab} color="#FFFFFF" strokeWidth={SLACK_ICON.strokeActive} />
    </TouchableOpacity>
  );
}

export function ChatSlackThreadHeader({
  title,
  subtitle,
  avatarIdentity,
  onBack,
  partyTabsRow,
  compactRoleTag,
  onOpenFilters,
}: {
  title: string;
  subtitle?: string;
  avatarIdentity: ResolvedPartyAvatarIdentity;
  onBack: () => void;
  partyTabsRow?: React.ReactNode;
  compactRoleTag?: string;
  onOpenFilters?: () => void;
}) {
  const [roleTagActive, setRoleTagActive] = useState(false);
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedSubtitle = (subtitle ?? "").trim().toLowerCase();
  const safeSubtitle =
    normalizedSubtitle && normalizedSubtitle !== normalizedTitle ? subtitle : undefined;
  const toggleOnlyHeader = Boolean(partyTabsRow);
  return (
    <View style={st.threadHeader}>
      <View style={st.threadHeaderTop}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={st.threadBackBtn}>
          <ArrowLeft
            size={SLACK_ICON.sizeBack}
            color={SLACK_MOBILE.iconInactive}
            strokeWidth={SLACK_ICON.strokeInactive}
          />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          {toggleOnlyHeader ? (
            <View style={st.threadCenterToggleRow}>{partyTabsRow}</View>
          ) : (
            <>
              <View style={st.threadCenterMainRow}>
                <View style={st.peopleAvatarCircle}>
                  <ChatPartyAvatar identity={avatarIdentity} size={SLACK_AVATAR.header} />
                </View>
                <View style={st.threadCenterTextCol}>
                  <Text style={st.threadTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <View style={st.threadMetaRow}>
                    {safeSubtitle ? (
                      <Text style={st.threadSubtitle} numberOfLines={1}>
                        {safeSubtitle}
                      </Text>
                    ) : null}
                    {compactRoleTag ? (
                      <TouchableOpacity
                        onPress={() => setRoleTagActive((v) => !v)}
                        activeOpacity={0.82}
                        style={[
                          st.threadCompactRoleTag,
                          roleTagActive && st.threadCompactRoleTagActive,
                        ]}
                      >
                        <Text
                          style={[
                            st.threadCompactRoleTagText,
                            roleTagActive && st.threadCompactRoleTagTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {compactRoleTag}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
        {onOpenFilters ? (
          <View style={st.threadActions}>
            <TouchableOpacity
              onPress={onOpenFilters}
              hitSlop={8}
              style={st.threadActionBtn}
            >
              <SlidersHorizontal
                size={17}
                color={SLACK_MOBILE.iconInactive}
                strokeWidth={SLACK_ICON.strokeInactive}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 8 }} />
        )}
      </View>
    </View>
  );
}
