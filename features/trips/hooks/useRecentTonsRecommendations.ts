import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import {
  buildTonsRecommendationChips,
  loadRecentTons,
  rememberTonsValue,
} from "@/features/trips/services/userRecentTons.storage";

const DEFAULT_TONS = ["5", "9", "10", "12", "16", "20"] as const;
/** ~2 rows of compact chips. */
const MAX_CHIPS = 12;

export function useRecentTonsRecommendations() {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const [recent, setRecent] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRecent([]);
      return;
    }
    setRecent(await loadRecentTons(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const remember = useCallback(
    async (raw: string) => {
      if (!userId) return;
      const next = await rememberTonsValue(userId, raw);
      setRecent(next);
    },
    [userId],
  );

  const chips = buildTonsRecommendationChips(recent, DEFAULT_TONS, MAX_CHIPS);

  return { chips, recent, remember, refresh };
}
