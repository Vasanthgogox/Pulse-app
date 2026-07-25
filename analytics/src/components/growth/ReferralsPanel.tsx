/**
 * Growth > Referrals — platform-wide pulse_credit_referrals workspace.
 * Settled automatically by record_referral / platform_approve_verification.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function ReferralsPanel() {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ReferralStatus>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    setRows((data ?? []) as unknown as ReferralRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const base = { all: rows.length, pending: 0, milestone_met: 0, credited: 0, rejected: 0 };
    for (const r of rows) base[r.status] += 1;
    return base;
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
              Read-only
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Platform-wide referral activity — settlements run automatically on verification.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 border-b border-border px-4 py-3">
        <StatPill label="Total" value={counts.all} />
        <StatPill label="Pending" value={counts.pending} />
        <StatPill label="Credited" value={counts.credited} />
        <StatPill label="Rejected" value={counts.rejected} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
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
            <span className="ml-1 tabular-nums opacity-70">
              {f.key === 'all' ? counts.all : counts[f.key]}
            </span>
          </button>
        ))}
        <div className="ml-auto flex w-56 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organizations…"
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
          <div className="p-4 text-xs text-destructive">Couldn&apos;t load referrals: {error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-xs text-center">
              <Users className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-semibold text-foreground">No referrals match</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Adjust the status filter or search to find referral activity.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Referrer</th>
                <th className="px-4 py-2.5 font-semibold">Referred organization</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Joined</th>
                <th className="px-4 py-2.5 font-semibold">Credited</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {r.referrer?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {r.referred?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={badge.variant} appearance="light" size="xs">
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {formatDate(r.credited_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        Showing {filtered.length} of {rows.length} referrals
      </div>
    </div>
  );
}
