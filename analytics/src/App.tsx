import { useState } from 'react';
import { Shield, Moon, Sun, ChevronRightSquare, Coins, Users, SlidersHorizontal, Rocket, UserRound } from 'lucide-react';
import { AdminDataProvider, useAdmin } from '@/context/AdminDataProvider';
import { ApplicationQueue } from '@/components/queue/ApplicationQueue';
import { AuditTrail } from '@/components/queue/AuditTrail';
import { OrgWorkspace } from '@/components/workspace/OrgWorkspace';
import { DriverKycPanel } from '@/components/queue/DriverKycPanel';
import { VerificationActionPanel } from '@/components/workspace/VerificationActionPanel';
import { CreditsPanel } from '@/components/credits/CreditsPanel';
import { ReferralsPanel } from '@/components/growth/ReferralsPanel';
import { RewardRulesPanel } from '@/components/growth/RewardRulesPanel';
import { BoostControlCenterPanel } from '@/components/growth/BoostControlCenterPanel';
import { Badge } from '@/components/ui/badge';
import { supabaseConfigError } from '@/lib/supabase';

type ConsoleView = 'verification' | 'driver-kyc' | 'credits' | 'referrals' | 'reward-rules' | 'boost-ops';

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({
  dark,
  setDark,
  view,
  setView,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  view: ConsoleView;
  setView: (v: ConsoleView) => void;
}) {
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

        <nav className="ml-4 flex items-center gap-1 border-l border-border pl-4">
          <button
            onClick={() => setView('verification')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'verification' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            Verification
          </button>
          <button
            onClick={() => setView('driver-kyc')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'driver-kyc' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <UserRound className="size-3" /> Driver KYC
          </button>
          <button
            onClick={() => setView('credits')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'credits' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Coins className="size-3" /> Growth · Credits
          </button>
          <button
            onClick={() => setView('referrals')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'referrals' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Users className="size-3" /> Growth · Referrals
          </button>
          <button
            onClick={() => setView('reward-rules')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'reward-rules' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <SlidersHorizontal className="size-3" /> Growth · Reward Rules
          </button>
          <button
            onClick={() => setView('boost-ops')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'boost-ops' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Rocket className="size-3" /> Boost · Control Center
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {view === 'verification' && escalatedCount > 0 && (
          <Badge variant="destructive" appearance="light" size="sm">{escalatedCount} escalated</Badge>
        )}
        {view === 'verification' && (
          <Badge variant="warning" appearance="light" size="sm">{pendingCount} pending</Badge>
        )}
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
  const [view, setView] = useState<ConsoleView>('verification');

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Topbar dark={dark} setDark={setDark} view={view} setView={setView} />

        {view === 'driver-kyc' ? (
          <DriverKycPanel />
        ) : view === 'credits' ? (
          <CreditsPanel />
        ) : view === 'referrals' ? (
          <ReferralsPanel />
        ) : view === 'reward-rules' ? (
          <RewardRulesPanel />
        ) : view === 'boost-ops' ? (
          <BoostControlCenterPanel />
        ) : (
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
        )}
      </div>
    </div>
  );
}

export default function App() {
  if (supabaseConfigError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-lg space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <h1 className="text-sm font-bold">Admin Console — config required</h1>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{supabaseConfigError}</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
            <li>
              Open Supabase Dashboard → Project Settings → API
            </li>
            <li>
              Copy the <span className="font-semibold text-foreground">service_role</span> secret
              into repo-root <code className="rounded bg-muted px-1">.env</code> as{" "}
              <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY=...</code>
            </li>
            <li>
              Restart analytics:{" "}
              <code className="rounded bg-muted px-1">npm run dev</code> in{" "}
              <code className="rounded bg-muted px-1">analytics/</code>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <AdminDataProvider>
      <AdminShell />
    </AdminDataProvider>
  );
}
