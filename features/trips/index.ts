export { AddTripModal } from "./components/add-trip";
export type { AddTripFormData, AddTripModalProps } from "./components/add-trip";
export {
    AggregateTripOtpPanel, type AggregateOtpUiState, type AggregateTripOtpPanelProps
} from "./components/AggregateTripOtpPanel";
// TripDetailScreen is lazy-loaded from app/trip/[id] — do not re-export here
// (barrel pull-in duplicates react-native-webview across async route chunks).
export {
    TripAssignmentBlock, type AssignmentSource, type TripAssignmentBlockProps
} from "./components/TripAssignmentBlock";
export {
    TripExpandableCard,
    type TripExpandableCardProps
} from "./components/TripExpandableCard";
export {
    TripFinanceBlock,
    type TripFinanceBlockProps
} from "./components/TripFinanceBlock";
export {
    DEFAULT_TRIPS_HUB_TABLE_COLUMNS,
    TripsHubMobileTripListCanvas,
    TripsHubTableView,
    TripsHubTripCard,
    linkedOrgAvatarFields,
    summarizeTripLedgerForHub,
    tripFinanceAdjForHubLookup,
    tripHubCost,
    tripHubDue,
    tripHubRevenue, type TripHubCostOptions, type TripsHubTableColumnId, type TripsHubTableViewProps, type TripsHubTripCardProps
} from "./components/TripsHubViews";
export {
    TripTrackingBlock,
    type TripTrackingBlockProps
} from "./components/TripTrackingBlock";
export { useRealtimeTrip, useRealtimeTrips } from "./hooks/useRealtimeTrips";
export { setInitialTripForDetail } from "./initialTripForDetail";
export {
    buildTripHubPartyMetaByTripId,
    isUuidLikeString,
    type TripHubPartyMeta
} from "./utils/tripHubPartyMeta";
export {
    buildUniqueLinkedOrgIdMap, canOrgSeeTripAsIntegratedClient,
    canOrgSeeTripAsIntegratedSupplier, isCrossOrgIntegrationTrip, isLoadBasedTrip, isTripVisibleToOrgViaIntegration
} from "./visibility/tripVisibility";

