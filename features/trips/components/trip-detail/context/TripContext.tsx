/**
 * TripContext — shared identity for the trip-detail feature.
 *
 * MIGRATION STEP 0 (scaffolding): this provides the non-null `trip` and the
 * primitives every future domain hook (useTripFinance, useTripTracking, …) will
 * need, so they can stop prop-drilling identity. It is intentionally ADDITIVE:
 * TripDetailScreen wraps its post-guard render in <TripProvider> but nothing
 * consumes the context yet. No behavior changes until later steps opt in.
 *
 * The provider is only mounted AFTER the screen's loading/access/error guards,
 * so `trip` is guaranteed non-null here — domain hooks never need null checks.
 *
 * See docs/TRIP_DETAIL_ARCHITECTURE.md.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { useTripDetail } from "../hooks/useTripDetail";

/** Derived from the hook's own return type — avoids extra import coupling and keeps signatures exact. */
type TripDetailReturn = ReturnType<typeof useTripDetail>;
type TripRow = NonNullable<TripDetailReturn["trip"]>;

export interface TripContextValue {
  /** The loaded trip. Non-null: provider mounts only after the screen's guards. */
  trip: TripRow;
  /** Route param id for this trip. */
  tripId: string;
  /** Viewer's active organization id (null if none resolved). */
  viewerOrgId: string | null;
  /** i18n translate fn, passed through so domain hooks don't re-import it. */
  t: TripDetailReturn["t"];
  /** Reload the trip (wraps the existing loader; identity-preserving). */
  refresh: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({
  value,
  children,
}: {
  value: TripContextValue;
  children: ReactNode;
}) {
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

/** Read the trip context. Throws if used outside <TripProvider> (a wiring bug). */
export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext);
  if (ctx == null) {
    throw new Error("useTripContext must be used within <TripProvider>");
  }
  return ctx;
}
