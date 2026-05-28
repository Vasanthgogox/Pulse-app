import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { OperationalButton } from "@/components/operational";
import { OperationalBottomActionBar, OperationalDetailSkeleton } from "@/components/operational";
import { useOperationsControlCenter } from "./queries/useOperationsControlCenter";
import { useOperationsBatchActions } from "./hooks/useOperationsBatchActions";
import { ApprovalQueue } from "./ApprovalQueue";
import { ReimbursementQueue } from "./ReimbursementQueue";
import { ReconciliationQueue } from "./ReconciliationQueue";
import { OperationalAlertsPanel } from "./OperationalAlertsPanel";
import type { OperationalQueueItem } from "./types";

function mergeQueueItems(
  pages: Array<{ flatItems: OperationalQueueItem[] }> | undefined,
): OperationalQueueItem[] {
  if (!pages) return [];
  const all = pages.flatMap((page) => page.flatItems);
  const deduped = new Map<string, OperationalQueueItem>();
  for (const item of all) deduped.set(item.id, item);
  return Array.from(deduped.values()).sort(
    (a, b) => +new Date(b.enteredAt) - +new Date(a.enteredAt),
  );
}

export function OperationsControlCenter({
  organizationId,
  actorUserId,
  enabled = true,
}: {
  organizationId: string | null;
  actorUserId: string | null;
  enabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queue = useOperationsControlCenter({ organizationId, enabled: enabled && expanded });
  const actions = useOperationsBatchActions({ organizationId, actorUserId });
  const allItems = useMemo(
    () => mergeQueueItems(queue.data?.pages),
    [queue.data?.pages],
  );
  const approvalItems = useMemo(
    () => allItems.filter((item) => item.queueKinds.includes("pending_approval")),
    [allItems],
  );
  const reimbursementItems = useMemo(
    () =>
      allItems.filter((item) => item.queueKinds.includes("reimbursement_required")),
    [allItems],
  );
  const reconciliationItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          item.queueKinds.includes("reconciliation_mismatch") ||
          item.queueKinds.includes("posting_retry_failure"),
      ),
    [allItems],
  );
  const syncFailureItems = useMemo(
    () => allItems.filter((item) => item.queueKinds.includes("offline_sync_failure")),
    [allItems],
  );
  const selectedItems = useMemo(
    () => allItems.filter((item) => selectedIds.has(item.id)),
    [allItems, selectedIds],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const loadingAction =
    actions.approveSelected.isPending ||
    actions.rejectSelected.isPending ||
    actions.reconcileSelected.isPending ||
    actions.markReimbursed.isPending;

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded((value) => !value)}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Dispatcher operations control</Text>
          <Text style={styles.subtitle}>
            {allItems.length} active queue item{allItems.length === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.content}>
          {queue.isLoading ? (
            <OperationalDetailSkeleton />
          ) : (
            <>
              <OperationalAlertsPanel
                postingFailures={reconciliationItems.filter((x) => x.postingState === "failed").length}
                retryFailures={reconciliationItems.filter((x) => x.retryCount > 0).length}
                reimbursementBacklog={reimbursementItems.length}
                offlineFailures={syncFailureItems.length}
              />
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                <ApprovalQueue
                  items={approvalItems}
                  selectedIds={selectedIds}
                  onToggle={toggleSelected}
                />
                <ReimbursementQueue
                  items={reimbursementItems}
                  selectedIds={selectedIds}
                  onToggle={toggleSelected}
                />
                <ReconciliationQueue
                  items={reconciliationItems}
                  selectedIds={selectedIds}
                  onToggle={toggleSelected}
                />
                {queue.hasNextPage ? (
                  <Pressable
                    style={styles.loadMore}
                    onPress={() => queue.fetchNextPage()}
                    disabled={queue.isFetchingNextPage}
                  >
                    <Text style={styles.loadMoreText}>
                      {queue.isFetchingNextPage ? "Loading..." : "Load more"}
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
              {selectedItems.length > 0 ? (
                <OperationalBottomActionBar style={styles.actionBar}>
                  <View style={styles.actionWrap}>
                    <OperationalButton
                      label="Approve"
                      intent="approval"
                      onPress={async () => {
                        await actions.approveSelected.mutateAsync(selectedItems);
                        clearSelection();
                      }}
                      disabled={loadingAction}
                    />
                    <OperationalButton
                      label="Reject"
                      intent="destructiveFinancial"
                      onPress={async () => {
                        await actions.rejectSelected.mutateAsync(selectedItems);
                        clearSelection();
                      }}
                      disabled={loadingAction}
                    />
                    <OperationalButton
                      label="Reconcile"
                      intent="utility"
                      onPress={async () => {
                        await actions.reconcileSelected.mutateAsync(selectedItems);
                        clearSelection();
                      }}
                      disabled={loadingAction}
                    />
                    <OperationalButton
                      label="Reimbursed"
                      intent="list"
                      onPress={async () => {
                        await actions.markReimbursed.mutateAsync(selectedItems);
                        clearSelection();
                      }}
                      disabled={loadingAction}
                    />
                  </View>
                </OperationalBottomActionBar>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    color: Theme.textPrimary,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  chevron: {
    color: Theme.textMuted,
    fontSize: 12,
  },
  content: {
    padding: 10,
    gap: 8,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  loadMore: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  loadMoreText: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "600",
  },
  actionBar: {
    paddingHorizontal: 0,
    borderTopWidth: 0,
  },
  actionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
