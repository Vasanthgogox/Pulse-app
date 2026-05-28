import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from "react";
import type { PulseFilterState } from "../types";

const EMPTY_FILTERS: PulseFilterState = {
  dateRange: { start: null, end: null },
  clientIds: [],
  supplierIds: [],
  vehicleIds: [],
  driverIds: [],
  branches: [],
  routes: [],
  tripModes: [],
  executionModels: [],
  vehicleTypes: [],
  profitabilityStates: [],
  complianceStates: [],
  settlementStates: [],
};

type PulseFilterAction =
  | { type: "set"; patch: Partial<PulseFilterState> }
  | { type: "reset" }
  | { type: "toggle-id"; key: ToggleFilterKey; value: string }
  | { type: "set-date-range"; start: string | null; end: string | null };

type ToggleFilterKey = Exclude<keyof PulseFilterState, "dateRange">;

function reducer(state: PulseFilterState, action: PulseFilterAction): PulseFilterState {
  if (action.type === "reset") return EMPTY_FILTERS;
  if (action.type === "set") return { ...state, ...action.patch };
  if (action.type === "set-date-range") {
    return { ...state, dateRange: { start: action.start, end: action.end } };
  }
  if (action.type === "toggle-id") {
    const key = action.key;
    const bucket = state[key];
    if (!Array.isArray(bucket)) return state;
    const normalized = String(action.value);
    const normalizedBucket = bucket.map((item) => String(item));
    const exists = normalizedBucket.includes(normalized);
    const next = exists
      ? normalizedBucket.filter((item) => item !== normalized)
      : [...normalizedBucket, normalized];
    return { ...state, [key]: next } as PulseFilterState;
  }
  return state;
}

interface PulseFilterContextShape {
  filters: PulseFilterState;
  setFilters: (patch: Partial<PulseFilterState>) => void;
  resetFilters: () => void;
  toggleFilterValue: (key: ToggleFilterKey, value: string) => void;
  setDateRange: (start: string | null, end: string | null) => void;
}

const PulseFilterContext = createContext<PulseFilterContextShape | null>(null);

export function PulseFilterProvider({ children }: PropsWithChildren) {
  const [filters, dispatch] = useReducer(reducer, EMPTY_FILTERS);

  const setFilters = useCallback((patch: Partial<PulseFilterState>) => {
    dispatch({ type: "set", patch });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const toggleFilterValue = useCallback((key: ToggleFilterKey, value: string) => {
    dispatch({ type: "toggle-id", key, value });
  }, []);

  const setDateRange = useCallback((start: string | null, end: string | null) => {
    dispatch({ type: "set-date-range", start, end });
  }, []);

  const value = useMemo(
    () => ({ filters, setFilters, resetFilters, toggleFilterValue, setDateRange }),
    [filters, resetFilters, setDateRange, setFilters, toggleFilterValue],
  );

  return <PulseFilterContext.Provider value={value}>{children}</PulseFilterContext.Provider>;
}

export function usePulseFilters(): PulseFilterContextShape {
  const context = useContext(PulseFilterContext);
  if (!context) {
    throw new Error("usePulseFilters must be used within PulseFilterProvider");
  }
  return context;
}
