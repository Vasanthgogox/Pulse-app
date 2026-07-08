/**
 * Evidence upload for POD logging — maps files to LRs and uploads to pod-documents bucket.
 * Logic aligned with cashflow PodAttachmentModal.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import type { MappedPodAttachment } from '@/features/log-pods/services/logPods.service';
import { isTripDocumentsMetaTableUnavailable } from '@/features/trips/services/tripDocuments.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface MatchedLR {
  tripId: string;
  lrNumber: string;
}

export interface PodFileItem {
  id: string;
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string | null;
  progress: number;
  matchedLRs: MatchedLR[];
}

interface PodAttachmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (mapped: MappedPodAttachment[]) => void;
  onSkip: () => void;
  selectedCount: number;
  selectedLRs: Record<string, string[]>;
}

export function PodAttachmentModal({
  visible,
  onClose,
  onSuccess,
  onSkip,
  selectedCount,
  selectedLRs,
}: PodAttachmentModalProps) {
  const [files, setFiles] = useState<PodFileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState({ current: 0, total: 0, percentage: 0 });

  const flatSelectedLRs = useMemo(() => {
    const list: MatchedLR[] = [];
    Object.entries(selectedLRs).forEach(([tripId, lrs]) => {
      lrs.forEach((lr) => list.push({ tripId, lrNumber: lr }));
    });
    return list;
  }, [selectedLRs]);

  const matchLrsFromName = useCallback(
    (fileNameNoExt: string): MatchedLR[] => {
      const fn = fileNameNoExt.toLowerCase().trim();
      const fileNameClean = fn.replace(/[^a-z0-9]/g, '');
      return flatSelectedLRs.filter((target) => {
        const targetLr = target.lrNumber.toLowerCase().trim();
        const targetLrClean = targetLr.replace(/[^a-z0-9]/g, '');
        return (
          fn.includes(targetLr) ||
          targetLr.includes(fn) ||
          (fileNameClean.length > 2 && targetLrClean.includes(fileNameClean)) ||
          (targetLrClean.length > 2 && fileNameClean.includes(targetLrClean))
        );
      });
    },
    [flatSelectedLRs],
  );

  const addItems = useCallback(
    (items: { uri: string; name: string; size: number; mimeType: string }[]) => {
      const next: PodFileItem[] = items.map((item) => {
        const id = Math.random().toString(36).substring(2, 11);
        const extParts = item.name.split('.');
        const fileNameNoExt = extParts.length > 1 ? extParts.slice(0, -1).join('.').toLowerCase().trim() : item.name.toLowerCase();
        const isOversized = item.size > MAX_FILE_SIZE;
        const matched = isOversized ? [] : matchLrsFromName(fileNameNoExt);
        return {
          id,
          uri: item.uri,
          name: item.name,
          size: item.size,
          mimeType: item.mimeType || 'application/octet-stream',
          status: isOversized ? 'error' : 'pending',
          error: isOversized
            ? `Exceeds 10MB limit (${(item.size / 1024 / 1024).toFixed(1)}MB)`
            : null,
          progress: 0,
          matchedLRs: matched,
        };
      });
      setFiles((prev) => {
        const combined = [...prev, ...next];
        return combined.sort((a, b) => {
          if (a.status === 'error' && b.status !== 'error') return -1;
          if (a.status !== 'error' && b.status === 'error') return 1;
          return 0;
        });
      });
    },
    [matchLrsFromName],
  );

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Photo library access is needed to attach POD images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.92,
    });
    if (res.canceled || !res.assets?.length) return;
    addItems(
      res.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? `image-${Date.now()}.jpg`,
        size: a.fileSize ?? 0,
        mimeType: a.mimeType ?? 'image/jpeg',
      })),
    );
  };

  const pickDocuments = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    addItems(
      res.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType ?? 'application/octet-stream',
      })),
    );
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const clearAll = () => setFiles([]);

  const uploadFiles = async () => {
    const valid = files.filter((f) => f.status !== 'error');
    if (valid.length === 0) {
      onSuccess([]);
      return;
    }

    setIsUploading(true);
    setUploadStats({ current: 0, total: valid.length, percentage: 0 });
    const finalMappings: MappedPodAttachment[] = [];

    try {
      for (let i = 0; i < valid.length; i++) {
        const fileObj = valid[i];
        if (fileObj.status === 'completed') continue;

        setUploadStats((prev) => ({ ...prev, current: i + 1 }));
        setFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'uploading' as const, progress: 10 } : f)),
        );

        const ext = fileObj.name.split('.').pop() ?? 'bin';
        const response = await fetch(fileObj.uri);
        const blob = await response.blob();

        const targets =
          fileObj.matchedLRs.length > 0 ? fileObj.matchedLRs : flatSelectedLRs;

        // Group targets by tripId so we only upload once per trip
        const tripIds = Array.from(new Set(targets.map((t) => t.tripId)));

        // Upload all trips concurrently, then batch-insert metadata in one call
        const uploads = await Promise.all(
          tripIds.map(async (tripId) => {
            const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
            const filePath = `${tripId}/pod/${fileName}`;
            const { data, error } = await supabase()
              .storage.from('trip-documents')
              .upload(filePath, blob, {
                cacheControl: '3600',
                upsert: false,
                contentType: fileObj.mimeType,
              });
            if (error) {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileObj.id ? { ...f, status: 'error', error: error.message, progress: 0 } : f,
                ),
              );
              throw error;
            }
            return { tripId, storagePath: data?.path ?? filePath };
          })
        );

        const firstUploadPath = uploads[0]?.storagePath ?? null;

        // Single batch insert for all trip_documents rows
        const { error: metaInsertErr } = await supabase().from('trip_documents').insert(
          uploads.map(({ tripId, storagePath }) => ({
            trip_id: tripId,
            file_name: fileObj.name,
            storage_path: storagePath,
            mime_type: fileObj.mimeType,
            size_bytes: fileObj.size,
            document_type: 'pod',
          }))
        );
        if (metaInsertErr && !isTripDocumentsMetaTableUnavailable(metaInsertErr)) {
          throw metaInsertErr;
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'completed' as const, progress: 100 } : f,
          ),
        );

        // We map back to the original attachment payload for logPodsService
        // logPodsService still uses mappedAttachments for pod_attachments
        targets.forEach((t) => {
          finalMappings.push({
            trip_id: t.tripId,
            lr_number: t.lrNumber,
            file_path: firstUploadPath ?? '',
            file_name: fileObj.name,
            file_size: fileObj.size,
            file_type: fileObj.mimeType,
          });
        });

        setUploadStats((prev) => ({
          ...prev,
          percentage: Math.round(((i + 1) * 100) / valid.length),
        }));
      }

      onSuccess(finalMappings);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Upload failed', msg);
    } finally {
      setIsUploading(false);
    }
  };

  const validFilesCount = files.filter((f) => f.status !== 'error').length;
  const stats = useMemo(() => {
    const totalRequired = flatSelectedLRs.length;
    const mappedLRs = new Set<string>();
    files.forEach((f) => f.matchedLRs.forEach((m) => mappedLRs.add(m.lrNumber)));
    return {
      totalRequired,
      mappedCount: mappedLRs.size,
      allDone: mappedLRs.size >= totalRequired && totalRequired > 0,
    };
  }, [files, flatSelectedLRs]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => !isUploading && onClose()}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Evidence inflow</Text>
            <Text style={styles.headerSub}>
              Automapping to {selectedCount} selected unit{selectedCount === 1 ? '' : 's'}
            </Text>
          </View>

          {isUploading && (
            <View style={styles.progressStrip}>
              <Text style={styles.progressText}>
                Processing {uploadStats.current} / {uploadStats.total} · {uploadStats.percentage}%
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${uploadStats.percentage}%` }]} />
              </View>
            </View>
          )}

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.actionsRow}>
              <Pressable style={styles.addBtn} onPress={pickImages} disabled={isUploading}>
                <FontAwesome name="image" size={18} color={Theme.primary} />
                <Text style={styles.addBtnText}>Photos</Text>
              </Pressable>
              <Pressable style={styles.addBtn} onPress={pickDocuments} disabled={isUploading}>
                <FontAwesome name="file" size={18} color={Theme.primary} />
                <Text style={styles.addBtnText}>Files</Text>
              </Pressable>
            </View>

            {files.length > 0 && (
              <>
                <View style={styles.invHeader}>
                  <Text style={styles.invTitle}>Files ({files.length})</Text>
                  <Pressable onPress={clearAll} disabled={isUploading}>
                    <Text style={styles.clearText}>Clear all</Text>
                  </Pressable>
                </View>
                {files.map((f) => (
                  <View
                    key={f.id}
                    style={[
                      styles.fileRow,
                      f.status === 'error' && styles.fileRowErr,
                      f.matchedLRs.length > 0 && styles.fileRowOk,
                    ]}
                  >
                    {f.mimeType.startsWith('image/') ? (
                      <Image source={{ uri: f.uri }} style={styles.thumb} />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <FontAwesome name="file-pdf-o" size={22} color={Theme.textMuted} />
                      </View>
                    )}
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text style={styles.fileSize}>{(f.size / 1024 / 1024).toFixed(2)} MB</Text>
                      {f.matchedLRs.length > 0 && (
                        <Text style={styles.mappedHint} numberOfLines={2}>
                          Mapped: {f.matchedLRs.map((m) => m.lrNumber).join(', ')}
                        </Text>
                      )}
                      {f.status === 'error' && f.error ? (
                        <Text style={styles.errText}>{f.error}</Text>
                      ) : null}
                    </View>
                    <Pressable onPress={() => removeFile(f.id)} disabled={isUploading} hitSlop={8}>
                      <FontAwesome name="times" size={18} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.ghostBtn} onPress={onClose} disabled={isUploading}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={onSkip} disabled={isUploading}>
              <Text style={styles.outlineBtnText}>Skip</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, (isUploading || validFilesCount === 0) && styles.btnDisabled]}
              onPress={uploadFiles}
              disabled={isUploading || validFilesCount === 0}
            >
              {isUploading ? (
                <LoadingIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {stats.allDone ? 'Upload & link' : `Link ${stats.mappedCount}/${stats.totalRequired}`}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  headerSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  progressStrip: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    backgroundColor: Theme.darkBackground,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    marginBottom: 6,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: Theme.borderLight,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Theme.buttonPrimary,
  },
  body: { maxHeight: 420 },
  bodyContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Theme.cardWhite,
  },
  addBtnText: { fontWeight: '700', color: Theme.primary },
  invHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invTitle: { fontSize: 11, fontWeight: '800', color: Theme.textMuted, letterSpacing: 1 },
  clearText: { fontSize: 12, fontWeight: '700', color: '#b00020' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: Theme.cardWhite,
  },
  fileRowErr: { borderColor: '#f5c2c7', backgroundColor: '#fff5f5' },
  fileRowOk: { borderColor: '#c3e6cb', backgroundColor: '#f4fff6' },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMeta: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  fileSize: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
  mappedHint: { fontSize: 10, color: '#1a7f4c', marginTop: 4, fontWeight: '600' },
  errText: { fontSize: 10, color: '#b00020', marginTop: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Layout.screenPaddingHorizontal,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  ghostBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  ghostBtnText: { fontSize: 13, color: Theme.textMuted, fontWeight: '600' },
  outlineBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  outlineBtnText: { fontSize: 12, fontWeight: '800', color: Theme.textPrimaryDark },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: Theme.buttonPrimaryText, fontWeight: '800', fontSize: 12, textAlign: 'center' },
});
