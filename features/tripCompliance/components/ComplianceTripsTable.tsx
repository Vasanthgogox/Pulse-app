/**
 * Table workbench for the Compliance work queue — trip is the primary row,
 * expandable to reveal its documents inline. Same already-fetched
 * `ComplianceTripSummary[]`, no extra query. Inline document actions open
 * the same ComplianceDocumentReviewSheet used by the card view's "Review
 * Documents" — no duplicate approve/reject wiring.
 */
import Theme from "@/constants/Theme";
import { ComplianceStatusChip } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import { COMPLIANCE_STAGE_LABEL, type ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { deriveComplianceDocumentRows, labelForDocType } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { ensureComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ComplianceTripsTableProps = {
  summaries: ComplianceTripSummary[];
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  /** Opens the review sheet; documentKey null opens straight to the document list. */
  onReview: (tripId: string, documentKey: string | null) => void;
};

function TripRowContent({
  summary,
  onOpenTrip,
  onOpenDetails,
  onReview,
}: {
  summary: ComplianceTripSummary;
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  onReview: (tripId: string, documentKey: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => deriveComplianceDocumentRows(summary.documents), [summary.documents]);
  const checklist = ensureComplianceChecklist(summary);

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.expandToggle}>
          {expanded ? (
            <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />
          ) : (
            <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.colTrip}
          onPress={() => (onOpenDetails ?? onOpenTrip)(summary.trip.id)}
        >
          <Text style={styles.cell} numberOfLines={1}>
            {summary.trip.booking_ref ?? summary.trip.id.slice(0, 8)}
          </Text>
          <Text style={[styles.cell, styles.muted]} numberOfLines={1}>
            {summary.trip.client_name || "—"}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.cell, styles.colStage]}>{COMPLIANCE_STAGE_LABEL[summary.stage]}</Text>
        <View style={styles.colDocs}>
          {rows.slice(0, 4).map((row) => (
            <ComplianceStatusChip key={row.key} status={row.status} label={labelForDocType(row.type)} compact />
          ))}
        </View>
        <Text style={[styles.cell, styles.colProgress]}>
          {`${checklist.verified} / ${checklist.total}`}
        </Text>
        <Text style={[styles.cell, styles.colMoney]}>
          {summary.advance ? `₹${summary.advance.amount.toLocaleString("en-IN")}` : "—"}
        </Text>
        <Text style={[styles.cell, styles.colMoney]}>
          {summary.balance ? `₹${summary.balance.amount.toLocaleString("en-IN")}` : "—"}
        </Text>
        <View style={styles.colAction}>
          <TouchableOpacity onPress={() => onReview(summary.trip.id, null)}>
            <Text style={styles.actionLink}>Verify Docs</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenTrip(summary.trip.id)}>
            <Text style={[styles.actionLink, styles.viewTripLink]}>View Trip</Text>
          </TouchableOpacity>
        </View>
      </View>

      {expanded ? (
        <View style={styles.expandedWrap}>
          {rows.map((row) => (
            <View key={row.key} style={styles.expandedRow}>
              <Text style={styles.expandedDocLabel}>{labelForDocType(row.type)}</Text>
              <ComplianceStatusChip status={row.status} label={row.status === "missing" ? "Missing" : row.status} compact />
              <View style={styles.expandedActions}>
                {row.status === "missing" ? (
                  <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                    <Text style={styles.actionLink}>Add</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                      <Text style={styles.actionLink}>Preview</Text>
                    </TouchableOpacity>
                    {row.status !== "verified" ? (
                      <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                        <Text style={styles.actionLink}> · Approve</Text>
                      </TouchableOpacity>
                    ) : null}
                    {row.status !== "rejected" ? (
                      <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                        <Text style={[styles.actionLink, styles.rejectLink]}> · Reject</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ComplianceTripsTable({ summaries, onOpenTrip, onOpenDetails, onReview }: ComplianceTripsTableProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.expandToggle} />
          <Text style={[styles.cell, styles.colTrip, styles.headerText]}>Trip</Text>
          <Text style={[styles.cell, styles.colStage, styles.headerText]}>Compliance</Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]}>Documents</Text>
          <Text style={[styles.cell, styles.colProgress, styles.headerText]}>Progress</Text>
          <Text style={[styles.cell, styles.colMoney, styles.headerText]}>Advance</Text>
          <Text style={[styles.cell, styles.colMoney, styles.headerText]}>Balance</Text>
          <Text style={[styles.cell, styles.colAction, styles.headerText]}>Action</Text>
        </View>

        {summaries.map((s) => (
          <TripRowContent
            key={s.trip.id}
            summary={s}
            onOpenTrip={onOpenTrip}
            onOpenDetails={onOpenDetails}
            onReview={onReview}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tableScroll: { flexGrow: 0 },
  table: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, overflow: "hidden", minWidth: 720 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F2F6",
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
  },
  headerRow: { borderTopWidth: 0, backgroundColor: "#FAFAFC", paddingVertical: 6 },
  headerText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  expandToggle: { width: 20, alignItems: "center" },
  cell: { fontSize: 12, color: Theme.textPrimary },
  muted: { color: Theme.textMuted, fontSize: 11 },
  colTrip: { flex: 1.4, minWidth: 100 },
  colStage: { flex: 1.2, minWidth: 100 },
  colDocs: { flex: 1.8, minWidth: 140, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  colProgress: { flex: 0.7, minWidth: 55 },
  colMoney: { flex: 0.8, minWidth: 70 },
  colAction: { flex: 1.2, minWidth: 110, flexDirection: "row", gap: 8 },
  actionLink: { fontSize: 11, fontWeight: "700", color: "#2563eb" },
  viewTripLink: { color: Theme.textMuted },
  rejectLink: { color: Theme.teslaRed },
  expandedWrap: { backgroundColor: "#FAFAFC", paddingLeft: 26, paddingRight: 8 },
  expandedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F2F6",
  },
  expandedDocLabel: { width: 90, fontSize: 12, fontWeight: "600", color: Theme.textPrimary },
  expandedActions: { flexDirection: "row", flexWrap: "wrap", marginLeft: "auto" },
});
