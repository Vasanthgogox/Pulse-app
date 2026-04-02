/**
 * OpsAgentMessageRow — renders a single chat message row for the Ops Agent.
 */
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
} from "react-native";
import { OpsAgentBotSvg } from "./components/OpsAgentBotSvg";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLanguage } from "@/contexts/LanguageContext";
import { toNaturalLanguageReply } from "./utils";
import type { Message, OpsRef } from "./types";
import { OpsAgentReportCard } from "./components/OpsAgentReportCard";
import { FONT } from "./constants";
import type { ChatReportData, OpsSessionState, LastMessageImage } from "@/services/opsAgentService";
import type { OpsAgentStyles } from "./opsAgentStyles";
import {
  ClientDropdown,
  type ClientDropdownThemeOverrides,
} from "@/features/trips/components/add-trip/ClientDropdown";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  formatIndianVehicleNumber,
  formatIndianVehicleNumberInput,
} from "@/lib/format";

export interface OpsAgentMessageRowProps {
  msg: Message;
  index: number;
  userInitial: string;
  REF: OpsRef;
  styles: OpsAgentStyles;
  editingMessageIndex: number | null;
  editingMessageContent: string;
  setEditingMessageContent: (v: string) => void;
  isTyping: boolean;
  pdfDownloadingTitle: string | null;
  editingPreviewIndex: number | null;
  setEditingPreviewIndex: (v: number | null) => void;
  messages: Message[];
  tripClients: ClientRow[];
  tripClientsLoading: boolean;
  onCopyMessage: (raw: string, isSystem: boolean) => void;
  onStartEditingMessage: (index: number) => void;
  onCancelEditingMessage: () => void;
  onSubmitEditedMessage: () => void;
  onUpdatePreviewData: (messageIndex: number, data: Record<string, unknown>) => void;
  onPreviewUpdate: (messageIndex: number) => void;
  onUpdatePendingConfirmData: (messageIndex: number, data: Record<string, unknown>) => void;
  onPendingConfirmCancel: (messageIndex: number) => void;
  onPendingConfirmSubmit: (messageIndex: number) => void;
  onDownloadReportPdf: (report: ChatReportData) => void;
  onShareAgentMessage: (content: string) => void;
  onAgentMessageMore: (index: number) => void;
  runProcessMessages: (
    nextMessages: Message[],
    sessionState?: OpsSessionState,
    lastMessageImage?: LastMessageImage
  ) => void;
  triggerSuccess: (msg?: string) => void;
}

