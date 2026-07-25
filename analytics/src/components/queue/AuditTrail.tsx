import { CheckCircle, AlertTriangle, XCircle, AlertOctagon, User, Send, Bot, RefreshCcw, Flag, MessageSquare } from 'lucide-react';
import { useAdmin } from '@/context/AdminDataProvider';
import { formatDateTime } from '@/lib/utils';
import type { AuditEntry, AuditEventType } from '@/types/kyc';
import { cn } from '@/lib/utils';

// ─── Event icon config ────────────────────────────────────────────────────────

type EventCfg = {
  icon:    React.FC<{ className?: string }>;
  color:   string;
  bg:      string;
};

const EVENT_CFG: Record<AuditEventType, EventCfg> = {
  submitted:          { icon: Send,         color: 'text-blue-600',   bg: 'bg-blue-100 dark:bg-blue-950' },
  pre_check_started:  { icon: Bot,          color: 'text-muted-foreground', bg: 'bg-muted' },
  pre_check_passed:   { icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-100 dark:bg-green-950' },
  pre_check_failed:   { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950' },
  assigned:           { icon: User,         color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-950' },
  document_flagged:   { icon: Flag,         color: 'text-amber-600',  bg: 'bg-amber-100 dark:bg-amber-950' },
  approved:           { icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-100 dark:bg-green-950' },
  rejected:           { icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-100 dark:bg-red-950' },
  escalated:          { icon: AlertOctagon, color: 'text-amber-600',  bg: 'bg-amber-100 dark:bg-amber-950' },
  comment:            { icon: MessageSquare, color: 'text-muted-foreground', bg: 'bg-muted' },
  reopened:           { icon: RefreshCcw,   color: 'text-blue-600',   bg: 'bg-blue-100 dark:bg-blue-950' },
};

// ─── Single entry ─────────────────────────────────────────────────────────────

function AuditRow({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const cfg = EVENT_CFG[entry.event_type] ?? EVENT_CFG.comment;
  const Icon = cfg.icon;

  return (
    <div className="flex gap-2.5">
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', cfg.bg)}>
          <Icon className={cn('size-3', cfg.color)} />
        </div>
        {!isLast && <div className="mt-0.5 w-px flex-1 bg-border" />}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-1 pb-3', isLast ? 'pb-0' : '')}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-semibold text-foreground">{entry.title}</p>
          <p className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(entry.timestamp)}</p>
        </div>
        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
          {entry.actor}
          {entry.actor_type === 'system' && (
            <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
              system
            </span>
          )}
        </p>
        {entry.detail && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{entry.detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AuditTrail() {
  const { selectedApp } = useAdmin();

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px] text-muted-foreground">No application selected</p>
      </div>
    );
  }

  const entries = [...selectedApp.audit_trail].reverse();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Audit Trail
        </span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {entries.length}
        </span>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {entries.length === 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">No audit entries yet</p>
        ) : (
          <div className="space-y-0">
            {entries.map((entry, i) => (
              <AuditRow key={entry.id} entry={entry} isLast={i === entries.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
