/**
 * Ops Agent chat state and handlers — messages, send, confirm, preview update, attachments.
 */
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
  CONFIRM_EXPIRY_MS,
  executePendingCreateClient,
  executePendingCreateSupplier,
  executePendingCreateVehicle,
  executePendingCreateDriver,
  executePendingCreateTrip,
  processOpsMessage,
  type ChatReportData,
  type CreatedEntitySnapshot,
  type LastMessageImage,
  type OpsContext,
  type OpsSessionState,
} from "@/features/ops-agent/services/ops-agent.service";
import { updateClient } from "@/features/clients";
import { updateSupplier } from "@/features/suppliers";
import { updateVehicle } from "@/features/vehicles";
import { updateDriver } from "@/features/drivers";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Keyboard, Share } from "react-native";
import { useEffect, useRef, useState } from "react";
import { INITIAL_MESSAGES } from "./constants";
import type { Message, MessageAttachment } from "./types";
import { toNaturalLanguageReply, reportToHtml, reportToPlainText } from "./utils";

export interface UseOpsAgentChatParams {
  currentOrganization: { id: string } | null;
  profile: { role?: string; aggregated?: boolean; asset?: boolean; uid?: string } | null;
  user: { uid: string } | null;
  opsContext: OpsContext | null;
}

export function useOpsAgentChat({
  currentOrganization,
  profile,
  user,
  opsContext,
}: UseOpsAgentChatParams) {
  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role ?? "",
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null
  );

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState("Synced.");
  const [error, setError] = useState<string | null>(null);
  const [editingPreviewIndex, setEditingPreviewIndex] = useState<number | null>(null);
  const [opsSessionState, setOpsSessionState] = useState<OpsSessionState | undefined>(undefined);
  const [pdfDownloadingTitle, setPdfDownloadingTitle] = useState<string | null>(null);
  const [reattemptPayload, setReattemptPayload] = useState<{
    contact_person: string;
    phone: string;
    organization_name?: string;
  } | null>(null);
  const [reattemptCount, setReattemptCount] = useState(0);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = (e: { endCoordinates: { height: number } }) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    };
    const hide = () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    };
    const subShow = Keyboard.addListener("keyboardDidShow", show);
    const subHide = Keyboard.addListener("keyboardDidHide", hide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const triggerSuccess = (message?: string) => {
    setSuccessToastMessage(message ?? "Synced.");
    setShowSuccess(true);
    const duration = message ? 2500 : 1200;
    const t = setTimeout(() => setShowSuccess(false), duration);
    return () => clearTimeout(t);
  };

  const runProcessMessages = (
    nextMessages: Message[],
    sessionState?: OpsSessionState,
    lastMessageImage?: LastMessageImage
  ) => {
    setError(null);
    setIsTyping(true);
    processOpsMessage({
      messages: nextMessages,
      organizationId: currentOrganization?.id ?? null,
      capabilities,
      userId: user?.uid ?? profile?.uid,
      sessionState,
      opsContext: opsContext ?? undefined,
      lastUserMessageImage: lastMessageImage,
    })
      .then((result) => {
        setIsTyping(false);
        setOpsSessionState(result.sessionState);
        if (result.error) setError(result.error);

        const requestedAt = result.sessionState?.confirmationRequestedAt ?? 0;
        const expired = Date.now() - requestedAt > CONFIRM_EXPIRY_MS;

        if (result.requiresUiConfirmation && result.sessionState && !expired) {
          if (result.sessionState.pendingCreateClientPayload) {
            const p = result.sessionState.pendingCreateClientPayload;
            setReattemptCount(0);
            setMessages([
              ...nextMessages,
              {
                role: "system",
                content: toNaturalLanguageReply(result.reply ?? ""),
                pendingConfirm: {
                  type: "client",
                  data: {
                    contact_person: p.contact_person ?? "",
                    phone: p.phone ?? "",
                    organization_name: p.organization_name ?? "",
                  },
                },
              },
            ]);
          } else if (result.sessionState.pendingCreateSupplierPayload) {
            const p = result.sessionState.pendingCreateSupplierPayload;
            setMessages([
              ...nextMessages,
              {
                role: "system",
                content: toNaturalLanguageReply(result.reply ?? ""),
                pendingConfirm: {
                  type: "supplier",
                  data: {
                    phone: p.phone ?? "",
                    company_name: p.company_name ?? "",
                    contact_person: p.contact_person ?? "",
                    email: p.email ?? "",
                  },
                },
              },
            ]);
          } else if (result.sessionState.pendingCreateVehiclePayload) {
            const p = result.sessionState.pendingCreateVehiclePayload;
            setMessages([
              ...nextMessages,
              {
                role: "system",
                content: toNaturalLanguageReply(result.reply ?? ""),
                pendingConfirm: {
                  type: "vehicle",
                  data: {
                    vehicle_number: p.vehicle_number ?? "",
                    vehicle_brand: p.vehicle_brand ?? "",
                    vehicle_body_type: p.vehicle_body_type ?? "",
                    vehicle_size: p.vehicle_size ?? "",
                    vehicle_axle: p.vehicle_axle ?? "",
                  },
                },
              },
            ]);
          } else if (result.sessionState.pendingCreateDriverPayload) {
            const p = result.sessionState.pendingCreateDriverPayload;
            setMessages([
              ...nextMessages,
              {
                role: "system",
                content: toNaturalLanguageReply(result.reply ?? ""),
                pendingConfirm: {
                  type: "driver",
                  data: {
                    name: p.name ?? "",
                    phone: p.phone ?? "",
                    license_number: p.license_number ?? "",
                    payable_amount: p.payable_amount,
                    commission_percent: p.commission_percent,
                    commission_per_km: p.commission_per_km,
                  },
                },
              },
            ]);
          } else if (result.sessionState.pendingCreateTripPayload) {
            const p = result.sessionState.pendingCreateTripPayload;
            setMessages([
              ...nextMessages,
              {
                role: "system",
                content: toNaturalLanguageReply(result.reply ?? ""),
                pendingConfirm: {
                  type: "trip",
                  data: {
                    pickup_area: p.pickup_area ?? "",
                    drop_location: p.drop_location ?? "",
                    client_name: p.client_name ?? "",
                    client_price: p.client_price ?? 0,
                    supply_source: p.supply_source ?? "asset",
                    supplier_rate: p.supplier_rate ?? 0,
                  },
                },
              },
            ]);
          } else {
            setMessages([...nextMessages, { role: "system", content: toNaturalLanguageReply(result.reply ?? "") }]);
          }
        } else if (expired && result.requiresUiConfirmation) {
          setOpsSessionState(undefined);
          setMessages([
            ...nextMessages,
            { role: "system", content: toNaturalLanguageReply(result.reply ?? "") },
            { role: "system", content: "Request expired. Please start again." },
          ]);
        } else {
          setMessages([
            ...nextMessages,
            {
              role: "system",
              content: toNaturalLanguageReply(result.reply ?? ""),
              ...(result.reportData ? { reportData: result.reportData } : {}),
            },
          ]);
          if (result.executed) triggerSuccess();
        }
      })
      .catch((err) => {
        setIsTyping(false);
        const errMessage = err instanceof Error ? err.message : "Request failed.";
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Something went wrong: ${errMessage}. Please try again.` },
        ]);
        setError(errMessage);
      });
  };

  const handleSendMessage = () => {
    const trimmed = chatInput.trim();
    if (!trimmed && !pendingAttachment) return;
    const userContent =
      trimmed ||
      (pendingAttachment?.type === "contact"
        ? `Contact: ${pendingAttachment.data.name}`
        : pendingAttachment?.type === "image"
          ? "I'm attaching an image. Please extract any details you can (e.g. for add client/supplier/driver/vehicle) and ask for missing fields."
          : "Image attached");
    const userMsg: Message = { role: "user", content: userContent, attachment: pendingAttachment ?? undefined };
    const nextMessages: Message[] = [...messages, userMsg];
    setMessages(nextMessages);
    setChatInput("");
    const imageToSend: LastMessageImage | undefined =
      pendingAttachment?.type === "image" && pendingAttachment.data
        ? { mimeType: pendingAttachment.mimeType ?? "image/jpeg", data: pendingAttachment.data }
        : undefined;
    setPendingAttachment(null);
    runProcessMessages(
      nextMessages.map((m) => ({ role: m.role, content: m.content })),
      opsSessionState,
      imageToSend
    );
  };

  const startEditingMessage = (index: number) => {
    if (messages[index]?.role !== "user") return;
    setEditingMessageIndex(index);
    setEditingMessageContent(messages[index].content);
  };

  const cancelEditingMessage = () => {
    setEditingMessageIndex(null);
    setEditingMessageContent("");
  };

  const submitEditedMessage = () => {
    const trimmed = editingMessageContent.trim();
    if (editingMessageIndex == null || trimmed === "") return;
    const newMessages: Message[] = [
      ...messages.slice(0, editingMessageIndex),
      { role: "user", content: trimmed },
    ];
    setMessages(newMessages);
    setEditingMessageIndex(null);
    setEditingMessageContent("");
    runProcessMessages(newMessages, undefined);
  };

  const clipboardClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COPY_CLIPBOARD_CLEAR_MS = 60_000;

  const copyMessageContent = (raw: string, isSystem: boolean) => {
    const t = (isSystem ? toNaturalLanguageReply(raw) : raw)?.trim() || "";
    if (!t) return;
    if (clipboardClearTimeoutRef.current) {
      clearTimeout(clipboardClearTimeoutRef.current);
      clipboardClearTimeoutRef.current = null;
    }
    Clipboard.setStringAsync(t)
      .then(() => {
        triggerSuccess("Copied");
        clipboardClearTimeoutRef.current = setTimeout(() => {
          Clipboard.setStringAsync("").catch(() => {});
          clipboardClearTimeoutRef.current = null;
        }, COPY_CLIPBOARD_CLEAR_MS);
      })
      .catch(() => triggerSuccess("Copied"));
  };

  useEffect(() => () => {
    if (clipboardClearTimeoutRef.current) {
      clearTimeout(clipboardClearTimeoutRef.current);
    }
  }, []);

  const updatePreviewData = (messageIndex: number, data: Record<string, unknown>) => {
    setMessages((prev) =>
      prev.map((m, idx) =>
        idx === messageIndex && m.createdPreview
          ? { ...m, createdPreview: { ...m.createdPreview, data } }
          : m
      )
    );
  };

  const handlePreviewUpdate = async (messageIndex: number) => {
    const msg = messages[messageIndex];
    const preview = msg?.createdPreview;
    if (!preview || !currentOrganization?.id) return;
    if (preview.updated && editingPreviewIndex !== messageIndex) return;
    setError(null);
    const orgId = currentOrganization.id;
    const data = preview.data as Record<string, string>;
    let err: string | null = null;
    if (preview.type === "client") {
      const res = await updateClient(orgId, preview.id, {
        contact_person: data.contact_person,
        phone: data.phone,
        organization_name: data.organization_name,
      });
      err = res.error?.message ?? null;
    } else if (preview.type === "supplier") {
      const res = await updateSupplier(orgId, preview.id, {
        phone: data.phone,
        company_name: data.company_name,
        contact_person: data.contact_person,
        email: data.email,
      });
      err = res.error?.message ?? null;
    } else if (preview.type === "vehicle") {
      const res = await updateVehicle(orgId, preview.id, {
        vehicle_number: data.vehicle_number,
        vehicle_brand: data.vehicle_brand || undefined,
        vehicle_body_type: data.vehicle_body_type || undefined,
        vehicle_size: data.vehicle_size || undefined,
        vehicle_axle: data.vehicle_axle || undefined,
      });
      err = res.error?.message ?? null;
    } else if (preview.type === "driver") {
      const res = await updateDriver(orgId, preview.id, {
        name: data.name,
        phone: data.phone,
      });
      err = res.error?.message ?? null;
    }
    if (err) {
      setError(err);
      return;
    }
    setMessages((prev) =>
      prev.map((m, idx) =>
        idx === messageIndex && m.createdPreview
          ? { ...m, createdPreview: { ...m.createdPreview, updated: true } }
          : m
      )
    );
    setEditingPreviewIndex(null);
    triggerSuccess("Successfully added. You can edit this in history or in the app.");
  };

  const updatePendingConfirmData = (messageIndex: number, data: Record<string, unknown>) => {
    setMessages((prev) =>
      prev.map((m, idx) =>
        idx === messageIndex && m.pendingConfirm
          ? { ...m, pendingConfirm: { ...m.pendingConfirm, data } }
          : m
      )
    );
  };

  const handlePendingConfirmCancel = (messageIndex: number) => {
    const msg = messages[messageIndex];
    const pending = msg?.pendingConfirm;
    if (!pending) return;
    setOpsSessionState(undefined);
    setMessages((prev) => {
      const next = prev.map((m, idx) =>
        idx === messageIndex && m.pendingConfirm ? { ...m, pendingConfirm: undefined } : m
      );
      const cancelMsg =
        pending.type === "client"
          ? "Client creation cancelled."
          : pending.type === "supplier"
            ? "Supplier creation cancelled."
            : pending.type === "vehicle"
              ? "Vehicle creation cancelled."
              : "Driver creation cancelled.";
      next.push({ role: "system", content: cancelMsg });
      if (pending.type === "client" && reattemptCount >= 2) {
        next.push({ role: "system", content: "Edit your message above and tap Run again to try again." });
      }
      return next;
    });
    if (pending.type === "client" && reattemptCount < 2) {
      const d = pending.data as Record<string, string>;
      setReattemptPayload({
        contact_person: d.contact_person ?? "",
        phone: d.phone ?? "",
        organization_name: d.organization_name || undefined,
      });
    }
  };

  const handlePendingConfirmSubmit = (messageIndex: number) => {
    const msg = messages[messageIndex];
    const pending = msg?.pendingConfirm;
    if (!pending || !currentOrganization?.id) return;
    const caps = getCapabilitiesFromProfile(
      profile
        ? { role: profile.role ?? "", aggregated: profile.aggregated, asset: profile.asset }
        : null
    );
    const orgId = currentOrganization.id;
    const uid = user?.uid ?? profile?.uid;
    const data = pending.data as Record<string, string | number | undefined>;
    setError(null);

    const onSuccess = (
      outcome: { success: boolean; message?: string; error?: string; entity?: CreatedEntitySnapshot }
    ) => {
      setOpsSessionState(undefined);
      setReattemptPayload(null);
      setReattemptCount(0);
      if (outcome.success) {
        const defaultMsg =
          pending.type === "client"
            ? "Client created."
            : pending.type === "supplier"
              ? "Supplier created."
              : pending.type === "vehicle"
                ? "Vehicle added."
                : pending.type === "trip"
                  ? "Trip created."
                  : "Driver added.";
        setMessages((prev) =>
          prev.map((m, idx) =>
            idx === messageIndex
              ? {
                  role: "system" as const,
                  content: outcome.message ?? defaultMsg,
                  createdPreview: outcome.entity ? { ...outcome.entity, updated: false } : undefined,
                }
              : m
          )
        );
        triggerSuccess("Successfully added. You can edit this in history or in the app.");
      } else {
        setMessages((prev) => [...prev, { role: "system", content: outcome.error ?? "Failed." }]);
        setError(outcome.error ?? null);
      }
    };

    if (pending.type === "client") {
      const contact_person = (data.contact_person ?? "").toString().trim();
      const phone = (data.phone ?? "").toString().trim();
      if (!contact_person || !phone) {
        setError("Contact name and phone are required.");
        return;
      }
      executePendingCreateClient(
        orgId,
        caps,
        { contact_person, phone, organization_name: (data.organization_name ?? "").toString().trim() || undefined },
        uid!
      ).then(onSuccess);
    } else if (pending.type === "supplier") {
      const phone = (data.phone ?? "").toString().trim();
      const company_name = (data.company_name ?? "").toString().trim() || undefined;
      const contact_person = (data.contact_person ?? "").toString().trim() || undefined;
      if (!phone) {
        setError("Phone is required.");
        return;
      }
      if (!company_name && !contact_person) {
        setError("Company name or contact person is required.");
        return;
      }
      executePendingCreateSupplier(
        orgId,
        caps,
        { phone, company_name, contact_person, email: (data.email ?? "").toString().trim() || undefined },
        uid!
      ).then(onSuccess);
    } else if (pending.type === "vehicle") {
      const vehicle_number = (data.vehicle_number ?? "").toString().trim();
      if (!vehicle_number) {
        setError("Vehicle number is required.");
        return;
      }
      executePendingCreateVehicle(
        orgId,
        caps,
        {
          vehicle_number,
          vehicle_brand: (data.vehicle_brand ?? "").toString().trim() || undefined,
          vehicle_body_type: (data.vehicle_body_type ?? "").toString().trim() || undefined,
          vehicle_size: (data.vehicle_size ?? "").toString().trim() || undefined,
          vehicle_axle: (data.vehicle_axle ?? "").toString().trim() || undefined,
        },
        uid!
      ).then(onSuccess);
    } else if (pending.type === "driver") {
      const name = (data.name ?? "").toString().trim();
      const phone = (data.phone ?? "").toString().trim();
      const license_number = (data.license_number ?? "").toString().trim();
      if (!name || !phone || !license_number) {
        setError("Name, phone and DL number are required.");
        return;
      }
      const payable_amount = typeof data.payable_amount === "number" ? data.payable_amount : undefined;
      const commission_percent = typeof data.commission_percent === "number" ? data.commission_percent : undefined;
      const commission_per_km = typeof data.commission_per_km === "number" ? data.commission_per_km : undefined;
      executePendingCreateDriver(
        orgId,
        caps,
        { name, phone, license_number, payable_amount, commission_percent, commission_per_km },
        uid!
      ).then(onSuccess);
    } else if (pending.type === "trip") {
      const pickup_area = (data.pickup_area ?? "").toString().trim();
      const drop_location = (data.drop_location ?? "").toString().trim();
      const client_name = (data.client_name ?? "").toString().trim();
      const client_price = typeof data.client_price === "number" ? data.client_price : Number(data.client_price) || 0;
      const supply_source =
        data.supply_source === "asset" || data.supply_source === "aggregate" ? data.supply_source : "asset";
      const supplier_rate = typeof data.supplier_rate === "number" ? data.supplier_rate : Number(data.supplier_rate) || 0;
      if (!pickup_area || !drop_location || !client_name) {
        setError("Origin, destination and client name are required.");
        return;
      }
      if (supply_source === "aggregate" && (supplier_rate === undefined || supplier_rate < 0)) {
        setError("Supplier rate is required for aggregate trips.");
        return;
      }
      executePendingCreateTrip(
        orgId,
        caps,
        { pickup_area, drop_location, client_name, client_price, supply_source, supplier_rate },
        uid!
      ).then(onSuccess);
    }
  };

  const handleDownloadReportPdf = async (report: ChatReportData) => {
    if (pdfDownloadingTitle !== null) return;
    setPdfDownloadingTitle(report.title);
    const html = reportToHtml(report);
    const plainText = reportToPlainText(report);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Save or share report PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Share.share({
          url: uri,
          title: report.title,
          message: "Save or share the report PDF.",
        });
      }
    } catch (e) {
      try {
        await Share.share({ message: plainText, title: report.title });
      } catch {
        const msg = e instanceof Error ? e.message : "Failed to generate or share report.";
        Alert.alert("Download failed", msg);
      }
    } finally {
      setPdfDownloadingTitle(null);
    }
  };

  const handleReattemptCreation = () => {
    if (!reattemptPayload) return;
    setReattemptCount((c) => c + 1);
    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: "Re-attempt: edit below and confirm.",
        pendingConfirm: {
          type: "client",
          data: {
            contact_person: reattemptPayload.contact_person ?? "",
            phone: reattemptPayload.phone ?? "",
            organization_name: reattemptPayload.organization_name ?? "",
          },
        },
      },
    ]);
    setReattemptPayload(null);
  };

  const handleTakePhoto = async () => {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera", "Camera permission is needed to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64 ?? null;
    if (base64) {
      setPendingAttachment({ type: "image", data: base64, mimeType: "image/jpeg" });
    } else {
      triggerSuccess("Photo taken; base64 not available on this device.");
    }
  };

  const handlePickImage = async () => {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Photo library permission is needed to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64 ?? null;
    if (base64) {
      const mime = asset.mimeType ?? "image/jpeg";
      setPendingAttachment({ type: "image", data: base64, mimeType: mime });
    } else {
      triggerSuccess("Image selected; base64 not available on this device.");
    }
  };

  const handleShareAgentMessage = (content: string) => {
    const text = toNaturalLanguageReply(content ?? "").trim() || content?.trim() || "";
    if (!text) return;
    Share.share({ message: text }).catch(() => {});
  };

  const handleAgentMessageMore = (index: number) => {
    const msg = messages[index];
    const text = toNaturalLanguageReply(msg?.content ?? "").trim() || msg?.content?.trim() || "";
    Alert.alert("Message", undefined, [
      { text: "Copy", onPress: () => copyMessageContent(text, true) },
      { text: "Share", onPress: () => handleShareAgentMessage(msg?.content ?? "") },
      { text: "Run again", onPress: () => runProcessMessages(messages.slice(0, index + 1), undefined) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return {
    messages,
    setMessages,
    chatInput,
    setChatInput,
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
    runProcessMessages,
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
  };
}
