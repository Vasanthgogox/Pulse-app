/**
 * Growth > Boost Control Center — INTERNAL operations dashboard.
 * One RPC (get_boost_control_center) feeds campaign health, lanes, rewards,
 * driver-story adoption, and funnel timings.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Loader2,
  MapPin,
  RefreshCw,
  Rocket,
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
      ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
      : tone === 'warning'
        ? 'border-amber-500/25 bg-amber-500/[0.04]'
        : 'border-border bg-card';
  return (
    <div className={`rounded-lg border p-3.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function BoostControlCenterPanel() {
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_boost_control_center');
    if (rpcError) setError(rpcError.message);
    else setData(rpcData as unknown as ControlCenterData);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Growth</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Boost Control Center</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Internal
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Marketplace operations over campaigns, opportunities, and referral conversion — live,
            read-only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading control center…
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <Rocket className="mx-auto size-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-semibold text-foreground">Control center unavailable</p>
            <p className="mt-1 text-[11px] text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No data.
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Active Campaigns"
              value={String(data.active_campaigns)}
              sub="Currently live distribution"
              icon={<Activity className="size-3" />}
            />
            <StatCard
              label="Healthy"
              value={String(data.healthy)}
              tone="success"
              sub={
                data.active_campaigns > 0
                  ? `${Math.round((100 * data.healthy) / data.active_campaigns)}% of active`
                  : 'No active campaigns'
              }
              icon={<TrendingUp className="size-3" />}
            />
            <StatCard
              label="Need Attention"
              value={String(data.need_attention)}
              tone={data.need_attention > 0 ? 'warning' : 'default'}
              sub="Low engagement vs elapsed time"
              icon={<Activity className="size-3" />}
            />
          </div>

          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="size-3" />
                Top performing lanes
              </div>
              <span className="text-[10px] text-muted-foreground">
                {data.top_lanes.length} lane{data.top_lanes.length === 1 ? '' : 's'}
              </span>
            </header>
            {data.top_lanes.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
                No lane activity yet — lanes appear once boosted loads receive bids or conversions.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3.5 py-2">Corridor</th>
                    <th className="px-3.5 py-2 text-right">Campaigns</th>
                    <th className="px-3.5 py-2 text-right">Bids</th>
                    <th className="px-3.5 py-2 text-right">Won</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_lanes.map((l) => (
                    <tr
                      key={`${l.origin}-${l.destination}`}
                      className="border-t border-border/60 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3.5 py-2.5 font-medium text-foreground">
                        {l.origin} → {l.destination}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {l.campaigns}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {l.bids}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                        {l.conversions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                data.avg_approval_to_trip_hr != null
                  ? `${data.avg_approval_to_trip_hr} hr`
                  : '—'
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
