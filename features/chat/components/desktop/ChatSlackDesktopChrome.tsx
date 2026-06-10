import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { ChevronDown, PenLine, Search, Settings, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SLACK_DESKTOP_AVATAR,
  slackDesktopStyles as st,
  SLACK_DESKTOP,
} from "./chatSlackDesktop.styles";

export function ChatSlackDesktopSidebarChrome({
  workspaceName,
  searchValue,
  onSearchChange,
  onClearSearch,
  onCompose,
  onClose,
}: {
  workspaceName: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onClearSearch: () => void;
  onCompose?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <View style={st.sidebarTopBrandRow}>
        <View style={st.sidebarBrandTitleRow}>
          <Text style={st.sidebarBrandTitle}>pulsechat</Text>
          <Text style={st.sidebarBrandDot}>.</Text>
        </View>
        {onClose ? (
          <TouchableOpacity
            style={st.sidebarTopCloseBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          >
            <X size={16} color="#CBD5E1" strokeWidth={1.9} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={st.sidebarHeader}>
        <View style={st.workspaceNameWrap}>
          <Text style={st.workspaceName} numberOfLines={1}>
            {workspaceName}
          </Text>
          <ChevronDown size={14} color="#475569" strokeWidth={1.8} />
        </View>
        <View style={st.headerActions}>
          <TouchableOpacity style={st.headerIconBtn} hitSlop={8}>
            <Settings size={16} color="#475569" strokeWidth={1.65} />
          </TouchableOpacity>
          {onCompose ? (
            <TouchableOpacity style={st.headerIconBtn} onPress={onCompose} hitSlop={8}>
              <PenLine size={16} color="#475569" strokeWidth={1.65} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={st.searchWrap}>
        <Search size={14} color="#64748B" strokeWidth={1.7} />
        <TextInput
          style={st.searchInput}
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder="Search conversations"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
        />
        {searchValue.length > 0 ? (
          <TouchableOpacity onPress={onClearSearch} hitSlop={8}>
            <X size={12} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={st.sectionLabel}>Conversations</Text>
    </>
  );
}

export function ChatSlackDesktopSidebarRow({
  identity,
  title,
  preview,
  previewKind = "default",
  previewImageUrl,
  time,
  active,
  onPress,
  showAvatar = true,
}: {
  identity: ResolvedPartyAvatarIdentity;
  title: string;
  preview?: string | null;
  previewKind?: "default" | "system" | "image" | "document" | "data" | "html";
  previewImageUrl?: string | null;
  time?: string;
  active?: boolean;
  onPress: () => void;
  showAvatar?: boolean;
}) {
  const activeAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [active, activeAnim]);

  const badgeLabel =
    previewKind === "system"
      ? "System Update"
      : previewKind === "image"
        ? "Image"
        : previewKind === "document"
          ? "Document"
      : previewKind === "data"
          ? "Data"
      : previewKind === "html"
          ? "HTML"
          : null;
  const badgeStyle =
    previewKind === "image"
      ? st.sidebarPreviewBadgeImage
      : previewKind === "document"
        ? st.sidebarPreviewBadgeDocument
    : previewKind === "data"
        ? st.sidebarPreviewBadgeData
    : previewKind === "html"
        ? st.sidebarPreviewBadgeHtml
        : st.sidebarPreviewBadgeSystem;
  const badgeTextStyle =
    previewKind === "image"
      ? st.sidebarPreviewBadgeTextImage
      : previewKind === "document"
        ? st.sidebarPreviewBadgeTextDocument
    : previewKind === "data"
        ? st.sidebarPreviewBadgeTextData
    : previewKind === "html"
        ? st.sidebarPreviewBadgeTextHtml
        : st.sidebarPreviewBadgeTextSystem;
  return (
    <Animated.View
      style={{
        transform: [
          {
            scale: activeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.006],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }) => [
          st.sidebarRow,
          active && st.sidebarRowActive,
          hovered && !active && st.sidebarRowHover,
          hovered && active && st.sidebarRowActiveHover,
          pressed && !active && st.sidebarRowPressed,
        ]}
      >
        {showAvatar ? (
          <View style={st.sidebarRowAvatarWrap}>
            <ChatPartyAvatar identity={identity} size={SLACK_DESKTOP_AVATAR.sidebar} />
          </View>
        ) : null}
        <View style={st.sidebarRowBody}>
          <View style={st.sidebarRowTop}>
            <Text style={st.sidebarRowName} numberOfLines={1}>
              {title}
            </Text>
            {time ? (
              <Text style={st.sidebarRowTime} numberOfLines={1}>
                {time}
              </Text>
            ) : null}
          </View>
          {preview ? (
            previewKind !== "default" ? (
              <View style={st.sidebarSystemPreviewWrap}>
                <View style={st.sidebarPreviewRichRow}>
                  {previewKind === "image" && previewImageUrl ? (
                    <Image source={{ uri: previewImageUrl }} style={st.sidebarPreviewThumb} />
                  ) : (
                    <View style={st.sidebarPreviewThumbPlaceholder} />
                  )}
                  <View style={st.sidebarPreviewTextWrap}>
                    <Text style={[st.sidebarPreviewBadge, badgeStyle, badgeTextStyle]}>
                      {badgeLabel}
                    </Text>
                    <Text style={st.sidebarRowPreview} numberOfLines={2}>
                      {preview}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={st.sidebarRowPreview} numberOfLines={2}>
                {preview}
              </Text>
            )
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ChatSlackDesktopThreadHeader({
  title,
  subtitle,
  avatarIdentity,
  partyTabsRow,
  compactRoleTag,
}: {
  title: string;
  subtitle?: string;
  avatarIdentity?: ResolvedPartyAvatarIdentity;
  partyTabsRow?: React.ReactNode;
  compactRoleTag?: string;
}) {
  const [roleTagActive, setRoleTagActive] = useState(false);
  const toggleOnlyHeader = Boolean(partyTabsRow);
  return (
    <View style={[st.threadHeader, toggleOnlyHeader && st.threadHeaderToggleOnly]}>
      <View style={[st.threadHeaderTop, toggleOnlyHeader && st.threadHeaderTopToggleOnly]}>
        {toggleOnlyHeader ? (
          <View style={st.threadTopPartyTabs}>{partyTabsRow}</View>
        ) : (
          <>
            {avatarIdentity ? (
              <ChatPartyAvatar identity={avatarIdentity} size={SLACK_DESKTOP_AVATAR.thread} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.threadTitle} numberOfLines={1}>
                {title}
              </Text>
              <View style={st.threadMetaRow}>
                {subtitle ? (
                  <Text style={st.threadSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
                {compactRoleTag ? (
                  <TouchableOpacity
                    style={[
                      st.threadCompactRoleTag,
                      roleTagActive && st.threadCompactRoleTagActive,
                    ]}
                    onPress={() => setRoleTagActive((v) => !v)}
                    activeOpacity={0.82}
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
          </>
        )}
      </View>
      <View style={st.threadTabsRow}>
        <View style={[st.threadTab, st.threadTabActive]}>
          <Text style={[st.threadTabText, st.threadTabTextActive]}>Messages</Text>
        </View>
      </View>
    </View>
  );
}
