import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, CheckCircle2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { LottieIcon, StatusBadge } from '@/components/pulse-ui';
import { useExecution } from '@/context/ExecutionProvider';

export function DriverTripPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { getJob, getNextStop, completeNextStop } = useExecution();
  const job = jobId ? getJob(jobId) : undefined;
  const [podRef, setPodRef] = useState('');
  const [busy, setBusy] = useState(false);

  if (!job) {
    return (
      <div className="container-fluid">
        <p className="text-muted-foreground">Trip not found.</p>
        <Link to="/execution" className="text-primary text-sm">← Back</Link>
      </div>
    );
  }

  const nextStop = getNextStop(job.id);
  const completedCount = job.stops.filter(s => s.status === 'completed').length;
  const progress = Math.round((completedCount / job.stops.length) * 100);

  async function handleCompleteStop() {
    if (!nextStop) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 400));
    completeNextStop(job!.id, nextStop.podRequired ? (podRef || `POD-${nextStop.stopId}`) : undefined);
    setPodRef('');
    setBusy(false);
  }

  return (
    <div className="container-fluid pb-8 max-w-lg mx-auto">
      <PageToolbar
        title="Driver — Multi-stop trip"
        breadcrumb={['Execution', job.planNumber]}
        description={`${job.driverName} · ${job.vehicleLabel}`}
      />

      <div className="rounded-xl border border-border bg-card p-5 mb-4 shadow-none text-center">
        <LottieIcon name="map" size={72} className="mx-auto mb-3" />
        <p className="font-mono font-bold text-lg">{job.planNumber}</p>
        <StatusBadge status={job.status} className="mt-2" />
        <div className="h-2 rounded-full bg-muted mt-4 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-2sm text-muted-foreground mt-2">{completedCount} of {job.stops.length} stops completed</p>
      </div>

      <ol className="space-y-2 mb-6">
        {job.stops.map(stop => (
          <li
            key={stop.stopId}
            className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
              stop.status === 'completed'
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30'
                : stop.stopId === nextStop?.stopId
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
            }`}
          >
            <span className="size-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0">
              {stop.sequence}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{stop.label}</p>
              <p className="text-2xs text-muted-foreground capitalize">{stop.type} · {stop.city}</p>
            </div>
            {stop.status === 'completed'
              ? <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
              : stop.stopId === nextStop?.stopId
                ? <MapPin className="size-5 text-primary shrink-0 animate-pulse" />
                : null}
          </li>
        ))}
      </ol>

      {job.status === 'completed' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <LottieIcon name="success" size={64} className="mx-auto mb-3" />
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">Trip completed</p>
          <p className="text-2sm text-muted-foreground mt-1">Settlement sent to Finance · Commerce will update</p>
          <Link to="/execution" className="inline-block mt-4 text-sm text-primary font-medium">← Execution dashboard</Link>
        </div>
      ) : nextStop ? (
        <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-none sticky bottom-4">
          <p className="font-semibold mb-1">Next stop: {nextStop.label}</p>
          <p className="text-2sm text-muted-foreground capitalize mb-4">{nextStop.type} · {nextStop.city}</p>
          {nextStop.podRequired && (
            <label className="block mb-3">
              <span className="text-2sm font-medium flex items-center gap-1 mb-1"><Camera className="size-3.5" /> POD reference</span>
              <input
                value={podRef}
                onChange={e => setPodRef(e.target.value)}
                placeholder={`POD-${nextStop.stopId}`}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
              />
            </label>
          )}
          <Button className="w-full" size="lg" disabled={busy} onClick={handleCompleteStop}>
            {nextStop.type === 'pickup' ? 'Confirm pickup' : 'Confirm drop & POD'}
          </Button>
        </div>
      ) : job.status === 'received' ? (
        <p className="text-center text-muted-foreground text-sm">
          Awaiting dispatcher assignment.{' '}
          <Link to={`/execution/dispatch/${job.id}`} className="text-primary">Assign vehicle →</Link>
        </p>
      ) : null}
    </div>
  );
}
