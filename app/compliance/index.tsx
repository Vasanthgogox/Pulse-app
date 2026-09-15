/**
 * Trip Compliance + Finance settlement — a workspace VIEW over canonical Trip
 * data, not a second Trip system. Card view extends the trip-card visual
 * language into a dedicated verification card (ComplianceTripCard); Table
 * view is an expandable trip work queue. Both open the same
 * ComplianceDocumentReviewSheet for the actual verify/reject work — no
 * duplicate document system, no new persistence.
 */
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import { ROUTES } from "@/lib/routes";
import { ComplianceTripCard } from "@/features/tripCompliance/components/ComplianceTripCard";
import { ComplianceTripsTable } from "@/features/tripCompliance/components/ComplianceTripsTable";
import { ComplianceDocumentReviewSheet } from "@/features/tripCompliance/components/ComplianceDocumentReviewSheet";
import { markTripComplianceVerified } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import {
  useComplianceStageFilter,
  useComplianceTripsQuery,
  useInvalidateComplianceTrips,
} from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import { COMPLIANCE_STAGE_LABEL, COMPLIANCE_STAGES } from "@/features/tripCompliance/tripCompliance.types";

function StageChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Text
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, active && styles.chipActive]}
    >
      {label}
    </Text>
  );
}

export default function ComplianceScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const canViewCompliance = complianceEnabled && canSurface("trip_compliance.tab");
  const canVerifyDocuments = canSurface("trip_compliance.documents.verify");
  const canMarkVerified = canSurface("trip_compliance.trip.mark_verified");
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const canViewFinance = canSurface("trip_compliance.finance.view");
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();

  const { data, isLoading, isError, error } = useComplianceTripsQuery(0);
  const { stage, setStage, filtered } = useComplianceStageFilter(data?.summaries);
  const invalidate = useInvalidateComplianceTrips();
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [review, setReview] = useState<{ tripId: string; documentKey: string | null } | null>(null);
  const [markingVerifiedTripId, setMarkingVerifiedTripId] = useState<string | null>(null);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;

  const openTrip = useCallback(
    (tripId: string) => {
      router.push(ROUTES.tripDetail(tripId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleMarkVerified = useCallback(
    async (tripId: string) => {
      if (!user?.uid) return;
      setMarkingVerifiedTripId(tripId);
      const { error: err } = await markTripComplianceVerified({ tripId, actorId: user.uid });
      setMarkingVerifiedTripId(null);
      if (err) {
        alertMessage("Compliance not verified", err.message);
        return;
      }
      invalidate();
    },
    [user?.uid, invalidate],
  );

  const reviewingSummary = useMemo(
    () => (review ? (data?.summaries ?? []).find((s) => s.trip.id === review.tripId) : null),
    [review, data?.summaries],
  );

  if (accessLoading || productsLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  // Route-level enforcement mirrors the nav gate — Compliance OFF or missing
  // trip_compliance.tab both land here, not just a hidden nav item.
  if (!canViewCompliance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnStandalone}>
          <ChevronLeft size={18} color={Theme.textPrimary} strokeWidth={2.2} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.message}>
          {complianceEnabled
            ? "You don't have access to Compliance."
            : "Compliance is not enabled for this workspace."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: contentTopInset }]}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <ChevronLeft size={16} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={styles.backBtnMuted}>Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Compliance</Text>
          <Text style={styles.subtitle}>
            Document verification and settlement, in parallel with Trip execution.
          </Text>
        </View>
        <View style={styles.headerActions}>
          {canManageFinance ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push(ROUTES.COMPLIANCE_BULK_PAYMENT as Parameters<typeof router.push>[0])}
            >
              <Text style={styles.headerBtnText}>Bulk Payment</Text>
            </TouchableOpacity>
          ) : null}
          {canViewFinance ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push(ROUTES.COMPLIANCE_REPORT as Parameters<typeof router.push>[0])}
            >
              <Text style={styles.headerBtnText}>Report</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.toolbarRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <StageChip label="ALL" active={stage === "all"} onPress={() => setStage("all")} />
          {COMPLIANCE_STAGES.map((s) => (
            <StageChip
              key={s}
              label={COMPLIANCE_STAGE_LABEL[s].toUpperCase()}
              active={stage === s}
              onPress={() => setStage(s)}
            />
          ))}
        </ScrollView>
        <View style={styles.viewToggle}>
          <TouchableOpacity onPress={() => setViewMode("card")} style={[styles.toggleBtn, viewMode === "card" && styles.toggleBtnActive]}>
            <Text style={[styles.toggleBtnText, viewMode === "card" && styles.toggleBtnTextActive]}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode("table")} style={[styles.toggleBtn, viewMode === "table" && styles.toggleBtnActive]}>
            <Text style={[styles.toggleBtnText, viewMode === "table" && styles.toggleBtnTextActive]}>Table</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <Text style={styles.message}>Loading trips…</Text>
      ) : isError ? (
        <Text style={styles.message}>{(error as Error)?.message ?? "Failed to load Compliance."}</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.message}>No trips in this stage.</Text>
      ) : viewMode === "table" ? (
        <ComplianceTripsTable
          summaries={filtered}
          onOpenTrip={openTrip}
          onReview={(tripId, documentKey) => setReview({ tripId, documentKey })}
        />
      ) : (
        filtered.map((summary) => (
          <ComplianceTripCard
            key={summary.trip.id}
            summary={summary}
            canMarkVerified={canMarkVerified}
            markingVerified={markingVerifiedTripId === summary.trip.id}
            onReviewDocuments={() => setReview({ tripId: summary.trip.id, documentKey: null })}
            onViewTrip={() => openTrip(summary.trip.id)}
            onMarkVerified={() => handleMarkVerified(summary.trip.id)}
          />
        ))
      )}

      {reviewingSummary ? (
        <ComplianceDocumentReviewSheet
          visible={review != null}
          onClose={() => setReview(null)}
          tripId={reviewingSummary.trip.id}
          tripLabel={`${reviewingSummary.trip.booking_ref ?? reviewingSummary.trip.id.slice(0, 8)} · ${reviewingSummary.trip.client_name || "Client"}`}
          organizationId={currentOrganization?.id ?? ""}
          actorId={user?.uid ?? null}
          documents={reviewingSummary.documents}
          canVerify={canVerifyDocuments}
          initialSelectedKey={review?.documentKey ?? null}
          onChanged={invalidate}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: 4 },
  backBtnStandalone: { flexDirection: "row", alignItems: "center", gap: 2, position: "absolute", top: 16, left: 16 },
  backBtnText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  backBtnMuted: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  title: { fontSize: 22, fontWeight: "700", color: Theme.textPrimary },
  subtitle: { fontSize: 13, color: Theme.textMuted, marginBottom: 4 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  headerTextWrap: { flex: 1 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#111827" },
  headerBtnText: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
  toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chipRow: { marginBottom: 8, flex: 1 },
  viewToggle: { flexDirection: "row", backgroundColor: "#F1F2F6", borderRadius: 8, padding: 2, marginBottom: 8 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: "#111827" },
  toggleBtnText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  toggleBtnTextActive: { color: "#FFFFFF" },
  chip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F1F2F6",
    color: Theme.textMuted,
    fontSize: 11,
    fontWeight: "600",
    overflow: "hidden",
  },
  chipActive: {
    backgroundColor: "#111827",
    color: "#FFFFFF",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { fontSize: 13, color: Theme.textMuted, textAlign: "center", paddingVertical: 24 },
});
