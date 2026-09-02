import { useEffect, useState } from 'react';
import { Shield, Moon, Sun, ChevronRightSquare, Coins, Users, SlidersHorizontal, Rocket, Ticket, UserRound, LogOut, Loader2, UserCog } from 'lucide-react';
import { AdminDataProvider, useAdmin } from '@/context/AdminDataProvider';
import { AdminAuthProvider, useAdminAuth } from '@/context/AdminAuthProvider';
import { AdminLoginScreen } from '@/components/auth/AdminLoginScreen';
import { ApplicationQueue } from '@/components/queue/ApplicationQueue';
import { AuditTrail } from '@/components/queue/AuditTrail';
import { OrgWorkspace } from '@/components/workspace/OrgWorkspace';
import { DriverKycPanel } from '@/components/queue/DriverKycPanel';
import { VerificationActionPanel } from '@/components/workspace/VerificationActionPanel';
import { CreditsPanel } from '@/components/credits/CreditsPanel';
import { ReferralsPanel } from '@/components/growth/ReferralsPanel';
import { RewardRulesPanel } from '@/components/growth/RewardRulesPanel';
import { BoostControlCenterPanel } from '@/components/growth/BoostControlCenterPanel';
import { SupportPanel } from '@/components/support/SupportPanel';
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel';
import { Badge } from '@/components/ui/badge';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { supabaseAuthConfigError } from '@/lib/supabaseAuth';
import {
  countSupportTicketsNeedingAgentAttention,
  fetchAllSupportTickets,
  formatSupportUnreadBadge,
} from '@/lib/supportTickets';

type ConsoleView =
  | 'verification'
  | 'driver-kyc'
  | 'credits'
  | 'referrals'
  | 'reward-rules'
  | 'boost-ops'
  | 'support'
  | 'admin-users';

function navTabClass(active: boolean) {
  return `inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[#00A884] text-white'
      : 'text-muted-foreground hover:bg-[#00A884]/12 hover:text-[#075E54]'
  }`;
}

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
  const { permissions } = useAdminAuth();
  const canManageAdmins = permissions.includes('platform_admin.manage');
  const pendingCount   = applications.filter(a => ['Pending', 'Under Review'].includes(a.status)).length;
  const escalatedCount = applications.filter(a => a.status === 'Escalated').length;
  const [supportUpdateCount, setSupportUpdateCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await fetchAllSupportTickets();
      if (!cancelled) setSupportUpdateCount(countSupportTicketsNeedingAgentAttention(rows));
    };
    void refresh();
    const channel = supabase
      .channel('support-nav-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-sm shadow-xs">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#00A884]">
          <Shield className="size-3.5 text-primary-foreground" />
        </div>
        <div className="hidden shrink-0 items-baseline gap-2 sm:flex">
          <span className="text-sm font-bold text-foreground">Admin Console</span>
          <span className="hidden text-[10px] font-medium uppercase tracking-widest text-muted-foreground xl:inline">
            Org &amp; User Management
          </span>
        </div>

        <nav className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto border-l border-border pl-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setView('verification')}
            className={navTabClass(view === 'verification')}
          >
            Verification
          </button>
          <button
            onClick={() => setView('driver-kyc')}
            className={navTabClass(view === 'driver-kyc')}
          >
            <UserRound className="size-3 shrink-0" /> Driver KYC
          </button>
          <button
            onClick={() => setView('credits')}
            className={navTabClass(view === 'credits')}
          >
            <Coins className="size-3 shrink-0" /> Growth · Credits
          </button>
          <button
            onClick={() => setView('referrals')}
            className={navTabClass(view === 'referrals')}
          >
            <Users className="size-3 shrink-0" /> Growth · Referrals
          </button>
          <button
            onClick={() => setView('reward-rules')}
            className={navTabClass(view === 'reward-rules')}
          >
            <SlidersHorizontal className="size-3 shrink-0" /> Growth · Reward Rules
          </button>
          <button
            onClick={() => setView('boost-ops')}
            className={navTabClass(view === 'boost-ops')}
          >
            <Rocket className="size-3 shrink-0" /> Boost · Control Center
          </button>
          <button
            onClick={() => setView('support')}
            className={navTabClass(view === 'support')}
          >
            <Ticket className="size-3 shrink-0" /> Support
            {supportUpdateCount > 0 ? (
              <span className="inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                {formatSupportUnreadBadge(supportUpdateCount)}
              </span>
            ) : null}
          </button>
          {canManageAdmins ? (
            <button
              onClick={() => setView('admin-users')}
              className={navTabClass(view === 'admin-users')}
            >
              <UserCog className="size-3 shrink-0" /> Admin Users
            </button>
          ) : null}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {view === 'verification' && escalatedCount > 0 && (
          <Badge variant="destructive" appearance="light" size="sm">{escalatedCount} escalated</Badge>
        )}
        {view === 'verification' && (
          <Badge variant="warning" appearance="light" size="sm">{pendingCount} pending</Badge>
        )}
        {view === 'support' && supportUpdateCount > 0 && (
          <Badge variant="warning" appearance="light" size="sm">
            {supportUpdateCount} support update{supportUpdateCount === 1 ? '' : 's'}
          </Badge>
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
        <AdminSessionBadge />
      </div>
    </header>
  );
}

function AdminSessionBadge() {
  const { session, signOut } = useAdminAuth();
  if (!session) return null;
  return (
    <button
      onClick={() => void signOut()}
      title={session.user.email ?? undefined}
      className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent"
    >
      <LogOut className="size-3.5" />
    </button>
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
        ) : view === 'support' ? (
          <SupportPanel />
        ) : view === 'admin-users' ? (
          <AdminUsersPanel />
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

// ─── Admin Console auth gate (S3a) ─────────────────────────────────────────────
// Authentication only: decides whether the console renders at all. Does not decide what any
// panel is allowed to do once inside — every panel keeps its existing service-role data path
// unchanged (see docs/SUPPORT_S3A_IMPLEMENTATION_PLAN.md).

function AdminGate() {
  const { status, signOut } = useAdminAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (status === 'signed_out') {
    return <AdminLoginScreen />;
  }

  if (status === 'signed_in_not_provisioned') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <h1 className="text-sm font-bold">Admin Console access not set up</h1>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            You're signed in, but this account isn't provisioned as an Admin Console user yet.
            Ask an existing platform admin to grant you access.
          </p>
          <button
            onClick={() => void signOut()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Sign out
          </button>
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

  if (supabaseAuthConfigError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-lg space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <h1 className="text-sm font-bold">Admin Console — login config required</h1>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{supabaseAuthConfigError}</p>
        </div>
      </div>
    );
  }

  return (
    <AdminAuthProvider>
      <AdminGate />
    </AdminAuthProvider>
  );
}
