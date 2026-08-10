/**
 * useAwardQuote — owns all state and logic for the Award (Offer Hub) modal.
 * FSM-style: open(load) → select/award → auto-closes on success.
 */

import {
  updateDirectQuoteStatus,
  updateIndent,
  type DirectQuoteRow,
  type IndentRow,
} from "@/features/indents";
import { useIndentDirectQuotesQuery, useInvalidateIndents } from "@/lib/queries";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { showAppAlert } from "@/lib/appAlert";
import { confirmDialog } from "@/lib/confirmDialog";
import { type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Lazy: keeps the connections service out of the Load Center entry chunk. */
const loadConnectionRequestsService = () =>
  import("@/features/connections/services/connectionRequests.service");

interface UseAwardQuoteParams {
  orgId: string | null;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  onSuccess: (msg: string) => void;
  /** linked_organization_id values from the shipper's suppliers — used to badge connected bidders */
  connectedSupplierOrgIds?: Set<string>;
}

export interface AwardQuoteResult {
  isOpen: boolean;
  currentLoad: IndentRow | null;
  selectedQuoteId: string | null;
  awarding: boolean;
  sortedQuotes: DirectQuoteRow[];
  pendingCount: number;
  lowestPendingAmount: number | null;
  quotesLoading: boolean;
  connectedSupplierOrgIds: Set<string>;
  /** True when the selected bidder is not yet an integrated supplier. */
  selectedBidderNeedsInvite: boolean;
  /** Invite status for the selected bidder, when one has been sent. */
  selectedBidderInviteStatus: "none" | "pending" | "sending";
  /** Send the supplier invite that unblocks awarding an unconnected bidder. */
  inviteSelectedBidder: () => Promise<void>;
  open: (load: IndentRow) => void;
  close: () => void;
  selectQuote: (id: string | null) => void;
  /** Optional quote id awards that pending offer immediately (card Award button). */
  award: (quoteIdOverride?: string) => Promise<void>;
}

export function useAwardQuote({
  orgId,
  queryClient,
  invalidateIndents,
  onSuccess,
  connectedSupplierOrgIds = new Set(),
}: UseAwardQuoteParams): AwardQuoteResult {
  const invalidatePosts = useInvalidatePosts(orgId);
  const [currentLoad, setCurrentLoad] = useState<IndentRow | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);

  const {
    data: awardModalQuotes = [],
    isLoading: quotesLoading,
    refetch: refetchAwardModalQuotes,
  } = useIndentDirectQuotesQuery(currentLoad?.id ?? null);

  // Refetch quotes when a new load is opened
  useEffect(() => {
    if (currentLoad?.id) {
      refetchAwardModalQuotes();
    }
  }, [currentLoad?.id, refetchAwardModalQuotes]);

  /** Sorted: pending by amount (lowest first), then rejected, then accepted. */
  const sortedQuotes = useMemo(() => {
    const list = [...awardModalQuotes];
    return list.sort((a, b) => {
      const sa = (a.status || "").toLowerCase();
      const sb = (b.status || "").toLowerCase();
      if (sa === "pending" && sb === "pending") {
        return Number(a.amount ?? 0) - Number(b.amount ?? 0);
      }
      if (sa === "pending") return -1;
      if (sb === "pending") return 1;
      if (sa === "rejected" && sb === "accepted") return -1;
      if (sa === "accepted" && sb === "rejected") return 1;
      return 0;
    });
  }, [awardModalQuotes]);

  const pendingCount = useMemo(
    () =>
      awardModalQuotes.filter(
        (q) => (q.status || "").toLowerCase() === "pending",
      ).length,
    [awardModalQuotes],
  );

  const lowestPendingAmount = useMemo(() => {
    const pending = awardModalQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    if (pending.length === 0) return null;
    return Math.min(...pending.map((q) => Number(q.amount ?? 0)));
  }, [awardModalQuotes]);

  /**
   * Single pending offer — preselect it. There is nothing to choose between, so
   * requiring a tap before "Award selected" becomes usable is a dead end the
   * user has to guess their way out of. Multi-bid loads still require an
   * explicit pick, which is the real point of the confirm step.
   *
   * Keyed on the load + quote identity (not selectedQuoteId) so deliberately
   * deselecting the only bid is not immediately undone by this effect.
   */
  const soloPendingQuoteId = useMemo(() => {
    const pending = awardModalQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    return pending.length === 1 ? pending[0]!.id : null;
  }, [awardModalQuotes]);

  useEffect(() => {
    if (soloPendingQuoteId) setSelectedQuoteId(soloPendingQuoteId);
  }, [currentLoad?.id, soloPendingQuoteId]);

  /**
   * Reach-only bidders: a paid campaign lets any targeted org bid, but a load
   * may only be awarded to an integrated supplier. The winner must accept a
   * supplier invite first — approving it fires on_connection_request_approved,
   * which creates the organization_relations + suppliers rows, after which the
   * bidder counts as connected and the normal award path applies.
   */
  const selectedBidderOrgId = useMemo(() => {
    if (!selectedQuoteId) return null;
    const q = awardModalQuotes.find((x) => x.id === selectedQuoteId);
    return q?.bidder_organization_id ?? null;
  }, [selectedQuoteId, awardModalQuotes]);

  const selectedBidderNeedsInvite = useMemo(
    () =>
      !!selectedBidderOrgId && !connectedSupplierOrgIds.has(selectedBidderOrgId),
    [selectedBidderOrgId, connectedSupplierOrgIds],
  );

  const [inviteStatusByOrgId, setInviteStatusByOrgId] = useState<
    Record<string, "pending" | "sending">
  >({});

  const selectedBidderInviteStatus = selectedBidderOrgId
    ? (inviteStatusByOrgId[selectedBidderOrgId] ?? "none")
    : "none";

  // Reflect an invite sent in an earlier session, so the modal does not offer
  // to re-send one that is already awaiting the bidder's response.
  useEffect(() => {
    if (!orgId || !selectedBidderOrgId || !selectedBidderNeedsInvite) return;
    if (inviteStatusByOrgId[selectedBidderOrgId]) return;
    let cancelled = false;
    (async () => {
      const { getLatestConnectionRequestStatus } =
        await loadConnectionRequestsService();
      const { status } = await getLatestConnectionRequestStatus(
        orgId,
        selectedBidderOrgId,
      );
      if (cancelled || status !== "pending") return;
      setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "pending" }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orgId,
    selectedBidderOrgId,
    selectedBidderNeedsInvite,
    inviteStatusByOrgId,
  ]);

  const inviteSelectedBidder = useCallback(async () => {
    if (!orgId || !selectedBidderOrgId) return;
    const winner = awardModalQuotes.find((q) => q.id === selectedQuoteId);
    const name = winner?.bidder_organization_name ?? "this supplier";
    setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "sending" }));
    const { createConnectionRequest, looksLikeConnectionRateLimitError } =
      await loadConnectionRequestsService();
    // requestCarrierSupplier: I am the shipper adding them to my supplier book.
    const { error, alreadyInvited } = await createConnectionRequest(
      orgId,
      selectedBidderOrgId,
      { requestShipperClient: false, requestCarrierSupplier: true },
    );
    if (error) {
      setInviteStatusByOrgId((m) => {
        const next = { ...m };
        delete next[selectedBidderOrgId];
        return next;
      });
      showAppAlert(
        looksLikeConnectionRateLimitError(error.message)
          ? "Daily limit exceeded"
          : "Could not send invite",
        error.message,
      );
      return;
    }
    setInviteStatusByOrgId((m) => ({ ...m, [selectedBidderOrgId]: "pending" }));
    onSuccess(
      alreadyInvited
        ? `${name} already has a pending supplier invite.`
        : `Supplier invite sent to ${name}. You can award once they accept.`,
    );
  }, [
    orgId,
    selectedBidderOrgId,
    selectedQuoteId,
    awardModalQuotes,
    onSuccess,
  ]);

  const open = useCallback((load: IndentRow) => {
    setCurrentLoad(load);
    setSelectedQuoteId(null);
  }, []);

  const close = useCallback(() => {
    setCurrentLoad(null);
    setSelectedQuoteId(null);
  }, []);

  const selectQuote = useCallback((id: string | null) => {
    setSelectedQuoteId(id);
  }, []);

  const award = useCallback(async (quoteIdOverride?: string) => {
    if (!orgId || !currentLoad) return;
    const winnerId = quoteIdOverride ?? selectedQuoteId;
    if (!winnerId) return;
    if (quoteIdOverride) setSelectedQuoteId(quoteIdOverride);
    const load = currentLoad;
    const currentStatus = (load.status || "").toLowerCase();
    if (currentStatus === "awarded" || currentStatus === "completed") {
      showAppAlert(
        "Already awarded",
        "This load has already been awarded. Closing.",
      );
      setCurrentLoad(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    if (currentStatus === "cancelled" || currentStatus === "closed") {
      showAppAlert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setCurrentLoad(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    const pendingQuotes = awardModalQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    const winner = pendingQuotes.find((q) => q.id === winnerId);
    if (!winner) {
      showAppAlert(
        "Invalid selection",
        "Please select a pending offer to award.",
      );
      return;
    }
    // Enforce the supplier-link gate here as well as in the UI: the modal hides
    // the Award button for unconnected bidders, but a stale render or a
    // connection revoked mid-flow must not slip an unlinked award through.
    if (
      winner.bidder_organization_id &&
      !connectedSupplierOrgIds.has(winner.bidder_organization_id)
    ) {
      showAppAlert(
        "Supplier not connected",
        `${winner.bidder_organization_name ?? "This bidder"} is not in your supplier network yet. Send a supplier invite and award once they accept.`,
      );
      return;
    }
    const confirmed = await confirmDialog(
      "Confirm Award",
      `Award this load to ${winner.bidder_organization_name ?? "this supplier"} for ₹${Number(winner.amount ?? 0).toLocaleString("en-IN")}?`,
      { confirmText: "Award", destructive: true },
    );
    if (!confirmed) return;

    try {
      setAwarding(true);
      const { error: acceptErr } = await updateDirectQuoteStatus(
        winner.id,
        "accepted",
      );
      if (acceptErr) {
        showAppAlert("Could not award", acceptErr.message);
        return;
      }
      for (const q of pendingQuotes) {
        if (q.id !== winner.id) {
          const { error: rejectErr } = await updateDirectQuoteStatus(
            q.id,
            "rejected",
          );
          if (rejectErr) {
            showAppAlert(
              "Award partially failed",
              "One or more quotes could not be updated. Winner was set.",
            );
            queryClient.invalidateQueries({
              queryKey: ["indents", load.id, "direct-quotes"],
            });
            invalidateIndents(orgId);
            break;
          }
        }
      }
      const { error: indentErr } = await updateIndent(load.id, {
        status: "awarded",
      });
      if (indentErr) {
        const friendlyMessage =
          indentErr.message &&
          (indentErr.message.includes("check constraint") ||
            indentErr.message.includes("indents_status_check"))
            ? "Indent status could not be updated. Please refresh the app and try again."
            : indentErr.message;
        showAppAlert(
          "Award saved but indent status could not be updated",
          friendlyMessage,
        );
        queryClient.invalidateQueries({
          queryKey: ["indents", load.id, "direct-quotes"],
        });
      }
      setSelectedQuoteId(null);
      setCurrentLoad(null);
      invalidateIndents(orgId);
      invalidatePosts();
      onSuccess("Load awarded — supplier can assign and deploy from Claimed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      showAppAlert("Could not award", msg);
      if (currentLoad?.id) {
        queryClient.invalidateQueries({
          queryKey: ["indents", currentLoad.id, "direct-quotes"],
        });
      }
      invalidateIndents(orgId);
    } finally {
      setAwarding(false);
    }
  }, [
    orgId,
    currentLoad,
    selectedQuoteId,
    awardModalQuotes,
    queryClient,
    invalidateIndents,
    invalidatePosts,
    onSuccess,
  ]);

  return {
    isOpen: currentLoad !== null,
    currentLoad,
    selectedQuoteId,
    awarding,
    sortedQuotes,
    pendingCount,
    lowestPendingAmount,
    quotesLoading,
    connectedSupplierOrgIds,
    selectedBidderNeedsInvite,
    selectedBidderInviteStatus,
    inviteSelectedBidder,
    open,
    close,
    selectQuote,
    award,
  };
}
