import * as tripDocumentsService from "@/features/trips/services/trip-documents.service";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export function usePodDocuments(
  tripId: string | undefined,
  userId: string | undefined,
) {
  const [podDocuments, setPodDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [podLoading, setPodLoading] = useState(false);
  const [podUploading, setPodUploading] = useState(false);
  const [podViewUrls, setPodViewUrls] = useState<Record<string, string>>({});
  const [podSkipped, setPodSkipped] = useState(false);

  const urlsRequestedRef = useRef<Set<string>>(new Set());
  const lastPodTripIdRef = useRef<string | null>(null);
  const uploadingRef = useRef(false); // ref guard — removes podUploading from deps

  const loadPodDocuments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!tripId) return;
    if (!opts?.silent) setPodLoading(true);
    try {
      const { documents, error } = await tripDocumentsService.getDocumentsByTripId(tripId);
      if (!error) { setPodDocuments(documents); lastPodTripIdRef.current = tripId; }
    } finally {
      setPodLoading(false);
    }
  }, [tripId]);

  const uploadPod = useCallback(async (
    onSuccess?: (doc: tripDocumentsService.TripDocumentRow) => void,
    onError?: (msg: string) => void,
  ) => {
    if (!tripId || !userId || uploadingRef.current) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return onError?.("Permission to access photos is required");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const { uri, fileName, mimeType } = result.assets[0];
    uploadingRef.current = true;
    setPodUploading(true);

    try {
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
      }
      
      if (!arrayBuffer?.byteLength) return onError?.("Could not read image file");

      const { doc, error } = await tripDocumentsService.uploadTripDocument(tripId, userId, {
        arrayBuffer,
        fileName: fileName ?? `pod-${Date.now()}.jpg`,
        mimeType: mimeType ?? "image/jpeg",
      });
      if (error) return onError?.(error.message);
      if (doc) {
        setPodDocuments((prev) => [doc, ...prev]);
        const url = await tripDocumentsService.getDocumentViewUrl(doc.storage_path);
        setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
        onSuccess?.(doc);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Upload failed");
    } finally {
      uploadingRef.current = false;
      setPodUploading(false); // single source of truth — no more 3× scattered calls
    }
  }, [tripId, userId]); // podUploading gone from deps — ref-guarded

  // Lazy-fetch signed view URLs for newly loaded docs
  useEffect(() => {
    podDocuments.forEach((doc) => {
      if (urlsRequestedRef.current.has(doc.id)) return;
      urlsRequestedRef.current.add(doc.id);
      tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) =>
        setPodViewUrls((prev) => prev[doc.id] ? prev : { ...prev, [doc.id]: url })
      );
    });
  }, [podDocuments]);

  return {
    podDocuments, setPodDocuments,
    podLoading, podUploading,
    podViewUrls, setPodViewUrls,
    podSkipped, setPodSkipped,
    loadPodDocuments, uploadPod,
    lastPodTripIdRef,
  };
}
