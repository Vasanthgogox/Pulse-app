/**
 * Client Feed feature — distributed bookkeeping surface (supplier-side).
 *
 * Domain boundary: reading + classifying external ledger entries from integrated
 * clients and letting the supplier Add / Link / Review / Dispute them.
 *
 * Entry points:
 *   - `/from-clients` route (primary, dedicated screen)
 *   - Resources tab row with unread count
 *   - (future) Home dashboard widget
 */
export { default as ClientFeedScreen } from "./components/ClientFeedScreen";
export { ClientFeedEntryDetailModal } from "./components/ClientFeedEntryDetailModal";
export {
  fetchClientFeed,
  type ClientFeedBundle,
  type ClientFeedEntry,
  type ClientFeedMatchKind,
  type ClientFeedEntryType,
} from "./services/clientFeedService";
export {
  getClientFeedStatusMap,
  setClientFeedEntryStatus,
  clearClientFeedEntryStatus,
  type ClientFeedLocalStatus,
  type ClientFeedLocalStatusKind,
} from "./lib/clientFeedLocalStatus";
