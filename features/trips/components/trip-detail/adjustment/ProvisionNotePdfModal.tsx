import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";

import { LoadingIndicator } from "@/components/LoadingIndicator";
import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";

import Theme from "@/constants/Theme";
import {
  downloadProvisionNotePdf,
  printProvisionNote,
  shareProvisionNoteOnWhatsApp,
  shareProvisionNotePdf,
} from "@/features/trips/components/trip-detail/adjustment/provisionNoteShare.util";
import {
  generateProvisionNotePdfUri,
  type ProvisionNotePdfContext,
} from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import type { TripAdjustment, TripAdjustmentImpact } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

type ProvisionAction = "print" | "whatsapp" | "share" | "download";

function noteTitle(impact: TripAdjustmentImpact): string {
  return impact === "minus" ? "Credit Note" : "Debit Note";
}

function ProvisionNoteHtmlPreview({
  html,
  title,
}: {
  html: string;
  title: string;
}) {
  if (Platform.OS === "web") {
    return (
      <iframe
        srcDoc={html}
        title={title}
        style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#f1f5f9" }}
      />
    );
  }

  return <NativeHtmlWebView html={html} style={styles.webView} />;
}

export type ProvisionNotePdfModalProps = {
  visible: boolean;
  context: ProvisionNotePdfContext | null;
  onClose: () => void;
  onEdit?: (adjustment: TripAdjustment) => void;
};

export const ProvisionNotePdfModal = memo(function ProvisionNotePdfModal(
  props: ProvisionNotePdfModalProps,
) {
  const insets = useSafeAreaInsets();
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<ProvisionAction | null>(null);

  useEffect(() => {
    if (!props.visible || !props.context) {
      setPdfUri(null);
      setHtmlPreview(null);
      setPrintHtml(null);
      setError(null);
      setLoading(false);
      setActionBusy(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await generateProvisionNotePdfUri(props.context!);
        if (cancelled) return;
        setHtmlPreview(result.html);
        setPrintHtml(result.printHtml);
        setPdfUri(Platform.OS === "web" ? null : result.uri);
      } catch {
        if (!cancelled) {
          setError("Could not generate the provision note PDF.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.visible, props.context]);

  const runAction = useCallback(
    async (action: ProvisionAction, fn: () => Promise<void>) => {
      if (!props.context || loading || error || actionBusy) return;
      setActionBusy(action);
      try {
        await fn();
      } finally {
        setActionBusy(null);
      }
    },
    [props.context, loading, error, actionBusy],
  );

  const handlePrint = useCallback(async () => {
    await runAction("print", async () => {
      await printProvisionNote(props.context!, printHtml);
    });
  }, [props.context, printHtml, runAction]);

  const handleWhatsApp = useCallback(async () => {
    await runAction("whatsapp", async () => {
      await shareProvisionNoteOnWhatsApp(props.context!);
    });
  }, [props.context, runAction]);

  const handleShare = useCallback(async () => {
    await runAction("share", async () => {
      await shareProvisionNotePdf(props.context!, printHtml, pdfUri);
    });
  }, [props.context, printHtml, pdfUri, runAction]);

  const handleDownload = useCallback(async () => {
    await runAction("download", async () => {
      await downloadProvisionNotePdf(props.context!, printHtml, pdfUri);
    });
  }, [props.context, printHtml, pdfUri, runAction]);

  if (!props.visible || !props.context) return null;

  const title = noteTitle(props.context.adjustment.impact);
  const kind = props.context.adjustment.impact === "minus" ? "CN" : "DN";
  const canEdit =
    typeof props.onEdit === "function" &&
    !isAdjustmentVoided(props.context.adjustment);
  const actionsDisabled = loading || Boolean(error) || actionBusy !== null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable
            onPress={props.onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close provision note"
          >
            <Feather name="x" size={22} color={Theme.textPrimaryDark} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerKicker}>PULSE PROVISION</Text>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerMeta}>
              {kind} · Trip {props.context.tripCode}
            </Text>
          </View>
          {canEdit ? (
            <Pressable
              onPress={() => props.onEdit?.(props.context!.adjustment)}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${kind}`}
            >
              <Feather name="edit-2" size={18} color={Theme.primary} />
            </Pressable>
          ) : (
            <View style={styles.editBtnSpacer} />
          )}
        </View>

        <View style={styles.preview}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Theme.primary} />
              <Text style={styles.loadingText}>Preparing document…</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : htmlPreview ? (
            <ProvisionNoteHtmlPreview html={htmlPreview} title={title} />
          ) : (
            <View style={styles.centered}>
              <Text style={styles.loadingText}>No preview available.</Text>
            </View>
          )}
        </View>

        <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom }]}>
          <TouchableOpacity
            style={[styles.actionBtn, actionsDisabled && styles.actionBtnDisabled]}
            onPress={() => void handlePrint()}
            disabled={actionsDisabled}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Print provision note"
          >
            {actionBusy === "print" ? (
              <LoadingIndicator size="small" color={Theme.textPrimary} />
            ) : (
              <FontAwesome name="print" size={16} color={Theme.textPrimary} />
            )}
            <Text style={styles.actionBtnText}>
              {actionBusy === "print" ? "Printing…" : "Print"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, actionsDisabled && styles.actionBtnDisabled]}
            onPress={() => void handleWhatsApp()}
            disabled={actionsDisabled}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Share provision note on WhatsApp"
          >
            {actionBusy === "whatsapp" ? (
              <LoadingIndicator size="small" color={Theme.textPrimary} />
            ) : (
              <FontAwesome name="whatsapp" size={16} color={Theme.textPrimary} />
            )}
            <Text style={styles.actionBtnText}>
              {actionBusy === "whatsapp" ? "Opening…" : "WhatsApp"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, actionsDisabled && styles.actionBtnDisabled]}
            onPress={() => void handleShare()}
            disabled={actionsDisabled}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Share provision note PDF"
          >
            {actionBusy === "share" ? (
              <LoadingIndicator size="small" color={Theme.textPrimary} />
            ) : (
              <FontAwesome name="share-alt" size={16} color={Theme.textPrimary} />
            )}
            <Text style={styles.actionBtnText}>
              {actionBusy === "share" ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, actionsDisabled && styles.actionBtnDisabled]}
            onPress={() => void handleDownload()}
            disabled={actionsDisabled}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Download provision note PDF"
          >
            {actionBusy === "download" ? (
              <LoadingIndicator size="small" color={Theme.textPrimary} />
            ) : (
              <FontAwesome name="download" size={16} color={Theme.textPrimary} />
            )}
            <Text style={styles.actionBtnText}>
              {actionBusy === "download" ? "Saving…" : "Download"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  editBtnSpacer: {
    width: 40,
    height: 40,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2, paddingTop: 4 },
  headerKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  headerMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  preview: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  webView: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.teslaRed,
    textAlign: "center",
  },
  actionBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
