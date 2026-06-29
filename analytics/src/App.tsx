import { useState } from 'react';
import { Shield, Moon, Sun, ChevronRightSquare } from 'lucide-react';
import { AdminDataProvider, useAdmin } from '@/context/AdminDataProvider';
import { ApplicationQueue } from '@/components/queue/ApplicationQueue';
import { AuditTrail } from '@/components/queue/AuditTrail';
import { OrgWorkspace } from '@/components/workspace/OrgWorkspace';
import { VerificationActionPanel } from '@/components/workspace/VerificationActionPanel';
import { Badge } from '@/components/ui/badge';

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  const { applications } = useAdmin();
  const pendingCount   = applications.filter(a => ['Pending', 'Under Review'].includes(a.status)).length;
  const escalatedCount = applications.filter(a => a.status === 'Escalated').length;

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
          <Shield className="size-3.5 text-primary-foreground" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-foreground">Admin Console</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Org &amp; User Management
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {escalatedCount > 0 && (
          <Badge variant="destructive" appearance="light" size="sm">{escalatedCount} escalated</Badge>
        )}
        <Badge variant="warning" appearance="light" size="sm">{pendingCount} pending</Badge>
        <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          INTERNAL
        </span>
        <button
          onClick={() => setDark(!dark)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        >
          {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
      </div>
    </header>
  );
}

// ─── Selected org strip ───────────────────────────────────────────────────────

function OrgStrip() {
  const { selectedApp } = useAdmin();
  if (!selectedApp) return null;

  const { id, company_name, entity_type, submission_date, assigned_to, status, billing_tier } = selectedApp;

  const statusVariant: Record<string, 'info' | 'warning' | 'destructive' | 'success' | 'secondary'> = {
    Pending: 'info', 'Under Review': 'warning', Escalated: 'destructive', Approved: 'success', Rejected: 'secondary',
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
      <ChevronRightSquare className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
      <span className="text-[11px] text-muted-foreground">·</span>
      <span className="truncate text-[12px] font-semibold text-foreground">{company_name}</span>
      <span className="text-[11px] text-muted-foreground shrink-0">({entity_type})</span>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {new Date(submission_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[10px] text-muted-foreground">· {assigned_to}</span>
        <Badge
          variant={billing_tier === 'Enterprise' ? 'primary' : billing_tier === 'Growth' ? 'info' : 'secondary'}
          appearance="light"
          size="xs"
        >
          {billing_tier}
        </Badge>
        <Badge variant={statusVariant[status] ?? 'secondary'} appearance="light" size="sm">
          {status}
        </Badge>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function AdminShell() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Topbar dark={dark} setDark={setDark} />

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar: queue (60%) + audit (40%) */}
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border">
            <div className="flex-[3] overflow-hidden border-b border-border">
              <ApplicationQueue />
            </div>
            <div className="flex-[2] overflow-hidden">
              <AuditTrail />
            </div>
          </aside>

          {/* Main content */}
          <main className="flex flex-1 flex-col overflow-hidden">
            <OrgStrip />
            {/* 3-tab workspace */}
            <div className="flex-1 overflow-hidden">
              <OrgWorkspace />
            </div>
            {/* KYC action panel — always visible */}
            <VerificationActionPanel />
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AdminDataProvider>
      <AdminShell />
    </AdminDataProvider>
  );
}
