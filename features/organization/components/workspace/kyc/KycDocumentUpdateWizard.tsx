import { LoadingIndicator } from "@/components/LoadingIndicator";
import { partyAddModalChromeStyles } from "@/components/PartyAddModalChrome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { OrganizationKycDocDefinition } from "@/features/organization/types/organizationKycDocuments.types";
import { ORG_KYC_DOC_LABELS } from "@/features/organization/types/organizationKycDocuments.types";
import type { PickedVerificationDocument } from "@/features/organization/utils/kycDocumentUpload.util";
import {
  ADDRESS_PROOF_OPTIONS,
  resolveAcceptTypes,
} from "@/features/organization/utils/kycVerification.util";
import type { AddressProofType } from "@/types/organization";
import {
  ArrowRight,
  Check,
  FileText,
  Pencil,
  ShieldCheck,
  UploadCloud,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type WizardStep = "intro" | "upload" | "preview";

type Props = {
  visible: boolean;
  definition: OrganizationKycDocDefinition | null;
  hasExistingDocument?: boolean;
  uploading: boolean;
  submitting: boolean;
  formError: string | null;
  /** First-time verify: skip intro and save into the draft instead of queuing a separate review. */
  variant?: "update" | "onboarding";
  onClose: () => void;
  onPick: (
    docType: OrganizationKycDocDefinition["type"],
    proofType?: AddressProofType,
  ) => Promise<PickedVerificationDocument | null>;
  onConfirm: (
    picked: PickedVerificationDocument,
    docType: OrganizationKycDocDefinition["type"],
    proofType?: AddressProofType,
  ) => Promise<boolean>;
};

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif");
}

