import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, AlertOctagon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAdmin } from '@/context/AdminDataProvider';
import { REJECTION_REASONS, APPROVAL_QUICK_NOTES } from '@/types/admin';

type ActionState = 'idle' | 'approving' | 'rejecting' | 'escalating';

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
  const [approvalNotes,    setApprovalNotes]    = useState('');
  const [rejectionReason,  setRejectionReason]  = useState('');
  const [rejectionNotes,   setRejectionNotes]   = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [localBusy, setLocalBusy] = useState(false);   // per-panel inflight indicator

  if (!selectedApp) return null;

  const { id, status, rejection_reason, rejection_notes, escalation_reason, approval_notes } = selectedApp;
  const isClosed = status === 'Approved' || status === 'Rejected';
  const badgeCfg = STATUS_BADGE[status] ?? STATUS_BADGE['Pending'];
  const busy     = isActing || localBusy;

  function reset() {
    setActionState('idle');
    setApprovalNotes('');
    setRejectionReason('');
    setRejectionNotes('');
    setEscalationReason('');
    setLocalBusy(false);
  }

  // ─── Async handlers — wait for DB acknowledgement before mutating UI ─────

  async function handleApprove() {
    setLocalBusy(true);
    try {
      await approveApp(id, approvalNotes.trim() || undefined);
      reset();
    } catch {
      setLocalBusy(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason || !rejectionNotes.trim()) return;
    setLocalBusy(true);
    try {
      await rejectApp(id, rejectionReason, rejectionNotes.trim());
      reset();
    } catch {
      setLocalBusy(false);
    }
  }

  async function handleEscalate() {
    if (!escalationReason.trim()) return;
    setLocalBusy(true);
    try {
      await escalateApp(id, escalationReason.trim());
      reset();
    } catch {
      setLocalBusy(false);
    }
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
            <div>
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="size-4" />
                <span className="text-sm font-medium">This application has been approved.</span>
              </div>
              {approval_notes && (
                <p className="mt-1 text-[11px] text-muted-foreground">{approval_notes}</p>
              )}
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

      ) : (
        /* ─── Normal action row ─────────────────────────────────────────── */
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="md"
            className="flex-1 border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
            onClick={() => setActionState('approving')}
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
        </div>
      )}

      {/* ─── Approve dialog ────────────────────────────────────────────── */}
      <Dialog open={actionState === 'approving'} onOpenChange={open => !open && !busy && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <CheckCircle className="size-4 text-green-600" />
              Approve Application
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {APPROVAL_QUICK_NOTES.map(note => (
                <button
                  key={note}
                  type="button"
                  onClick={() => setApprovalNotes(note)}
                  className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-green-400 hover:text-green-700 dark:hover:text-green-400"
                >
                  {note}
                </button>
              ))}
            </div>

            <textarea
              value={approvalNotes}
              onChange={e => setApprovalNotes(e.target.value)}
              placeholder="Add a remark (optional)…"
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
            <Button
              variant="primary" size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={busy}
            >
              {busy ? <><Loader2 className="size-3 animate-spin" /> Syncing…</> : 'Confirm Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reject dialog ─────────────────────────────────────────────── */}
      <Dialog open={actionState === 'rejecting'} onOpenChange={open => !open && !busy && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <XCircle className="size-4 text-destructive" />
              Reject Application
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 space-y-2.5">
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
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
            <Button
              variant="destructive" size="sm"
              onClick={handleReject}
              disabled={!rejectionReason || !rejectionNotes.trim() || busy}
            >
              {busy ? <><Loader2 className="size-3 animate-spin" /> Syncing…</> : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Escalate dialog ───────────────────────────────────────────── */}
      <Dialog open={actionState === 'escalating'} onOpenChange={open => !open && !busy && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <AlertOctagon className="size-4 text-amber-600" />
              Escalate for Review
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3">
            <textarea
              value={escalationReason}
              onChange={e => setEscalationReason(e.target.value)}
              placeholder="Describe the reason for escalation…"
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
            <Button
              variant="outline" size="sm"
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
              onClick={handleEscalate}
              disabled={!escalationReason.trim() || busy}
            >
              {busy ? <><Loader2 className="size-3 animate-spin" /> Syncing…</> : 'Confirm Escalate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
