/**
 * Support queue state: the paginated fetch, the debounced search, the filters,
 * and the realtime subscription that keeps the current page fresh.
 *
 * Extracted from SupportPanel because these four concerns interact -- a filter
 * change has to reset the page, a realtime event has to decide between patching a
 * row and refetching, and the debounce has to sit between the input and the
 * query. Keeping them in one place makes that interaction reviewable on its own
 * rather than spread through a 700-line component.
 *
 * Everything here runs on the admin's session client (Phase 1); no service_role.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import {
  fetchSupportTicketQueue,
  type SupportTicketRow,
  type SupportTicketStatus,
} from '@/lib/supportTickets';

export type StatusFilter = 'all' | SupportTicketStatus;

/** One screenful. The RPC clamps to 200; this stays well under that. */
export const PAGE_SIZE = 50;

/** Below the threshold where typing feels laggy, high enough to collapse a burst. */
const SEARCH_DEBOUNCE_MS = 250;

export interface SupportQueue {
  tickets: SupportTicketRow[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  unassignedOnly: boolean;
  setUnassignedOnly: (v: boolean) => void;
  page: number;
  setPage: (updater: (n: number) => number) => void;
  total: number;
  totalPages: number;
  statusCounts: Partial<Record<SupportTicketStatus, number>>;
  needsAttentionCount: number;
  /** Re-read the current page (also refreshes the server-side counts). */
  reload: () => Promise<void>;
  /** Apply a local patch to one row without a round trip. */
  patchTicket: (id: string, patch: Partial<SupportTicketRow>) => void;
}

export function useSupportQueue(): SupportQueue {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  // Mirror of `tickets` readable from the realtime callback without listing it as
  // a dependency, which would tear down and re-open the channel on every change.
  const ticketsRef = useRef<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  // Whole-queue aggregates from the server: these describe every matching ticket,
  // not just the page on screen, so the tabs and the badge stay correct.
  const [statusCounts, setStatusCounts] = useState<
    Partial<Record<SupportTicketStatus, number>>
  >({});
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetchSupportTicketQueue({
      search: debouncedSearch,
      status: statusFilter === 'all' ? null : statusFilter,
      unassignedOnly,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    setTickets(res.rows);
    setTotal(res.total);
    setStatusCounts(res.statusCounts);
    setNeedsAttentionCount(res.needsAttention);
    setLoading(false);
  }, [debouncedSearch, statusFilter, unassignedOnly, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // A filter change invalidates the page number: staying on page 3 of a result
  // set that now has one page would show an empty list.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, unassignedOnly]);

  const patchTicket = useCallback((id: string, patch: Partial<SupportTicketRow>) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Patch the row in place when the changed ticket is already on this page; only
  // refetch when the change could alter which rows belong here (INSERT, DELETE,
  // or a ticket we are not currently showing). Previously every event -- including
  // one the agent caused themselves -- reloaded the entire table.
  useEffect(() => {
    const channel = supabase
      .channel('support-console')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const next = payload.new as SupportTicketRow;
            if (ticketsRef.current.some((t) => t.id === next.id)) {
              setTickets((prev) =>
                prev.map((t) => (t.id === next.id ? { ...t, ...next } : t)),
              );
              return;
            }
          }
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    tickets,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    unassignedOnly,
    setUnassignedOnly,
    page,
    setPage,
    total,
    totalPages,
    statusCounts,
    needsAttentionCount,
    reload,
    patchTicket,
  };
}
