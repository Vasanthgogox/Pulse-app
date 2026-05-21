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
import { type QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";

interface UseAwardQuoteParams {
  orgId: string | null;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  onSuccess: (msg: string) => void;
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
  open: (load: IndentRow) => void;
  close: () => void;
  selectQuote: (id: string | null) => void;
  award: () => Promise<void>;
}

export function useAwardQuote({
  orgId,
  queryClient,
  invalidateIndents,
  onSuccess,
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

  const award = useCallback(async () => {
    if (!orgId || !currentLoad || !selectedQuoteId) return;
    const load = currentLoad;
    const currentStatus = (load.status || "").toLowerCase();
    if (currentStatus === "awarded" || currentStatus === "completed") {
      Alert.alert(
        "Already awarded",
        "This load has already been awarded. Closing.",
      );
      setCurrentLoad(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    if (currentStatus === "cancelled" || currentStatus === "closed") {
      Alert.alert(
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
    const winner = pendingQuotes.find((q) => q.id === selectedQuoteId);
    if (!winner) {
      Alert.alert(
        "Invalid selection",
        "Please select a pending offer to award.",
      );
      return;
    }
    try {
      setAwarding(true);
      const { error: acceptErr } = await updateDirectQuoteStatus(
        winner.id,
        "accepted",
      );
      if (acceptErr) {
        Alert.alert("Could not award", acceptErr.message);
        return;
      }
      for (const q of pendingQuotes) {
        if (q.id !== winner.id) {
          const { error: rejectErr } = await updateDirectQuoteStatus(
            q.id,
            "rejected",
          );
          if (rejectErr) {
            Alert.alert(
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
        Alert.alert(
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
      Alert.alert("Could not award", msg);
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
    open,
    close,
    selectQuote,
    award,
  };
}
