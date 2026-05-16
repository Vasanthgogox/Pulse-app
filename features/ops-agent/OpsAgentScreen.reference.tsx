/**
 * Ops Agent screen — Autopilot Interface.
 * Conversational commands via Gemini (e.g. "Add a client"); in-chat confirmation cards, report PDF.
 * Used by app/(tabs)/index (tab) and can be used by other routes.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getClientsByOrganization, updateClient } from "@/features/clients";
import { getDriversByOrganization, updateDriver } from "@/features/drivers";
import { getTransactionsByOrganization } from "@/features/finance";
import { getSuppliersByOrganization, updateSupplier } from "@/features/suppliers";
import { getVehiclesByOrganization, updateVehicle } from "@/features/vehicles";
import { formatMobileNumber } from "@/lib/format";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
  CONFIRM_EXPIRY_MS,
  executePendingCreateClient,
  executePendingCreateDriver,
  executePendingCreateSupplier,
  executePendingCreateTrip,
  executePendingCreateVehicle,
  processOpsMessage,
  type ChatReportData,
  type CreatedEntitySnapshot,
  type LastMessageImage,
  type OpsContext,
  type OpsSessionState,
} from "@/services/opsAgentService";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MessageRole = "user" | "system";

type MessageAttachment =
  | { type: "image"; data: string; mimeType?: string }
  | { type: "contact"; data: { name: string; role?: string; phone?: string } };

/** Pending confirmation (in-chat card) before create; same layout as post-create editable preview. */
type PendingConfirmType = "client" | "supplier" | "vehicle" | "driver" | "trip";

/** After a create, show editable preview; once user confirms update, set updated: true. */
interface Message {
  role: MessageRole;
  content: string;
  attachment?: MessageAttachment;
  createdPreview?: CreatedEntitySnapshot & { updated?: boolean };
  /** In-chat confirmation card (replaces modal); user edits and taps Create/Add to confirm. */
  pendingConfirm?: { type: PendingConfirmType; data: Record<string, unknown> };
  /** Report data for formatted display and PDF download. */
  reportData?: ChatReportData;
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: "system",
    content: "Operational Grid Online. You can add entities (e.g. 'Add a client', 'Add a vehicle', 'Create a trip') or ask about your data—e.g. 'What's my revenue?', 'How many vehicles?', 'Give me a report' (report is shown in a card and can be downloaded as PDF).",
  },
];

