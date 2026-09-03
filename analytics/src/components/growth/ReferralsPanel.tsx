/**
 * Growth > Referrals — platform-wide referral activity over pulse_credit_referrals.
 * Read-only ops view; settlement is automatic via record_referral /
 * platform_approve_verification.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Users,
  UserPlus,
} from 'lucide-react';
// Session client, not service_role: pulse_credit_referrals already grants read
// to holders of the 'credits.issue' platform permission
// (pcr_visible_to_participants), and the joined organizations rows are covered
// by organizations_platform_admin_select. Read-only panel.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ReferralStatus = 'pending' | 'milestone_met' | 'credited' | 'rejected';

interface ReferralRow {
  id: string;
  status: ReferralStatus;
  created_at: string;
  credited_at: string | null;
  referrer: { name: string } | null;
  referred: { name: string } | null;
}

const STATUS_FILTERS: { key: 'all' | ReferralStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'milestone_met', label: 'Verifying' },
  { key: 'credited', label: 'Credited' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<
  ReferralStatus,
  { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  milestone_met: { label: 'Verifying', variant: 'info' },
  credited: { label: 'Credited', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'secondary' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ReferralsPanel() {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ReferralStatus>('all');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('pulse_credit_referrals')
      .select(
        'id, status, created_at, credited_at, referrer:organizations!referrer_org_id(name), referred:organizations!referred_org_id(name)',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    else setRows((data ?? []) as unknown as ReferralRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        (r.referrer?.name ?? '').toLowerCase().includes(q) ||
        (r.referred?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Growth</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Referrals</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Auto-settled
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Platform-wide referral activity — credits settle automatically on verification.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex min-w-[220px] items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search referrer or referred…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading referrals…
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive">Couldn't load referrals: {error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-xs text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
                <UserPlus className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No referrals match</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Adjust filters or wait for invitees to join and verify.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_100px_110px_110px] items-center gap-2 border-b border-border bg-muted/30 px-3.5 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Referrer</span>
                <span>Referred organization</span>
                <span>Status</span>
                <span>Joined</span>
                <span>Credited</span>
              </div>
              <div className="divide-y divide-border/60">
                {filtered.map((r) => {
                  const badge = STATUS_BADGE[r.status];
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_100px_110px_110px] items-center gap-2 px-3.5 py-2.5 text-xs transition-colors hover:bg-muted/20"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                          {orgInitials(r.referrer?.name ?? '?')}
                        </span>
                        <span className="truncate font-medium text-foreground">
                          {r.referrer?.name ?? '—'}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <Users className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium text-foreground">
                          {r.referred?.name ?? '—'}
                        </span>
                      </div>
                      <Badge variant={badge.variant} appearance="light" size="xs">
                        {badge.label}
                      </Badge>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatDate(r.created_at)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatDate(r.credited_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Showing {filtered.length} of {rows.length} referrals
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