export function KycDocumentUpdateWizard({
  visible,
  definition,
  hasExistingDocument = false,
  uploading,
  submitting,
  formError,
  variant = "update",
  onClose,
  onPick,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 720;
  const onboarding = variant === "onboarding";
  const [step, setStep] = useState<WizardStep>(onboarding ? "upload" : "intro");
  const [picked, setPicked] = useState<PickedVerificationDocument | null>(null);
  const [proofType, setProofType] = useState<AddressProofType | null>(null);
  const [uploadDocType, setUploadDocType] = useState<
    OrganizationKycDocDefinition["type"] | null
  >(null);

  const acceptTypes = useMemo(
    () => (definition ? resolveAcceptTypes(definition) : []),
    [definition],
  );
  const uploadChoices = definition?.uploadChoices?.length
    ? definition.uploadChoices
    : acceptTypes.length > 1
      ? acceptTypes
      : definition
        ? [definition.type]
        : [];
  const needsProofType = definition?.type === "address_proof";
  const showUploadChoices = !needsProofType && uploadChoices.length > 1;
  const resolvedType =
    (needsProofType ? definition?.type : uploadDocType ?? definition?.type) ??
    "other";
  const canPick = !needsProofType || !!proofType;

  const reset = useCallback(() => {
    setStep(onboarding ? "upload" : "intro");
    setPicked(null);
    setProofType(null);
    setUploadDocType(null);
  }, [onboarding]);

  useEffect(() => {
    if (!visible) return;
    setStep(onboarding ? "upload" : "intro");
    setPicked(null);
    setProofType(null);
    setUploadDocType(null);
  }, [visible, onboarding, definition?.type]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handlePick = useCallback(async () => {
    if (!definition || !canPick) return;
    const docType = needsProofType ? definition.type : (uploadDocType ?? definition.type);
    const result = await onPick(docType, needsProofType ? (proofType ?? undefined) : undefined);
    if (!result) return;
    setPicked(result);
    setStep("preview");
  }, [canPick, definition, needsProofType, onPick, proofType, uploadDocType]);

  const handleConfirm = useCallback(async () => {
    if (!definition || !picked) return;
    const ok = await onConfirm(
      picked,
      resolvedType,
      needsProofType ? (proofType ?? undefined) : undefined,
    );
    if (ok) handleClose();
  }, [definition, handleClose, needsProofType, onConfirm, picked, proofType, resolvedType]);

  if (!visible || !definition) return null;

  const label = definition.label;
  const busy = uploading || submitting;

  const body = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: (isDesktop ? 16 : insets.bottom) + 20 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {step === "intro" ? (
        <View style={styles.intro}>
          <View style={styles.heroMark}>
            <View style={styles.idCard}>
              <FileText size={28} color={Theme.brandBlueInk} strokeWidth={1.8} />
            </View>
            <View style={styles.heroBadge}>
              <Check size={12} color={Theme.cardWhite} strokeWidth={3} />
            </View>
          </View>
          <Text style={styles.headline}>
            {hasExistingDocument
              ? `your ${label.toLowerCase()} needs a fresh review`
              : `complete your ${label.toLowerCase()} verification`}
          </Text>
          <Text style={styles.subhead}>
            {hasExistingDocument
              ? 'Replace the file, preview only the new document, then send it to the admin console for verification.'
              : 'Upload the file, preview it, then send it to the admin console for verification.'}
          </Text>
          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <Zap size={14} color={Theme.positive} strokeWidth={2.2} />
              </View>
              <View style={styles.bulletCopy}>
                <Text style={styles.bulletTitle}>quick update</Text>
                <Text style={styles.bulletHint}>takes less than a minute</Text>
              </View>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <ShieldCheck size={14} color={Theme.positive} strokeWidth={2.2} />
              </View>
              <View style={styles.bulletCopy}>
                <Text style={styles.bulletTitle}>admin review</Text>
                <Text style={styles.bulletHint}>
                  only the new file is queued — the previous copy is not shown
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setUploadDocType(uploadChoices[0] ?? definition.type);
              setStep("upload");
            }}
          >
            <Text style={styles.primaryBtnText}>Start now</Text>
            <ArrowRight size={16} color={Theme.buttonDarkText} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : null}

      {step === "upload" ? (
        <View style={styles.stepBody}>
          <Text style={styles.stepKicker}>UPDATE DOCUMENT</Text>
          <Text style={styles.stepTitle}>{`Upload a new ${label.toLowerCase()}`}</Text>
          <Text style={styles.stepHint}>{definition.hint}</Text>

          {needsProofType ? (
            <>
              <Text style={styles.fieldLabel}>Document type</Text>
              <View style={styles.chipRow}>
                {ADDRESS_PROOF_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, proofType === opt.value && styles.chipOn]}
                    onPress={() => setProofType(opt.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        proofType === opt.value && styles.chipTextOn,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {showUploadChoices ? (
            <>
              <Text style={styles.fieldLabel}>Upload as</Text>
              <View style={styles.chipRow}>
                {uploadChoices.map((choice) => (
                  <Pressable
                    key={choice}
                    style={[
                      styles.chip,
                      (uploadDocType ?? definition.type) === choice && styles.chipOn,
                    ]}
                    onPress={() => setUploadDocType(choice)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        (uploadDocType ?? definition.type) === choice &&
                          styles.chipTextOn,
                      ]}
                    >
                      {ORG_KYC_DOC_LABELS[choice]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            style={[styles.uploadZone, (!canPick || busy) && styles.disabled]}
            disabled={!canPick || busy}
            onPress={() => void handlePick()}
          >
            {uploading ? (
              <LoadingIndicator size="small" color={Theme.primary} />
            ) : (
              <>
                <UploadCloud size={22} color={Theme.primary} strokeWidth={2} />
                <Text style={styles.uploadZoneTitle}>Choose file</Text>
                <Text style={styles.uploadZoneHint}>PDF or image</Text>
              </>
            )}
          </Pressable>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        </View>
      ) : null}

      {step === "preview" && picked ? (
        <View style={styles.stepBody}>
          <Text style={styles.stepKicker}>PREVIEW</Text>
          <Text style={styles.stepTitle}>
            {onboarding
              ? "This file will be included in your application"
              : "Only this new document will be reviewed"}
          </Text>
          <Text style={styles.stepHint}>
            {onboarding
              ? "Edit to pick a different file. Submit happens on the review step."
              : "Admins see this file — not the previous upload. Edit to pick a different one."}
          </Text>

          <View style={styles.previewCard}>
            {isImageMime(picked.mimeType) && picked.localUri ? (
              <Image
                source={{ uri: picked.localUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.previewFile}>
                <FileText size={28} color={Theme.brandBlueInk} strokeWidth={1.8} />
              </View>
            )}
            <Pressable
              style={styles.editBadge}
              onPress={() => {
                setPicked(null);
                setStep("upload");
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit document"
            >
              <Pencil size={12} color={Theme.brandBlueInk} strokeWidth={2.4} />
            </Pressable>
            <Text style={styles.previewName} numberOfLines={2}>
              {picked.fileName}
            </Text>
            <Text style={styles.previewMeta}>
              {onboarding
                ? `${ORG_KYC_DOC_LABELS[resolvedType]} · saved to your application`
                : `${ORG_KYC_DOC_LABELS[resolvedType]} · pending admin review`}
            </Text>
          </View>

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void handleConfirm()}
          >
            {submitting ? (
              <LoadingIndicator size="small" color={Theme.buttonDarkText} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>
                  {onboarding ? "Save document" : "Submit for review"}
                </Text>
                <ArrowRight size={16} color={Theme.buttonDarkText} strokeWidth={2.4} />
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={busy ? undefined : handleClose}
    >
      <View style={partyAddModalChromeStyles.overlay}>
        <Pressable
          style={partyAddModalChromeStyles.overlayDismissHit}
          onPress={busy ? undefined : handleClose}
        />
        <View
          style={[
            partyAddModalChromeStyles.shell,
            styles.shell,
            isDesktop ? styles.shellDesktop : styles.shellMobile,
            !isDesktop && { paddingTop: insets.top },
          ]}
        >
          <Pressable
            onPress={busy ? undefined : handleClose}
            disabled={busy}
            style={styles.backBtn}
            hitSlop={10}
          >
            <Text style={styles.backText}>Close</Text>
          </Pressable>
          {body}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: Theme.cardWhite,
  },
  shellDesktop: {
    maxWidth: 440,
    width: "100%",
  },
  shellMobile: {
    maxWidth: "100%",
    alignSelf: "stretch",
    flex: 1,
    borderRadius: 0,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  backText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  scrollContent: {
    paddingHorizontal: 22,
  },
  intro: { gap: 10, paddingTop: 4 },
  heroMark: {
    width: 64,
    height: 52,
    marginBottom: 8,
  },
  idCard: {
    width: 56,
    height: 40,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlueRing,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    position: "absolute",
    right: 0,
    top: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  headline: {
    fontSize: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    lineHeight: 28,
    textTransform: "lowercase",
  },
  subhead: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  bullets: { gap: 14, marginTop: 8, marginBottom: 18 },
  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletCopy: { flex: 1, minWidth: 0, gap: 2 },
  bulletTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.positive,
    textTransform: "lowercase",
  },
  bulletHint: { fontSize: 12, lineHeight: 16, color: Theme.textMuted },
  primaryBtn: {
    marginTop: 8,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
  stepBody: { gap: 10, paddingTop: 4 },
  stepKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: Theme.positive,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  stepHint: { fontSize: 13, lineHeight: 18, color: Theme.textMuted },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  chipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  chipTextOn: { color: Theme.primary },
  uploadZone: {
    marginTop: 8,
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderStyle: "dashed",
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 16,
  },
  uploadZoneTitle: { fontSize: 14, fontWeight: "700", color: Theme.primary },
  uploadZoneHint: { fontSize: 12, color: Theme.textMuted },
  previewCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    padding: 14,
    alignItems: "center",
    gap: 8,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
  },
  previewFile: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.accentGold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  previewName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  previewMeta: { fontSize: 11, color: Theme.textMuted, textAlign: "center" },
  errorText: { fontSize: 12, fontWeight: "600", color: Theme.negative },
  disabled: { opacity: 0.45 },
});
