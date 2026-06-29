import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdmin } from '@/context/AdminDataProvider';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Organization, AccountFilter, AppStatus, RiskLevel } from '@/types/admin';

// ─── Badge configs ────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<AppStatus, 'info' | 'warning' | 'destructive' | 'success' | 'secondary'> = {
  'Pending':      'info',
  'Under Review': 'warning',
  'Escalated':    'destructive',
  'Approved':     'success',
  'Rejected':     'secondary',
};

const RISK_VARIANT: Record<RiskLevel, 'success' | 'warning' | 'destructive'> = {
  Low: 'success', Medium: 'warning', High: 'destructive',
};

const ACCOUNT_FILTERS: AccountFilter[] = ['All Orgs', 'Pending Verification', 'Active Accounts', 'Suspended/Flagged'];

function matchesAccountFilter(app: Organization, filter: AccountFilter): boolean {
  if (filter === 'All Orgs')           return true;
  if (filter === 'Pending Verification') return ['Pending', 'Under Review', 'Escalated'].includes(app.status);
  if (filter === 'Active Accounts')    return app.status === 'Approved';
  if (filter === 'Suspended/Flagged')  return app.status === 'Rejected' || app.risk_score === 'High';
  return true;
}

function matchesSearch(app: Organization, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  const ownerEmail = app.users.find(u => u.role === 'Owner')?.email ?? app.contact_email;
  return (
    app.company_name.toLowerCase().includes(lower) ||
    app.gstin.toLowerCase().includes(lower) ||
    ownerEmail.toLowerCase().includes(lower)
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function AppRow({ app }: { app: Organization }) {
  const { selectedId, selectApplication } = useAdmin();
  const isSelected = selectedId === app.id;
  const ownerEmail = app.users.find(u => u.role === 'Owner')?.email ?? app.contact_email;

  return (
    <button
      onClick={() => selectApplication(app.id)}
      className={cn(
        'w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors border-l-2',
        isSelected
          ? 'bg-primary/8 border-l-primary'
          : 'hover:bg-muted/40 border-l-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">{app.company_name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{ownerEmail}</p>
        </div>
        <Badge variant={STATUS_VARIANT[app.status]} appearance="light" size="xs" className="mt-0.5 shrink-0">
          {app.status}
        </Badge>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Badge variant={RISK_VARIANT[app.risk_score]} appearance="light" size="xs">
          {app.risk_score}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{app.entity_type}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(app.submission_date)}</span>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApplicationQueue() {
  const { applications, accountFilter, setAccountFilter, searchQuery, setSearchQuery } = useAdmin();

  const filtered = applications
    .filter(a => matchesAccountFilter(a, accountFilter))
    .filter(a => matchesSearch(a, searchQuery));

  const countFor = (f: AccountFilter) =>
    applications.filter(a => matchesAccountFilter(a, f)).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search input */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Company, GSTIN or owner email…"
            className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-6 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Account filter dropdown */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <Select value={accountFilter} onValueChange={v => setAccountFilter(v as AccountFilter)}>
          <SelectTrigger size="sm" className="text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_FILTERS.map(f => (
              <SelectItem key={f} value={f} className="text-[12px]">
                {f}
                <span className="ml-auto pl-2 text-[10px] text-muted-foreground">{countFor(f)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results header */}
      <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Organisations
        </span>
        <span className="text-[10px] text-muted-foreground">
          {filtered.length} of {applications.length}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center px-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : 'No organisations in this view'}
            </p>
          </div>
        ) : (
          filtered.map(app => <AppRow key={app.id} app={app} />)
        )}
      </div>
    </div>
  );
}
