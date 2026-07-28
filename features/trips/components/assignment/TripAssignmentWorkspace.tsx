/**
 * Full-page Driver & Vehicle Assignment workspace —
 * recreates the manifest management layout (hero, tabs, dual panels, audit footer).
 */
import { type ReactNode, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { aws } from "./tripAssignmentWorkspace.styles";

export type AssignmentFulfillmentMode = "ASSET" | "MARKET";
export type AssignmentPanelAction = "EDIT" | "SWAP";

export type ChangeReasonCode =
  | "AD_HOC_SUBSTITUTION"
  | "DUTY_HOURS_EXCEEDED"
  | "VEHICLE_BREAKDOWN"
  | "CLIENT_REQUEST"
  | "DOCUMENT_EXPIRED";

const CHANGE_REASONS: { value: ChangeReasonCode; label: string }[] = [
  { value: "AD_HOC_SUBSTITUTION", label: "Ad-hoc Operational Substitution" },
  { value: "DUTY_HOURS_EXCEEDED", label: "Driver Duty Hours Exceeded" },
  { value: "VEHICLE_BREAKDOWN", label: "Vehicle Mechanical Failure / Repair" },
  { value: "CLIENT_REQUEST", label: "Client / Shipper Specific Requirement" },
  { value: "DOCUMENT_EXPIRED", label: "DL or RC Document Expiry Renewal" },
];

export type TripAssignmentWorkspaceProps = {
  trip: TripRow;
  organizationId?: string | null;
  supplierDisplayName?: string | null;
  driverDisplayName: string;
  driverPhoneDisplay?: string | null;
  vehicleDisplayLabel: string;
  vehicleCategory?: string | null;
  fulfillmentMode: AssignmentFulfillmentMode;
  onFulfillmentModeChange?: (mode: AssignmentFulfillmentMode) => void;
  /** When false, mode toggle is display-only (locked to trip type). */
  fulfillmentModeEditable?: boolean;
  driverAction: AssignmentPanelAction;
  onDriverActionChange: (action: AssignmentPanelAction) => void;
  vehicleAction: AssignmentPanelAction;
  onVehicleActionChange: (action: AssignmentPanelAction) => void;
  /** Body under driver Edit/Swap (existing reassign sections / forms). */
  driverPanelBody: ReactNode;
  vehiclePanelBody: ReactNode;
  changeReason: ChangeReasonCode;
  onChangeReasonChange: (reason: ChangeReasonCode) => void;
  changeRemarks: string;
  onChangeRemarksChange: (remarks: string) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  confirmHint?: string | null;
  /** Primary CTA label (default: Confirm & update manifest). */
  confirmLabel?: string;
  onClose: () => void;
  toastMessage?: string | null;
  /** Optional activity timeline entries for the drawer. */
  activityItems?: { time: string; title: string; body: string; tone?: "ok" | "info" }[];
};

function cityFromLocation(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const first = raw.split(",")[0]?.trim() || raw;
  return first.toUpperCase();
}

function formatDistance(trip: TripRow): string {
  const d = trip.distance;
  if (d == null || d === "") return "—";
  const n = typeof d === "number" ? d : Number(String(d).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return String(d);
  return `${Math.round(n)} KM`;
}

export function TripAssignmentWorkspace({
  trip,
  organizationId,
  supplierDisplayName,
  driverDisplayName,
  driverPhoneDisplay,
  vehicleDisplayLabel,
  vehicleCategory,
  fulfillmentMode,
  driverAction,
  onDriverActionChange,
  vehicleAction,
  onVehicleActionChange,
  driverPanelBody,
  vehiclePanelBody,
  changeReason,
  onChangeReasonChange,
  changeRemarks,
  onChangeRemarksChange,
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  confirmHint = null,
  confirmLabel = "Confirm & update manifest",
  onClose,
  toastMessage = null,
  activityItems,
}: TripAssignmentWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const compact = width < 720;
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  const tripLabel = getTripDisplayNumber(trip, organizationId ?? undefined);
  const statusLabel = (trip.status ?? "ASSIGNED").replace(/_/g, " ").toUpperCase();
  const origin = cityFromLocation(trip.pickup_area);
  const destination = cityFromLocation(trip.drop_location);
  const clientName = (trip.client_name ?? "—").toUpperCase();
  const supplierName = (
    supplierDisplayName ??
    trip.supplier_name ??
    "—"
  ).toUpperCase();
  const eta = trip.estimated_duration?.trim() || "—";
  const range = formatDistance(trip);
  const driverInitial = (driverDisplayName.trim().charAt(0) || "?").toUpperCase();

  const defaultActivity = useMemo(
    () =>
      activityItems ?? [
        {
          time: "RECENT",
          title: `Manifest open · ${tripLabel}`,
          body: `${driverDisplayName || "Driver"} · ${vehicleDisplayLabel || "Vehicle"}`,
          tone: "ok" as const,
        },
        {
          time: "ROUTE",
          title: `${origin} → ${destination}`,
          body: `Client ${clientName}${supplierName !== "—" ? ` · Supplier ${supplierName}` : ""}`,
          tone: "info" as const,
        },
      ],
    [
      activityItems,
      tripLabel,
      driverDisplayName,
      vehicleDisplayLabel,
      origin,
      destination,
      clientName,
      supplierName,
    ],
  );

  return (
    <View style={[aws.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={aws.header}>
        <View style={[aws.headerInner, { paddingBottom: 8 }]}>
          <View style={aws.headerLeft}>
            <TouchableOpacity
              style={aws.iconBtn}
              onPress={onClose}
              accessibilityLabel="Close"
              activeOpacity={0.85}
            >
              <FontAwesome name="chevron-left" size={12} color={Theme.textSecondary} />
            </TouchableOpacity>
            <View style={{ minWidth: 0 }}>
              <Text style={aws.eyebrow}>Manifest management · driver & vehicle</Text>
              <View style={aws.tripTitleRow}>
                <Text style={aws.tripCode} numberOfLines={1}>
                  {tripLabel}
                </Text>
                <View style={aws.statusPill}>
                  <Text style={aws.statusPillText}>{statusLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={aws.headerRight}>
            {driverPhoneDisplay ? (
              <View style={[aws.phoneChip, compact && { maxWidth: 140 }]}>
                <FontAwesome name="phone" size={12} color={Theme.networkHubListCardOnlineDot} />
                <Text style={aws.phoneChipText} numberOfLines={1}>
                  {driverPhoneDisplay}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={aws.activityBtn}
              onPress={() => setShowAuditDrawer(true)}
              activeOpacity={0.85}
            >
              <FontAwesome name="history" size={12} color={Theme.textMuted} />
              {wide ? <Text style={aws.activityBtnText}>Activity</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={aws.iconBtn} activeOpacity={0.85}>
              <FontAwesome name="comment-o" size={14} color={Theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={aws.iconBtn} activeOpacity={0.85}>
              <FontAwesome name="share-alt" size={14} color={Theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          aws.main,
          compact && aws.mainMobile,
          { paddingBottom: Math.max(24, insets.bottom + 16) },
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        {/* Dark route hero */}
        <View style={[aws.hero, compact && aws.heroMobile]}>
          <View style={aws.heroRow}>
            <View style={{ flex: 1, minWidth: compact ? 0 : 240 }}>
              <View style={aws.heroMetaRow}>
                <View style={aws.heroMetaItem}>
                  <View style={aws.heroMetaIcon}>
                    <FontAwesome name="briefcase" size={10} color={Theme.primaryLight} />
                  </View>
                  <Text style={aws.heroMetaLabel}>
                    CLIENT: <Text style={aws.heroMetaValue}>{clientName}</Text>
                  </Text>
                </View>
                <View style={aws.heroMetaItem}>
                  <View style={aws.heroMetaIcon}>
                    <FontAwesome
                      name="truck"
                      size={10}
                      color={Theme.networkHubListCardOnlineDot}
                    />
                  </View>
                  <Text style={aws.heroMetaLabel}>
                    SUPPLIER: <Text style={aws.heroMetaValue}>{supplierName}</Text>
                  </Text>
                </View>
              </View>

              <View style={[aws.routeRow, compact && { gap: 10, flexWrap: "wrap" }]}>
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text
                    style={[aws.routeCity, compact && aws.routeCityMobile]}
                    numberOfLines={1}
                  >
                    {origin}
                  </Text>
                  <Text style={aws.routeSub}>ORIGIN</Text>
                </View>
                {!compact ? (
                  <View style={aws.routeCenter}>
                    <View style={aws.routeCenterLabels}>
                      <Text style={aws.routeCenterLabel}>ORIGIN</Text>
                      <Text style={aws.routeCenterLabel}>DESTINATION</Text>
                    </View>
                    <View style={aws.routeLine}>
                      <View style={aws.routeLineFill} />
                      <View style={aws.routeDot}>
                        <Text style={aws.routeDotText}>{driverInitial}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <FontAwesome name="arrow-right" size={12} color={Theme.primaryLight} />
                )}
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text
                    style={[
                      aws.routeCity,
                      compact && aws.routeCityMobile,
                      !compact && { textAlign: "right" },
                    ]}
                    numberOfLines={1}
                  >
                    {destination}
                  </Text>
                  <Text style={[aws.routeSub, !compact && { textAlign: "right" }]}>
                    DESTINATION
                  </Text>
                </View>
              </View>
            </View>

            <View style={[aws.metricsBox, compact && aws.metricsBoxMobile]}>
              <View style={aws.metricCell}>
                <Text style={aws.metricLabel}>Manifest range</Text>
                <Text style={aws.metricValue}>{range}</Text>
              </View>
              <View style={aws.metricCell}>
                <Text style={aws.metricLabel}>ETA manifest</Text>
                <Text style={aws.metricValue}>{eta}</Text>
              </View>
              <View style={[aws.metricCell, aws.metricCellLast]}>
                <Text style={aws.metricLabel}>Status</Text>
                <Text style={aws.metricValueWarn}>{statusLabel}</Text>
              </View>
            </View>
          </View>
        </View>

            <View style={[aws.dualGrid, compact && aws.dualGridMobile]}>
              {/* Driver panel */}
              <View style={[aws.panel, compact && aws.panelMobile]}>
                <View style={[aws.panelHeader, compact && aws.panelHeaderMobile]}>
                  <View style={aws.panelHeaderLeft}>
                    <View style={aws.panelIconDriver}>
                      <FontAwesome
                        name="user"
                        size={16}
                        color={Theme.networkHubListCardConnectedText}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={aws.panelTitle}>Driver assignment</Text>
                      <Text style={aws.panelSub}>
                        Edit contact & DL or swap assigned driver
                      </Text>
                    </View>
                  </View>
                  <View style={[aws.actionToggle, compact && aws.actionToggleMobile]}>
                    <TouchableOpacity
                      style={[
                        aws.actionBtn,
                        compact && aws.actionBtnMobile,
                        driverAction === "EDIT" && aws.actionBtnActive,
                      ]}
                      onPress={() => onDriverActionChange("EDIT")}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name="pencil"
                        size={11}
                        color={
                          driverAction === "EDIT"
                            ? Theme.textPrimaryDark
                            : Theme.textSecondary
                        }
                      />
                      <Text
                        style={[
                          aws.actionBtnText,
                          driverAction === "EDIT" && aws.actionBtnTextActive,
                        ]}
                      >
                        Edit details
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        aws.actionBtn,
                        compact && aws.actionBtnMobile,
                        driverAction === "SWAP" && aws.actionBtnSwapDriver,
                      ]}
                      onPress={() => onDriverActionChange("SWAP")}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name="refresh"
                        size={11}
                        color={
                          driverAction === "SWAP"
                            ? Theme.cardWhite
                            : Theme.textSecondary
                        }
                      />
                      <Text
                        style={[
                          aws.actionBtnText,
                          driverAction === "SWAP" && aws.actionBtnTextOnDark,
                        ]}
                      >
                        {fulfillmentMode === "ASSET" ? "Swap driver" : "New driver"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[aws.panelBody, compact && aws.panelBodyMobile]}>
                  <View style={[aws.snapshot, compact && aws.snapshotMobile]}>
                    <View style={aws.snapshotLeft}>
                      <View style={aws.snapshotAvatarDriver}>
                        <Text style={aws.snapshotAvatarText}>{driverInitial}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={aws.snapshotEyebrow}>Driver</Text>
                        <Text style={aws.snapshotName} numberOfLines={1}>
                          {driverDisplayName || "Unassigned"}
                        </Text>
                        {driverPhoneDisplay ? (
                          <Text style={aws.snapshotMeta} numberOfLines={1}>
                            {driverPhoneDisplay}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ alignItems: compact ? "flex-start" : "flex-end" }}>
                      <View style={aws.badgeOk}>
                        <Text style={aws.badgeOkText}>DL validated</Text>
                      </View>
                    </View>
                  </View>
                  <View style={aws.fieldsArea}>{driverPanelBody}</View>
                </View>
              </View>

              {/* Vehicle panel */}
              <View style={[aws.panel, compact && aws.panelMobile]}>
                <View style={[aws.panelHeader, compact && aws.panelHeaderMobile]}>
                  <View style={aws.panelHeaderLeft}>
                    <View style={aws.panelIconVehicle}>
                      <FontAwesome
                        name="truck"
                        size={16}
                        color={Theme.assignmentVehicleAccent}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={aws.panelTitle}>Vehicle assignment</Text>
                      <Text style={aws.panelSub}>
                        Edit RC, Fastag, specs, or swap truck
                      </Text>
                    </View>
                  </View>
                  <View style={[aws.actionToggle, compact && aws.actionToggleMobile]}>
                    <TouchableOpacity
                      style={[
                        aws.actionBtn,
                        compact && aws.actionBtnMobile,
                        vehicleAction === "EDIT" && aws.actionBtnActive,
                      ]}
                      onPress={() => onVehicleActionChange("EDIT")}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name="pencil"
                        size={11}
                        color={
                          vehicleAction === "EDIT"
                            ? Theme.textPrimaryDark
                            : Theme.textSecondary
                        }
                      />
                      <Text
                        style={[
                          aws.actionBtnText,
                          vehicleAction === "EDIT" && aws.actionBtnTextActive,
                        ]}
                      >
                        Edit specs
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        aws.actionBtn,
                        compact && aws.actionBtnMobile,
                        vehicleAction === "SWAP" && aws.actionBtnSwapVehicle,
                      ]}
                      onPress={() => onVehicleActionChange("SWAP")}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name="refresh"
                        size={11}
                        color={
                          vehicleAction === "SWAP"
                            ? Theme.cardWhite
                            : Theme.textSecondary
                        }
                      />
                      <Text
                        style={[
                          aws.actionBtnText,
                          vehicleAction === "SWAP" && aws.actionBtnTextOnDark,
                        ]}
                      >
                        {fulfillmentMode === "ASSET" ? "Swap truck" : "New truck"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[aws.panelBody, compact && aws.panelBodyMobile]}>
                  <View style={[aws.snapshot, compact && aws.snapshotMobile]}>
                    <View style={aws.snapshotLeft}>
                      <View style={aws.snapshotAvatarVehicle}>
                        <FontAwesome name="truck" size={18} color={Theme.cardWhite} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={aws.snapshotEyebrow}>Vehicle · RC verified</Text>
                        <Text style={aws.snapshotName} numberOfLines={1}>
                          {vehicleDisplayLabel || "Unassigned"}
                        </Text>
                        {vehicleCategory ? (
                          <Text style={[aws.snapshotMeta, { fontFamily: undefined }]} numberOfLines={1}>
                            {vehicleCategory}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ alignItems: compact ? "flex-start" : "flex-end" }}>
                      <View style={aws.badgeBlue}>
                        <Text style={aws.badgeBlueText}>GPS connected</Text>
                      </View>
                    </View>
                  </View>
                  <View style={aws.fieldsArea}>{vehiclePanelBody}</View>
                </View>
              </View>
            </View>

            {/* Audit footer */}
            <View style={aws.auditCard}>
              <View style={aws.auditHeader}>
                <View style={aws.auditTitleRow}>
                  <FontAwesome
                    name="check-square-o"
                    size={14}
                    color={Theme.assignmentVehicleAccent}
                  />
                  <Text style={aws.auditTitle}>
                    Dispatch audit log & change governance
                  </Text>
                </View>
                <Text style={aws.auditId}>Manifest ID: {tripLabel}</Text>
              </View>

              <View style={aws.auditGrid}>
                <View style={aws.auditReason}>
                  <Text style={aws.fieldLabel}>Reason for resource substitution *</Text>
                  <View style={aws.selectLike}>
                    <Text style={aws.selectLikeText}>
                      {CHANGE_REASONS.find((r) => r.value === changeReason)?.label}
                    </Text>
                  </View>
                  <View style={aws.reasonChips}>
                    {CHANGE_REASONS.map((r) => {
                      const active = changeReason === r.value;
                      return (
                        <TouchableOpacity
                          key={r.value}
                          style={[aws.reasonChip, active && aws.reasonChipActive]}
                          onPress={() => onChangeReasonChange(r.value)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              aws.reasonChipText,
                              active && aws.reasonChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {r.label.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={aws.auditRemarks}>
                  <Text style={aws.fieldLabel}>Dispatcher audit remarks</Text>
                  <TextInput
                    style={aws.input}
                    value={changeRemarks}
                    onChangeText={onChangeRemarksChange}
                    placeholder="Add operational notes for compliance record…"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>

                <View style={aws.auditSubmitWrap}>
                  <TouchableOpacity
                    style={[
                      aws.confirmBtn,
                      (confirmDisabled || confirmLoading) && aws.confirmBtnDisabled,
                    ]}
                    onPress={onConfirm}
                    disabled={confirmDisabled || confirmLoading}
                    activeOpacity={0.9}
                  >
                    <FontAwesome
                      name="save"
                      size={14}
                      color={Theme.networkHubListCardOnlineDot}
                    />
                    <Text style={aws.confirmBtnText}>
                      {confirmLoading ? "Saving…" : confirmLabel}
                    </Text>
                  </TouchableOpacity>
                  {confirmHint ? (
                    <Text style={[aws.infoBody, { marginTop: 8, color: Theme.textMuted }]}>
                      {confirmHint}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
      </ScrollView>

      {toastMessage ? (
        <View style={aws.toast} pointerEvents="none">
          <FontAwesome
            name="check-circle"
            size={16}
            color={Theme.networkHubListCardOnlineDot}
          />
          <Text style={aws.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <Modal
        visible={showAuditDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuditDrawer(false)}
      >
        <Pressable
          style={aws.drawerBackdrop}
          onPress={() => setShowAuditDrawer(false)}
        >
          <Pressable
            style={[aws.drawer, { paddingTop: insets.top + 12 }]}
            onPress={(e) => {
              // Prevent backdrop close when interacting with drawer content (web).
              if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
                e.stopPropagation();
              }
            }}
          >
            <View>
              <View style={aws.drawerHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={aws.iconBtn}>
                    <FontAwesome name="history" size={14} color={Theme.textSecondary} />
                  </View>
                  <View>
                    <Text style={aws.drawerTitle}>{tripLabel} activity log</Text>
                    <Text style={aws.drawerSub}>Manifest audit trail</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={aws.iconBtn}
                  onPress={() => setShowAuditDrawer(false)}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="close" size={14} color={Theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={aws.timeline}>
                {defaultActivity.map((item, idx) => (
                  <View key={`${item.title}-${idx}`} style={{ position: "relative" }}>
                    <View
                      style={[
                        aws.timelineDot,
                        {
                          backgroundColor:
                            item.tone === "ok"
                              ? Theme.networkHubListCardOnlineDot
                              : Theme.assignmentVehicleAccent,
                        },
                      ]}
                    />
                    <Text style={aws.timelineTime}>{item.time}</Text>
                    <Text style={aws.timelineTitle}>{item.title}</Text>
                    <Text style={aws.timelineBody}>{item.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={aws.drawerClose}
              onPress={() => setShowAuditDrawer(false)}
              activeOpacity={0.85}
            >
              <Text style={aws.drawerCloseText}>Close activity window</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
