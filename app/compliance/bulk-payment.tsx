/**
 * Bulk compliance payment import — Upload → Validate → Preview → Confirm →
 * Process. Every accepted row still posts through the canonical
 * `postCompliancePayment()` → `createLedgerEntry()` → `transactions` path
 * (see tripComplianceBulkPayment.service.ts) — this screen only handles
 * file I/O and the review UI, no direct ledger writes.
 */
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
// expo-file-system SDK 54 moved readAsStringAsync to the legacy entry (matches
// the existing convention in features/chat/utils/chatDocumentPick.util.ts).
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  parseComplianceBulkPaymentCsv,
  processComplianceBulkPayments,
  validateComplianceBulkPayments,
  type ComplianceBulkPaymentRow,
  type ComplianceBulkRowValidation,
} from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { TripRow } from "@/features/trips/services/trips.service";

async function readUriAsText(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.text();
  }
  return FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
}

type Step = "upload" | "validating" | "preview" | "processing" | "done";

export default function ComplianceBulkPaymentScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  const [category, setCategory] = useState<ComplianceLedgerCategory>("compliance_advance");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [valid, setValid] = useState<ComplianceBulkRowValidation[]>([]);
  const [invalid, setInvalid] = useState<ComplianceBulkRowValidation[]>([]);
  const [tripsById, setTripsById] = useState<Map<string, TripRow>>(new Map());
  const [results, setResults] = useState<{ rowIndex: number; error: Error | null }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;

  const reset = useCallback(() => {
    setStep("upload");
    setFileName(null);
    setValid([]);
    setInvalid([]);
    setResults([]);
    setLoadError(null);
  }, []);

  const handlePick = useCallback(async () => {
    setLoadError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setFileName(asset.name ?? "payments.csv");
    setStep("validating");
    try {
      const text = await readUriAsText(asset.uri);
      const rows: ComplianceBulkPaymentRow[] = parseComplianceBulkPaymentCsv(text);
      if (rows.length === 0) {
        setLoadError("The file is empty or malformed — expected a header row plus at least one data row.");
        setStep("upload");
        return;
      }
      const result = await validateComplianceBulkPayments({ organizationId: orgId, category, rows });
      setValid(result.valid);
      setInvalid(result.invalid);
      setTripsById(result.tripsById);
      setStep("preview");
    } catch (e) {
      setLoadError((e as Error).message);
      setStep("upload");
    }
  }, [orgId, category]);

  const handleProcess = useCallback(async () => {
    setStep("processing");
    const outcomes = await processComplianceBulkPayments({
      organizationId: orgId,
      category,
      rows: valid,
      tripsById,
    });
    setResults(outcomes);
    setStep("done");
  }, [orgId, category, valid, tripsById]);

  const succeeded = useMemo(() => results.filter((r) => !r.error).length, [results]);
  const failed = useMemo(() => results.filter((r) => r.error).length, [results]);

  if (accessLoading || productsLoading) return <ChromeBelowTopNavLoadingScreen variant="preparing" />;

  // Mirrors /compliance's own gate — RBAC alone isn't enough, the workspace
  // toggle must also be on, or this screen stays reachable via direct URL
  // while the workspace has Compliance turned off.
  if (!complianceEnabled || !canManageFinance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          {!complianceEnabled
            ? "Compliance is not enabled for this workspace."
            : "You don't have access to bulk compliance payments."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { paddingTop: contentTopInset }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bulk Payment Upload</Text>
      <Text style={styles.subtitle}>
        CSV columns: Trip ID, Amount, Mode, Date, UTR, Remarks (header row required).
      </Text>

      <View style={styles.categoryRow}>
        {(["compliance_advance", "compliance_balance"] as const).map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => {
              setCategory(c);
              reset();
            }}
            style={[styles.categoryChip, category === c && styles.categoryChipActive]}
          >
            <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
              {c === "compliance_advance" ? "ADVANCE" : "BALANCE"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {step === "upload" ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={handlePick}>
          <Text style={styles.primaryBtnText}>Select CSV</Text>
        </TouchableOpacity>
      ) : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {step === "validating" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Validating {fileName}…</Text>
        </View>
      ) : null}

      {step === "preview" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.subheader}>
            {valid.length + invalid.length} rows · {valid.length} valid · {invalid.length} errors
          </Text>
          {invalid.length > 0 ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorBlockTitle}>Errors (not processed)</Text>
              {invalid.map((r) => (
                <Text key={r.row.rowIndex} style={styles.errorRow}>
                  Row {r.row.rowIndex} ({r.row.tripId || "—"}): {r.errors.join("; ")}
                </Text>
              ))}
            </View>
          ) : null}
          {valid.length > 0 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleProcess}>
              <Text style={styles.primaryBtnText}>Process {valid.length} Payments</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.message}>No valid rows to process.</Text>
          )}
          <TouchableOpacity onPress={reset} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Start over</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === "processing" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Processing {valid.length} payments…</Text>
        </View>
      ) : null}

      {step === "done" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.subheader}>
            {succeeded} succeeded · {failed} failed
          </Text>
          {results
            .filter((r) => r.error)
            .map((r) => (
              <Text key={r.rowIndex} style={styles.errorRow}>
                Row {r.rowIndex}: {r.error?.message}
              </Text>
            ))}
          <TouchableOpacity onPress={reset} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Upload another file</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back to Compliance</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: Theme.textPrimary },
  subtitle: { fontSize: 12, color: Theme.textMuted },
  subheader: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary, marginBottom: 6 },
  categoryRow: { flexDirection: "row", gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F1F2F6" },
  categoryChipActive: { backgroundColor: "#111827" },
  categoryChipText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  categoryChipTextActive: { color: "#FFFFFF" },
  primaryBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: "#111827", alignItems: "center" },
  primaryBtnText: { fontSize: 13, color: "#FFFFFF", fontWeight: "700" },
  secondaryBtn: { paddingVertical: 10, alignItems: "center" },
  secondaryBtnText: { fontSize: 12, color: Theme.textMuted, fontWeight: "600" },
  errorText: { fontSize: 12, color: "#d93025" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  centeredInline: { alignItems: "center", gap: 8, paddingVertical: 12 },
  message: { fontSize: 12, color: Theme.textMuted },
  previewWrap: { gap: 8 },
  errorBlock: { backgroundColor: "#FCE8E6", borderRadius: 10, padding: 10, gap: 4 },
  errorBlockTitle: { fontSize: 12, fontWeight: "700", color: "#d93025" },
  errorRow: { fontSize: 11, color: "#7a271a" },
});
