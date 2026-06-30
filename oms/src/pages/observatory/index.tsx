import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock, Radio, Server } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { CorrelationTrace, StatusBadge } from '@/components/pulse-ui';
import { useCommerce } from '@/context/CommerceProvider';
import {
  getObservatoryStats, getRecentObservatoryRecords, subscribeObservatory,
} from '@/lib/pulse-observatory';
import { getRegisteredServices } from '@/lib/pulse-registry';
import type { ObservatoryRecord } from '@/types/observatory';

export function ObservatoryPage() {
  const { plans } = useCommerce();
  const [records, setRecords] = useState<ObservatoryRecord[]>(() => getRecentObservatoryRecords(30));
  const [selectedCorrelation, setSelectedCorrelation] = useState<string | null>(
    plans.find(p => p.correlation_id)?.correlation_id ?? null,
  );
  const stats = getObservatoryStats();
  const services = getRegisteredServices();

  useEffect(() => subscribeObservatory(() => {
    setRecords(getRecentObservatoryRecords(30));
  }), []);

  const plansWithCorrelation = plans.filter(p => p.correlation_id);

  return (
    <div className="container-fluid pb-8">
      <PageToolbar
        title="Pulse Observatory"
        breadcrumb={['Commerce Workspace', 'Observatory']}
        description="Commands, events, latency, and correlation traces — answers “where is my order?”"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard icon={Activity} label="Recent commands" value={String(stats.commands)} />
        <StatCard icon={Radio} label="Domain events" value={String(stats.events)} />
        <StatCard icon={Clock} label="Avg latency" value={`${stats.avgLatencyMs}ms`} />
        <StatCard icon={AlertTriangle} label="Failures" value={String(stats.failures)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Pulse Registry</h2>
            </div>
            <div className="divide-y divide-border">
              {services.map(svc => (
                <div key={svc.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{svc.name}</p>
                    <p className="text-2xs text-muted-foreground font-mono truncate">{svc.basePath} · {svc.region}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {svc.activeSlot && <span className="text-2xs text-muted-foreground">{svc.activeSlot}</span>}
                    <StatusBadge status={svc.health === 'healthy' ? 'fulfilled' : svc.health === 'degraded' ? 'pending' : 'cancelled'} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">Execution plans with trace</h2>
            </div>
            <div className="divide-y divide-border">
              {plansWithCorrelation.length === 0 && (
                <p className="px-5 py-4 text-2sm text-muted-foreground">Publish a plan to create a correlation trace.</p>
              )}
              {plansWithCorrelation.map(plan => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedCorrelation(plan.correlation_id!)}
                  className={`w-full text-left px-5 py-3 hover:bg-accent/30 transition-colors ${selectedCorrelation === plan.correlation_id ? 'bg-primary/5' : ''}`}
                >
                  <p className="font-mono text-sm font-medium">{plan.plan_number}</p>
                  <p className="text-2xs font-mono text-muted-foreground truncate mt-0.5">{plan.correlation_id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={plan.status} />
                    {plan.journey_in_progress && <StatusBadge status="optimizing" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 space-y-4">
          {selectedCorrelation ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-none">
              <h2 className="font-semibold text-sm mb-4">Lifecycle trace</h2>
              <CorrelationTrace correlationId={selectedCorrelation} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              Select an execution plan to view its full lifecycle trace.
            </div>
          )}

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">Recent activity</h2>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {records.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedCorrelation(r.correlationId)}
                  className="w-full text-left px-5 py-2.5 hover:bg-accent/20 text-2sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{r.action}</span>
                    <StatusBadge status={r.status === 'success' ? 'fulfilled' : r.status} />
                  </div>
                  <p className="text-2xs text-muted-foreground font-mono truncate">{r.correlationId}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-none">
      <Icon className="size-4 text-primary mb-2" />
      <p className="text-2sm text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
