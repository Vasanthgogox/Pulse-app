/**
 * The queue's scrollable ticket list: loading state, empty state, rows, and the
 * pager. Purely presentational -- every value comes from useSupportQueue via
 * SupportPanel, so this renders a page of tickets and reports clicks.
 */
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  supportTicketNeedsAgentAttention,
  SUPPORT_STATUS_LABEL,
  type SupportTicketRow,
  type SupportTicketStatus,
} from '@/lib/supportTickets';

const STATUS_BADGE: Record<
  SupportTicketStatus,
  'info' | 'warning' | 'success' | 'secondary' | 'destructive'
> = {
  open: 'info',
  assigned: 'info',
  in_progress: 'warning',
  waiting_for_user: 'warning',
  resolved: 'success',
  closed: 'secondary',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SupportTicketList({
  tickets,
  loading,
  selectedId,
  onSelect,
  isFiltered,
  page,
  totalPages,
  onPageChange,
}: {
  tickets: SupportTicketRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isFiltered: boolean;
  page: number;
  totalPages: number;
  onPageChange: (updater: (n: number) => number) => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            No tickets{isFiltered ? ' in this state' : ''}.
          </p>
        ) : (
          tickets.map((t) => {
            const active = t.id === selectedId;
            const needsAttention = supportTicketNeedsAgentAttention(t);
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left hover:bg-muted/40 ${
                  active ? 'bg-muted/60' : ''
                } ${needsAttention && !active ? 'bg-amber-500/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {needsAttention ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-amber-500"
                      title="Update available"
                      aria-label="Update available"
                    />
                  ) : null}
                  <span className="font-mono text-[10px] text-muted-foreground">{t.display_id}</span>
                  <Badge
                    variant={STATUS_BADGE[t.status]}
                    appearance="light"
                    size="xs"
                    className="ml-auto shrink-0"
                  >
                    {SUPPORT_STATUS_LABEL[t.status]}
                  </Badge>
                </div>
                <span
                  className={`truncate text-[12px] ${needsAttention ? 'font-bold' : 'font-semibold'}`}
                >
                  {t.subject}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{t.reporter_display_name ?? 'Unknown reporter'}</span>
                  {t.organization_name ? <span>· {t.organization_name}</span> : null}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{t.category}</span>
                  <span className="ml-auto">{formatDate(t.updated_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={page === 0 || loading}
            onClick={() => onPageChange((n) => Math.max(0, n - 1))}
          >
            Prev
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={page + 1 >= totalPages || loading}
            onClick={() => onPageChange((n) => n + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}
