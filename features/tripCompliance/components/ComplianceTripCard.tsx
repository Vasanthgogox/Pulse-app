/**
 * The Compliance work-queue card — extends the existing trip-card visual
 * language (spacing, type scale, restrained color use) into a dedicated
 * verification card, rather than reusing TripsHubMobileTripCard unchanged.
 * Reads only already-fetched ComplianceTripSummary data; no new query.
 */
import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Theme from "@/constants/Theme";
import { ComplianceStatusChip } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import { deriveComplianceDocumentRows, complianceProgress, labelForDocType } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { COMPLIANCE_STAGE_LABEL, type ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

export type ComplianceTripCardProps = {
  summary: ComplianceTripSummary;
  canMarkVerified: boolean;
  markingVerified?: boolean;
  onReviewDocuments: () => void;
  onViewTrip: () => void;
  onMarkVerified: () => void;
};

export function ComplianceTripCard({
  summary,
  canMarkVerified,
  markingVerified = false,
  onReviewDocuments,
  onViewTrip,
  onMarkVerified,
}: ComplianceTripCardProps) {
  const rows = useMemo(() => deriveComplianceDocumentRows(summary.documents), [summary.documents]);
  const { verified, total } = complianceProgress(rows);
  const pendingCount = rows.filter((r) => r.required && r.status !== "verified").length;
  const allVerified = total > 0 && verified === total;
  const trip = summary.trip;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.tripCode} numberOfLines={1}>
            {trip.booking_ref ?? trip.id.slice(0, 8)}
          </Text>
          <Text style={styles.client} numberOfLines={1}>
            {trip.client_name || "Client"}
          </Text>
        </View>
        <View style={styles.stagePill}>
          <Text style={styles.stagePillText}>{COMPLIANCE_STAGE_LABEL[summary.stage].toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <Text style={styles.routeText} numberOfLines={1}>
          {trip.pickup_area}
        </Text>
        <Text style={styles.routeArrow}>───────►</Text>
        <Text style={[styles.routeText, styles.routeTextEnd]} numberOfLines={1}>
          {trip.drop_location}
        </Text>
      </View>

      {total > 0 ? (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>DOCUMENT VERIFICATION</Text>
          <View style={styles.progressDotsRow}>
            {Array.from({ length: total }).map((_, i) => (
              <View key={i} style={[styles.dot, i < verified && styles.dotFilled]} />
            ))}
            <Text style={styles.progressText}>
              {verified} of {total} verified
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noDocsText}>No documents uploaded yet</Text>
      )}

      {rows.length > 0 ? (
        <View style={styles.chipsRow}>
          {rows.map((row) => (
            <ComplianceStatusChip
              key={row.key}
              status={row.status}
              label={labelForDocType(row.type)}
              compact
            />
          ))}
        </View>
      ) : null}

      {allVerified ? (
        <View style={styles.readyBanner}>
          <Text style={styles.readyBannerTitle}>✓ All required documents verified</Text>
          {canMarkVerified ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              disabled={markingVerified}
              onPress={onMarkVerified}
            >
              {markingVerified ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Mark Compliance Verified</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <Text style={styles.nextActionText}>
            {total === 0
              ? "No documents to review yet"
              : `${pendingCount} document${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} verification`}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onReviewDocuments}>
            <Text style={styles.primaryBtnText}>Review Documents</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={onViewTrip} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>View Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1 },
  tripCode: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  client: { fontSize: 12, color: Theme.textMuted, marginTop: 1 },
  stagePill: { backgroundColor: "#F1F2F6", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  stagePillText: { fontSize: 9, fontWeight: "700", color: Theme.textMuted },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeText: { fontSize: 12, color: Theme.textPrimary, fontWeight: "600", flexShrink: 1 },
  routeTextEnd: { textAlign: "right" },
  routeArrow: { fontSize: 10, color: "#D1D5DB", flexShrink: 0 },
  progressSection: { gap: 4 },
  progressLabel: { fontSize: 9, fontWeight: "700", color: Theme.textMuted, letterSpacing: 0.5 },
  progressDotsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E5E7EB" },
  dotFilled: { backgroundColor: Theme.success },
  progressText: { fontSize: 11, color: Theme.textMuted, marginLeft: 4 },
  noDocsText: { fontSize: 12, color: Theme.textMuted },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  nextActionText: { fontSize: 12, color: Theme.textMuted },
  readyBanner: { backgroundColor: "#E7F5EC", borderRadius: 10, padding: 10, gap: 8 },
  readyBannerTitle: { fontSize: 12, fontWeight: "700", color: Theme.success },
  primaryBtn: { paddingVertical: 11, borderRadius: 10, backgroundColor: "#111827", alignItems: "center" },
  primaryBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  secondaryBtn: { alignItems: "center", paddingVertical: 4 },
  secondaryBtnText: { fontSize: 12, fontWeight: "600", color: "#2563eb" },
});
