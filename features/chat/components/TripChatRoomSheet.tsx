/**
 * Unified trip chat room — first Phase 2 UI surface.
 *
 * Full-screen sheet on trip detail: one room per trip (dispatcher, driver,
 * linked client/supplier org members). Uses the platform `chat_*` store and
 * conversation-scoped realtime — not the legacy 3-lane trip chat UI.
 */
import React, { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { Theme } from "@/constants/Theme";

import { TripChatRoomActionCard } from "./TripChatRoomActionCard";
import { useTripChatRoom } from "../hooks/useTripChatRoom";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";
import { handleTripChatRoomAction } from "../utils/tripChatRoomActions.util";

export interface TripChatRoomSheetProps {
  visible: boolean;
  tripId: string | null;
  tripLabel?: string;
  onClose: () => void;
  onViewTrip?: () => void;
}

function MessageBubble({ message }: { message: ChatPlatformMessageRow }) {
  const isSystem =
    message.sender_type === "system" || message.sender_type === "integration";
  const deleted = !!message.deleted_at;

  if (message.message_type === "action_card") {
    return <TripChatRoomActionCard message={message} />;
  }

  if (isSystem && message.message_type !== "text") {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>
          {deleted ? "Message removed" : message.content}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, isSystem && styles.bubbleSystem]}>
      {!isSystem && message.sender_name ? (
        <Text style={styles.senderName}>{message.sender_name}</Text>
      ) : null}
      <Text style={styles.bubbleText}>
        {deleted ? "Message removed" : message.content}
      </Text>
    </View>
  );
}

export function TripChatRoomSheet({
  visible,
  tripId,
  tripLabel,
  onClose,
  onViewTrip,
}: TripChatRoomSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const { room, messages, isLoading, isError, sendMessage, openRoom } =
    useTripChatRoom(visible ? tripId : null, { enabled: visible && !!tripId });

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({ content: text, messageType: "text" });
      setDraft("");
    } finally {
      setSending(false);
    }
  }, [draft, sendMessage, sending]);

  const handleAction = useCallback(
    (actionId: string, message: ChatPlatformMessageRow) => {
      if (!tripId) return;
      const handled = handleTripChatRoomAction(actionId, message, {
        tripId,
        router,
        onClose,
      });
      if (!handled && actionId === "view_trip") onViewTrip?.();
    },
    [tripId, router, onClose, onViewTrip],
  );

  const title = tripLabel?.trim() || room?.title || "Trip chat";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Close trip chat"
          >
            <Feather name="x" size={22} color={Theme.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSub}>Team room · all parties</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {isLoading ? (
          <CenteredLoadingView />
        ) : isError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Could not load trip chat.</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => void openRoom.mutateAsync()}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 8, paddingTop: insets.bottom + 72 },
            ]}
            renderItem={({ item }) =>
              item.message_type === "action_card" ? (
                <TripChatRoomActionCard
                  message={item}
                  onAction={(id, msg) => handleAction(id, msg)}
                />
              ) : (
                <MessageBubble message={item} />
              )
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>
                  Status updates, documents, and payments appear here automatically.
                </Text>
              </View>
            }
          />
        )}

        <View
          style={[
            styles.composeBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Message the trip team…"
            placeholderTextColor={Theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={8000}
            editable={!isLoading && !isError}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={() => void handleSend()}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator size="small" color={Theme.textOnDark} />
            ) : (
              <Feather name="send" size={18} color={Theme.textOnDark} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
  },
  bubbleSystem: {
    alignSelf: "center",
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: "transparent",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: Theme.textPrimary,
  },
  systemWrap: {
    alignSelf: "center",
    marginVertical: 6,
    paddingHorizontal: 12,
  },
  systemText: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Theme.textPrimary,
    backgroundColor: Theme.screenBackground,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: Theme.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Theme.pulseIndigoWash,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.primary,
  },
  empty: {
    transform: [{ scaleY: -1 }],
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center",
  },
});
