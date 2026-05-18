/**
 * useAwardQuote — encapsulates the award-quote async workflow.
 */

import {
  updateDirectQuoteStatus,
  updateIndent,
  type DirectQuoteRow,
  type IndentRow,
} from "@/features/indents";
import { useInvalidateIndents } from "@/lib/queries";
import { type QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useState } from "react";

type LoadAction =
  | { type: "AWARD"; load: IndentRow }
  | { type: "BID"; load: IndentRow }
  | { type: "ASSIGN"; load: IndentRow }
  | null;

interface UseAwardQuoteParams {
  orgId: string | null;
  loadAction: LoadAction;
  setLoadAction: (action: LoadAction) => void;
  selectedQuoteId: string | null;
  setSelectedQuoteId: (id: string | null) => void;
  awardModalQuotes: DirectQuoteRow[];
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  triggerSuccess: (msg: string) => void;
}

export function useAwardQuote({
  orgId,
  loadAction,
  setLoadAction,
  selectedQuoteId,
  setSelectedQuoteId,
  awardModalQuotes,
  queryClient,
  invalidateIndents,
  triggerSuccess,
}: UseAwardQuoteParams): {
  handleAwardQuote: () => Promise<void>;
  awarding: boolean;
} {
  const [awarding, setAwarding] = useState(false);

  const handleAwardQuote = async () => {
    if (!orgId || loadAction?.type !== "AWARD" || !selectedQuoteId) return;
    const load = loadAction.load;
    const currentStatus = (load.status || "").toLowerCase();
    if (currentStatus === "awarded" || currentStatus === "completed") {
      Alert.alert(
        "Already awarded",
        "This load has already been awarded. Closing.",
      );
      setLoadAction(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    if (currentStatus === "cancelled" || currentStatus === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
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
      setLoadAction(null);
      invalidateIndents(orgId);
      triggerSuccess(
        "Load awarded — supplier can assign and deploy from Claimed.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not award", msg);
      if (loadAction?.type === "AWARD" && loadAction.load?.id) {
        queryClient.invalidateQueries({
          queryKey: ["indents", loadAction.load.id, "direct-quotes"],
        });
      }
      invalidateIndents(orgId);
    } finally {
      setAwarding(false);
    }
  };

  return { handleAwardQuote, awarding };
}
