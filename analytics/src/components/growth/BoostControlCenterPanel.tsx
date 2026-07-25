/**
 * Growth > Boost Control Center — INTERNAL operations dashboard for the Boost
 * marketplace (not customer-facing). One RPC (get_boost_control_center) feeds
 * campaign health, top lanes, reward effectiveness, driver story adoption, and
 * funnel timings.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Loader2,
  MapPin,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ControlCenterData {
  active_campaigns: number;
  healthy: number;
  need_attention: number;
  top_lanes: {
    origin: string;
    destination: string;
    campaigns: number;
    bids: number;
    conversions: number;
  }[];
  most_effective_reward: {
    reward_amount: number;
    decided: number;
    converted: number;
  } | null;
  driver_story_adoption_pct: number;
  avg_recommendation_to_decision_min: number | null;
  avg_approval_to_trip_hr: number | null;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/[0.04]'
        : 'border-border bg-card';

  return (
    <div className={`rounded-lg border p-3.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function BoostControlCenterPanel() {
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    supabase.rpc('get_boost_control_center').then(({ data: payload, error: err }) => {
      if (err) setError(err.message);
      else setData(payload as unknown as ControlCenterData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Boost</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Control Center</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Internal
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Marketplace operations — campaigns, driver opportunities, and referral conversion.
            Read-only, aggregated live.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading control center…
        </div>
      ) : error ? (
        <div className="space-y-2 p-4 text-xs">
          <p className="text-destructive">Couldn't load control center: {error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <div className="p-4 text-xs text-muted-foreground">No data.</div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Active Campaigns"
              value={String(data.active_campaigns)}
              sub="Currently distributing"
              icon={<Activity className="size-3" />}
            />
            <StatCard
              tone="success"
              label="Healthy"
              value={String(data.healthy)}
              sub={
                data.active_campaigns > 0
                  ? `${Math.round((100 * data.healthy) / data.active_campaigns)}% of active`
                  : 'No active campaigns'
              }
              icon={<TrendingUp className="size-3" />}
            />
            <StatCard
              tone="warning"
              label="Need Attention"
              value={String(data.need_attention)}
              sub="Low engagement vs elapsed time"
              icon={<Activity className="size-3" />}
            />
          </div>

          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="size-3" />
                Top Performing Lanes
              </div>
              <span className="text-[10px] text-muted-foreground">
                {data.top_lanes.length} lane{data.top_lanes.length === 1 ? '' : 's'}
              </span>
            </header>
            {data.top_lanes.length === 0 ? (
              <div className="px-3.5 py-8 text-center">
                <MapPin className="mx-auto size-5 text-muted-foreground/40" />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  No lane activity yet — lanes appear once boosted loads receive bids or
                  conversions.
                </p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[minmax(0,1fr)_88px_72px_72px] gap-2 border-b border-border px-3.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Corridor</span>
                  <span className="text-right">Campaigns</span>
                  <span className="text-right">Bids</span>
                  <span className="text-right">Won</span>
                </div>
                <div className="divide-y divide-border/60">
                  {data.top_lanes.map((l) => (
                    <div
                      key={`${l.origin}-${l.destination}`}
                      className="grid grid-cols-[minmax(0,1fr)_88px_72px_72px] items-center gap-2 px-3.5 py-2.5 text-xs"
                    >
                      <span className="truncate font-medium text-foreground">
                        {l.origin} → {l.destination}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {l.campaigns}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">{l.bids}</span>
                      <span className="text-right font-semibold tabular-nums text-foreground">
                        {l.conversions}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Most Effective Reward"
              value={
                data.most_effective_reward
                  ? `₹${data.most_effective_reward.reward_amount.toLocaleString('en-IN')}`
                  : '—'
              }
              sub={
                data.most_effective_reward
                  ? `${data.most_effective_reward.converted} of ${data.most_effective_reward.decided} decided converted`
                  : 'No converted rewards yet'
              }
              icon={<TrendingUp className="size-3" />}
            />
            <StatCard
              label="Driver Story Adoption"
              value={`${data.driver_story_adoption_pct}%`}
              sub="Campaigns distributing to drivers"
              icon={<Users className="size-3" />}
            />
            <StatCard
              label="Recommendation → Decision"
              value={
                data.avg_recommendation_to_decision_min != null
                  ? `${data.avg_recommendation_to_decision_min} min`
                  : '—'
              }
              sub="Avg fleet owner response time"
              icon={<Timer className="size-3" />}
            />
            <StatCard
              label="Approval → Trip Start"
              value={
                data.avg_approval_to_trip_hr != null ? `${data.avg_approval_to_trip_hr} hr` : '—'
              }
              sub="Avg conversion time after approval"
              icon={<Timer className="size-3" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
