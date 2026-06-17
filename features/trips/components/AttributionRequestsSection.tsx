import { memo, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import { resolveSalaryRegistryAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";
import type { RegistryTag } from "@/lib/alertRegistry/registryAlertPresentation.util";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useDriverProfileImagesQuery } from "@/lib/queries/useDriverProfileImagesQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ChevronDown, ChevronUp } from "lucide-react-native";

const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_COLUMNS = 3;
const SECTION_INSET = 16;
const CARD_GAP = 12;
const DESKTOP_CARD_MIN_WIDTH = 200;
const LIST_MAX_HEIGHT = 420;

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Just now";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatSalaryAmount(amount: number | null | undefined): string {
  return `₹${Number(amount ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSalaryHighlight(req: SalaryRequestWithDriverRow): string {
  return `₹${Number(req.amount ?? 0).toLocaleString("en-IN")}`;
}

function pendingCountLabel(count: number): string {
  return count === 1 ? "1 pending" : `${count} pending`;
}

function renderRequestCard(
  req: SalaryRequestWithDriverRow,
  driversById: Map<string, { id: string; name?: string | null }>,
  busySalaryId: string | null,
  onOpenRequest: (req: SalaryRequestWithDriverRow) => void,
  onAcceptRequest: (req: SalaryRequestWithDriverRow) => void,
  onReject: (requestId: string) => void,
  variant: "feed" | "tile",
) {
  const driverName = req.drivers?.name?.trim() || "Driver";
  const busy = busySalaryId === req.id;
  const salaryTags: RegistryTag[] = [
    { label: "attribution", variant: "default" },
    { label: "trip based", variant: "neutral" },
  ];

  return (
    <AlertRegistrySignalCard
      variant={variant}
      mode="active"
      onPress={() => onOpenRequest(req)}
      avatar={resolveSalaryRegistryAvatar(req, driversById)}
      actorName={driverName}
      actionText="sent a trip for review on"
      highlightText={formatSalaryHighlight(req)}
      detailTitle={formatSalaryAmount(req.amount)}
      detailSubtitle="Fleet trip attribution request"
      timeLabel={formatRelativeTime(req.created_at)}
      contextLabel="Fleet attribution"
      tags={salaryTags}
      isUnread
      footer={
        <RegistryCardActions>
          <RegistryGhostButton
            label="Decline"
            onPress={() => onReject(req.id)}
            disabled={busy}
          />
          <RegistryPrimaryButton
            label="Accept"
            onPress={() => onAcceptRequest(req)}
            disabled={busy}
          />
        </RegistryCardActions>
      }
    />
  );
}

export type AttributionRequestsSectionProps = {
  requests: SalaryRequestWithDriverRow[];
  orgId: string | null;
  busySalaryId: string | null;
  onOpenRequest: (req: SalaryRequestWithDriverRow) => void;
  onAcceptRequest: (req: SalaryRequestWithDriverRow) => void;
  onReject: (requestId: string) => void;
};

export const AttributionRequestsSection = memo(function AttributionRequestsSection({
  requests,
  orgId,
  busySalaryId,
  onOpenRequest,
  onAcceptRequest,
  onReject,
}: AttributionRequestsSectionProps) {
  const { width: layoutWidth } = useWindowDimensions();
  const orgCtx = useOrganization();
  const resolvedOrgId = orgId ?? orgCtx.currentOrganization?.id ?? null;
  const { data: drivers = [] } = useDriversQuery(resolvedOrgId);
  const driversById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );

  const driverIds = useMemo(
    () => [...new Set(requests.map((r) => r.driver_id).filter(Boolean))],
    [requests],
  );
  useDriverProfileImagesQuery(driverIds);

  const salaryRequestsHasMore = useGlobalSyncStore((s) => s.salaryRequestsHasMore);
  const [expanded, setExpanded] = useState(true);

  const isDesktopRow =
    Platform.OS === "web" && layoutWidth >= DESKTOP_BREAKPOINT;

  const desktopTrackWidth = useMemo(() => {
    if (!isDesktopRow) return null;
    return layoutWidth - Layout.screenPaddingHorizontal * 2 - SECTION_INSET * 2;
  }, [isDesktopRow, layoutWidth]);

  const desktopCardWidth = useMemo(() => {
    if (desktopTrackWidth == null) return null;
    const gaps = (DESKTOP_COLUMNS - 1) * CARD_GAP;
    return Math.max(
      DESKTOP_CARD_MIN_WIDTH,
      Math.floor((desktopTrackWidth - gaps) / DESKTOP_COLUMNS),
    );
  }, [desktopTrackWidth]);

  if (!requests.length) return null;

  const useDesktopHorizontalScroll =
    isDesktopRow && requests.length > DESKTOP_COLUMNS;
  const showScrollHint = useDesktopHorizontalScroll;
  const showVerticalScrollHint =
    !isDesktopRow && requests.length > 2;

  return (
    <View style={styles.section}>
      <Pressable
        style={[styles.headerRow, !expanded && styles.headerRowCollapsed]}
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? "Hide attribution requests"
            : `Show attribution requests, ${pendingCountLabel(requests.length)}`
        }
      >
        <Text style={styles.sectionTitle}>Attribution requests</Text>
        <View style={styles.headerActions}>
          <View
            style={styles.countBadge}
            accessibilityLabel={pendingCountLabel(requests.length)}
          >
            <Text style={styles.countBadgeText}>
              {pendingCountLabel(requests.length)}
            </Text>
          </View>
          <View style={styles.collapseBtn}>
            {expanded ? (
              <ChevronUp size={14} color={Theme.textMuted} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />
            )}
            <Text style={styles.collapseBtnText}>
              {expanded ? "Hide" : "Show"}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <>
          <Text style={styles.sectionSubtitle}>
            Review and accept driver trip attribution requests from fleet home.
          </Text>

          {isDesktopRow && desktopCardWidth != null ? (
            useDesktopHorizontalScroll ? (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={Platform.OS === "web"}
                keyboardShouldPersistTaps="handled"
                style={styles.desktopScroll}
                contentContainerStyle={styles.desktopScrollContent}
              >
                {requests.map((req) => (
                  <View
                    key={req.id}
                    style={[styles.desktopCardCell, { width: desktopCardWidth }]}
                  >
                    {renderRequestCard(
                      req,
                      driversById,
                      busySalaryId,
                      onOpenRequest,
                      onAcceptRequest,
                      onReject,
                      "tile",
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.desktopRow}>
                {requests.map((req) => (
                  <View
                    key={req.id}
                    style={[styles.desktopCardCell, { width: desktopCardWidth }]}
                  >
                    {renderRequestCard(
                      req,
                      driversById,
                      busySalaryId,
                      onOpenRequest,
                      onAcceptRequest,
                      onReject,
                      "tile",
                    )}
                  </View>
                ))}
              </View>
            )
          ) : showVerticalScrollHint ? (
        <ScrollView
          style={[styles.listScroll, styles.listScrollBounded]}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {requests.map((req) => (
            <View key={req.id}>
              {renderRequestCard(
                req,
                driversById,
                busySalaryId,
                onOpenRequest,
                onAcceptRequest,
                onReject,
                "feed",
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.listContent}>
          {requests.map((req) => (
            <View key={req.id}>
              {renderRequestCard(
                req,
                driversById,
                busySalaryId,
                onOpenRequest,
                onAcceptRequest,
                onReject,
                "feed",
              )}
            </View>
          ))}
        </View>
      )}

      {showScrollHint ? (
        <Text style={styles.scrollHint}>Scroll sideways for more requests</Text>
      ) : null}
      {showVerticalScrollHint ? (
        <Text style={styles.scrollHint}>Scroll for more requests</Text>
      ) : null}
      {salaryRequestsHasMore ? (
        <Text style={styles.scrollHint}>
          More requests are available in Notifications.
        </Text>
      ) : null}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        minWidth: 0,
        maxWidth: "100%" as const,
        boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    paddingHorizontal: SECTION_INSET,
    paddingTop: 14,
  },
  headerRowCollapsed: {
    paddingBottom: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  collapseBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    flexShrink: 0,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    width: "100%",
    paddingHorizontal: SECTION_INSET,
    paddingTop: 4,
    paddingBottom: 10,
  },
  desktopScroll: {
    width: "100%",
    flexGrow: 0,
  },
  desktopScrollContent: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: CARD_GAP,
    paddingHorizontal: SECTION_INSET,
    paddingBottom: 12,
  },
  desktopRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: CARD_GAP,
    width: "100%",
    paddingHorizontal: SECTION_INSET,
    paddingBottom: 12,
  },
  desktopCardCell: {
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    minHeight: 168,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.06)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  listScroll: {
    alignSelf: "stretch",
    width: "100%",
    flexGrow: 0,
  },
  listScrollBounded: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listContent: {
    width: "100%",
    alignSelf: "stretch",
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  scrollHint: {
    fontSize: 10,
    color: Theme.textMuted,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: SECTION_INSET,
    paddingBottom: 10,
  },
});
