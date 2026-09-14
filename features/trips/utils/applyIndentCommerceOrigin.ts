export type CommerceOriginTrip = {
  indent_id?: string | null;
  source_indent_id?: string | null;
  execution_plan_id?: string | null;
  is_commerce?: boolean;
};

export type IndentCommerceOriginRow = {
  id: string;
  execution_plan_id?: string | null;
};

/** Indent ids already on the trip row — no Primitive A. */
export function indentIdsForCommerceLookup(
  trips: readonly CommerceOriginTrip[],
): string[] {
  const ids = new Set<string>();
  for (const trip of trips) {
    const a = (trip.indent_id ?? '').trim();
    const b = (trip.source_indent_id ?? '').trim();
    if (a) ids.add(a);
    if (b) ids.add(b);
  }
  return [...ids];
}

/**
 * Stamp `is_commerce` from indent.execution_plan_id (and any trip-level plan id).
 * Does not call get_driver_trip_stop_orders.
 */
export function applyIndentCommerceOrigin<T extends CommerceOriginTrip>(
  trips: T[],
  indentRows: readonly IndentCommerceOriginRow[],
): T[] {
  const commerceIndentIds = new Set(
    indentRows
      .filter((row) => Boolean((row.execution_plan_id ?? '').trim()))
      .map((row) => row.id),
  );
  return trips.map((trip) => {
    const indentCommerce =
      commerceIndentIds.has((trip.indent_id ?? '').trim()) ||
      commerceIndentIds.has((trip.source_indent_id ?? '').trim());
    return {
      ...trip,
      is_commerce:
        Boolean(trip.is_commerce) ||
        Boolean((trip.execution_plan_id ?? '').trim()) ||
        indentCommerce,
    };
  });
}
