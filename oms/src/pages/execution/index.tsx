import { Link } from 'react-router-dom';
import { ArrowRight, Radio, Truck, User } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { KpiCard, LottieIcon, RouteTimeline, StatusBadge } from '@/components/pulse-ui';
import { useExecution } from '@/context/ExecutionProvider';
import { formatCurrency } from '@/lib/utils';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ExecutionDashboardPage() {
  const { pendingJobs, activeJobs, completedJobs } = useExecution();

  return (
    <div className="container-fluid pb-8">
      <PageToolbar
        title="Pulse Operations"
        breadcrumb={['Pulse Platform', 'Operations']}
        description="Dispatch assigns org fleet · Driver completes sequential PODs · Execution Service owns state"
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <KpiCard label="Awaiting dispatch" value={String(pendingJobs.length)} lottie="logistics" />
        <KpiCard label="Active trips" value={String(activeJobs.length)} lottie="delivery" />
        <KpiCard label="Completed" value={String(completedJobs.length)} lottie="success" />
      </div>

      {pendingJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <LottieIcon name="planning" size={32} />
            Incoming execution plans
          </h2>
          <div className="space-y-3">
            {pendingJobs.map(job => (
              <div key={job.id} className="rounded-xl border border-primary/25 bg-primary/5 p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-sm">{job.planNumber}</p>
                    <StatusBadge status={job.status} />
                  </div>
                  {job.indentCode && (
                    <p className="text-2xs font-mono text-primary mt-0.5">Indent: {job.indentCode}</p>
                  )}
                  <p className="text-2xs text-muted-foreground mt-1">
                    {job.command.summary.orderCount} orders · {formatCurrency(job.command.summary.totalAmount)} · {job.stops.length} stops
                  </p>
                  <p className="text-2xs text-muted-foreground mt-0.5">Published {formatTimestamp(job.receivedAt)}</p>
                  <p className="text-2xs font-mono text-primary/80 mt-1 flex items-center gap-1">
                    <Radio className="size-3" />{job.correlationId}
                  </p>
                </div>
                <Link
                  to={`/execution/dispatch/${job.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  Dispatch <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="font-semibold mb-3">Active trips</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {activeJobs.map(job => (
              <div key={job.id} className="rounded-xl border border-border bg-card p-5 shadow-none">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-mono font-semibold">{job.planNumber}</p>
                    <p className="text-2sm text-muted-foreground flex items-center gap-2 mt-1">
                      <User className="size-3.5" />{job.driverName}
                      <Truck className="size-3.5 ml-2" />{job.vehicleLabel}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                <RouteTimeline
                  stops={job.stops.map(s => ({
                    stop_id: s.stopId,
                    label: s.label,
                    type: s.type,
                    address: { line1: '', city: s.city, state: '', pincode: '' },
                    contact_name: '',
                    contact_phone: '',
                    pod_required: s.podRequired,
                  }))}
                  sequence={job.stops.map(s => s.stopId)}
                />
                <Link
                  to={`/execution/driver/${job.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-primary font-medium"
                >
                  Open driver view <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {pendingJobs.length === 0 && activeJobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <LottieIcon name="logistics" size={80} className="mx-auto mb-4" />
          <p className="font-medium">No active execution jobs</p>
          <p className="text-2sm text-muted-foreground mt-1">Publish an execution plan from Commerce Workspace to begin M1.</p>
          <Link to="/execution-plans/build" className="inline-block mt-4 text-sm text-primary font-medium">Go to Plan Builder →</Link>
        </div>
      )}
    </div>
  );
}
