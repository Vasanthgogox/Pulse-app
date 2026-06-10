/**
 * KYC tab — document vault checklist, upload slots, verification score.
 */
import Theme from "@/constants/Theme";
import type { ClientKycDocumentRow, ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import {
  KYC_DOC_LABELS,
  MANDATORY_KYC_DOC_TYPES,
  type ClientKycDocType,
} from "@/features/clients/types/clientManagement.types";
import { computeKycScore, kycMissingLabels } from "@/features/clients/utils/clientManagement.util";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  bundle: ClientManagementBundle;
  onUploadDoc?: (docType: ClientKycDocType) => void;
};

function docForType(docs: ClientKycDocumentRow[], type: ClientKycDocType) {
  return docs
    .filter((d) => d.doc_type === type)
    .sort((a, b) => b.version_number - a.version_number)[0];
}

export function ClientProfileKycPanel({ bundle, onUploadDoc }: Props) {
  const { score, verified, total, missing } = computeKycScore(bundle.kyc_documents);
  const missingLabels = kycMissingLabels(missing);

  return (
    <View style={styles.panel}>
      <View style={cpStyles.kycScoreBanner}>
        <View style={cpStyles.kycScoreRing}>
          <Text style={cpStyles.kycScoreValue}>{score}%</Text>
        </View>
        <View style={cpStyles.kycScoreMeta}>
          <Text style={styles.sectionTitle}>KYC completion</Text>
          <Text style={cpStyles.kycScoreSub}>
            {verified} of {total} mandatory documents verified
          </Text>
          {missingLabels.length > 0 ? (
            <Text style={cpStyles.kycMissingText}>
              Missing: {missingLabels.join(", ")}
            </Text>
          ) : (
            <Text style={cpStyles.kycCompleteText}>All mandatory documents on file</Text>
          )}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Mandatory documents</Text>
      <View style={cpStyles.kycDocGrid}>
        {MANDATORY_KYC_DOC_TYPES.map((type) => {
          const doc = docForType(bundle.kyc_documents, type);
          const uploaded = Boolean(doc?.storage_path);
          const verifiedDoc = doc?.status === "verified";
          return (
            <View key={type} style={cpStyles.kycDocCard}>
              <View style={cpStyles.kycDocCardHead}>
                <FileText size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={cpStyles.kycDocTitle}>{KYC_DOC_LABELS[type]}</Text>
                {verifiedDoc ? (
                  <CheckCircle2 size={18} color="#50CD89" strokeWidth={2} />
                ) : uploaded ? (
                  <AlertCircle size={18} color="#F6C000" strokeWidth={2} />
                ) : null}
              </View>
              <Text style={cpStyles.kycDocStatus}>
                {verifiedDoc
                  ? "Verified"
                  : uploaded
                    ? "Pending verification"
                    : "Not uploaded"}
              </Text>
              {doc?.expiry_date ? (
                <Text style={cpStyles.kycDocExpiry}>Expires {doc.expiry_date}</Text>
              ) : null}
              <Pressable
                style={cpStyles.kycUploadBtn}
                onPress={() => onUploadDoc?.(type)}
              >
                <Upload size={14} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={cpStyles.kycUploadBtnText}>
                  {uploaded ? "Replace" : "Upload"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Optional documents</Text>
      <View style={cpStyles.kycDocGrid}>
        {(["iec", "trade_license", "udyam", "other"] as ClientKycDocType[]).map((type) => {
          const doc = docForType(bundle.kyc_documents, type);
          return (
            <View key={type} style={cpStyles.kycDocCard}>
              <View style={cpStyles.kycDocCardHead}>
                <FileText size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={cpStyles.kycDocTitle}>{KYC_DOC_LABELS[type]}</Text>
              </View>
              <Text style={cpStyles.kycDocStatus}>
                {doc?.storage_path ? doc.status : "Not uploaded"}
              </Text>
              <Pressable
                style={cpStyles.kycUploadBtn}
                onPress={() => onUploadDoc?.(type)}
              >
                <Upload size={14} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={cpStyles.kycUploadBtnText}>Upload</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
