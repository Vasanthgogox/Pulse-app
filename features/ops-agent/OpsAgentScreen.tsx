/**
 * Ops Agent screen — Autopilot Interface.
 * Conversational commands via Gemini (e.g. "Add a client"); in-chat confirmation cards, report PDF.
 * Used by app/(tabs)/index (tab) and can be used by other routes.
 *
 * Refactored: logic in useOpsContext + useOpsAgentChat, UI in components/, shared types/constants/utils/styles in module files.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  OpsAgentEmptyState,
  OpsAgentHeader,
  OpsAgentInputBar,
  OpsAgentMessageRow,
  OpsAgentReattemptBubble,
  OpsAgentSuccessToast,
  OpsAgentTypingIndicator
} from "./components/index";
import { REF_DARK, REF_LIGHT, SP } from "./constants";
import { getOpsAgentStyles } from "./opsAgentStyles";
import type { OpsRef } from "./types";
import { useOpsAgentChat } from "./useOpsAgentChat";
import { useOpsContext } from "./useOpsContext";
import { useClientsForTrip } from "@/features/trips/components/add-trip/useClientsForTrip";

export default function OpsAgentScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const opsContext = useOpsContext(currentOrganization?.id);
  const { clients: tripClients, loading: tripClientsLoading } = useClientsForTrip(
    currentOrganization?.id ?? null
  );

  const [isDarkMode, setIsDarkMode] = useState(true);
  const REF: OpsRef = isDarkMode ? REF_DARK : REF_LIGHT;
  const styles = useMemo(() => getOpsAgentStyles(REF), [isDarkMode]);

  const userInitial = (
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "?"
  )
    .charAt(0)
    .toUpperCase();

  const chat = useOpsAgentChat({
    currentOrganization,
    profile,
    user,
    opsContext,
  });

  const {
    messages,
    setChatInput,
    chatInput,
    isTyping,
    showSuccess,
    successToastMessage,
    error,
    editingPreviewIndex,
    setEditingPreviewIndex,
    pdfDownloadingTitle,
    reattemptPayload,
    editingMessageIndex,
    editingMessageContent,
    setEditingMessageContent,
    pendingAttachment,
    setPendingAttachment,
    showAttachMenu,
    setShowAttachMenu,
    keyboardVisible,
    keyboardHeight,
    triggerSuccess,
    handleSendMessage,
    startEditingMessage,
    cancelEditingMessage,
    submitEditedMessage,
    copyMessageContent,
    updatePreviewData,
    handlePreviewUpdate,
    updatePendingConfirmData,
    handlePendingConfirmCancel,
    handlePendingConfirmSubmit,
    handleDownloadReportPdf,
    handleReattemptCreation,
    handleTakePhoto,
    handlePickImage,
    handleShareAgentMessage,
    handleAgentMessageMore,
    runProcessMessages,
  } = chat;

  useEffect(() => {
    if ((messages.length > 0 || reattemptPayload) && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, isTyping, reattemptPayload]);

  const showEmptyState = messages.length === 1 && messages[0].role === "system";

  return (
    <View style={[styles.container, { backgroundColor: REF.bg }]}>
      <OpsAgentSuccessToast
        visible={showSuccess}
        message={successToastMessage}
        themeRef={REF}
        styles={styles}
        topOffset={insets.top + SP.xl}
      />

      <OpsAgentHeader
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((p) => !p)}
        userInitial={userInitial}
        styles={styles}
        themeRef={REF}
        topInset={insets.top}
      />

      <View style={[styles.keyboardView, { marginBottom: keyboardHeight }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={[styles.messageListContent, { paddingBottom: SP.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {showEmptyState ? (
            <OpsAgentEmptyState
              onQuickPillPress={(label) => setChatInput(label)}
              styles={styles}
            />
          ) : (
            <>
          {messages.map((msg, i) => (
                <OpsAgentMessageRow
              key={i}
                  msg={msg}
                  index={i}
                  userInitial={userInitial}
                  REF={REF}
                  styles={styles}
                  editingMessageIndex={editingMessageIndex}
                  editingMessageContent={editingMessageContent}
                  setEditingMessageContent={setEditingMessageContent}
                  isTyping={isTyping}
                  pdfDownloadingTitle={pdfDownloadingTitle}
                  editingPreviewIndex={editingPreviewIndex}
                  setEditingPreviewIndex={setEditingPreviewIndex}
                  messages={messages}
                  tripClients={tripClients}
                  tripClientsLoading={tripClientsLoading}
                  onCopyMessage={copyMessageContent}
                  onStartEditingMessage={startEditingMessage}
                  onCancelEditingMessage={cancelEditingMessage}
                  onSubmitEditedMessage={submitEditedMessage}
                  onUpdatePreviewData={updatePreviewData}
                  onPreviewUpdate={handlePreviewUpdate}
                  onUpdatePendingConfirmData={updatePendingConfirmData}
                  onPendingConfirmCancel={handlePendingConfirmCancel}
                  onPendingConfirmSubmit={handlePendingConfirmSubmit}
                  onDownloadReportPdf={handleDownloadReportPdf}
                  onShareAgentMessage={handleShareAgentMessage}
                  onAgentMessageMore={handleAgentMessageMore}
                  runProcessMessages={runProcessMessages}
                  triggerSuccess={triggerSuccess}
                />
              ))}
              {isTyping && <OpsAgentTypingIndicator themeRef={REF} styles={styles} />}
              {reattemptPayload && (
                <OpsAgentReattemptBubble
                  onReattempt={handleReattemptCreation}
                  themeRef={REF}
                  styles={styles}
                />
              )}
            </>
          )}
        </ScrollView>

        <OpsAgentInputBar
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSend={handleSendMessage}
          isTyping={isTyping}
          pendingAttachment={pendingAttachment}
          onRemoveAttachment={() => setPendingAttachment(null)}
          showAttachMenu={showAttachMenu}
          onToggleAttachMenu={() => setShowAttachMenu((v) => !v)}
          onTakePhoto={handleTakePhoto}
          onPickImage={handlePickImage}
          onAddContact={() => {
            setPendingAttachment({
              type: "contact",
              data: { name: "Raj Kumar", role: "Prime Pilot", phone: "+91 98765 43210" },
            });
            setShowAttachMenu(false);
          }}
          keyboardVisible={keyboardVisible}
          onDismissKeyboard={() => Keyboard.dismiss()}
          error={error}
          triggerSuccess={triggerSuccess}
          themeRef={REF}
          styles={styles}
          bottomPadding={insets.bottom}
        />
              </View>
    </View>
  );
}
