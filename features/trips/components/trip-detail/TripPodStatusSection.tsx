import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  markTripHardCopyPodReceived,
  tripPodIsReceived,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { TripCompletionOrPodTags } from "@/features/trips/components/TripPodStatusTags";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function formatReceivedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TripPodStatusSection({
  tripId,
  organizationId,
  podReceivedAt,
  softCopyReceived,
  tripCompleted,
  canMutate,
  onSoftCopyUpload,
  onUpdated,
}: {
  tripId: string;
  organizationId?: string | null;
  podReceivedAt?: string | null;
  softCopyReceived: boolean;
  tripCompleted: boolean;
  canMutate: boolean;
  onSoftCopyUpload?: () => void;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const hardCopyReceived = tripPodIsReceived({ pod_received_at: podReceivedAt });
  const receivedLabel = formatReceivedAt(podReceivedAt);
  const canRecordHardCopy = canMutate && tripCompleted && !hardCopyReceived;

  const markReceived = useCallback(async () => {
    if (!canRecordHardCopy || saving) return;
    setSaving(true);
    const { error } = await markTripHardCopyPodReceived(tripId);
    setSaving(false);
    if (error) {
      Alert.alert("Hard copy POD", error.message);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
    if (organizationId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.logPods.trips(organizationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.trips(organizationId) });
    }
    onUpdated?.();
  }, [
    canRecordHardCopy,
    organizationId,
    onUpdated,
    queryClient,
    saving,
    tripId,
  ]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>POD status</Text>
        <TripCompletionOrPodTags
          tripCompleted={tripCompleted}
          softCopyReceived={softCopyReceived}
          hardCopyReceived={hardCopyReceived}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Soft copy</Text>
          <Text style={styles.value}>
            {softCopyReceived ? "Received" : "Pending"}
          </Text>
          {!softCopyReceived && canMutate && tripCompleted && onSoftCopyUpload ? (
            <Pressable
              onPress={onSoftCopyUpload}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Upload soft copy POD"
            >
              <Text style={styles.linkText}>Upload digital POD</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Hard copy</Text>
          <Text style={styles.value}>
            {hardCopyReceived ? "Received" : "Pending"}
          </Text>
          {hardCopyReceived && receivedLabel ? (
            <Text style={styles.meta}>{receivedLabel}</Text>
          ) : null}
          {!tripCompleted && !hardCopyReceived ? (
            <Text style={styles.meta}>Available after the trip is delivered</Text>
          ) : null}
        </View>
      </View>

      {canRecordHardCopy ? (
        <Pressable
          style={styles.primaryBtn}
          onPress={() => void markReceived()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Mark hard copy POD received"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
          ) : (
            <>
              <FontAwesome name="check" size={12} color={Theme.buttonPrimaryText} />
              <Text style={styles.primaryBtnText}>Mark Hard Copy POD Received</Text>
            </>
          )}
        </Pressable>
      ) : hardCopyReceived ? (
        <View style={styles.receivedBar}>
          <FontAwesome name="check-circle" size={13} color={Theme.positive} />
          <Text style={styles.receivedBarText}>Hard Copy POD Received</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.12,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  value: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textRouteCard,
  },
  linkBtn: {
    marginTop: 6,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  linkText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  primaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
  },
  receivedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  receivedBarText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.positive,
  },
});