/** Strip code blocks (e.g. ```tool_code ... ```) so we show only natural language to the user. */
function toNaturalLanguageReply(text: string): string {
  if (!text?.trim()) return "";
  let out = text
    .replace(/\s*```[\w]*\s*[\s\S]*?```\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || "Done.";
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build HTML for report PDF. */
function reportToHtml(report: ChatReportData): string {
  const dateStr = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const sectionsHtml = report.sections
    .map((s) => {
      let content: string;
      if (s.table?.headers?.length) {
        const headerRow = s.table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const dataRows = (s.table.rows ?? [])
          .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`)
          .join("");
        content = `<table class="report-table"><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table>`;
      } else {
        content = `<div class="body">${escapeHtml(s.body ?? "").replace(/\n/g, "<br/>")}</div>`;
      }
      return `<div class="section"><h3>${escapeHtml(s.title)}</h3>${content}</div>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(report.title)}</title>
<style>body{font-family:system-ui;padding:20px;font-size:12px;color:#111;}
h1{font-size:18px;margin-bottom:4px;} .meta{color:#666;font-size:11px;margin-bottom:20px;}
.section{margin-bottom:16px;page-break-inside:avoid;}
.section h3{font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#333;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;}
.body{white-space:pre-wrap;}
.report-table{width:100%;border-collapse:collapse;font-size:11px;}
.report-table th,.report-table td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
.report-table th{background:#f5f5f5;font-weight:600;}</style></head>
<body><h1>${escapeHtml(report.title)}</h1><p class="meta">Generated: ${escapeHtml(dateStr)}</p>${sectionsHtml}</body></html>`;
}

/** Plain text version of report for fallback when PDF is not available. */
function reportToPlainText(report: ChatReportData): string {
  const dateStr = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const parts = [report.title, `Generated: ${dateStr}`, ""];
  report.sections.forEach((s) => {
    parts.push(s.title);
    if (s.table?.headers?.length) {
      parts.push(s.table.headers.join("\t"));
      (s.table.rows ?? []).forEach((row) => parts.push(row.join("\t")));
    } else {
      parts.push(s.body ?? "");
    }
    parts.push("");
  });
  return parts.join("\n");
}

/** Ops Agent — theme palette (dark and light). */
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

type OpsRef = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  textOnAccent: string;
  accent: string;
  accentSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  red: string;
  userBubble: string;
  botBubble: string;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  imagePlaceholderOverlay: string;
  contactCardBg: string;
  contactCardBorder: string;
  editInputBg: string;
  editInputBorder: string;
  surfaceOverlay: string;
  surfaceOverlayText: string;
  surfaceOverlayMuted: string;
  radiusSm: number;
  radius: number;
  radiusLg: number;
  radiusXl: number;
  shadow: object;
  shadowSm: object;
};

const REF_DARK: OpsRef = {
  bg: "#000000",
  surface: "#1C1C1E",
  surface2: "#2C2C2E",
  surface3: "#363636",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  text2: "#B0B0B0",
  text3: "#8E8E93",
  textOnAccent: "#FFFFFF",
  accent: "#2196F3",
  accentSoft: "rgba(33,150,243,0.15)",
  green: "#4CAF50",
  greenSoft: "rgba(76,175,80,0.15)",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.12)",
  red: "#F44336",
  userBubble: "#2C2C2E",
  botBubble: "#1C1C1E",
  cardBg: "#1C1C1E",
  cardBorder: "rgba(255,255,255,0.08)",
  inputBg: "#1C1C1E",
  imagePlaceholderOverlay: "rgba(0,0,0,0.3)",
  contactCardBg: "rgba(255,255,255,0.12)",
  contactCardBorder: "rgba(255,255,255,0.2)",
  editInputBg: "rgba(0,0,0,0.15)",
  editInputBorder: "rgba(255,255,255,0.25)",
  surfaceOverlay: "rgba(255,255,255,0.1)",
  surfaceOverlayText: "rgba(255,255,255,0.9)",
  surfaceOverlayMuted: "rgba(255,255,255,0.7)",
  radiusSm: 8,
  radius: 14,
  radiusLg: 18,
  radiusXl: 22,
  shadow: Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 4 } : { elevation: 3 },
  shadowSm: Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 0.5 }, shadowOpacity: 0.15, shadowRadius: 2 } : { elevation: 2 },
};

const REF_LIGHT: OpsRef = {
  bg: "#FFFFFF",
  surface: "#F5F5F7",
  surface2: "#E8E8ED",
  surface3: "#D1D1D6",
  border: "rgba(0,0,0,0.08)",
  border2: "rgba(0,0,0,0.12)",
  text: "#1C1C1E",
  text2: "#3A3A3C",
  text3: "#8E8E93",
  textOnAccent: "#FFFFFF",
  accent: "#2196F3",
  accentSoft: "rgba(33,150,243,0.12)",
  green: "#34C759",
  greenSoft: "rgba(52,199,89,0.12)",
  amber: "#FF9500",
  amberSoft: "rgba(255,149,0,0.12)",
  red: "#FF3B30",
  userBubble: "#E8E8ED",
  botBubble: "#F5F5F7",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(0,0,0,0.08)",
  inputBg: "#F5F5F7",
  imagePlaceholderOverlay: "rgba(0,0,0,0.06)",
  contactCardBg: "rgba(0,0,0,0.05)",
  contactCardBorder: "rgba(0,0,0,0.12)",
  editInputBg: "#F5F5F7",
  editInputBorder: "rgba(0,0,0,0.2)",
  surfaceOverlay: "rgba(0,0,0,0.06)",
  surfaceOverlayText: "#1C1C1E",
  surfaceOverlayMuted: "#6C6C70",
  radiusSm: 8,
  radius: 14,
  radiusLg: 18,
  radiusXl: 22,
  shadow: Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 } : { elevation: 2 },
  shadowSm: Platform.OS === "ios" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 0.5 }, shadowOpacity: 0.06, shadowRadius: 2 } : { elevation: 1 },
};

/** Plus Jakarta Sans — creative, friendly, contrasts with app system font. Used only in Ops Agent. */
const FONT = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semiBold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;

export default function OpsAgentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState("Synced.");
  const [error, setError] = useState<string | null>(null);
  /** When set, this message's preview card is in edit mode again (after already updated). */
  const [editingPreviewIndex, setEditingPreviewIndex] = useState<number | null>(null);
  const [opsSessionState, setOpsSessionState] = useState<OpsSessionState | undefined>(undefined);
  const [pdfDownloadingTitle, setPdfDownloadingTitle] = useState<string | null>(null);
  /** After cancel (client only), hold payload so user can tap "Re-attempt creation" for in-chat confirm again. */
  const [reattemptPayload, setReattemptPayload] = useState<{
    contact_person: string;
    phone: string;
    organization_name?: string;
  } | null>(null);
  /** Number of re-attempts used in this flow (max 2). Reset when modal opens from agent or create succeeds. */
  const [reattemptCount, setReattemptCount] = useState(0);
  /** When set, user is editing this user message index; show inline input and "Run again". */
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  /** Light/dark theme for Ops Agent (screen-level only). */
  const [isDarkMode, setIsDarkMode] = useState(true);
  const REF: OpsRef = isDarkMode ? REF_DARK : REF_LIGHT;
  const styles = useMemo(() => getStyles(REF), [isDarkMode]);
  /** First letter of logged-in user (profile full_name or email) for avatar initials. */
  const userInitial = (
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "?"
  ).charAt(0).toUpperCase();
  /** Pre-fetched summaries for AI to answer questions about revenue, vehicles, drivers. */
  const [opsContext, setOpsContext] = useState<OpsContext | null>(null);
  /** Pending attachment before send (image or contact mock). */
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  /** Show attachment menu (ChatGPT-style + menu). */
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  /** Keyboard visible — show dismiss button (production: proper on both iOS and Android). */
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  /** Keyboard height from events; applied as marginBottom so input sits above keyboard (avoids KAV gap/collapse). */
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const triggerSuccess = (message?: string) => {
    setSuccessToastMessage(message ?? "Synced.");
    setShowSuccess(true);
    const duration = message ? 2500 : 1200;
    const t = setTimeout(() => setShowSuccess(false), duration);
    return () => clearTimeout(t);
  };

  const capabilities = getCapabilitiesFromProfile(
    profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
  );

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

  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) {
      setOpsContext(null);
      return;
    }
    Promise.all([
      getTransactionsByOrganization(orgId),
      getVehiclesByOrganization(orgId),
      getDriversByOrganization(orgId),
      getClientsByOrganization(orgId),
      getSuppliersByOrganization(orgId),
    ]).then(
      ([txRes, vehRes, drvRes, cliRes, supRes]) => {
        const transactions = txRes.error ? [] : txRes.transactions;
        const totalIn = transactions.reduce((s, t) => s + (t.amount_in ?? 0), 0);
        const totalOut = transactions.reduce((s, t) => s + (t.amount_out ?? 0), 0);
        const net = totalIn - totalOut;
        const formatRupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
        const clientNames = cliRes.error ? [] : (cliRes.clients ?? []).map((c) => c.name || c.contact_person || '').filter(Boolean);
        const supplierNames = supRes.error ? [] : (supRes.suppliers ?? []).map((s) => s.company_name || (s as { name?: string }).name || s.contact_person || '').filter(Boolean);
        const driverNames = drvRes.error ? [] : (drvRes.drivers ?? []).map((d) => d.name ?? '').filter(Boolean);
        const vehicleNumbers = vehRes.error ? [] : (vehRes.vehicles ?? []).map((v) => v.vehicle_number ?? '').filter(Boolean);

        const revenueSummary = `Total amount in: ${formatRupee(totalIn)}. Total amount out: ${formatRupee(totalOut)}. Net: ${formatRupee(net)}. (${transactions.length} transactions.)`;
        const revenueTable = {
          headers: ['Metric', 'Value'],
          rows: [
            ['Total In', formatRupee(totalIn)],
            ['Total Out', formatRupee(totalOut)],
            ['Net', formatRupee(net)],
            ['Transactions', String(transactions.length)],
          ],
        };

        const entityCounts = `Clients: ${cliRes.error ? 0 : (cliRes.clients?.length ?? 0)}. Suppliers: ${supRes.error ? 0 : (supRes.suppliers?.length ?? 0)}. Drivers: ${drvRes.error ? 0 : (drvRes.drivers?.length ?? 0)}. Vehicles: ${vehRes.error ? 0 : (vehRes.vehicles?.length ?? 0)}.`;
        const entityCountsTable = {
          headers: ['Entity', 'Count'],
          rows: [
            ['Clients', String(cliRes.error ? 0 : (cliRes.clients?.length ?? 0))],
            ['Suppliers', String(supRes.error ? 0 : (supRes.suppliers?.length ?? 0))],
            ['Drivers', String(drvRes.error ? 0 : (drvRes.drivers?.length ?? 0))],
            ['Vehicles', String(vehRes.error ? 0 : (vehRes.vehicles?.length ?? 0))],
          ],
        };

        const vehicleSummary =
          vehRes.error || !vehRes.vehicles?.length
            ? 'No vehicles in the fleet.'
            : `Total: ${vehRes.vehicles.length}. ${vehRes.vehicles
                .map(
                  (v) =>
                    `${v.vehicle_number}${v.vehicle_brand || v.vehicle_body_type ? ` (${[v.vehicle_brand, v.vehicle_body_type].filter(Boolean).join(', ')})` : ''}`
                )
                .join('; ')}.`;
        const vehicleTable =
          vehRes.error || !vehRes.vehicles?.length
            ? undefined
            : {
                headers: ['Vehicle', 'Details'],
                rows: vehRes.vehicles.map((v) => [
                  v.vehicle_number ?? '—',
                  [v.vehicle_brand, v.vehicle_body_type].filter(Boolean).join(', ') || '—',
                ]),
              };

        const driverSummary =
          drvRes.error || !drvRes.drivers?.length
            ? 'No drivers.'
            : `Total: ${drvRes.drivers.length}. Names: ${drvRes.drivers.map((d) => d.name ?? '—').join(', ')}.`;
        const driverTable =
          drvRes.error || !drvRes.drivers?.length
            ? undefined
            : {
                headers: ['Driver'],
                rows: drvRes.drivers.map((d) => [d.name ?? '—']),
              };

        setOpsContext({
          revenueSummary,
          revenueTable,
          entityCounts,
          entityCountsTable,
          vehicleSummary,
          vehicleTable,
          driverSummary,
          driverTable,
          availableClientNames: clientNames.length ? clientNames.join(', ') : '',
          availableSupplierNames: supplierNames.length ? supplierNames.join(', ') : '',
          availableDriverNames: driverNames.length ? driverNames.join(', ') : '',
          availableVehicleNumbers: vehicleNumbers.length ? vehicleNumbers.join(', ') : '',
        });
      },
      () => setOpsContext(null)
    );
  }, [currentOrganization?.id]);

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

  const copyMessageContent = (raw: string, isSystem: boolean) => {
    const t = (isSystem ? toNaturalLanguageReply(raw) : raw)?.trim() || "";
    if (!t) return;
    Clipboard.setStringAsync(t).then(() => triggerSuccess("Copied")).catch(() => triggerSuccess("Copied"));
  };

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
    } else if (preview.type === "trip") {
      // Trip create is done; no in-chat update API. Just mark preview as confirmed.
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
      profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
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
        setMessages((prev) =>
          prev.map((m, idx) =>
            idx === messageIndex
              ? {
                  role: "system" as const,
                  content: outcome.message ?? (pending.type === "client" ? "Client created." : pending.type === "supplier" ? "Supplier created." : pending.type === "vehicle" ? "Vehicle added." : pending.type === "trip" ? "Trip created." : "Driver added."),
                  createdPreview: outcome.entity ? { ...outcome.entity, updated: false } : undefined,
                }
              : m
          )
        );
        triggerSuccess("Successfully added. You can edit this in history or in the app.");
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: outcome.error ?? "Failed." },
        ]);
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
      executePendingCreateClient(orgId, caps, { contact_person, phone, organization_name: (data.organization_name ?? "").toString().trim() || undefined }, uid).then(onSuccess);
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
      executePendingCreateSupplier(orgId, caps, { phone, company_name, contact_person, email: (data.email ?? "").toString().trim() || undefined }, uid).then(onSuccess);
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
        uid
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
        uid
      ).then(onSuccess);
    } else if (pending.type === "trip") {
      const pickup_area = (data.pickup_area ?? "").toString().trim();
      const drop_location = (data.drop_location ?? "").toString().trim();
      const client_name = (data.client_name ?? "").toString().trim();
      const client_price = typeof data.client_price === "number" ? data.client_price : Number(data.client_price) || 0;
      const supply_source = (data.supply_source === "asset" || data.supply_source === "aggregate") ? data.supply_source : "asset";
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
        uid
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
        await Share.share({
          message: plainText,
          title: report.title,
        });
      } catch {
        const msg = e instanceof Error ? e.message : "Failed to generate or share report.";
        Alert.alert("Download failed", msg);
      }
    } finally {
      setPdfDownloadingTitle(null);
    }
  };

  useEffect(() => {
    if ((messages.length > 0 || reattemptPayload) && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, isTyping, reattemptPayload]);

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

  return (
    <View style={[styles.container, { backgroundColor: REF.bg }]}>
      {showSuccess && (
        <View
          style={[styles.successToast, { top: insets.top + SP.xl }]}
          pointerEvents="none"
        >
          <FontAwesome name="check" size={14} color={REF.green} />
          <Text style={styles.successToastText}>{successToastMessage}</Text>
        </View>
      )}

      <View style={[styles.refHeader, { paddingTop: insets.top + 14 }]}>
        <View style={styles.refHeaderLeft}>
          <TouchableOpacity onPress={() => router.replace("/(tabs)/trips")} style={styles.refBackBtn} hitSlop={12}>
            <Feather name="chevron-left" size={20} color={REF.text} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={styles.refStatusDot} />
          <Text style={styles.refHeaderTitle}>Ops Agent</Text>
          <Text style={styles.refHeaderMeta}>· gemini-2.0-flash</Text>
        </View>
        <View style={styles.refHeaderRight}>
          <TouchableOpacity
            onPress={() => setIsDarkMode((prev) => !prev)}
            style={[styles.refHeaderBtn, { paddingVertical: SP.sm, paddingHorizontal: SP.sm }]}
            hitSlop={8}
            accessibilityLabel={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            <FontAwesome name={isDarkMode ? "sun-o" : "moon-o"} size={18} color={REF.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.refAvatar} onPress={() => router.push("/(tabs)/profile")}>
            <Text style={styles.refAvatarText}>{userInitial}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat keyboard: manual keyboard height as marginBottom so input bar stays visible and sits above keyboard (no KAV gap/collapse). */}
      <View style={[styles.keyboardView, { marginBottom: keyboardHeight }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={[styles.messageListContent, { paddingBottom: SP.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {messages.length === 1 && messages[0].role === "system" ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconEmoji}>🤖</Text>
              </View>
              <Text style={styles.emptyTitle}>Ops Agent Online</Text>
              <Text style={styles.emptySub}>
                Add clients, suppliers, drivers, vehicles or trips by typing naturally. Ask about revenue, fleet, or generate a full PDF report.
              </Text>
              <View style={styles.quickPills}>
                {["Add a client", "Create a trip", "What's my revenue?", "Give me a report", "Add a driver", "Add a vehicle"].map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.quickPill}
                    onPress={() => setChatInput(label)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.quickPillText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <>
          {messages.map((msg, i) => (
            <View
              key={i}
              style={[
                styles.messageRow,
                msg.role === "user" ? styles.messageRowUser : styles.messageRowSystem,
              ]}
            >
              <View style={[styles.msgAvatar, msg.role === "user" ? styles.msgAvatarUser : styles.msgAvatarAgent]}>
                <Text style={[styles.msgAvatarText, msg.role === "user" && styles.msgAvatarTextUser]}>{msg.role === "user" ? userInitial : "OA"}</Text>
              </View>
              <View style={[styles.msgBody, msg.role === "user" ? styles.msgBodyUser : styles.msgBodySystem]}>
                <View style={[styles.msgMeta, msg.role === "user" && styles.msgMetaEnd]}>
                  <Text style={styles.msgName}>{msg.role === "user" ? "You" : "Ops Agent"}</Text>
                  <Text style={styles.msgTime}>
                    {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.quBubble,
                    msg.role === "user"
                      ? [styles.quBubbleUser, { backgroundColor: REF.userBubble, borderColor: REF.border }]
                      : styles.quBubbleBot,
                  ]}
                >
                  {msg.role === "user" && editingMessageIndex === i ? (
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
                        <TouchableOpacity style={styles.editMessageBtnCancel} onPress={cancelEditingMessage} activeOpacity={0.8}>
                          <Text style={styles.editMessageBtnCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.editMessageBtnSend, (!editingMessageContent.trim() || isTyping) && styles.editMessageBtnSendDisabled]}
                          onPress={submitEditedMessage}
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
                        <Text style={[styles.quBubbleText, msg.role === "user" && styles.quBubbleTextUser]}>
                          {msg.role === "system" ? toNaturalLanguageReply(msg.content) : msg.content}
                        </Text>
                      ) : null}
                      {msg.role === "user" && msg.attachment?.type === "image" && (
                        <View style={styles.quAttachmentImage}>
                          {msg.attachment.data ? (
                            <Image source={{ uri: msg.attachment.data }} style={styles.quAttachmentImageImg} resizeMode="cover" />
                          ) : (
                            <View style={styles.quAttachmentImagePlaceholder}>
                              <FontAwesome name="image" size={24} color={REF.text3} />
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
                            <Text style={styles.quAttachmentContactName}>{msg.attachment.data.name}</Text>
                            {msg.attachment.data.role ? (
                              <Text style={styles.quAttachmentContactRole}>{msg.attachment.data.role}</Text>
                            ) : null}
                          </View>
                          <FontAwesome name="phone" size={14} color={REF.green} />
                        </View>
                      )}
                      {msg.role === "system" && msg.reportData && (
                        <View style={styles.reportCard}>
                          <View style={styles.reportCardHeader}>
                            <View style={styles.reportIconBox}>
                              <Text style={styles.reportIconEmoji}>📊</Text>
                            </View>
                            <View style={styles.reportTitleBlock}>
                              <Text style={styles.reportCardTitle}>{msg.reportData.title}</Text>
                              <Text style={styles.reportCardDate}>
                              {new Date(msg.reportData.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                              </Text>
                            </View>
                          </View>
                          <ScrollView style={styles.reportCardScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {msg.reportData.sections.map((sec, idx) => (
                              <View key={idx} style={styles.reportSection}>
                                <Text style={styles.reportSectionTitle}>{sec.title}</Text>
                                {sec.table?.headers?.length ? (
                                  <View style={styles.reportTable}>
                                    <View style={styles.reportTableHeaderRow}>
                                      {sec.table.headers.map((h, i) => (
                                        <Text key={i} style={[styles.reportTableHeaderCell, sec.table!.headers.length === 2 && i === 1 && styles.reportTableCellRight]} numberOfLines={1}>
                                          {h}
                                        </Text>
                                      ))}
                                    </View>
                                    {(sec.table.rows ?? []).map((row, ri) => (
                                      <View key={ri} style={styles.reportTableRow}>
                                        {row.map((cell, ci) => (
                                          <Text key={ci} style={[styles.reportTableCell, sec.table!.headers.length === 2 && ci === 1 && styles.reportTableCellRight]} numberOfLines={1}>
                                            {cell}
                                          </Text>
                                        ))}
                                      </View>
                                    ))}
                                  </View>
                                ) : (
                                  <Text style={styles.reportSectionBody}>{sec.body}</Text>
                                )}
                              </View>
                            ))}
                          </ScrollView>
                          <TouchableOpacity
                            style={styles.reportDownloadBtn}
                            onPress={() => handleDownloadReportPdf(msg.reportData!)}
                            activeOpacity={0.8}
                            disabled={pdfDownloadingTitle === msg.reportData?.title}
                          >
                            {pdfDownloadingTitle === msg.reportData?.title ? (
                              <LoadingIndicator size="small" color={REF.amber} />
                            ) : (
                              <FontAwesome name="file-pdf-o" size={16} color={REF.amber} />
                            )}
                            <Text style={styles.reportDownloadBtnText}>
                              {pdfDownloadingTitle === msg.reportData?.title ? "Generating…" : "Download PDF"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {msg.role === "system" && msg.pendingConfirm && (
                        <View style={styles.previewCard}>
                          <View style={styles.previewCardHeader}>
                            <Text style={styles.previewCardTitle}>
                              {msg.pendingConfirm.type === "client"
                                ? "Create client?"
                                : msg.pendingConfirm.type === "supplier"
                                  ? "Add supplier?"
                                  : msg.pendingConfirm.type === "vehicle"
                                    ? "Add vehicle?"
                                    : msg.pendingConfirm.type === "trip"
                                      ? "Create trip?"
                                      : "Add driver?"}
                            </Text>
                            <Text style={styles.previewCardHint}>Edit details below, then confirm.</Text>
                          </View>
                          {msg.pendingConfirm.type === "client" && (
                            <>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Contact person name</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.contact_person ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, contact_person: t })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, phone: formatMobileNumber(t) })}
                                  placeholder="e.g. 943214566"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="phone-pad"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Organization / company name (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.organization_name ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, organization_name: t })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, phone: formatMobileNumber(t) })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, company_name: t })}
                                  placeholder="e.g. Acme Transport"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Contact person</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.contact_person ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, contact_person: t })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, email: t })}
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
                                <Text style={styles.modalLabel}>Vehicle number / registration (required)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.vehicle_number ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, vehicle_number: t })}
                                  placeholder="e.g. KA01AB1234"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="characters"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Brand (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.vehicle_brand ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, vehicle_brand: t })}
                                  placeholder="e.g. Tata"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Body type (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.vehicle_body_type ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, vehicle_body_type: t })}
                                  placeholder="e.g. Container"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Size (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.vehicle_size ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, vehicle_size: t })}
                                  placeholder="e.g. 20 ft"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Axle (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.vehicle_axle ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, vehicle_axle: t })}
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
                                <Text style={styles.modalLabel}>Contact name (required)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.name ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, name: t })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, phone: formatMobileNumber(t) })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, license_number: t })}
                                  placeholder="e.g. DL-12345"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="characters"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Fixed salary (₹) optional</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={msg.pendingConfirm.data.payable_amount != null ? String(msg.pendingConfirm.data.payable_amount) : ""}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, payable_amount: t ? Number(t) : undefined })}
                                  placeholder="e.g. 15000"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="number-pad"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Trips commission (%) optional</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={msg.pendingConfirm.data.commission_percent != null ? String(msg.pendingConfirm.data.commission_percent) : ""}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, commission_percent: t ? Number(t) : undefined })}
                                  placeholder="e.g. 10"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Per km pay (₹/km) optional</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={msg.pendingConfirm.data.commission_per_km != null ? String(msg.pendingConfirm.data.commission_per_km) : ""}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, commission_per_km: t ? Number(t) : undefined })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, pickup_area: t })}
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
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, drop_location: t })}
                                  placeholder="e.g. Bangalore"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Client name</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.pendingConfirm.data.client_name ?? "")}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, client_name: t })}
                                  placeholder="e.g. ABC Ltd"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Trip rate (₹) — amount charged to client</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={msg.pendingConfirm.data.client_price != null ? String(msg.pendingConfirm.data.client_price) : ""}
                                  onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, client_price: t ? Number(t) : 0 })}
                                  placeholder="e.g. 50000"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="number-pad"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Own fleet (asset) or partner (aggregate)</Text>
                                <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                                  <TouchableOpacity
                                    style={[
                                      styles.modalInput,
                                      { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 10 },
                                      (msg.pendingConfirm.data.supply_source ?? "asset") === "asset" && { backgroundColor: REF.accentSoft, borderColor: REF.accent },
                                    ]}
                                    onPress={() => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, supply_source: "asset" })}
                                  >
                                    <Text style={[(msg.pendingConfirm.data.supply_source ?? "asset") === "asset" && { fontFamily: FONT.semiBold, color: REF.accent }]}>Asset</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.modalInput,
                                      { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 10 },
                                      msg.pendingConfirm.data.supply_source === "aggregate" && { backgroundColor: REF.accentSoft, borderColor: REF.accent },
                                    ]}
                                    onPress={() => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, supply_source: "aggregate" })}
                                  >
                                    <Text style={[msg.pendingConfirm.data.supply_source === "aggregate" && { fontFamily: FONT.semiBold, color: REF.accent }]}>Aggregate</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              {(msg.pendingConfirm.data.supply_source ?? "asset") === "aggregate" && (
                                <View style={styles.modalField}>
                                  <Text style={styles.modalLabel}>Supplier rate (₹) — amount paid to partner</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    value={msg.pendingConfirm.data.supplier_rate != null ? String(msg.pendingConfirm.data.supplier_rate) : ""}
                                    onChangeText={(t) => updatePendingConfirmData(i, { ...msg.pendingConfirm!.data, supplier_rate: t ? Number(t) : 0 })}
                                    placeholder="e.g. 40000"
                                    placeholderTextColor={REF.text3}
                                    keyboardType="number-pad"
                                  />
                                </View>
                              )}
                            </>
                          )}
                          <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => handlePendingConfirmCancel(i)} activeOpacity={0.8}>
                              <Text style={styles.modalBtnCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalBtnConfirm} onPress={() => handlePendingConfirmSubmit(i)} activeOpacity={0.8}>
                              <Text style={styles.modalBtnConfirmText}>
                                {msg.pendingConfirm.type === "client" ? "Create client" : msg.pendingConfirm.type === "supplier" ? "Add supplier" : msg.pendingConfirm.type === "vehicle" ? "Add vehicle" : msg.pendingConfirm.type === "trip" ? "Create trip" : "Add driver"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      {msg.role === "system" && msg.createdPreview && (
                        <View style={styles.previewCard}>
                          <View style={styles.previewCardHeader}>
                            <Text style={styles.previewCardTitle}>
                              {msg.createdPreview.updated && editingPreviewIndex !== i
                                ? "Added to history"
                                : msg.createdPreview.type === "client"
                                  ? "Create client?"
                                  : msg.createdPreview.type === "supplier"
                                    ? "Add supplier?"
                                    : msg.createdPreview.type === "vehicle"
                                      ? "Add vehicle?"
                                      : msg.createdPreview.type === "trip"
                                        ? "Create trip?"
                                        : "Add driver?"}
                            </Text>
                            {(msg.createdPreview.updated && editingPreviewIndex !== i) ? null : (
                              <Text style={styles.previewCardHint}>Edit details below, then confirm.</Text>
                            )}
                          </View>
                          {msg.createdPreview.updated && editingPreviewIndex !== i && (
                            <View style={styles.previewSummaryCard}>
                              <View style={styles.previewSummaryHeader}>
                                <View style={styles.previewBadge}>
                                  <Text style={styles.previewBadgeText}>
                                    {msg.createdPreview.type === "client"
                                      ? "Client"
                                      : msg.createdPreview.type === "supplier"
                                        ? "Supplier"
                                        : msg.createdPreview.type === "vehicle"
                                          ? "Vehicle"
                                          : msg.createdPreview.type === "trip"
                                            ? "Trip"
                                            : "Driver"}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.previewEditLink}
                                  onPress={() => setEditingPreviewIndex(i)}
                                  activeOpacity={0.8}
                                >
                                  <FontAwesome name="pencil" size={12} color={REF.accent} />
                                  <Text style={styles.previewEditLinkText}>Edit</Text>
                                </TouchableOpacity>
                              </View>
                              <View style={styles.previewSummaryBody}>
                                {msg.createdPreview.type === "client" && (
                                  <>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Contact</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>{String(msg.createdPreview.data.contact_person || "—")}</Text>
                                    </View>
                                    <View style={[styles.previewSummaryRow, (msg.createdPreview.data as Record<string, string>).organization_name ? undefined : styles.previewSummaryRowLast]}>
                                      <Text style={styles.previewSummaryLabel}>Phone</Text>
                                      <Text style={styles.previewSummaryValue}>{String(msg.createdPreview.data.phone || "—")}</Text>
                                    </View>
                                    {(msg.createdPreview.data as Record<string, string>).organization_name ? (
                                      <View style={[styles.previewSummaryRow, styles.previewSummaryRowLast]}>
                                        <Text style={styles.previewSummaryLabel}>Organization</Text>
                                        <Text style={styles.previewSummaryValue} numberOfLines={1}>{String((msg.createdPreview.data as Record<string, string>).organization_name)}</Text>
                                      </View>
                                    ) : null}
                                  </>
                                )}
                                {msg.createdPreview.type === "supplier" && (
                                  <>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Company</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>{String((msg.createdPreview.data as Record<string, string>).company_name || "—")}</Text>
                                    </View>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Contact</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>{String((msg.createdPreview.data as Record<string, string>).contact_person || "—")}</Text>
                                    </View>
                                    <View style={[styles.previewSummaryRow, (msg.createdPreview.data as Record<string, string>).email ? undefined : styles.previewSummaryRowLast]}>
                                      <Text style={styles.previewSummaryLabel}>Phone</Text>
                                      <Text style={styles.previewSummaryValue}>{String((msg.createdPreview.data as Record<string, string>).phone || "—")}</Text>
                                    </View>
                                    {(msg.createdPreview.data as Record<string, string>).email ? (
                                      <View style={[styles.previewSummaryRow, styles.previewSummaryRowLast]}>
                                        <Text style={styles.previewSummaryLabel}>Email</Text>
                                        <Text style={styles.previewSummaryValue} numberOfLines={1}>{String((msg.createdPreview.data as Record<string, string>).email)}</Text>
                                      </View>
                                    ) : null}
                                  </>
                                )}
                                {msg.createdPreview.type === "vehicle" && (
                                  <>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Registration</Text>
                                      <Text style={styles.previewSummaryValue}>{String((msg.createdPreview.data as Record<string, string>).vehicle_number || "—")}</Text>
                                    </View>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Brand</Text>
                                      <Text style={styles.previewSummaryValue}>{String((msg.createdPreview.data as Record<string, string>).vehicle_brand || "—")}</Text>
                                    </View>
                                    <View style={[styles.previewSummaryRow, styles.previewSummaryRowLast]}>
                                      <Text style={styles.previewSummaryLabel}>Body · Size / Axle</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>
                                        {[((msg.createdPreview.data as Record<string, string>).vehicle_body_type || ""), ((msg.createdPreview.data as Record<string, string>).vehicle_size || ""), ((msg.createdPreview.data as Record<string, string>).vehicle_axle || "")].filter(Boolean).join(" · ") || "—"}
                                      </Text>
                                    </View>
                                  </>
                                )}
                                {msg.createdPreview.type === "trip" && (
                                  <>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Route</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>
                                        {[msg.createdPreview.data.pickup_area, msg.createdPreview.data.drop_location].filter(Boolean).join(" → ") || "—"}
                                      </Text>
                                    </View>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Client</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>{String(msg.createdPreview.data.client_name ?? "—")}</Text>
                                    </View>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Trip rate</Text>
                                      <Text style={styles.previewSummaryValue}>₹{Number(msg.createdPreview.data.client_price ?? 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={[styles.previewSummaryRow, styles.previewSummaryRowLast]}>
                                      <Text style={styles.previewSummaryLabel}>Supply</Text>
                                      <Text style={styles.previewSummaryValue}>
                                        {msg.createdPreview.data.supply_source === "aggregate"
                                          ? `Aggregate · ₹${Number(msg.createdPreview.data.supplier_rate ?? 0).toLocaleString()}`
                                          : "Asset (own fleet)"}
                                      </Text>
                                    </View>
                                  </>
                                )}
                                {msg.createdPreview.type === "driver" && (
                                  <>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Name</Text>
                                      <Text style={styles.previewSummaryValue} numberOfLines={1}>{String((msg.createdPreview.data as Record<string, string>).name || "—")}</Text>
                                    </View>
                                    <View style={styles.previewSummaryRow}>
                                      <Text style={styles.previewSummaryLabel}>Phone</Text>
                                      <Text style={styles.previewSummaryValue}>{String((msg.createdPreview.data as Record<string, string>).phone || "—")}</Text>
                                    </View>
                                    <View style={[styles.previewSummaryRow, styles.previewSummaryRowLast]}>
                                      <Text style={styles.previewSummaryLabel}>DL number</Text>
                                      <Text style={styles.previewSummaryValue}>{String((msg.createdPreview.data as Record<string, string>).license_number || "—")}</Text>
                                    </View>
                                  </>
                                )}
                              </View>
                            </View>
                          )}
                          {(!msg.createdPreview.updated || editingPreviewIndex === i) && msg.createdPreview.type === "client" && (
                            <>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Contact person name</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.contact_person ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, contact_person: t })}
                                  placeholder="e.g. Raj"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Phone number</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.phone ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, phone: formatMobileNumber(t) })}
                                  placeholder="e.g. 943214566"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="phone-pad"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Organization / company name (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.organization_name ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, organization_name: t })}
                                  placeholder="e.g. Acme Transport"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                            </>
                          )}
                          {(!msg.createdPreview.updated || editingPreviewIndex === i) && msg.createdPreview.type === "supplier" && (
                            <>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Phone (required)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.phone ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, phone: formatMobileNumber(t) })}
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
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, company_name: t })}
                                  placeholder="e.g. Acme Transport"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="words"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Contact person</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.contact_person ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, contact_person: t })}
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
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, email: t })}
                                  placeholder="e.g. contact@acme.com"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="email-address"
                                />
                              </View>
                            </>
                          )}
                          {(!msg.createdPreview.updated || editingPreviewIndex === i) && msg.createdPreview.type === "vehicle" && (
                            <>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Vehicle number / registration (required)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.vehicle_number ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, vehicle_number: t })}
                                  placeholder="e.g. KA01AB1234"
                                  placeholderTextColor={REF.text3}
                                  autoCapitalize="characters"
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Brand (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.vehicle_brand ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, vehicle_brand: t })}
                                  placeholder="e.g. Tata"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Body type (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.vehicle_body_type ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, vehicle_body_type: t })}
                                  placeholder="e.g. Container"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Size (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.vehicle_size ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, vehicle_size: t })}
                                  placeholder="e.g. 20 ft"
                                  placeholderTextColor={REF.text3}
                                />
                              </View>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Axle (optional)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.vehicle_axle ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, vehicle_axle: t })}
                                  placeholder="e.g. 2"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="number-pad"
                                />
                              </View>
                            </>
                          )}
                          {(!msg.createdPreview.updated || editingPreviewIndex === i) && msg.createdPreview.type === "driver" && (
                            <>
                              <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Contact name (required)</Text>
                                <TextInput
                                  style={styles.modalInput}
                                  value={String(msg.createdPreview.data.name ?? "")}
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, name: t })}
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
                                  onChangeText={(t) => updatePreviewData(i, { ...msg.createdPreview!.data, phone: formatMobileNumber(t) })}
                                  placeholder="e.g. 943214566"
                                  placeholderTextColor={REF.text3}
                                  keyboardType="phone-pad"
                                />
                              </View>
                            </>
                          )}
                          {(!msg.createdPreview.updated || editingPreviewIndex === i) && (
                            <View style={styles.modalActions}>
                              <TouchableOpacity
                                style={styles.modalBtnCancel}
                                onPress={() => setEditingPreviewIndex(null)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.modalBtnCancelText}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.modalBtnConfirm}
                                onPress={() => handlePreviewUpdate(i)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.modalBtnConfirmText}>
                                  {msg.createdPreview.type === "client" ? "Create client" : msg.createdPreview.type === "supplier" ? "Add supplier" : msg.createdPreview.type === "vehicle" ? "Add vehicle" : msg.createdPreview.type === "trip" ? "Create trip" : "Add driver"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
                {/* ChatGPT-style message actions row (copy, edit / thumbs, share, refresh, more) */}
                {editingMessageIndex !== i && (
                  <View style={[styles.msgActionsRow, msg.role === "user" && styles.msgActionsRowEnd]}>
                    {msg.role === "user" ? (
                      <>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => copyMessageContent(msg.content, false)} activeOpacity={0.7}>
                          <FontAwesome name="copy" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => startEditingMessage(i)} activeOpacity={0.7}>
                          <FontAwesome name="pencil" size={12} color={REF.text3} />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => copyMessageContent(msg.content ?? "", true)} activeOpacity={0.7}>
                          <FontAwesome name="copy" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => triggerSuccess("Thanks for feedback")} activeOpacity={0.7}>
                          <FontAwesome name="thumbs-up" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => triggerSuccess("Feedback recorded")} activeOpacity={0.7}>
                          <FontAwesome name="thumbs-down" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => handleShareAgentMessage(msg.content ?? "")} activeOpacity={0.7}>
                          <FontAwesome name="share-alt" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => { const newMessages = messages.slice(0, i + 1); runProcessMessages(newMessages, undefined); }} activeOpacity={0.7}>
                          <FontAwesome name="refresh" size={12} color={REF.text3} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.msgActionBtn} onPress={() => handleAgentMessageMore(i)} activeOpacity={0.7}>
                          <FontAwesome name="ellipsis-h" size={12} color={REF.text3} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}
            </>
          )}
          {isTyping && (
            <View style={[styles.messageRow, styles.messageRowSystem]}>
              <View style={[styles.quTypingBubble, { backgroundColor: REF.botBubble, borderColor: REF.border }]}>
                <View style={styles.typingDots}>
                  <View style={[styles.typingDot, styles.quTypingDot]} />
                  <View style={[styles.typingDot, styles.typingDot2, styles.quTypingDot]} />
                  <View style={[styles.typingDot, styles.typingDot3, styles.quTypingDot]} />
                </View>
              </View>
            </View>
          )}
          {reattemptPayload && (
            <View style={[styles.messageRow, styles.messageRowSystem]}>
              <View style={[styles.quBubble, styles.reattemptBubble, { backgroundColor: REF.botBubble, borderColor: REF.border }]}>
                <TouchableOpacity style={styles.reattemptBtn} onPress={handleReattemptCreation} activeOpacity={0.8}>
                  <FontAwesome name="refresh" size={12} color={REF.accent} />
                  <Text style={styles.reattemptBtnText}>Re-attempt creation</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.quInputWrap, { paddingBottom: keyboardVisible ? SP.sm : SP.sm + insets.bottom }]}>
          {error ? <Text style={styles.errorText} numberOfLines={2}>{error}</Text> : null}
          {pendingAttachment && (
            <View style={styles.quAttachmentStrip}>
              <View style={styles.quAttachmentStripLeft}>
                <FontAwesome
                  name={pendingAttachment.type === "image" ? "image" : "user"}
                  size={16}
                  color={REF.accent}
                />
                <Text style={styles.quAttachmentStripText}>
                  {pendingAttachment.type === "image" ? "Image Ready" : `Contact: ${pendingAttachment.data.name}`}
                </Text>
              </View>
              <TouchableOpacity style={styles.quAttachmentStripRemove} onPress={() => setPendingAttachment(null)} activeOpacity={0.8}>
                <FontAwesome name="times" size={12} color={REF.red} />
              </TouchableOpacity>
            </View>
          )}
          {showAttachMenu && (
            <View style={styles.attachMenu}>
              <TouchableOpacity style={styles.attachMenuItem} onPress={handleTakePhoto} activeOpacity={0.8}>
                <FontAwesome name="camera" size={18} color={REF.text2} />
                <Text style={styles.attachMenuItemText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachMenuItem} onPress={handlePickImage} activeOpacity={0.8}>
                <FontAwesome name="paperclip" size={18} color={REF.text2} />
                <Text style={styles.attachMenuItemText}>Add photos & files</Text>
              </TouchableOpacity>
              <View style={styles.attachMenuDivider} />
              <TouchableOpacity
                style={styles.attachMenuItem}
                onPress={() => { setPendingAttachment({ type: "contact", data: { name: "Raj Kumar", role: "Prime Pilot", phone: "+91 98765 43210" } }); setShowAttachMenu(false); }}
                activeOpacity={0.8}
              >
                <Feather name="user-plus" size={18} color={REF.text2} strokeWidth={1.5} />
                <Text style={styles.attachMenuItemText}>Add contact</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.quInputRow}>
            <TouchableOpacity
              style={[styles.quInputPlusBtn, showAttachMenu && styles.quInputPlusBtnActive]}
              onPress={() => setShowAttachMenu((v) => !v)}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={20} color={showAttachMenu ? REF.accent : REF.text2} strokeWidth={1.5} />
            </TouchableOpacity>
            <TextInput
              style={styles.quInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask anything"
              placeholderTextColor={REF.text3}
              multiline
              maxLength={500}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            {keyboardVisible ? (
              <TouchableOpacity
                style={styles.quInputActionBtn}
                onPress={() => Keyboard.dismiss()}
                activeOpacity={0.8}
                accessibilityLabel="Close keyboard"
              >
                <Feather name="chevron-down" size={18} color={REF.text3} strokeWidth={1.5} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.quInputActionBtn} onPress={() => triggerSuccess("Voice input coming soon")} activeOpacity={0.8}>
              <FontAwesome name="microphone" size={18} color={REF.text3} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.quSendBtn,
                (chatInput.trim() || pendingAttachment) && !isTyping ? styles.quSendBtnActive : styles.quSendBtnDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={(!chatInput.trim() && !pendingAttachment) || isTyping}
              activeOpacity={0.8}
            >
              <Feather name="arrow-up" size={18} color={(chatInput.trim() || pendingAttachment) && !isTyping ? REF.text : REF.text3} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function getStyles(ref: OpsRef) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ref.bg,
  },
  successToast: {
    position: "absolute",
    left: SP.lg,
    right: SP.lg,
    zIndex: 300,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    backgroundColor: ref.bg,
    paddingVertical: SP.md,
    paddingHorizontal: SP.xl,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    ...ref.shadow,
  },
  successToastText: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: ref.text,
    letterSpacing: 0.3,
  },
  keyboardView: { flex: 1 },
  messageList: { flex: 1, backgroundColor: ref.bg },
  messageListContent: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
    paddingBottom: SP.md,
    minHeight: 120,
  },
  refHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ref.border,
    backgroundColor: ref.bg,
  },
  refHeaderLeft: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  refBackBtn: { padding: SP.xs },
  refStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ref.green,
    ...(Platform.OS === "ios" ? { shadowColor: ref.green, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4 } : {}),
  },
  refHeaderTitle: { fontSize: 15, fontFamily: FONT.semiBold, color: ref.text, letterSpacing: 0.2 },
  refHeaderMeta: { fontSize: 11, fontFamily: FONT.regular, color: ref.text2, letterSpacing: 0.3 },
  refHeaderRight: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  refHeaderBtn: {
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderRadius: ref.radiusSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border2,
  },
  refHeaderBtnText: { fontSize: 12, fontFamily: FONT.medium, color: ref.text },
  refAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ref.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  refAvatarText: { fontSize: 12, fontFamily: FONT.bold, color: ref.textOnAccent },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.xxl * 2,
    paddingHorizontal: SP.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: ref.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.xl,
    ...ref.shadowSm,
  },
  emptyIconEmoji: { fontSize: 28 },
  emptyTitle: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: ref.text,
    marginBottom: SP.sm,
    textAlign: "center",
    letterSpacing: 0.15,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: ref.text2,
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 22,
    marginBottom: SP.xl,
    letterSpacing: 0.1,
  },
  quickPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: SP.sm,
    maxWidth: 460,
  },
  quickPill: {
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    backgroundColor: ref.surface2,
    ...ref.shadowSm,
  },
  quickPillText: { fontSize: 13, fontFamily: FONT.medium, color: ref.text2, letterSpacing: 0.1 },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SP.sm,
    gap: SP.sm,
    paddingVertical: 2,
  },
  messageRowUser: { flexDirection: "row-reverse" },
  messageRowSystem: {},
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  msgAvatarAgent: {
    backgroundColor: ref.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border2,
  },
  msgAvatarUser: { backgroundColor: ref.accent },
  msgAvatarText: { fontSize: 9, fontFamily: FONT.bold, color: ref.accent },
  msgAvatarTextUser: { fontFamily: FONT.bold, color: ref.text, fontSize: 12 },
  msgBody: { flex: 1, minWidth: 0, maxWidth: "85%" },
  msgBodyUser: { alignItems: "flex-end" },
  msgBodySystem: { alignItems: "flex-start" },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: SP.xs, marginBottom: 3 },
  msgMetaEnd: { justifyContent: "flex-end" },
  msgName: {
    fontSize: 9,
    fontFamily: FONT.semiBold,
    color: ref.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  msgTime: { fontSize: 9, fontFamily: FONT.regular, color: ref.text3, letterSpacing: 0.2 },
  msgActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.lg,
    marginTop: 4,
  },
  msgActionsRowEnd: { justifyContent: "flex-end" },
  msgActionBtn: {
    padding: 4,
    borderRadius: 6,
  },
  quBubble: {
    maxWidth: "100%",
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderRadius: ref.radius,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quBubbleUser: {
    borderBottomRightRadius: 6,
    ...ref.shadowSm,
  },
  quBubbleBot: {
    backgroundColor: ref.surface,
    borderColor: ref.border,
  },
  quBubbleText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: ref.text,
    lineHeight: 20,
    letterSpacing: 0.05,
  },
  quBubbleTextUser: { fontFamily: FONT.regular, color: ref.text },
  quAttachmentImage: {
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ref.border2,
    height: 120,
    width: "100%",
  },
  quAttachmentImageImg: { width: "100%", height: "100%" },
  quAttachmentImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: ref.imagePlaceholderOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  quAttachmentContact: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: ref.contactCardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ref.contactCardBorder,
  },
  quAttachmentContactIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ref.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  quAttachmentContactInfo: { flex: 1 },
  quAttachmentContactName: {
    fontSize: 11,
    fontFamily: FONT.bold,
    fontStyle: "italic",
    color: ref.text,
  },
  quAttachmentContactRole: {
    fontSize: 8,
    fontFamily: FONT.bold,
    color: ref.text2,
    marginTop: 4,
  },
  reportCard: {
    marginTop: SP.md,
    backgroundColor: ref.cardBg,
    borderRadius: ref.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.cardBorder,
    overflow: "hidden",
    maxWidth: 480,
    maxHeight: 320,
    ...ref.shadow,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    padding: SP.md,
    paddingHorizontal: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ref.border,
  },
  reportCardTitle: {
    fontSize: 14,
    fontFamily: FONT.semiBold,
    color: ref.text,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  reportCardDate: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: ref.text3,
    letterSpacing: 0.2,
  },
  reportIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: ref.amberSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border2,
    alignItems: "center",
    justifyContent: "center",
  },
  reportIconEmoji: { fontSize: 14 },
  reportTitleBlock: {},
  reportCardScroll: {
    maxHeight: 200,
    marginBottom: 12,
  },
  reportSection: {
    marginBottom: 12,
  },
  reportSectionTitle: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: ref.text3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reportSectionBody: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: ref.text2,
    lineHeight: 20,
  },
  reportTable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  reportTableHeaderRow: {
    flexDirection: "row",
    backgroundColor: ref.border2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ref.border,
  },
  reportTableHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontFamily: FONT.bold,
    color: ref.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  reportTableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ref.border,
  },
  reportTableCell: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT.regular,
    color: ref.text2,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  reportTableCellRight: {
    textAlign: "right",
  },
  reportDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    margin: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: ref.amberSoft,
    borderWidth: 1,
    borderColor: ref.border2,
    borderRadius: ref.radiusSm,
  },
  reportDownloadBtnText: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: ref.amber,
  },
  previewCard: {
    marginTop: SP.md,
    backgroundColor: ref.cardBg,
    borderRadius: ref.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.cardBorder,
    overflow: "hidden",
    ...ref.shadow,
  },
  previewCardHeader: {
    padding: SP.md,
    paddingHorizontal: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ref.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewCardTitle: {
    fontSize: 14,
    fontFamily: FONT.semiBold,
    color: ref.text,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  previewCardHint: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: ref.text2,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  previewReadOnly: {
    gap: 4,
    marginTop: 4,
  },
  previewReadOnlyLine: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: ref.text,
  },
  previewSummaryCard: {
    marginTop: 4,
    backgroundColor: ref.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ref.border,
    overflow: "hidden",
  },
  previewSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: ref.border,
  },
  previewBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: ref.accentSoft,
  },
  previewBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: ref.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewEditLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  previewEditLinkText: {
    fontSize: 12,
    fontFamily: FONT.semiBold,
    color: ref.accent,
  },
  previewSummaryBody: {
    padding: 14,
    gap: 0,
  },
  previewSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: ref.border,
  },
  previewSummaryRowLast: {
    borderBottomWidth: 0,
  },
  previewSummaryLabel: {
    fontSize: 11,
    fontFamily: FONT.semiBold,
    color: ref.text3,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginRight: 12,
  },
  previewSummaryValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: ref.text,
    textAlign: "right",
  },
  previewEditAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  previewEditAgainBtnText: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: ref.accent,
  },
  quTypingBubble: {
    paddingVertical: SP.lg,
    paddingHorizontal: SP.xl,
    borderRadius: ref.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 6,
  },
  quTypingDot: {
    backgroundColor: ref.accent,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  reattemptBubble: { paddingVertical: SP.sm, paddingHorizontal: SP.sm },
  reattemptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.accent,
    borderRadius: ref.radiusSm,
    alignSelf: "flex-start",
  },
  reattemptBtnText: { fontSize: 12, fontFamily: FONT.semiBold, color: ref.accent },
  editMessageWrap: { gap: SP.md },
  editMessageInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.editInputBorder,
    backgroundColor: ref.editInputBg,
    borderRadius: ref.radiusSm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    fontSize: 14,
    fontFamily: FONT.regular,
    color: ref.text,
    minHeight: 48,
    maxHeight: 100,
  },
  editMessageActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: SP.sm, marginTop: SP.sm },
  editMessageBtnCancel: {
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
    borderRadius: ref.radiusSm,
    backgroundColor: ref.surfaceOverlay,
  },
  editMessageBtnCancelText: { fontSize: 13, fontFamily: FONT.medium, color: ref.surfaceOverlayText },
  editMessageBtnSend: {
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
    borderRadius: ref.radiusSm,
    backgroundColor: ref.bg,
  },
  editMessageBtnSendDisabled: { backgroundColor: ref.surface3, opacity: 0.8 },
  editMessageBtnSendText: { fontSize: 13, fontFamily: FONT.semiBold, color: ref.text },
  editMessageTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: ref.surfaceOverlay,
  },
  editMessageTriggerText: {
    fontSize: 10,
    fontFamily: FONT.semiBold,
    color: ref.surfaceOverlayMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typingDots: { flexDirection: "row", alignItems: "center", gap: 6 },
  typingDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.5 },
  typingDot2: { opacity: 0.75 },
  typingDot3: { opacity: 1 },
  errorText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: ref.red,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  quInputWrap: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.sm,
    backgroundColor: ref.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ref.border,
  },
  quAttachmentStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: ref.surface2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    marginBottom: 6,
  },
  quAttachmentStripLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  quAttachmentStripText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: ref.accent,
    letterSpacing: 0.5,
  },
  quAttachmentStripRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239,68,68,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  quInputActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  quInputActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  quInputActionBtnActive: {
    backgroundColor: ref.accent,
  },
  quInputActionDivider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: ref.border, marginHorizontal: 2 },
  quInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ref.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    borderRadius: ref.radiusXl,
    paddingLeft: SP.xs,
    paddingRight: SP.xs,
    paddingVertical: SP.xs,
    minHeight: 44,
    ...ref.shadow,
  },
  quInputPlusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ref.surface3,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SP.sm,
  },
  quInputPlusBtnActive: {
    backgroundColor: ref.accentSoft,
  },
  quInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: ref.text,
    paddingVertical: SP.sm,
    paddingRight: SP.xs,
    paddingLeft: SP.xs,
    maxHeight: 88,
    letterSpacing: 0.1,
  },
  quDismissKeypadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SP.xs,
  },
  quSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...ref.shadowSm,
  },
  quSendBtnActive: { backgroundColor: ref.accent },
  quSendBtnDisabled: { backgroundColor: ref.surface3 },
  attachMenu: {
    backgroundColor: ref.surface2,
    borderRadius: ref.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border,
    marginBottom: SP.sm,
    paddingVertical: SP.xs,
    ...ref.shadow,
  },
  attachMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
  },
  attachMenuItemText: { fontSize: 14, fontFamily: FONT.regular, color: ref.text2 },
  attachMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ref.border,
    marginVertical: SP.xs,
    marginHorizontal: SP.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  modalCardWrap: {
    justifyContent: "flex-end",
    maxHeight: "85%",
  },
  modalCard: {
    backgroundColor: ref.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ref.border2,
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  modalCardChat: {
    backgroundColor: ref.surface2,
    borderColor: ref.border2,
    borderWidth: 1,
    shadowColor: ref.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  modalCardHeader: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: ref.text,
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: ref.text2,
  },
  modalScroll: {
    maxHeight: 280,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalField: { marginBottom: SP.md },
  modalLabel: {
    fontSize: 10,
    fontFamily: FONT.semiBold,
    color: ref.text3,
    marginBottom: SP.xs + 1,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border2,
    backgroundColor: ref.surface2,
    borderRadius: ref.radiusSm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 1,
    fontSize: 14,
    fontFamily: FONT.regular,
    color: ref.text,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
  },
  modalBtnCancel: {
    paddingVertical: SP.sm + 1,
    paddingHorizontal: SP.lg,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ref.border2,
    borderRadius: ref.radiusSm,
  },
  modalBtnCancelText: { fontSize: 13, fontFamily: FONT.medium, color: ref.text2 },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: SP.sm + 1,
    paddingHorizontal: SP.lg,
    backgroundColor: ref.accent,
    borderRadius: ref.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnConfirmText: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: ref.textOnAccent,
  },
  });
}
