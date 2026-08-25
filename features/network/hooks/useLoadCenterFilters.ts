/**
 * useLoadCenterFilters — derives all filtered lists and status tab counts
 * for the Load Center (Hire Partner / Find Work / Claimed).
 * Pure data transformation; no side effects, no network calls.
 */

import { getIndentDisplayNumber, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useCallback, useMemo } from "react";
import {
  statusMatchesFilter,
  type DoneSubTab,
  type LoadSubTab,
  type StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";
import {
  isDoneConvertedToTrip,
} from "@/features/network/utils/loadCenterTripAllocation.util";

export interface UseLoadCenterFiltersParams {
  orgId: string | null;
  indents: IndentRow[];
  marketIndents: IndentRow[];
  myQuotes: DirectQuoteRow[];
  trips: TripRow[];
  quoteCounts: Record<string, number>;
  loadSubTab: LoadSubTab;
  statusFilterTab: StatusFilterTab;
  /** When `statusFilterTab` is DONE, splits the done list. */
  doneSubTab: DoneSubTab;
  searchQuery: string;
}

export interface LoadCenterFiltersResult {
  myQuoteByIndentId: Map<string, DirectQuoteRow>;
  indentIdsWithTrip: Set<string>;
  hirePartnerLoads: IndentRow[];
  awardedToMeIndentIds: Set<string>;
  awardedLoads: IndentRow[];
  awardedLoadsDone: IndentRow[];
  findWorkDoneLoads: IndentRow[];
  findWorkDoneUnionLoads: IndentRow[];
  getLoads: IndentRow[];
  findWorkLoads: IndentRow[];
  filteredHirePartnerLoads: IndentRow[];
  filteredFindWorkLoads: IndentRow[];
  filteredFindWorkDoneLoads: IndentRow[];
  filteredFindWorkList: IndentRow[];
  filteredClaimedLoads: IndentRow[];
  filteredClaimedDoneLoads: IndentRow[];
  filteredHirePartnerDoneLoads: IndentRow[];
  tripByIndentId: Map<string, TripRow>;
  doneSubTabCounts: {
    REJECTED: number;
    CONVERTED: number;
  };
  statusTabCounts: {
    OPEN: number;
    QUOTED: number;
    AWARDED: number;
    DONE: number;
  };
  loadMatchesSearch: (load: IndentRow, q: string) => boolean;
}

export function useLoadCenterFilters({
  orgId,
  indents,
  marketIndents,
  myQuotes,
  trips,
  quoteCounts,
  loadSubTab,
  statusFilterTab,
  doneSubTab,
  searchQuery,
}: UseLoadCenterFiltersParams): LoadCenterFiltersResult {
  /** O(myQuotes.length): map indent_id -> quote for Find Work "Quote Sent" / "Update quote" and modal prefill. */
  const myQuoteByIndentId = useMemo(() => {
    const m = new Map<string, DirectQuoteRow>();
    for (const q of myQuotes) m.set(q.indent_id, q);
    return m;
  }, [myQuotes]);

  /** Indent ids that already have a trip (owner or supplier). Exclude these from Claimed so we don't show "ASSIGN STAFF & DEPLOY" again after deploy. */
  const tripByIndentId = useMemo(() => {
    const m = new Map<string, TripRow>();
    for (const t of trips ?? []) {
      const row = t as TripRow;
      const id = (row.indent_id ?? "").trim();
      if (id) m.set(id, row);
    }
    return m;
  }, [trips]);

  const indentIdsWithTrip = useMemo(
    () => new Set(tripByIndentId.keys()),
    [tripByIndentId],
  );

  /** All indents from my org (for Hire Partner — filter by status tab). */
  const hirePartnerLoads = useMemo(
    () => indents.filter((i) => i.organization_id === orgId),
    [indents, orgId],
  );

  /** Indents awarded to my org: accepted direct quote OR shipper set assigned_supplier_id (Give Load / assign without quote row). */
  const awardedToMeIndentIds = useMemo(() => {
    const s = new Set(
      myQuotes
        .filter((q) => (q.status || "").toLowerCase() === "accepted")
        .map((q) => q.indent_id),
    );
    const stAwarded = new Set(["awarded", "completed"]);
    for (const i of marketIndents) {
      const aid = i.assigned_supplier_id;
      if (!orgId || String(aid ?? "") !== orgId) continue;
      const st = (i.status || "").toLowerCase();
      if (stAwarded.has(st)) s.add(i.id);
    }
    return s;
  }, [myQuotes, marketIndents, orgId]);

  const awardedLoads = useMemo(
    () =>
      marketIndents.filter(
        (i) =>
          awardedToMeIndentIds.has(i.id) &&
          (i.status || "").toLowerCase() !== "completed" &&
          !indentIdsWithTrip.has(i.id),
      ),
    [marketIndents, awardedToMeIndentIds, indentIdsWithTrip],
  );

  /**
   * Find Work "Done": terminal loads that I bid on, excluding any load awarded
   * to me (those belong in Claimed → Done). We later union this with Claimed →
   * Done when rendering Find Work → Done, so users can view all done outcomes
   * from one place without changing award/deploy flow.
   */
  const findWorkDoneLoads = useMemo(() => {
    return marketIndents.filter((i) => {
      const status = (i.status || "").toLowerCase();
      if (!statusMatchesFilter(status, "DONE")) return false;
      // Unset target defaults to integrated_supplier (matches createIndent).
      const target = (i.circulation_target || "integrated_supplier").toLowerCase();
      const isTargeted = target === "integrated_supplier" || target === "both";
      if (!isTargeted) return false;
      if (awardedToMeIndentIds.has(i.id)) return false;
      return myQuoteByIndentId.has(i.id);
    });
  }, [marketIndents, awardedToMeIndentIds, myQuoteByIndentId]);

  /** Claimed "Done": loads awarded to me that are completed or have a trip. */
  const awardedLoadsDone = useMemo(
    () =>
      marketIndents.filter(
        (i) =>
          awardedToMeIndentIds.has(i.id) &&
          (statusMatchesFilter(i.status || "", "DONE") ||
            indentIdsWithTrip.has(i.id)),
      ),
    [marketIndents, awardedToMeIndentIds, indentIdsWithTrip],
  );

  /**
   * Find Work → Done should also include Claimed → Done (awarded-to-me + done/trip),
   * so users can see final outcomes in the Find Work DONE tab too.
   */
  const findWorkDoneUnionLoads = useMemo(() => {
    const byId = new Map<string, IndentRow>();
    for (const l of findWorkDoneLoads) byId.set(l.id, l);
    for (const l of awardedLoadsDone ?? []) byId.set(l.id, l);
    return Array.from(byId.values());
  }, [findWorkDoneLoads, awardedLoadsDone]);

  const getLoads = useMemo(
    () =>
      marketIndents.filter((i) => {
        const status = (i.status || "").toLowerCase();
        if (
          status === "awarded" ||
          status === "completed" ||
          status === "cancelled"
        )
          return false;
        // Unset target defaults to integrated_supplier (matches createIndent).
        const target = (i.circulation_target || "integrated_supplier").toLowerCase();
        return target === "integrated_supplier" || target === "both";
      }),
    [marketIndents],
  );

  /** Find Work list: open loads targeted to me, excluding any load already awarded to me (so we never show "Update quote" for awarded loads). */
  const findWorkLoads = useMemo(
    () => getLoads.filter((load) => !awardedToMeIndentIds.has(load.id)),
    [getLoads, awardedToMeIndentIds],
  );

  /** Check if a load matches the search query (route, ID, client, creator org). */
  const loadMatchesSearch = useCallback(
    (load: IndentRow, q: string): boolean => {
      const trimmed = q.trim().toLowerCase();
      if (!trimmed) return true;
      const route =
        `${(load.pickup_area || "").toLowerCase()} ${(load.drop_location || "").toLowerCase()}`.trim();
      const indentId = (getIndentDisplayNumber(load) || "").toLowerCase();
      const tripId = getTripOperationalDisplay({
        trip_number: load["trip_number"] ?? null,
      }).toLowerCase();
      const client = (
        orgId && load.organization_id === orgId
          ? load.client_name || ""
          : (load as { creator_organization_name?: string | null })
              .creator_organization_name || ""
      ).toLowerCase();
      const creator = (
        (load as { creator_organization_name?: string })
          .creator_organization_name || ""
      ).toLowerCase();
      return (
        route.includes(trimmed) ||
        indentId.includes(trimmed) ||
        tripId.includes(trimmed) ||
        client.includes(trimmed) ||
        creator.includes(trimmed)
      );
    },
    [],
  );

  const filteredFindWorkLoads = useMemo(() => {
    const statusFiltered = (() => {
      if (statusFilterTab === "OPEN") {
        // Find Work Open Market: loads I haven't bid on yet.
        // Deliberately keyed on MY quote, not the indent status: `quoted` is a
        // shared field set by the first bidder, so filtering on it here would
        // hide a still-biddable load from every other supplier.
        return findWorkLoads.filter(
          (load) =>
            !myQuoteByIndentId.has(load.id) &&
            !statusMatchesFilter((load.status || "").toLowerCase(), "AWARDED") &&
            !statusMatchesFilter((load.status || "").toLowerCase(), "DONE"),
        );
      }
      if (statusFilterTab === "QUOTED") {
        // Find Work My Bids: loads where I already sent a bid/quote.
        return findWorkLoads.filter((load) => myQuoteByIndentId.has(load.id));
      }
      if (statusFilterTab === "AWARDED") {
        // Find Work: Awarded mirrors Claimed (awarded to me, ready to deploy).
        return awardedLoads;
      }
      return [];
    })();

    return statusFiltered.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [
    findWorkLoads,
    statusFilterTab,
    searchQuery,
    loadMatchesSearch,
    myQuoteByIndentId,
    awardedLoads,
  ]);

  /**
   * Done → Rejected: terminal Get Load outcomes that did not convert to our trip
   * (declined bid, lost to another bidder, cancelled/expired, etc.).
   * Must partition Done with Converted so Done count = Rejected + Converted.
   */
  const findWorkDoneConvertedOpts = useCallback(
    (load: IndentRow) => ({
      awardedToMe: awardedToMeIndentIds.has(load.id),
      indentStatus: load.status,
      quoteStatus: myQuoteByIndentId.get(load.id)?.status,
    }),
    [awardedToMeIndentIds, myQuoteByIndentId],
  );

  const findWorkDoneRejectedLoads = useMemo(
    () =>
      findWorkDoneUnionLoads.filter(
        (load) =>
          !isDoneConvertedToTrip(
            load.id,
            indentIdsWithTrip,
            findWorkDoneConvertedOpts(load),
          ),
      ),
    [findWorkDoneUnionLoads, indentIdsWithTrip, findWorkDoneConvertedOpts],
  );

  const findWorkDoneConvertedLoads = useMemo(
    () =>
      findWorkDoneUnionLoads.filter((load) =>
        isDoneConvertedToTrip(
          load.id,
          indentIdsWithTrip,
          findWorkDoneConvertedOpts(load),
        ),
      ),
    [findWorkDoneUnionLoads, indentIdsWithTrip, findWorkDoneConvertedOpts],
  );

  const hirePartnerDoneLoads = useMemo(
    () =>
      hirePartnerLoads.filter((load) =>
        statusMatchesFilter(load.status || "", "DONE"),
      ),
    [hirePartnerLoads],
  );

  /** Done → Rejected (Give Load): terminal loads not linked to a trip. */
  const hirePartnerDoneRejectedLoads = useMemo(
    () =>
      hirePartnerDoneLoads.filter(
        (load) => !isDoneConvertedToTrip(load.id, indentIdsWithTrip),
      ),
    [hirePartnerDoneLoads, indentIdsWithTrip],
  );

  const hirePartnerDoneConvertedLoads = useMemo(
    () =>
      hirePartnerDoneLoads.filter((load) =>
        isDoneConvertedToTrip(load.id, indentIdsWithTrip),
      ),
    [hirePartnerDoneLoads, indentIdsWithTrip],
  );

  /** Done → Rejected (Action required / Claimed): awarded loads without a trip. */
  const claimedDoneRejectedLoads = useMemo(
    () =>
      awardedLoadsDone.filter(
        (load) =>
          !isDoneConvertedToTrip(load.id, indentIdsWithTrip, {
            awardedToMe: true,
            indentStatus: load.status,
            quoteStatus: myQuoteByIndentId.get(load.id)?.status,
          }),
      ),
    [awardedLoadsDone, indentIdsWithTrip, myQuoteByIndentId],
  );

  const claimedDoneConvertedLoads = useMemo(
    () =>
      awardedLoadsDone.filter((load) =>
        isDoneConvertedToTrip(load.id, indentIdsWithTrip, {
          awardedToMe: true,
          indentStatus: load.status,
          quoteStatus: myQuoteByIndentId.get(load.id)?.status,
        }),
      ),
    [awardedLoadsDone, indentIdsWithTrip, myQuoteByIndentId],
  );

  const pickDoneSubList = useCallback(
    (rejected: IndentRow[], converted: IndentRow[]) =>
      doneSubTab === "REJECTED" ? rejected : converted,
    [doneSubTab],
  );

  const filteredFindWorkDoneLoads = useMemo(() => {
    const base = pickDoneSubList(
      findWorkDoneRejectedLoads,
      findWorkDoneConvertedLoads,
    );
    return base.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [
    pickDoneSubList,
    findWorkDoneRejectedLoads,
    findWorkDoneConvertedLoads,
    searchQuery,
    loadMatchesSearch,
  ]);

  const filteredFindWorkList = useMemo(
    () =>
      statusFilterTab === "DONE"
        ? filteredFindWorkDoneLoads
        : filteredFindWorkLoads,
    [statusFilterTab, filteredFindWorkDoneLoads, filteredFindWorkLoads],
  );

  const filteredClaimedLoads = useMemo(() => {
    return awardedLoads.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [awardedLoads, searchQuery, loadMatchesSearch]);

  const filteredClaimedDoneLoads = useMemo(() => {
    const base = pickDoneSubList(
      claimedDoneRejectedLoads,
      claimedDoneConvertedLoads,
    );
    return base.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [
    pickDoneSubList,
    claimedDoneRejectedLoads,
    claimedDoneConvertedLoads,
    searchQuery,
    loadMatchesSearch,
  ]);

  const filteredHirePartnerDoneLoads = useMemo(() => {
    const base = pickDoneSubList(
      hirePartnerDoneRejectedLoads,
      hirePartnerDoneConvertedLoads,
    );
    return base.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [
    pickDoneSubList,
    hirePartnerDoneRejectedLoads,
    hirePartnerDoneConvertedLoads,
    searchQuery,
    loadMatchesSearch,
  ]);

  /** Status-filtered lists for each role tab, then search-filtered. */
  const filteredHirePartnerLoads = useMemo(() => {
    if (statusFilterTab === "DONE") {
      return filteredHirePartnerDoneLoads;
    }
    const statusFiltered = hirePartnerLoads.filter((load) => {
      const status = (load.status || "").toLowerCase();
      if (statusFilterTab === "QUOTED") {
        // Give Load: Receiving Bids — still open market, at least one bid.
        // Driven by bid count only; indent.status is never flipped to 'quoted'.
        const hasBids = (quoteCounts[load.id] ?? 0) > 0;
        const isNotTerminal =
          !statusMatchesFilter(status, "AWARDED") &&
          !statusMatchesFilter(status, "DONE");
        return hasBids && isNotTerminal;
      }
      if (statusFilterTab === "OPEN") {
        // Open Market — published, no bids yet. First bid moves to Receiving Bids
        // (shipper tab only). Marketplace for other suppliers stays open via
        // indent.status remaining open/broadcast (ADR-012 Phase 0).
        const hasBids = (quoteCounts[load.id] ?? 0) > 0;
        if (hasBids) return false;
        return statusMatchesFilter(status, "OPEN");
      }
      return statusMatchesFilter(status, statusFilterTab);
    });
    return statusFiltered.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [
    hirePartnerLoads,
    statusFilterTab,
    quoteCounts,
    searchQuery,
    loadMatchesSearch,
    filteredHirePartnerDoneLoads,
  ]);

  const doneSubTabCounts = useMemo(() => {
    if (loadSubTab === "GIVE_LOAD") {
      return {
        REJECTED: hirePartnerDoneRejectedLoads.length,
        CONVERTED: hirePartnerDoneConvertedLoads.length,
      };
    }
    if (loadSubTab === "GET_LOAD") {
      return {
        REJECTED: findWorkDoneRejectedLoads.length,
        CONVERTED: findWorkDoneConvertedLoads.length,
      };
    }
    if (loadSubTab === "AWARDED") {
      return {
        REJECTED: claimedDoneRejectedLoads.length,
        CONVERTED: claimedDoneConvertedLoads.length,
      };
    }
    return { REJECTED: 0, CONVERTED: 0 };
  }, [
    loadSubTab,
    hirePartnerDoneRejectedLoads,
    hirePartnerDoneConvertedLoads,
    findWorkDoneRejectedLoads,
    findWorkDoneConvertedLoads,
    claimedDoneRejectedLoads,
    claimedDoneConvertedLoads,
  ]);

  /** Counts per status tab for the current role tab (Hire Partner / Find Work / Claimed). */
  const statusTabCounts = useMemo(() => {
    const getCount = (filter: StatusFilterTab) => {
      if (loadSubTab === "GIVE_LOAD") {
        return hirePartnerLoads.filter((load) => {
          const status = (load.status || "").toLowerCase();
          if (filter === "QUOTED") {
            const hasBids = (quoteCounts[load.id] ?? 0) > 0;
            const isNotTerminal =
              !statusMatchesFilter(status, "AWARDED") &&
              !statusMatchesFilter(status, "DONE");
            return hasBids && isNotTerminal;
          }
          if (filter === "OPEN") {
            const hasBids = (quoteCounts[load.id] ?? 0) > 0;
            if (hasBids) return false;
            return statusMatchesFilter(status, "OPEN");
          }
          return statusMatchesFilter(status, filter);
        }).length;
      }
      if (loadSubTab === "GET_LOAD") {
        if (filter === "DONE") return findWorkDoneUnionLoads.length;
        if (filter === "AWARDED") return awardedLoads.length;
        if (filter === "QUOTED") {
          return findWorkLoads.filter((load) => myQuoteByIndentId.has(load.id))
            .length;
        }
        if (filter === "OPEN") {
          return findWorkLoads.filter((load) => !myQuoteByIndentId.has(load.id))
            .length;
        }
        return 0;
      }
      if (loadSubTab === "AWARDED") {
        if (filter === "AWARDED") return awardedLoads.length;
        if (filter === "DONE") return awardedLoadsDone.length;
        return 0;
      }
      return 0;
    };
    return {
      OPEN: getCount("OPEN"),
      QUOTED: getCount("QUOTED"),
      AWARDED: getCount("AWARDED"),
      DONE: getCount("DONE"),
    };
  }, [
    loadSubTab,
    hirePartnerLoads,
    findWorkLoads,
    findWorkDoneUnionLoads,
    awardedLoads,
    awardedLoadsDone,
    quoteCounts,
    myQuoteByIndentId,
  ]);

  return {
    myQuoteByIndentId,
    indentIdsWithTrip,
    tripByIndentId,
    hirePartnerLoads,
    awardedToMeIndentIds,
    awardedLoads,
    awardedLoadsDone,
    findWorkDoneLoads,
    findWorkDoneUnionLoads,
    getLoads,
    findWorkLoads,
    filteredHirePartnerLoads,
    filteredFindWorkLoads,
    filteredFindWorkDoneLoads,
    filteredFindWorkList,
    filteredClaimedLoads,
    filteredClaimedDoneLoads,
    filteredHirePartnerDoneLoads,
    doneSubTabCounts,
    statusTabCounts,
    loadMatchesSearch,
  };
}
