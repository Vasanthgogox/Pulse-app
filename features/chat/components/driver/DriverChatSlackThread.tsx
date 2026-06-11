/**
 * Driver trip thread — Slack-style layout aligned with business Command Hub chat.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
import { ChatLocationSystemCard } from "@/features/chat/components/ChatLocationSystemCard";
import { ChatSlackThreadHeader } from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import {
  SLACK_AVATAR,
  slackMobileStyles as slackSt,
} from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { ChatSlackMessageRow } from "@/features/chat/components/mobile/ChatSlackMessageRow";
import { ChatMediaBurstRow } from "@/features/chat/components/shared/ChatMediaBurstRow";
import { ChatHistoryExpiryNotice } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import type { TripMessageRow } from "@/features/chat/types/chat.types";
import {
  buildChatMediaBurstIndex,
  tripChatMessageSenderKey,
} from "@/features/chat/utils/chatMediaBurst.util";
import { compressAndUploadChatImage } from "@/features/chat/utils/chatImageUpload.util";
import { isLocationPingMessage } from "@/features/chat/utils/locationPingChatDisplay.util";
import { parseSystemLogLocationData } from "@/features/chat/utils/locationLogPayload.util";
import * as chatService from "@/features/chat/services/chat.service";
import {
  appendDriverChatMessageToCache,
  driverChatMessagesQueryKey,
  removeDriverChatMessageFromCache,
  replaceDriverChatMessageInCache,
  type DriverChatMessagesPage,
} from "@/features/chat/utils/driverChatMessageCache.util";
import { stripChatPreviewEmojiPrefix } from "@/features/chat/utils/chatAvatar.util";
import {
  buildSlackMessageGroupMap,
  isSlackGroupableTripMessage,
} from "@/features/chat/utils/slackMessageGroup.util";
import { useDriverChatSystem } from "@/features/driver/communication";
import {
  appendDriverStatusNote,
  deriveDriverFlowStepFromTrip,
  DRIVER_PREDEFINED_STATUS_BY_STEP,
  parseDriverUpdatesFromNotes,
  type ParsedDriverStatusNote,
} from "@/features/driver/utils/driverTripStatusNotes.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import * as tripsService from "@/features/trips/services/trips.service";
import {
  dockPaddingBottom,
  effectiveKeyboardInset,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DRIVER_QUICK_MESSAGES = [
  "I have arrived at pickup.",
  "Loading in progress.",
  "Documents collected. Departing now.",
  "En route to delivery point.",
  "I have reached the destination.",
  "POD submitted. Trip complete.",
  "Need assistance — please call.",
  "Running 30 minutes behind schedule.",
];

function isStatusNoteRedundantWithChat(
  u: ParsedDriverStatusNote,
  messages: TripMessageRow[],
): boolean {
  const t = new Date(u.timestamp).getTime();
  return messages.some(
    (m) =>
      m.sender_role === "driver" &&
      m.message_type === "text" &&
      m.content.trim() === u.message.trim() &&
      Math.abs(new Date(m.created_at).getTime() - t) < 120_000,
  );
}

function UploadingImagePreview({ localUri }: { localUri: string }) {
  return (
    <View style={localStyles.uploadShell}>
      <Image source={{ uri: localUri }} style={localStyles.uploadImg} contentFit="cover" />
      <View style={localStyles.uploadOverlay}>
        <ActivityIndicator color="#fff" size="small" />
      </View>
    </View>
  );
}

export type DriverChatSlackThreadProps = {
  conversationId: string;
  organizationId: string;
  tripId: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
  fleetName?: string | null;
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSend: () => void;
  onSendTripChat: (text: string) => Promise<void>;
  onBack: () => void;
};

export function DriverChatSlackThread({
  conversationId,
  organizationId,
  tripId,
  tripNumber,
  pickupArea,
  dropLocation,
  fleetName,
  messageInput,
  setMessageInput,
  onSend,
  onSendTripChat,
  onBack,
}: DriverChatSlackThreadProps) {
  const { profile } = useAuth();
  const orgCtx = useOptionalOrganization();
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  const selfUid = profile?.uid ?? null;
  const selfName = profile?.full_name || profile?.displayName || "You";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const { keyboardVisible: keyboardOpen, keyboardHeight } = useKeyboardVisible();
  const keyboardInset = effectiveKeyboardInset(keyboardOpen, keyboardHeight);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusSending, setStatusSending] = useState<string | null>(null);
  const mountedAtMs = useRef(Date.now()).current;

  const {
    messages,
    isLoading: messagesLoading,
    hasOlder,
    isFetchingOlder,
    loadOlder,
  } = useDriverChatSystem({
    conversationId,
    organizationId,
    selfUid,
    enabled: true,
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvt, () => {
      setTimeout(
        () => scrollRef.current?.scrollToEnd({ animated: true }),
        Platform.OS === "ios" ? 80 : 120,
      );
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTrip(null);
    void tripsService.getTripById(tripId).then(({ trip: t }) => {
      if (!cancelled) setTrip(t);
    });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const statusNotes = useMemo(
    () => parseDriverUpdatesFromNotes(trip?.notes ?? null),
    [trip?.notes],
  );

  const displayMessages = useMemo(
    () =>
      messages.filter(
        (m) => m.message_type !== "system" || isLocationPingMessage(m),
      ),
    [messages],
  );

  const senderKey = useCallback(
    (m: TripMessageRow) =>
      m.sender_role === "driver" ? "__self__" : tripChatMessageSenderKey(m),
    [],
  );

  const mediaBurstIndex = useMemo(
    () =>
      buildChatMediaBurstIndex(displayMessages, {
        senderKey,
      }),
    [displayMessages, senderKey],
  );

  const slackGroupMeta = useMemo(
    () =>
      buildSlackMessageGroupMap(displayMessages, {
        isGroupable: isSlackGroupableTripMessage,
        senderKey,
        createdAt: (m) => m.created_at,
      }),
    [displayMessages, senderKey],
  );

  const merged = useMemo(() => {
    type Row =
      | { key: string; kind: "msg"; m: TripMessageRow }
      | { key: string; kind: "status"; u: ParsedDriverStatusNote };
    const items: Row[] = [];
    for (const m of displayMessages) {
      if (mediaBurstIndex.skipIds.has(m.id)) continue;
      items.push({ key: `m-${m.id}`, kind: "msg", m });
    }
    statusNotes.forEach((u, i) => {
      if (isStatusNoteRedundantWithChat(u, messages)) return;
      items.push({
        key: `s-${u.timestamp}-${i}-${u.message.slice(0, 12)}`,
        kind: "status",
        u,
      });
    });
    items.sort((a, b) => {
      const ta =
        a.kind === "msg"
          ? new Date(a.m.created_at).getTime()
          : new Date(a.u.timestamp).getTime();
      const tb =
        b.kind === "msg"
          ? new Date(b.m.created_at).getTime()
          : new Date(b.u.timestamp).getTime();
      return ta - tb;
    });
    return items;
  }, [displayMessages, mediaBurstIndex.skipIds, messages, statusNotes]);

  const flowStep = trip ? deriveDriverFlowStepFromTrip(trip) : "completed";
  const predefinedForStep = DRIVER_PREDEFINED_STATUS_BY_STEP[flowStep] ?? [];

  const sendStatusLine = async (label: string) => {
    if (!trip || flowStep === "completed") return;
    setStatusSending(label);
    const res = await appendDriverStatusNote(trip.id, flowStep, label);
    if (!res.error) {
      const { trip: next } = await tripsService.getTripById(tripId);
      if (next) setTrip(next);
      try {
        await onSendTripChat(label);
      } catch {
        // Notes updated; chat row may fail independently
      }
    }
    setStatusSending(null);
  };

  const handleOpenAttach = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to share images in chat.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const localUri = result.assets[0].uri;
    const senderName = profile?.full_name ?? "Driver";
    const tempId = `opt-${Date.now()}`;
    const optimistic: TripMessageRow = {
      id: tempId,
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_user_id: selfUid ?? "",
      sender_role: "driver",
      sender_name: senderName,
      content: "Photo",
      message_type: "image",
      is_read: true,
      read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      metadata: {
        local_uri: localUri,
        storage_path: "",
        mime_type: "image/jpeg",
      } as unknown as TripMessageRow["metadata"],
    };

    const msgKey = driverChatMessagesQueryKey(conversationId);
    queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
      msgKey,
      (old) => appendDriverChatMessageToCache(old, optimistic),
    );
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

    setUploading(true);
    try {
      const { storagePath } = await compressAndUploadChatImage(localUri, conversationId);
      const persisted = await chatService.sendChatMessage({
        conversationId,
        organizationId,
        content: "Photo",
        senderRole: "driver",
        senderName,
        senderUserId: selfUid,
        messageType: "document_share",
        metadata: {
          document_name: "Photo",
          document_type: "Photo",
          storage_path: storagePath,
          mime_type: "image/jpeg",
        },
      });
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
        msgKey,
        (old) => replaceDriverChatMessageInCache(old, tempId, persisted),
      );
    } catch (err: unknown) {
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
        msgKey,
        (old) => removeDriverChatMessageFromCache(old, tempId),
      );
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Could not upload image.",
      );
    } finally {
      setUploading(false);
    }
  }, [conversationId, organizationId, profile, selfUid, queryClient]);

  const ownAvatar: ResolvedPartyAvatarIdentity = useMemo(
    () => ({
      displayName: selfName,
      entityType: "driver",
    }),
    [selfName],
  );

  const fleetAvatar: ResolvedPartyAvatarIdentity = useMemo(
    () => ({
      displayName: fleetName?.trim() || "Fleet",
      entityType: "client",
    }),
    [fleetName],
  );

  const renderTripMessage = (m: TripMessageRow) => {
    const own = m.sender_role === "driver";
    const burstLeader = mediaBurstIndex.leaders.get(m.id);
    if (burstLeader) {
      const burstIsNew = burstLeader.messages.some(
        (msg) => Date.parse(msg.created_at) > mountedAtMs,
      );
      return (
        <ChatMediaBurstRow
          burst={burstLeader}
          senderName={own ? selfName : m.sender_name?.trim() || "Fleet"}
          timestamp={m.created_at}
          avatar={own ? ownAvatar : fleetAvatar}
          isOwn={own}
          userName={selfName}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={currentOrganization?.logo_url ?? null}
          variant="mobile"
          group={slackGroupMeta.get(m.id)}
          isNew={burstIsNew}
        />
      );
    }

    if (isLocationPingMessage(m)) {
      const loc = parseSystemLogLocationData(m);
      return (
        <ChatLocationSystemCard
          message={m}
          location={loc}
          isMobile
          isOwnDriverSend={own}
        />
      );
    }

    if (m.message_type === "image") {
      const meta = m.metadata as { storage_path?: string; local_uri?: string } | null;
      const localUri = String(meta?.local_uri ?? "").trim();
      if (localUri && !String(meta?.storage_path ?? "").trim()) {
        return (
          <View style={[slackSt.threadMsgRow, slackSt.threadMsgRowLead]}>
            <View style={slackSt.threadMsgAvatarCircle}>
              <ChatPartyAvatar
                identity={ownAvatar}
                size={SLACK_AVATAR.thread}
                isOwnUser
                userName={selfName}
                userAvatarUrl={profile?.avatar_url ?? null}
                userAvatarSeed={profile?.avatar_seed ?? null}
                userOrgLogoUrl={currentOrganization?.logo_url ?? null}
              />
            </View>
            <View style={[slackSt.threadMsgBody, { paddingTop: 4 }]}>
              <UploadingImagePreview localUri={localUri} />
            </View>
          </View>
        );
      }
    }

    if (m.message_type === "ledger_event") return null;

    const peerLabel = m.sender_name?.trim() || fleetName?.trim() || "Fleet";
    const peerAvatar = fleetAvatar;

    return (
      <ChatSlackMessageRow
        senderName={own ? selfName : peerLabel}
        content={stripChatPreviewEmojiPrefix(m.content)}
        timestamp={m.created_at}
        avatar={own ? ownAvatar : peerAvatar}
        isOwn={own}
        userName={selfName}
        userAvatarUrl={profile?.avatar_url ?? null}
        userAvatarSeed={profile?.avatar_seed ?? null}
        userOrgLogoUrl={currentOrganization?.logo_url ?? null}
        variant="mobile"
        group={slackGroupMeta.get(m.id)}
        isNew={Date.parse(m.created_at) > mountedAtMs}
      />
    );
  };

  const routeSubtitle = `${pickupArea || trip?.pickup_area || ""}${
    dropLocation || trip?.drop_location ? ` → ${dropLocation || trip?.drop_location}` : ""
  }`.trim();

  const composerDock = (
    <View
      style={[
        localStyles.composerDock,
        { paddingBottom: dockPaddingBottom(insets.bottom, keyboardOpen) },
        Platform.OS === "android" &&
          keyboardInset > 0 && { paddingBottom: keyboardInset },
      ]}
    >
      {predefinedForStep.length > 0 ? (
        <View style={localStyles.quickStatusBlock}>
          <Text style={localStyles.quickStatusLabel}>Quick status</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={localStyles.quickStatusChipRow}
            keyboardShouldPersistTaps="handled"
          >
            {predefinedForStep.map((label) => (
              <TouchableOpacity
                key={label}
                style={[
                  localStyles.quickStatusChip,
                  statusSending === label && localStyles.quickStatusChipBusy,
                ]}
                onPress={() => void sendStatusLine(label)}
                disabled={!!statusSending || !trip}
                activeOpacity={0.75}
              >
                {statusSending === label ? (
                  <ActivityIndicator size="small" color={Theme.primary} />
                ) : (
                  <Text style={localStyles.quickStatusChipText} numberOfLines={2}>
                    {label}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ChatMobileComposer
        variant="slack"
        value={messageInput}
        onChangeText={setMessageInput}
        onSend={onSend}
        onOpenAttach={uploading ? undefined : handleOpenAttach}
        quickMessages={DRIVER_QUICK_MESSAGES}
        hideQuickChips={keyboardOpen}
        placeholder={uploading ? "Uploading image…" : `Message ${fleetName?.trim() || "fleet"}`}
      />
    </View>
  );

  const threadBody = (
    <>
      <ChatSlackThreadHeader
        title={tripNumber || trip?.trip_number || "Trip"}
        subtitle={routeSubtitle || undefined}
        avatarIdentity={fleetAvatar}
        onBack={onBack}
        compactRoleTag="Driver"
      />
      {uploading ? (
        <View style={localStyles.uploadBar}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={localStyles.uploadBarText}>Uploading photo…</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={localStyles.threadScroll}
        contentContainerStyle={slackSt.threadMsgsContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        onScroll={(e) => {
          if (!hasOlder || isFetchingOlder) return;
          if (e.nativeEvent.contentOffset.y < 80) void loadOlder();
        }}
        scrollEventThrottle={200}
      >
        {messagesLoading ? (
          <View style={localStyles.centered}>
            <LoadingIndicator size="small" color={Theme.primary} />
          </View>
        ) : null}
        {isFetchingOlder ? (
          <View style={localStyles.centeredCompact}>
            <LoadingIndicator size="small" color="#94a3b8" />
          </View>
        ) : null}
        {merged.length === 0 && !messagesLoading ? (
          <View style={slackSt.threadSysMsg}>
            <Text style={slackSt.threadSysMsgText}>
              No messages yet — use quick status or reply below.
            </Text>
          </View>
        ) : (
          merged.map((row) =>
            row.kind === "status" ? (
              <View key={row.key} style={slackSt.threadSysMsg}>
                <Text style={slackSt.threadSysMsgText}>{row.u.message}</Text>
              </View>
            ) : (
              <View key={row.key}>{renderTripMessage(row.m)}</View>
            ),
          )
        )}
        <ChatHistoryExpiryNotice slackLayout />
      </ScrollView>
      {composerDock}
    </>
  );

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        style={localStyles.root}
        behavior="padding"
        keyboardVerticalOffset={insets.top}
      >
        {threadBody}
      </KeyboardAvoidingView>
    );
  }

  return <View style={localStyles.root}>{threadBody}</View>;
}

const localStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  threadScroll: { flex: 1 },
  composerDock: {
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(24, 28, 50, 0.08)",
  },
  centered: { paddingVertical: 24, alignItems: "center" },
  centeredCompact: { paddingVertical: 8, alignItems: "center" },
  quickStatusBlock: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  quickStatusLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  quickStatusChipRow: { gap: 8, paddingBottom: 4 },
  quickStatusChip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(91, 94, 244, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.2)",
    minHeight: 40,
    justifyContent: "center",
  },
  quickStatusChipBusy: { opacity: 0.7 },
  quickStatusChipText: {
    fontSize: 11,
    color: "#4B4ACF",
    fontWeight: "600",
  },
  uploadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "rgba(91, 94, 244, 0.06)",
  },
  uploadBarText: { fontSize: 12, color: "#64748b", fontWeight: "500" },
  uploadShell: {
    width: 160,
    height: 120,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  uploadImg: { width: "100%", height: "100%" },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});
