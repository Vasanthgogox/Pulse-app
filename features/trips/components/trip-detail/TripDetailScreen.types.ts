/** Shared props for trip detail (TripDetailScreen). */
export interface TripDetailScreenProps {
  tripId: string;
  /**
   * When "supplier", add-entry opens with defaultType "out" and supplier pre-filled.
   * When "vehicle", add-entry opens with defaultType "out" and trip pre-selected (vehicle expense flow).
   * When "client", add-entry opens with defaultType "in" and client pre-filled (customer payment flow).
   */
  entryContext?: "supplier" | "vehicle" | "client";
  /** When entryContext="client", the local client id/name for integrated flows. */
  clientIdFromContext?: string;
  clientNameFromContext?: string;
  onBack: () => void;
}