export function OpsAgentMessageRow({
  msg,
  index,
  userInitial,
  REF,
  styles,
  editingMessageIndex,
  editingMessageContent,
  setEditingMessageContent,
  isTyping,
  pdfDownloadingTitle,
  editingPreviewIndex,
  setEditingPreviewIndex,
  messages,
  tripClients,
  tripClientsLoading,
  onCopyMessage,
  onStartEditingMessage,
  onCancelEditingMessage,
  onSubmitEditedMessage,
  onUpdatePreviewData,
  onPreviewUpdate,
  onUpdatePendingConfirmData,
  onPendingConfirmCancel,
  onPendingConfirmSubmit,
  onDownloadReportPdf,
  onShareAgentMessage,
  onAgentMessageMore,
  runProcessMessages,
  triggerSuccess,
}: OpsAgentMessageRowProps) {
  const { t } = useLanguage();
  const [tripClientPickerOpen, setTripClientPickerOpen] = useState(false);

  const getConfirmLabel = (type: string) => {
    switch (type) {
      case "client": return t("createClient");
      case "supplier": return t("addSupplier");
      case "vehicle": return t("addVehicle");
      case "trip": return t("createTrip");
      default: return t("addDriver");
    }
  };

  const selectedTripClientId =
    msg.pendingConfirm?.type === "trip" && tripClients.length > 0 && msg.pendingConfirm.data.client_name
      ? (tripClients.find(
          (c) => c.name.trim().toLowerCase() === String(msg.pendingConfirm!.data.client_name).trim().toLowerCase()
        )?.id ?? null)
      : null;

  const clientDropdownTheme: ClientDropdownThemeOverrides = {
    borderColor: REF.border2,
    triggerTextColor: REF.text,
    triggerPlaceholderColor: REF.text3,
    clearTextColor: REF.text2,
    chevronColor: REF.text3,
    pickerListBg: REF.surface2,
    pickerListBorder: REF.border2,
    pickerItemBorder: REF.border,
    pickerItemTextColor: REF.text,
    pickerItemActiveBg: REF.accentSoft,
    hintColor: REF.text2,
    placeholderColor: REF.text3,
    loaderColor: REF.accent,
  };

  return (
    <View
      style={[
        styles.messageRow,
        msg.role === "user" ? styles.messageRowUser : styles.messageRowSystem,
      ]}
    >
      <View
        style={[
          styles.msgAvatar,
          msg.role === "user" ? styles.msgAvatarUser : styles.msgAvatarAgent,
        ]}
      >
        {msg.role === "user" ? (
          <Text
            style={[
              styles.msgAvatarText,
              styles.msgAvatarTextUser,
            ]}
          >
            {userInitial}
          </Text>
        ) : (
          <OpsAgentBotSvg width={28} height={28} headOnly />
        )}
      </View>
      <View
        style={[
          styles.msgBody,
          msg.role === "user" ? styles.msgBodyUser : styles.msgBodySystem,
        ]}
      >
        <View
          style={[styles.msgMeta, msg.role === "user" && styles.msgMetaEnd]}
        >
          <Text style={styles.msgName}>
            {msg.role === "user" ? t("you") : t("opsAgent")}
          </Text>
          <Text style={styles.msgTime}>
            {new Date().toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </Text>
        </View>
        <View
          style={[
            styles.quBubble,
            msg.role === "user"
              ? [
                  styles.quBubbleUser,
                  { backgroundColor: REF.userBubble, borderColor: REF.border },
                ]
              : styles.quBubbleBot,
          ]}
        >
          {msg.role === "user" && editingMessageIndex === index ? (
            <View style={styles.editMessageWrap}>
              <TextInput
                style={styles.editMessageInput}
                value={editingMessageContent}
                onChangeText={setEditingMessageContent}
                placeholder="Edit message..."
                placeholderTextColor={REF.text3}
                multiline
                maxLength={500}
                autoFocus
                blurOnSubmit={false}
              />
              <View style={styles.editMessageActions}>
                <TouchableOpacity
                  style={styles.editMessageBtnCancel}
                  onPress={onCancelEditingMessage}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editMessageBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.editMessageBtnSend,
                    (!editingMessageContent.trim() || isTyping) &&
                      styles.editMessageBtnSendDisabled,
                  ]}
                  onPress={onSubmitEditedMessage}
                  disabled={!editingMessageContent.trim() || isTyping}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editMessageBtnSendText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {msg.content ? (
                <Text
                  style={[
                    styles.quBubbleText,
                    msg.role === "user" && styles.quBubbleTextUser,
                  ]}
                >
                  {msg.role === "system"
                    ? toNaturalLanguageReply(msg.content)
                    : msg.content}
                </Text>
              ) : null}
              {msg.role === "user" && msg.attachment?.type === "image" && (
                <View style={styles.quAttachmentImage}>
                  {msg.attachment.data ? (
                    <Image
                      source={{ uri: msg.attachment.data }}
                      style={styles.quAttachmentImageImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.quAttachmentImagePlaceholder}>
                      <FontAwesome
                        name="image"
                        size={24}
                        color={REF.text3}
                      />
                    </View>
                  )}
                </View>
              )}
              {msg.role === "user" && msg.attachment?.type === "contact" && (
                <View style={styles.quAttachmentContact}>
                  <View style={styles.quAttachmentContactIcon}>
                    <FontAwesome name="user" size={20} color={REF.text} />
                  </View>
                  <View style={styles.quAttachmentContactInfo}>
                    <Text style={styles.quAttachmentContactName}>
                      {msg.attachment.data.name}
                    </Text>
                    {msg.attachment.data.role ? (
                      <Text
                        style={styles.quAttachmentContactRole}
                      >
                        {msg.attachment.data.role}
                      </Text>
                    ) : null}
                  </View>
                  <FontAwesome name="phone" size={14} color={REF.green} />
                </View>
              )}
              {msg.role === "system" && msg.reportData && (
                <OpsAgentReportCard
                  report={msg.reportData}
                  onDownloadPdf={onDownloadReportPdf}
                  isDownloading={pdfDownloadingTitle === msg.reportData?.title}
                  themeRef={REF}
                  styles={styles}
                />
              )}
              {msg.role === "system" && msg.pendingConfirm && (
                <View style={styles.previewCard}>
                  <View style={styles.previewCardHeader}>
                    <Text style={styles.previewCardTitle}>
                      {`${getConfirmLabel(msg.pendingConfirm.type)}?`}
                    </Text>
                    <Text style={styles.previewCardHint}>
                      {t("editDetailsThenConfirm")}
                    </Text>
                  </View>
                  {msg.pendingConfirm.type === "client" && (
                    <>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          {t("contactPerson")}
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(
                            msg.pendingConfirm.data.contact_person ?? ""
                          )}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              contact_person: t,
                            })
                          }
                          placeholder="e.g. Raj"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Phone number</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.phone ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              phone: t,
                            })
                          }
                          placeholder="e.g. 943214566"
                          placeholderTextColor={REF.text3}
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          Organization / company name (optional)
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(
                            msg.pendingConfirm.data.organization_name ?? ""
                          )}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              organization_name: t,
                            })
                          }
                          placeholder="e.g. Acme Transport"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                    </>
                  )}
                  {msg.pendingConfirm.type === "supplier" && (
                    <>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Phone (required)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.phone ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              phone: t,
                            })
                          }
                          placeholder="e.g. 943214566"
                          placeholderTextColor={REF.text3}
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Company name</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.company_name ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              company_name: t,
                            })
                          }
                          placeholder="e.g. Acme Transport"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>{t("contactPerson")}</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.contact_person ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              contact_person: t,
                            })
                          }
                          placeholder="e.g. Raj"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Email (optional)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.email ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              email: t,
                            })
                          }
                          placeholder="e.g. contact@acme.com"
                          placeholderTextColor={REF.text3}
                          keyboardType="email-address"
                        />
                      </View>
                    </>
                  )}
                  {msg.pendingConfirm.type === "vehicle" && (
                    <>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          Vehicle number / registration (required)
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.vehicle_number ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              vehicle_number: formatIndianVehicleNumberInput(t),
                            })
                          }
                          placeholder="e.g. TN 25 CM 7892"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="characters"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Brand (optional)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.vehicle_brand ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              vehicle_brand: t,
                            })
                          }
                          placeholder="e.g. Tata"
                          placeholderTextColor={REF.text3}
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Body type (optional)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.vehicle_body_type ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              vehicle_body_type: t,
                            })
                          }
                          placeholder="e.g. Container"
                          placeholderTextColor={REF.text3}
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Size (optional)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.vehicle_size ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              vehicle_size: t,
                            })
                          }
                          placeholder="e.g. 20 ft"
                          placeholderTextColor={REF.text3}
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Axle (optional)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.vehicle_axle ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              vehicle_axle: t,
                            })
                          }
                          placeholder="e.g. 2"
                          placeholderTextColor={REF.text3}
                          keyboardType="number-pad"
                        />
                      </View>
                    </>
                  )}
                  {msg.pendingConfirm.type === "driver" && (
                    <>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>{t("contactName")} (required)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.name ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              name: t,
                            })
                          }
                          placeholder="e.g. Raj"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Phone (required)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.phone ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              phone: t,
                            })
                          }
                          placeholder="e.g. 943214566"
                          placeholderTextColor={REF.text3}
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>DL number (required)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.license_number ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              license_number: t,
                            })
                          }
                          placeholder="e.g. DL-12345"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="characters"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Fixed salary (₹) optional</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={
                            msg.pendingConfirm.data.payable_amount != null
                              ? String(msg.pendingConfirm.data.payable_amount)
                              : ""
                          }
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              payable_amount: t ? Number(t) : undefined,
                            })
                          }
                          placeholder="e.g. 15000"
                          placeholderTextColor={REF.text3}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          Trips commission (%) optional
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={
                            msg.pendingConfirm.data.commission_percent != null
                              ? String(msg.pendingConfirm.data.commission_percent)
                              : ""
                          }
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              commission_percent: t ? Number(t) : undefined,
                            })
                          }
                          placeholder="e.g. 10"
                          placeholderTextColor={REF.text3}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Per km pay (₹/km) optional</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={
                            msg.pendingConfirm.data.commission_per_km != null
                              ? String(msg.pendingConfirm.data.commission_per_km)
                              : ""
                          }
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              commission_per_km: t ? Number(t) : undefined,
                            })
                          }
                          placeholder="e.g. 8"
                          placeholderTextColor={REF.text3}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </>
                  )}
                  {msg.pendingConfirm.type === "trip" && (
                    <>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Origin (pickup)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.pickup_area ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              pickup_area: t,
                            })
                          }
                          placeholder="e.g. Chennai"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Destination (drop)</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={String(msg.pendingConfirm.data.drop_location ?? "")}
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              drop_location: t,
                            })
                          }
                          placeholder="e.g. Bangalore"
                          placeholderTextColor={REF.text3}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <ClientDropdown
                          clients={tripClients}
                          loading={tripClientsLoading}
                          selectedId={selectedTripClientId}
                          clientName={String(msg.pendingConfirm.data.client_name ?? "")}
                          pickerOpen={tripClientPickerOpen}
                          onTogglePicker={() => setTripClientPickerOpen((v) => !v)}
                          onSelectClient={(client) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              client_name: client.name,
                            })
                          }
                          onClearSelection={() =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              client_name: "",
                            })
                          }
                          onClientNameChange={(name) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              client_name: name,
                            })
                          }
                          inputStyle={styles.modalInput}
                          labelStyle={styles.modalLabel}
                          themeOverrides={clientDropdownTheme}
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          Trip rate (₹) — amount charged to client
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={
                            msg.pendingConfirm.data.client_price != null
                              ? String(msg.pendingConfirm.data.client_price)
                              : ""
                          }
                          onChangeText={(t) =>
                            onUpdatePendingConfirmData(index, {
                              ...msg.pendingConfirm!.data,
                              client_price: t ? Number(t) : 0,
                            })
                          }
                          placeholder="e.g. 50000"
                          placeholderTextColor={REF.text3}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>
                          Own fleet (asset) or partner (aggregate)
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            marginTop: 4,
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.modalInput,
                              {
                                flex: 1,
                                justifyContent: "center",
                                alignItems: "center",
                                paddingVertical: 10,
                              },
                              (msg.pendingConfirm.data.supply_source ?? "asset") === "asset" && {
                                backgroundColor: REF.accentSoft,
                                borderColor: REF.accent,
                              },
                            ]}
                            onPress={() =>
                              onUpdatePendingConfirmData(index, {
                                ...msg.pendingConfirm!.data,
                                supply_source: "asset",
                              })
                            }
                          >
                            <Text
                              style={[
                                (msg.pendingConfirm.data.supply_source ?? "asset") === "asset" && {
                                  fontFamily: FONT.semiBold,
                                  color: REF.accent,
                                },
                              ]}
                            >
                              Asset
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.modalInput,
                              {
                                flex: 1,
                                justifyContent: "center",
                                alignItems: "center",
                                paddingVertical: 10,
                              },
                              msg.pendingConfirm.data.supply_source === "aggregate" && {
                                backgroundColor: REF.accentSoft,
                                borderColor: REF.accent,
                              },
                            ]}
                            onPress={() =>
                              onUpdatePendingConfirmData(index, {
                                ...msg.pendingConfirm!.data,
                                supply_source: "aggregate",
                              })
                            }
                          >
                            <Text
                              style={[
                                msg.pendingConfirm.data.supply_source === "aggregate" && {
                                  fontFamily: FONT.semiBold,
                                  color: REF.accent,
                                },
                              ]}
                            >
                              Aggregate
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {(msg.pendingConfirm.data.supply_source ?? "asset") ===
                        "aggregate" && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>
                            Supplier rate (₹) — amount paid to partner
                          </Text>
                          <TextInput
                            style={styles.modalInput}
                            value={
                              msg.pendingConfirm.data.supplier_rate != null
                                ? String(msg.pendingConfirm.data.supplier_rate)
                                : ""
                            }
                            onChangeText={(t) =>
                              onUpdatePendingConfirmData(index, {
                                ...msg.pendingConfirm!.data,
                                supplier_rate: t ? Number(t) : 0,
                              })
                            }
                            placeholder="e.g. 40000"
                            placeholderTextColor={REF.text3}
                            keyboardType="number-pad"
                          />
                        </View>
                      )}
                    </>
                  )}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.modalBtnCancel}
                      onPress={() => onPendingConfirmCancel(index)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalBtnCancelText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalBtnConfirm}
                      onPress={() => onPendingConfirmSubmit(index)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalBtnConfirmText}>
                        {getConfirmLabel(msg.pendingConfirm.type)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {msg.role === "system" && msg.createdPreview && (
                <View style={styles.previewCard}>
                  <View style={styles.previewCardHeader}>
                    <Text style={styles.previewCardTitle}>
                      {msg.createdPreview.updated &&
                      editingPreviewIndex !== index
                        ? t("addedToHistory")
                        : msg.createdPreview.type === "client"
                          ? `${getConfirmLabel("client")}?`
                          : msg.createdPreview.type === "supplier"
                            ? `${getConfirmLabel("supplier")}?`
                            : msg.createdPreview.type === "vehicle"
                              ? `${getConfirmLabel("vehicle")}?`
                              : msg.createdPreview.type === "trip"
                                ? `${getConfirmLabel("trip")}?`
                                : `${getConfirmLabel("driver")}?`}
                    </Text>
                    {!(msg.createdPreview.updated && editingPreviewIndex !== index) && (
                      <Text style={styles.previewCardHint}>
                        {t("editDetailsThenConfirm")}
                      </Text>
                    )}
                  </View>
                  {msg.createdPreview.updated &&
                    editingPreviewIndex !== index && (
                      <View style={styles.previewSummaryCard}>
                        <View style={styles.previewSummaryHeader}>
                          <View style={styles.previewBadge}>
                            <Text style={styles.previewBadgeText}>
                              {msg.createdPreview.type === "client"
                                ? t("client")
                                : msg.createdPreview.type === "supplier"
                                  ? t("supplier")
                                  : msg.createdPreview.type === "vehicle"
                                    ? t("vehicle")
                                    : msg.createdPreview.type === "trip"
                                      ? t("trip")
                                      : t("driver")}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.previewEditLink}
                            onPress={() => setEditingPreviewIndex(index)}
                            activeOpacity={0.8}
                          >
                            <FontAwesome
                              name="pencil"
                              size={12}
                              color={REF.accent}
                            />
                            <Text style={styles.previewEditLinkText}>
                              {t("edit")}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.previewSummaryBody}>
                          {msg.createdPreview.type === "client" && (
                            <>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  {t("contact")}
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {String(
                                    msg.createdPreview.data.contact_person ||
                                      "—"
                                  )}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.previewSummaryRow,
                                  (msg.createdPreview.data as Record<string, string>)
                                    .organization_name
                                    ? undefined
                                    : styles.previewSummaryRowLast,
                                ]}
                              >
                                <Text style={styles.previewSummaryLabel}>
                                  Phone
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {String(
                                    msg.createdPreview.data.phone || "—"
                                  )}
                                </Text>
                              </View>
                              {(msg.createdPreview.data as Record<string, string>)
                                .organization_name ? (
                                <View
                                  style={[
                                    styles.previewSummaryRow,
                                    styles.previewSummaryRowLast,
                                  ]}
                                >
                                  <Text style={styles.previewSummaryLabel}>
                                    Organization
                                  </Text>
                                  <Text
                                    style={styles.previewSummaryValue}
                                    numberOfLines={1}
                                  >
                                    {String(
                                      (
                                        msg.createdPreview
                                          .data as Record<string, string>
                                      ).organization_name
                                    )}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          )}
                          {msg.createdPreview.type === "supplier" && (
                            <>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Company
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .company_name || "—"
                                  )}
                                </Text>
                        </View>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  {t("contact")}
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .contact_person || "—"
                                  )}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.previewSummaryRow,
                                  (msg.createdPreview.data as Record<string, string>)
                                    .email
                                    ? undefined
                                    : styles.previewSummaryRowLast,
                                ]}
                              >
                                <Text style={styles.previewSummaryLabel}>
                                  Phone
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .phone || "—"
                                  )}
                                </Text>
                              </View>
                              {(msg.createdPreview.data as Record<string, string>)
                                .email ? (
                                <View
                                  style={[
                                    styles.previewSummaryRow,
                                    styles.previewSummaryRowLast,
                                  ]}
                                >
                                  <Text style={styles.previewSummaryLabel}>
                                    Email
                                  </Text>
                                  <Text
                                    style={styles.previewSummaryValue}
                                    numberOfLines={1}
                                  >
                                    {String(
                                      (msg.createdPreview.data as Record<
                                        string,
                                        string
                                      >).email
                                    )}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          )}
                          {msg.createdPreview.type === "vehicle" && (
                            <>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Registration
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {formatIndianVehicleNumber(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .vehicle_number
                                  ) || "—"}
                                </Text>
                              </View>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Brand
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .vehicle_brand || "—"
                                  )}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.previewSummaryRow,
                                  styles.previewSummaryRowLast,
                                ]}
                              >
                                <Text style={styles.previewSummaryLabel}>
                                  Body · Size / Axle
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {[
                                    (
                                      msg.createdPreview.data as Record<
                                        string,
                                        string
                                      >
                                    ).vehicle_body_type || "",
                                    (
                                      msg.createdPreview.data as Record<
                                        string,
                                        string
                                      >
                                    ).vehicle_size || "",
                                    (
                                      msg.createdPreview.data as Record<
                                        string,
                                        string
                                      >
                                    ).vehicle_axle || "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </Text>
                              </View>
                            </>
                          )}
                          {msg.createdPreview.type === "trip" && (
                            <>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Route
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {[
                                    msg.createdPreview.data.pickup_area,
                                    msg.createdPreview.data.drop_location,
                                  ]
                                    .filter(Boolean)
                                    .join(" → ") || "—"}
                                </Text>
                              </View>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Client
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {String(
                                    msg.createdPreview.data.client_name ?? "—"
                                  )}
                                </Text>
                              </View>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Trip rate
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  ₹
                                  {Number(
                                    msg.createdPreview.data.client_price ?? 0
                                  ).toLocaleString()}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.previewSummaryRow,
                                  styles.previewSummaryRowLast,
                                ]}
                              >
                                <Text style={styles.previewSummaryLabel}>
                                  Supply
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {msg.createdPreview.data.supply_source ===
                                  "aggregate"
                                    ? `Aggregate · ₹${Number(
                                        msg.createdPreview.data
                                          .supplier_rate ?? 0
                                      ).toLocaleString()}`
                                    : "Asset (own fleet)"}
                                </Text>
                              </View>
                            </>
                          )}
                          {msg.createdPreview.type === "driver" && (
                            <>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Name
                                </Text>
                                <Text
                                  style={styles.previewSummaryValue}
                                  numberOfLines={1}
                                >
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .name || "—"
                                  )}
                                </Text>
                              </View>
                              <View style={styles.previewSummaryRow}>
                                <Text style={styles.previewSummaryLabel}>
                                  Phone
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .phone || "—"
                                  )}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.previewSummaryRow,
                                  styles.previewSummaryRowLast,
                                ]}
                              >
                                <Text style={styles.previewSummaryLabel}>
                                  DL number
                                </Text>
                                <Text style={styles.previewSummaryValue}>
                                  {String(
                                    (msg.createdPreview.data as Record<string, string>)
                                      .license_number || "—"
                                  )}
                                </Text>
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                    )}
                  {(!msg.createdPreview.updated ||
                    editingPreviewIndex === index) &&
                    msg.createdPreview.type === "client" && (
                      <>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>
                            {t("contactPerson")}
                          </Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(
                              msg.createdPreview.data.contact_person ?? ""
                            )}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                contact_person: t,
                              })
                            }
                            placeholder="e.g. Raj"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="words"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>
                            Phone number
                          </Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(
                              msg.createdPreview.data.phone ?? ""
                            )}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                phone: t,
                              })
                            }
                            placeholder="e.g. 943214566"
                            placeholderTextColor={REF.text3}
                            keyboardType="phone-pad"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>
                            Organization / company name (optional)
                          </Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(
                              msg.createdPreview.data.organization_name ?? ""
                            )}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                organization_name: t,
                              })
                            }
                            placeholder="e.g. Acme Transport"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="words"
                          />
                        </View>
                      </>
                    )}
                  {(!msg.createdPreview.updated ||
                    editingPreviewIndex === index) &&
                    msg.createdPreview.type === "supplier" && (
                      <>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Phone (required)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.phone ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                phone: t,
                              })
                            }
                            placeholder="e.g. 943214566"
                            placeholderTextColor={REF.text3}
                            keyboardType="phone-pad"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Company name</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.company_name ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                company_name: t,
                              })
                            }
                            placeholder="e.g. Acme Transport"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="words"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>{t("contactPerson")}</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.contact_person ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                contact_person: t,
                              })
                            }
                            placeholder="e.g. Raj"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="words"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Email (optional)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.email ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                email: t,
                              })
                            }
                            placeholder="e.g. contact@acme.com"
                            placeholderTextColor={REF.text3}
                            keyboardType="email-address"
                          />
                        </View>
                      </>
                    )}
                  {(!msg.createdPreview.updated ||
                    editingPreviewIndex === index) &&
                    msg.createdPreview.type === "vehicle" && (
                      <>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>
                            Vehicle number / registration (required)
                          </Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.vehicle_number ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                vehicle_number: formatIndianVehicleNumberInput(t),
                              })
                            }
                            placeholder="e.g. TN 25 CM 7892"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="characters"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Brand (optional)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.vehicle_brand ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                vehicle_brand: t,
                              })
                            }
                            placeholder="e.g. Tata"
                            placeholderTextColor={REF.text3}
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Body type (optional)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.vehicle_body_type ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                vehicle_body_type: t,
                              })
                            }
                            placeholder="e.g. Container"
                            placeholderTextColor={REF.text3}
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Size (optional)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.vehicle_size ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                vehicle_size: t,
                              })
                            }
                            placeholder="e.g. 20 ft"
                            placeholderTextColor={REF.text3}
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Axle (optional)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.vehicle_axle ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                vehicle_axle: t,
                              })
                            }
                            placeholder="e.g. 2"
                            placeholderTextColor={REF.text3}
                            keyboardType="number-pad"
                          />
                        </View>
                      </>
                    )}
                  {(!msg.createdPreview.updated ||
                    editingPreviewIndex === index) &&
                    msg.createdPreview.type === "driver" && (
                      <>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>{t("contactName")} (required)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.name ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                name: t,
                              })
                            }
                            placeholder="e.g. Raj"
                            placeholderTextColor={REF.text3}
                            autoCapitalize="words"
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Phone (required)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={String(msg.createdPreview.data.phone ?? "")}
                            onChangeText={(t) =>
                              onUpdatePreviewData(index, {
                                ...msg.createdPreview!.data,
                                phone: t,
                              })
                            }
                            placeholder="e.g. 943214566"
                            placeholderTextColor={REF.text3}
                            keyboardType="phone-pad"
                          />
                        </View>
                      </>
                    )}
                  {(!msg.createdPreview.updated ||
                    editingPreviewIndex === index) && (
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.modalBtnCancel}
                        onPress={() => setEditingPreviewIndex(null)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.modalBtnCancelText}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.modalBtnConfirm}
                        onPress={() => onPreviewUpdate(index)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.modalBtnConfirmText}>
                          {getConfirmLabel(msg.createdPreview.type)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </View>
        {editingMessageIndex !== index && (
          <View
            style={[
              styles.msgActionsRow,
              msg.role === "user" && styles.msgActionsRowEnd,
            ]}
          >
            {msg.role === "user" ? (
              <>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => onCopyMessage(msg.content, false)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="copy" size={12} color={REF.text3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => onStartEditingMessage(index)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="pencil" size={12} color={REF.text3} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() =>
                    onCopyMessage(msg.content ?? "", true)
                  }
                  activeOpacity={0.7}
                >
                  <FontAwesome name="copy" size={12} color={REF.text3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => triggerSuccess(t("thanksForFeedback"))}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="thumbs-up" size={12} color={REF.text3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => triggerSuccess(t("feedbackRecorded"))}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="thumbs-down" size={12} color={REF.text3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() =>
                    onShareAgentMessage(msg.content ?? "")
                  }
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name="share-alt"
                    size={12}
                    color={REF.text3}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => {
                    const newMessages = messages.slice(0, index + 1);
                    runProcessMessages(newMessages, undefined);
                  }}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="refresh" size={12} color={REF.text3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.msgActionBtn}
                  onPress={() => onAgentMessageMore(index)}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name="ellipsis-h"
                    size={12}
                    color={REF.text3}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
