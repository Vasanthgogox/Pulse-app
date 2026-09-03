/**
 * Mobile vault tab — order-list style document cards (reference: Orders & Refunds).
 * Same upload / view handlers as TripAssetVaultPanel; chrome only changes.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { canAddMoreTripDocs, type TripDocItem } from "@/features/trips/components/trip-detail/tripDocTypes";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { createElement, memo, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const LINK = "#2874F0";
const CANVAS = "#F5F5F5";
const MUTED = "#9E9E9E";
const BODY = "#616161";
const INK = "#212121";
const PAD = 14;
const THUMB = 52;

type Props = {
  docs: TripDocItem[];
  canUploadTripDocs: boolean;
  uploadingDocId: string | null;
  vehicleId: string | null;
  onCardPress: (doc: TripDocItem) => void;
  onAddMore?: (doc: TripDocItem) => void;
  tripIdLabel: string;
  createdAtLabel: string;
};

type Tone = "ok" | "warn" | "miss";

function statusCopy(status: TripDocItem["status"] | string): {
  title: string;
  detail: string;
  tone: Tone;
} {
  if (status === "Missing") {
    return {
      title: "Missing",
      detail: "Required document not uploaded yet",
      tone: "miss",
    };
  }
  if (status === "Pending") {
    return {
      title: "Pending upload",
      detail: "Tap to upload or open",
      tone: "warn",
    };
  }
  return {
    title: "Uploaded",
    detail: "Document on file — tap to view",
    tone: "ok",
  };
}

function isPdfDoc(doc: TripDocItem): boolean {
  if (doc.type === "PDF") return true;
  const path = (doc.storagePath ?? "").toLowerCase();
  return path.endsWith(".pdf");
}

function StatusGlyph({ tone }: { tone: Tone }) {
  return (
    <Feather
      name={
        tone === "miss"
          ? "alert-triangle"
          : tone === "ok"
            ? "check"
            : "file-text"
      }
      size={16}
      color={
        tone === "miss"
          ? Theme.teslaRed
          : tone === "ok"
            ? Theme.positive
            : BODY
      }
    />
  );
}

const VaultDocThumb = memo(function VaultDocThumb({
  doc,
  tone,
}: {
  doc: TripDocItem;
  tone: Tone;
}) {
  const storagePath = doc.storagePath?.trim() || "";
  const canPreview = tone === "ok" && !!storagePath;
  const pdf = useMemo(() => isPdfDoc(doc), [doc]);

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!canPreview || !storagePath) {
      setUrl(null);
      setLoading(false);
      setImageFailed(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setUrl(null);
    setImageFailed(false);

    const resolve =
      doc.docSource === "vehicle"
        ? getVehicleDocumentViewUrl(storagePath)
        : getDocumentViewUrl(storagePath);

    void Promise.resolve(resolve)
      .then((signed) => {
        if (!alive) return;
        const next = (signed ?? "").trim() || null;
        setUrl(next);
        setLoading(false);
        if (!next) setImageFailed(true);
      })
      .catch(() => {
        if (!alive) return;
        setUrl(null);
        setLoading(false);
        setImageFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [canPreview, storagePath, doc.docSource]);

  if (!canPreview) {
    return (
      <View
        style={[
          styles.thumb,
          tone === "ok" && styles.thumbOk,
          tone === "miss" && styles.thumbMiss,
          tone === "warn" && styles.thumbWarn,
        ]}
      >
        <StatusGlyph tone={tone} />
      </View>
    );
  }

  const showImage = !!url && !pdf && !imageFailed;
  const showWebPdf = !!url && pdf && Platform.OS === "web";

  return (
    <View style={[styles.thumb, styles.thumbPreview]}>
      {loading ? (
        <LoadingIndicator size="small" color={MUTED} />
      ) : showImage ? (
        <Image
          source={{ uri: url }}
          style={styles.thumbImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          accessibilityLabel={`${doc.label} preview`}
        />
      ) : showWebPdf ? (
        <View style={styles.pdfClip} pointerEvents="none">
          {createElement("iframe", {
            src: `${url}#page=1&view=FitH&toolbar=0&navpanes=0`,
            title: `${doc.label} preview`,
            style: {
              width: THUMB * 3.2,
              height: THUMB * 4.2,
              border: "none",
              transform: "scale(0.3125)",
              transformOrigin: "top left",
              backgroundColor: "#fff",
            },
          })}
          <View style={styles.pdfBadge}>
            <Text style={styles.pdfBadgeText}>PDF</Text>
          </View>
        </View>
      ) : (
        <View style={styles.thumbFallback}>
          <FontAwesome
            name={pdf ? "file-pdf-o" : "file-image-o"}
            size={18}
            color={pdf ? Theme.teslaRed : Theme.primary}
          />
          <Text style={styles.thumbFallbackLabel}>{pdf ? "PDF" : "DOC"}</Text>
        </View>
      )}
    </View>
  );
});

export const TripMobileVaultPanel = memo(function TripMobileVaultPanel({
  docs,
  canUploadTripDocs,
  uploadingDocId,
  vehicleId,
  onCardPress,
  onAddMore,
  tripIdLabel,
  createdAtLabel,
}: Props) {
  const verifiedCount = docs.filter((d) => d.status !== "Pending").length;
  const headline =
    docs.length === 0
      ? "No documents yet"
      : verifiedCount === docs.length
        ? "All documents ready"
        : `${verifiedCount} of ${docs.length} documents ready`;

  return (
    <View style={styles.root}>
      <View style={[styles.block, styles.blockFirst]}>
        <Text style={styles.heroTitle}>{headline}</Text>
        <Text style={styles.heroSub}>
          Vault · {verifiedCount}/{docs.length || 0} on file
        </Text>
      </View>

      <View style={styles.listPad}>
        {docs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No vault items</Text>
            <Text style={styles.emptyBody}>
              Trip documents will appear here when available.
            </Text>
          </View>
        ) : (
          docs.map((doc) => {
            const copy = statusCopy(doc.status);
            const isUploading = uploadingDocId === doc.id;
            const isPending = doc.status === "Pending";
            const actionLabel = isPending
              ? canUploadTripDocs
                ? "Upload"
                : doc.id === "vehicle-documents" && vehicleId
                  ? "Open"
                  : "Pending"
              : "View";

            const showAddMore =
              canUploadTripDocs &&
              !isPending &&
              !!onAddMore &&
              canAddMoreTripDocs(doc);

            return (
              <View key={doc.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() => onCardPress(doc)}
                  activeOpacity={0.88}
                  disabled={isUploading}
                  accessibilityRole="button"
                  accessibilityLabel={`${actionLabel} ${doc.label}`}
                >
                  <View style={styles.cardMain}>
                    <VaultDocThumb doc={doc} tone={copy.tone} />
                    <View style={styles.cardBody}>
                      <Text
                        style={[
                          styles.cardStatus,
                          copy.tone === "miss" && styles.cardStatusMiss,
                          copy.tone === "ok" && styles.cardStatusOk,
                        ]}
                        numberOfLines={1}
                      >
                        {copy.title}
                      </Text>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {doc.label}
                      </Text>
                      <Text style={styles.cardDetail} numberOfLines={2}>
                        {(doc.files?.length ?? 0) > 1
                          ? `${doc.files?.length} files on file — tap to view`
                          : copy.detail}
                      </Text>
                      <Text style={styles.cardAction} numberOfLines={1}>
                        {isUploading ? "Uploading…" : actionLabel}
                        {canUploadTripDocs && isPending ? " · required" : ""}
                      </Text>
                    </View>
                    <View style={styles.chevronWrap}>
                      {isUploading ? (
                        <LoadingIndicator size="small" color={MUTED} />
                      ) : (
                        <FontAwesome name="chevron-right" size={12} color={MUTED} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                {showAddMore ? (
                  <TouchableOpacity
                    onPress={() => onAddMore(doc)}
                    style={styles.addMoreBtn}
                    activeOpacity={0.85}
                    disabled={isUploading}
                    accessibilityRole="button"
                    accessibilityLabel={`Add another ${doc.label}`}
                  >
                    <FontAwesome name="plus" size={12} color={LINK} />
                    <Text style={styles.addMoreText}>Add another</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.bottomText} numberOfLines={1}>
          Trip ID: <Text style={styles.bottomStrong}>{tripIdLabel}</Text>
        </Text>
        <Text style={styles.bottomTextEnd} numberOfLines={1}>
          Placed On: <Text style={styles.bottomStrong}>{createdAtLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: CANVAS,
  },
  block: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: PAD,
    paddingTop: 12,
    paddingBottom: 14,
  },
  blockFirst: {
    paddingTop: 10,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: INK,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  heroSub: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
  },
  listPad: {
    paddingHorizontal: PAD,
    paddingTop: 8,
    gap: 8,
  },
  emptyCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 12,
    color: BODY,
    lineHeight: 16,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
  },
  addMoreBtn: {
    marginTop: 10,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
  },
  addMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: LINK,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbPreview: {
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
  },
  thumbOk: {
    backgroundColor: "rgba(21, 128, 61, 0.12)",
  },
  thumbMiss: {
    backgroundColor: "rgba(232, 33, 39, 0.1)",
  },
  thumbWarn: {
    backgroundColor: "#F5F5F5",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  pdfClip: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  pdfBadge: {
    position: "absolute",
    right: 3,
    bottom: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(33, 33, 33, 0.72)",
  },
  pdfBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  thumbFallbackLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.4,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardStatus: {
    fontSize: 13,
    fontWeight: "700",
    color: INK,
    marginBottom: 2,
  },
  cardStatusOk: {
    color: Theme.positive,
  },
  cardStatusMiss: {
    color: Theme.teslaRed,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: BODY,
  },
  cardDetail: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 15,
  },
  cardAction: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: LINK,
  },
  chevronWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bottomBar: {
    marginTop: 8,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: PAD,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  bottomText: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
  },
  bottomTextEnd: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
    textAlign: "right",
  },
  bottomStrong: {
    fontWeight: "500",
    color: INK,
  },
});
