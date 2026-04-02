/**
 * Vehicle documents section — view, upload, re-upload, and delete RC, insurance, fitness, PUC.
 * Shown in Vehicle Profile modal.
 *
 * Edge cases:
 *  - File size/type validation before upload (10 MB max; JPEG/PNG/WebP/PDF).
 *  - Re-upload: user can overwrite an existing document (same storage path, no orphan).
 *  - Delete: removes storage file + clears JSONB key.
 *  - Double-tap guard: buttons are disabled while an operation is in-flight.
 *  - Rollback: if DB update fails after storage write, orphan file is cleaned up (in service).
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DOCUMENT_EXPIRY_ORDER,
  DOCUMENT_LABELS,
  type DocumentWithExpiry,
  type VehicleDocuments,
} from '../utils/vehicleDocuments.util';
import {
  deleteVehicleDocument,
  getVehicleDocumentViewUrl,
  uploadAndSaveVehicleDocument,
  validateDocumentFile,
} from '../services/vehicleDocuments.service';

function formatExpiryDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getExpiryState(expiryDate: string | null | undefined): 'valid' | 'expiringSoon' | 'expired' | null {
  if (!expiryDate) return null;
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return 'expired';
  const soonThreshold = new Date(today);
  soonThreshold.setDate(soonThreshold.getDate() + 30);
  if (d <= soonThreshold) return 'expiringSoon';
  return 'valid';
}

function getExpiryLabel(expiryDate: string | null | undefined): string | null {
  if (!expiryDate) return null;
  const formatted = formatExpiryDate(expiryDate);
  const state = getExpiryState(expiryDate);
  if (state === 'expired') return `Expired on ${formatted}`;
  if (state === 'expiringSoon') return `Expiring soon: ${formatted}`;
  return `Valid till ${formatted}`;
}

export interface VehicleDocumentsSectionProps {
  organizationId: string;
  vehicleId: string;
  documents: VehicleDocuments | null;
  onDocumentsUpdated: (documents: VehicleDocuments) => void;
}

export function VehicleDocumentsSection({
  organizationId,
  vehicleId,
  documents,
  onDocumentsUpdated,
}: VehicleDocumentsSectionProps) {
  const insets = useSafeAreaInsets();
  const [busyType, setBusyType] = useState<keyof VehicleDocuments | null>(null);
  const [expiryModalType, setExpiryModalType] = useState<keyof VehicleDocuments | null>(null);
  const [pendingExpiry, setPendingExpiry] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    arrayBuffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  } | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDocType, setPreviewDocType] = useState<keyof VehicleDocuments | null>(null);

  // Guard against concurrent operations
  const busyRef = useRef(false);

  const pickAndValidateFile = async (): Promise<{
    arrayBuffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  } | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access photos is required to upload documents.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const { uri, fileName, mimeType } = result.assets[0];
    const arrayBuffer = await new File(uri).arrayBuffer();
    if (!arrayBuffer?.byteLength) {
      Alert.alert('Error', 'Could not read image file');
      return null;
    }

    const picked = {
      arrayBuffer,
      fileName: fileName ?? `doc-${Date.now()}.jpg`,
      mimeType: mimeType ?? 'image/jpeg',
    };

    const validationError = validateDocumentFile(picked);
    if (validationError) {
      Alert.alert('Invalid file', validationError);
      return null;
    }

    return picked;
  };

  const handleUploadPress = async (docType: keyof VehicleDocuments) => {
    if (busyRef.current) return;
    const file = await pickAndValidateFile();
    if (!file) return;

    setPendingFile(file);
    setPendingExpiry(toISODate(new Date()));
    setExpiryModalType(docType);
  };

  const handleExpiryConfirm = async () => {
    if (!expiryModalType || !pendingFile || !pendingExpiry || busyRef.current) return;

    busyRef.current = true;
    setBusyType(expiryModalType);
    const docType = expiryModalType;

    try {
      const { documents: updated, error } = await uploadAndSaveVehicleDocument(
        organizationId,
        vehicleId,
        docType,
        pendingFile,
        pendingExpiry,
        documents,
      );

      if (error || !updated) {
        Alert.alert('Upload failed', error?.message ?? 'Could not upload document');
        return;
      }

      onDocumentsUpdated(updated);
    } finally {
      busyRef.current = false;
      setBusyType(null);
      setExpiryModalType(null);
      setPendingFile(null);
      setPendingExpiry(null);
    }
  };

  const handleExpiryCancel = () => {
    setExpiryModalType(null);
    setPendingFile(null);
    setPendingExpiry(null);
  };

  const handleViewPress = async (doc: DocumentWithExpiry, docType: keyof VehicleDocuments) => {
    if (!doc?.url?.trim()) return;
    setPreviewDocType(docType);
    setPreviewLoading(true);
    setPreviewUrl(null);
    const url = await getVehicleDocumentViewUrl(doc.url);
    if (url) {
      setPreviewUrl(url);
      setPreviewLoading(false);
    } else {
      setPreviewLoading(false);
      Alert.alert('Error', 'Could not open document');
      setPreviewDocType(null);
    }
  };

  const handleDeletePress = (docType: keyof VehicleDocuments) => {
    Alert.alert(
      'Delete document',
      `Remove ${DOCUMENT_LABELS[docType]}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (busyRef.current) return;
            busyRef.current = true;
            setBusyType(docType);
            try {
              const { documents: updated, error } = await deleteVehicleDocument(
                organizationId,
                vehicleId,
                docType,
                documents,
              );
              if (error) {
                Alert.alert('Delete failed', error.message);
                return;
              }
              if (updated) onDocumentsUpdated(updated);
            } finally {
              busyRef.current = false;
              setBusyType(null);
            }
          },
        },
      ],
    );
  };

  const isBusy = busyRef.current;
  const previewDoc = previewDocType ? documents?.[previewDocType] : null;
  const previewDocExpiry = getExpiryLabel(previewDoc?.expiryDate);
  const previewDocExpiryState = getExpiryState(previewDoc?.expiryDate);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Documents</Text>
      <View style={styles.list}>
        {DOCUMENT_EXPIRY_ORDER.map((docType, idx) => {
          const doc = documents?.[docType];
          const hasDoc = !!doc?.url?.trim();
          const busy = busyType === docType;
          const isLast = idx === DOCUMENT_EXPIRY_ORDER.length - 1;
          const expiryState = getExpiryState(doc?.expiryDate);
          const expiryLabel = getExpiryLabel(doc?.expiryDate);

          return (
            <View
              key={docType}
              style={[styles.row, isLast && styles.rowLast]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, hasDoc ? styles.iconWrapUploaded : styles.iconWrapEmpty]}>
                  <FontAwesome
                    name={hasDoc ? 'file-text-o' : 'file-o'}
                    size={16}
                    color={hasDoc ? Theme.darkGreen : Theme.textMuted}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{DOCUMENT_LABELS[docType]}</Text>
                  <Text
                    style={[
                      styles.rowStatus,
                      expiryState === 'valid' && styles.rowStatusValid,
                      expiryState === 'expiringSoon' && styles.rowStatusWarning,
                      expiryState === 'expired' && styles.rowStatusExpired,
                    ]}
                    numberOfLines={1}
                  >
                    {hasDoc && expiryLabel
                      ? expiryLabel
                      : 'Not uploaded'}
                  </Text>
                </View>
              </View>
              <View style={styles.rowActions}>
                {hasDoc ? (
                  <View style={styles.rowActionsGroup}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleViewPress(doc!, docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      <FontAwesome name="eye" size={14} color={Theme.primary} />
                      <Text style={styles.actionBtnText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnSmall, styles.actionBtnReupload]}
                      onPress={() => handleUploadPress(docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={Theme.primary} />
                      ) : (
                        <FontAwesome name="refresh" size={12} color={Theme.primary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnSmall, styles.actionBtnDelete]}
                      onPress={() => handleDeletePress(docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={Theme.teslaRed} />
                      ) : (
                        <FontAwesome name="trash-o" size={12} color={Theme.teslaRed} />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnUpload]}
                    onPress={() => handleUploadPress(docType)}
                    disabled={busy || isBusy}
                    activeOpacity={0.7}
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                    ) : (
                      <>
                        <FontAwesome name="cloud-upload" size={14} color={Theme.textOnPrimary} />
                        <Text style={styles.actionBtnTextUpload}>Upload</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Expiry date picker modal */}
      {expiryModalType && (
        <Modal visible transparent animationType="slide">
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleExpiryCancel}
          >
            <View
              style={[styles.modalSheet, { paddingBottom: Math.max(32, insets.bottom) }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Set expiry — {DOCUMENT_LABELS[expiryModalType]}
                </Text>
                <TouchableOpacity onPress={handleExpiryCancel} hitSlop={12}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalLabel}>Expiry date</Text>
                {Platform.OS === 'android' ? (
                  <DateTimePicker
                    value={pendingExpiry ? new Date(pendingExpiry + 'T12:00:00') : new Date()}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      if (e.type === 'set' && date) setPendingExpiry(toISODate(date));
                    }}
                  />
                ) : (
                  <DateTimePicker
                    value={pendingExpiry ? new Date(pendingExpiry + 'T12:00:00') : new Date()}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date()}
                    onChange={(_, date) => date && setPendingExpiry(toISODate(date))}
                  />
                )}
              </View>
              <TouchableOpacity
                style={[styles.modalConfirm, busyType ? styles.modalConfirmDisabled : null]}
                onPress={handleExpiryConfirm}
                activeOpacity={0.8}
                disabled={!!busyType}
              >
                {busyType ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.modalConfirmText}>Upload & Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Document preview modal */}
      {previewDocType != null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewDocType(null)}>
          <View style={styles.previewBackdrop}>
            <View style={[styles.previewContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.previewHeader}>
                <View style={styles.previewHeaderText}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {DOCUMENT_LABELS[previewDocType]}
                  </Text>
                  {previewDocExpiry ? (
                    <Text
                      style={[
                        styles.previewSubtitle,
                        previewDocExpiryState === 'valid' && styles.previewSubtitleValid,
                        previewDocExpiryState === 'expiringSoon' && styles.previewSubtitleWarning,
                        previewDocExpiryState === 'expired' && styles.previewSubtitleExpired,
                      ]}
                      numberOfLines={1}
                    >
                      {previewDocExpiry}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setPreviewDocType(null);
                    setPreviewUrl(null);
                  }}
                  hitSlop={12}
                  style={styles.previewClose}
                >
                  <FontAwesome name="close" size={20} color={Theme.textPrimaryDark} />
                </TouchableOpacity>
              </View>
              <View style={styles.previewBody}>
                {previewLoading ? (
                  <ActivityIndicator size="large" color={Theme.primary} />
                ) : previewUrl ? (
                  <Image
                    source={{ uri: previewUrl }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <FontAwesome name="exclamation-triangle" size={48} color={Theme.textMuted} />
                    <Text style={styles.previewPlaceholderText}>Could not load preview</Text>
                  </View>
                )}
              </View>
              {previewUrl && (
                <TouchableOpacity
                  style={styles.previewOpenExternal}
                  onPress={() => previewUrl && Linking.openURL(previewUrl)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="external-link" size={14} color={Theme.primary} />
                  <Text style={styles.previewOpenExternalText}>Open in browser</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  list: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapEmpty: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  iconWrapUploaded: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  rowStatus: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  rowStatusValid: {
    color: Theme.positive,
    fontWeight: '600',
  },
  rowStatusWarning: {
    color: Theme.warning,
    fontWeight: '600',
  },
  rowStatusExpired: {
    color: Theme.teslaRed,
    fontWeight: '600',
  },
  rowActions: {
    marginLeft: 12,
  },
  rowActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnReupload: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  actionBtnDelete: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.primary,
  },
  actionBtnUpload: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  actionBtnTextUpload: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  modalCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  modalBody: {
    paddingVertical: 20,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    marginBottom: 12,
  },
  modalConfirm: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalConfirmDisabled: {
    opacity: 0.6,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  previewHeaderText: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
    marginTop: 4,
  },
  previewSubtitleValid: {
    color: Theme.positive,
  },
  previewSubtitleWarning: {
    color: Theme.warning,
  },
  previewSubtitleExpired: {
    color: Theme.negative,
  },
  previewClose: {
    padding: 4,
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  previewPlaceholderText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  previewOpenExternal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  previewOpenExternalText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.primary,
  },
});
