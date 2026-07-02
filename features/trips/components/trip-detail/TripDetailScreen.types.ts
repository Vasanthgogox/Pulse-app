/** Shared props for trip detail (TripDetailScreen). */
import type {
  TripDetailRouteFinanceSubTab,
  TripDetailRouteTab,
} from "@/lib/routes";

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
  /** Deep link: open Finance Hub, Journey Log, etc. on first paint. */
  initialTab?: TripDetailRouteTab;
  /** Deep link: Finance Hub sub-tab (Summary vs Transactions). */
  initialFinanceSubTab?: TripDetailRouteFinanceSubTab;
  onBack: () => void;
}
