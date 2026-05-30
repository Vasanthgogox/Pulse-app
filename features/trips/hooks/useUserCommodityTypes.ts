import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { LOAD_TYPES, VEHICLE_TYPES } from "@/features/indents/constants";
import {
  loadUserCommodityTypes,
  takePendingCommodityPick,
  type CommodityTypeKind,
  type UserCommodityTypesStore,
} from "@/features/trips/services/userCommodityTypes.storage";

function mergeOptionLists(
  catalog: readonly string[],
  custom: string[],
  fromIndent?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  const indent = (fromIndent ?? "").trim();
  if (indent) add(indent);
  for (const item of custom) add(item);
  for (const item of catalog) add(item);
  return out;
}

export function useUserCommodityTypes(indentVehicleType?: string | null, indentLoadType?: string | null) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const [store, setStore] = useState<UserCommodityTypesStore>({
    vehicleTypes: [],
    productTypes: [],
  });

  const refresh = useCallback(async () => {
    if (!userId) {
      setStore({ vehicleTypes: [], productTypes: [] });
      return;
    }
    setStore(await loadUserCommodityTypes(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const vehicleOptions = mergeOptionLists(
    VEHICLE_TYPES,
    store.vehicleTypes,
    indentVehicleType,
  );
  const productOptions = mergeOptionLists(LOAD_TYPES, store.productTypes, indentLoadType);

  const consumePendingPick = useCallback(async (): Promise<{
    kind: CommodityTypeKind;
    name: string;
  } | null> => {
    if (!userId) return null;
    const pick = await takePendingCommodityPick(userId);
    if (pick) await refresh();
    return pick;
  }, [userId, refresh]);

  return {
    userId,
    store,
    vehicleOptions,
    productOptions,
    refresh,
    consumePendingPick,
  };
}
