import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Feather from "@expo/vector-icons/Feather";
import { WebView } from "react-native-webview";

import Theme from "@/constants/Theme";
import {
  generateProvisionNotePdfUri,
  type ProvisionNotePdfContext,
} from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import type { TripAdjustmentImpact } from "@/features/trips/services/tripAdjustments";

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

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      style={styles.webView}
      showsVerticalScrollIndicator
      nestedScrollEnabled
    />
  );
}

export type ProvisionNotePdfModalProps = {
  visible: boolean;
  context: ProvisionNotePdfContext | null;
  onClose: () => void;
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

  useEffect(() => {
    if (!props.visible || !props.context) {
      setPdfUri(null);
      setHtmlPreview(null);
      setPrintHtml(null);
      setError(null);
      setLoading(false);
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

  const handlePrint = useCallback(async () => {
    if (!props.context) return;
    try {
      const html =
        printHtml ?? (await generateProvisionNotePdfUri(props.context)).printHtml;
      await Print.printAsync({ html });
    } catch {
      Alert.alert("Print", "Could not open the print dialog for this note.");
    }
  }, [props.context, printHtml]);

  const handleShare = useCallback(async () => {
    if (!props.context) return;
    try {
      const title = noteTitle(props.context.adjustment.impact);
      if (Platform.OS === "web") {
        const html =
          printHtml ?? (await generateProvisionNotePdfUri(props.context)).printHtml;
        await Print.printAsync({ html });
        Alert.alert("Share PDF", "Use your browser print dialog to save or share the PDF.");
        return;
      }
      const uri = pdfUri ?? (await generateProvisionNotePdfUri(props.context)).uri;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: title,
          UTI: "com.adobe.pdf",
        });
        return;
      }
      await Share.share({ url: uri, title });
    } catch {
      Alert.alert("Share", "Could not share this provision note.");
    }
  }, [props.context, printHtml, pdfUri]);

  if (!props.visible || !props.context) return null;

  const title = noteTitle(props.context.adjustment.impact);
  const kind = props.context.adjustment.impact === "minus" ? "CN" : "DN";

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

        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolBtn} onPress={() => void handlePrint()} activeOpacity={0.88}>
            <Feather name="printer" size={16} color={Theme.primary} />
            <Text style={styles.toolBtnText}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, styles.toolBtnPrimary]}
            onPress={() => void handleShare()}
            activeOpacity={0.88}
          >
            <Feather name="share-2" size={16} color="#fff" />
            <Text style={[styles.toolBtnText, styles.toolBtnTextPrimary]}>Share PDF</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f1f5f9",
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
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
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
    backgroundColor: "#fff",
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
  toolbar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  toolBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  toolBtnPrimary: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  toolBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.primary,
  },
  toolBtnTextPrimary: {
    color: "#fff",
  },
});
