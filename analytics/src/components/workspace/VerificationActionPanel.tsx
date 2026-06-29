import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, AlertOctagon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/context/AdminDataProvider';
import { REJECTION_REASONS } from '@/types/admin';

type ActionState = 'idle' | 'rejecting' | 'escalating';

const STATUS_BADGE: Record<string, { variant: 'success' | 'destructive' | 'warning' | 'info' | 'secondary'; label: string }> = {
  'Pending':      { variant: 'info',        label: 'Pending Review' },
  'Under Review': { variant: 'warning',     label: 'Under Review'  },
  'Escalated':    { variant: 'destructive', label: 'Escalated'     },
  'Approved':     { variant: 'success',     label: 'Approved'      },
  'Rejected':     { variant: 'destructive', label: 'Rejected'      },
};

export function VerificationActionPanel() {
  const { selectedApp, approveApp, rejectApp, escalateApp, isActing } = useAdmin();
  const [actionState,      setActionState]      = useState<ActionState>('idle');
  const [rejectionReason,  setRejectionReason]  = useState('');
  const [rejectionNotes,   setRejectionNotes]   = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);   // per-panel inflight indicator

  if (!selectedApp) return null;

  const { id, status, rejection_reason, rejection_notes, escalation_reason } = selectedApp;
  const isClosed = status === 'Approved' || status === 'Rejected';
  const badgeCfg = STATUS_BADGE[status] ?? STATUS_BADGE['Pending'];
  const busy     = isActing || localBusy;

  function reset() {
    setActionState('idle');
    setRejectionReason('');
    setRejectionNotes('');
    setEscalationReason('');
    setConfirmingApprove(false);
    setLocalBusy(false);
  }

  // ─── Async handlers — wait for DB acknowledgement before mutating UI ─────

  async function handleApprove() {
    if (!confirmingApprove) { setConfirmingApprove(true); return; }
    setLocalBusy(true);
    await approveApp(id);   // isActing held true during the entire network round-trip
    reset();                // called after API responds (or after alert on error)
  }

  async function handleReject() {
    if (!rejectionReason || !rejectionNotes.trim()) return;
    setLocalBusy(true);
    await rejectApp(id, rejectionReason, rejectionNotes.trim());
    reset();
  }

  async function handleEscalate() {
    if (!escalationReason.trim()) return;
    setLocalBusy(true);
    await escalateApp(id, escalationReason.trim());
    reset();
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-3">
      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Decision</p>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          <Badge variant={badgeCfg.variant} appearance="light" size="sm">{badgeCfg.label}</Badge>
        </div>
      </div>

      {/* ─── Closed state ─────────────────────────────────────────────── */}
      {isClosed ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          {status === 'Approved' && (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="size-4" />
              <span className="text-sm font-medium">This application has been approved.</span>
            </div>
          )}
          {status === 'Rejected' && (
            <div>
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="size-4" />
                <span className="text-sm font-medium">Rejected — {rejection_reason}</span>
              </div>
              {rejection_notes && (
                <p className="mt-1 text-[11px] text-muted-foreground">{rejection_notes}</p>
              )}
            </div>
          )}
        </div>

      ) : actionState === 'idle' ? (
        /* ─── Normal action row ─────────────────────────────────────────── */
        <div className="flex items-center gap-2">
          {confirmingApprove ? (
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
              <CheckCircle className="size-4 text-green-600" />
              <span className="flex-1 text-xs text-green-800 dark:text-green-300">
                Confirm approval? This action is permanent.
              </span>
              <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                {busy ? 'Syncing…' : 'Confirm Approve'}
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline" size="md"
                className="flex-1 border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                onClick={handleApprove}
                disabled={busy || status === 'Escalated'}
              >
                <CheckCircle className="size-4" /> Approve
              </Button>
              <Button
                variant="outline" size="md"
                className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                onClick={() => setActionState('escalating')}
                disabled={busy || status === 'Escalated'}
              >
                <AlertTriangle className="size-4" /> Escalate
              </Button>
              <Button
                variant="outline" size="md"
                className="flex-1 border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => setActionState('rejecting')}
                disabled={busy}
              >
                <XCircle className="size-4" /> Reject
              </Button>
            </>
          )}
        </div>

      ) : actionState === 'rejecting' ? (
        /* ─── Reject flow ────────────────────────────────────────────────── */
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 shrink-0 text-destructive" />
            <span className="text-xs font-semibold text-destructive">Reject Application</span>
          </div>

          <Select value={rejectionReason} onValueChange={setRejectionReason}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Select rejection reason…" />
            </SelectTrigger>
            <SelectContent>
              {REJECTION_REASONS.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <textarea
            value={rejectionNotes}
            onChange={e => setRejectionNotes(e.target.value)}
            placeholder="Add auditor notes (required)…"
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
            <Button
              variant="destructive" size="sm"
              onClick={handleReject}
              disabled={!rejectionReason || !rejectionNotes.trim() || busy}
            >
              {busy ? <><Loader2 className="size-3 animate-spin" /> Syncing…</> : 'Confirm Reject'}
            </Button>
          </div>
        </div>

      ) : (
        /* ─── Escalate flow ──────────────────────────────────────────────── */
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <AlertOctagon className="size-4 shrink-0 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Escalate for Review</span>
          </div>

          <textarea
            value={escalationReason}
            onChange={e => setEscalationReason(e.target.value)}
            placeholder="Describe the reason for escalation…"
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
            <Button
              variant="outline" size="sm"
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
              onClick={handleEscalate}
              disabled={!escalationReason.trim() || busy}
            >
              {busy ? <><Loader2 className="size-3 animate-spin" /> Syncing…</> : 'Confirm Escalate'}
            </Button>
          </div>
        </div>
      )}

      {/* Escalation context */}
      {status === 'Escalated' && actionState === 'idle' && escalation_reason && (
        <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-amber-600" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Escalation Reason</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">{escalation_reason}</p>
        </div>
      )}
    </div>
  );
}
