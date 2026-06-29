/**
 * Trip audit log drawer / sheet — dedicated audit trail (not notifications).
 */
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import { TripAuditLogContent } from "@/features/trips/components/trip-detail/TripAuditLogContent";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  buildTripAuditLog,
  matchesTripAuditTab,
} from "@/lib/trips/buildTripAuditLog.util";
import { useMemo } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AUDIT_DRAWER_WIDTH = 420;

export type TripAuditLogPanelProps = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId?: string | null;
  currentUserId?: string | null;
  assignmentAuditRows: TripAssignmentAuditRow[];
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  timelineRows: DriverActivityTimelineRow[];
  tripLedgerEntries: LedgerRow[];
  loading?: boolean;
};

export function TripAuditLogPanel({
  visible,
  onClose,
  trip,
  organizationId,
  currentUserId,
  assignmentAuditRows,
  assignmentDriverNames,
  assignmentVehicleLabels,
  timelineRows,
  tripLedgerEntries,
  loading = false,
}: TripAuditLogPanelProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 768;

  const tripRef = getTripDisplayNumber(trip, organizationId ?? undefined);
  const route = [trip.pickup_area, trip.drop_location].filter(Boolean).join(" → ");

  const entries = useMemo(
    () =>
      buildTripAuditLog({
        tripRef,
        assignmentAuditRows,
        assignmentDriverNames,
        assignmentVehicleLabels,
        timelineRows,
        transactions: tripLedgerEntries,
        currentUserId,
      }),
    [
      tripRef,
      assignmentAuditRows,
      assignmentDriverNames,
      assignmentVehicleLabels,
      timelineRows,
      tripLedgerEntries,
      currentUserId,
    ],
  );

  const panel = (
    <TripAuditLogContent
      title="Audit log"
      subtitle={route ? `${tripRef} · ${route}` : tripRef}
      entries={entries}
      matchesTab={matchesTripAuditTab}
      loading={loading}
      onClose={onClose}
      shellStyle={styles.panelFullBleed}
    />
  );

  if (Platform.OS === "web") {
    return (
      <RegistryWebDrawer
        visible={visible}
        onClose={onClose}
        width={AUDIT_DRAWER_WIDTH}
      >
        {panel}
      </RegistryWebDrawer>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={isCompact ? "fullScreen" : "pageSheet"}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.nativeSheet,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            maxHeight: height,
          },
        ]}
      >
        {panel}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  nativeSheet: {
    flex: 1,
    backgroundColor: "#fff",
  },
  panelFullBleed: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
  },
});
