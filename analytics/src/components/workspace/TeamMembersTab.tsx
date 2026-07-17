import { useState } from 'react';
import { RefreshCcw, UserX, LogIn, UserCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/context/AdminDataProvider';
import { adminApi, ApiNotConfiguredError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { OrgUser, UserRole, UserStatus } from '@/types/admin';

// ─── Badge configs ────────────────────────────────────────────────────────────

const ROLE_VARIANT: Record<UserRole, 'primary' | 'info' | 'secondary'> = {
  Owner:  'primary',
  Admin:  'info',
  Member: 'secondary',
};

const STATUS_VARIANT: Record<UserStatus, 'success' | 'destructive' | 'warning'> = {
  Active:    'success',
  Suspended: 'destructive',
  Invited:   'warning',
};

// ─── Impersonate toast ────────────────────────────────────────────────────────

function ImpersonateToast({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <LogIn className="size-4 text-primary" />
      <span className="text-sm text-foreground">Impersonating <strong>{name}</strong> (simulated)</span>
      <button onClick={onClose} className="ml-2 text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({
  user, orgId, onImpersonate,
}: { user: OrgUser; orgId: string; onImpersonate: (name: string) => void }) {
  const { suspendUser } = useAdmin();
  const [resetting,    setResetting]    = useState(false);
  const [suspending,   setSuspending]   = useState(false);

  const isSuspended = user.status === 'Suspended';
  const isInvited   = user.status === 'Invited';

  // Wire to real API; ApiNotConfiguredError → silent mock success
  async function handle2FAClick() {
    if (resetting) return;
    setResetting(true);
    try {
      await adminApi.resetUser2FA(orgId, user.id);
    } catch (e) {
      if (!(e instanceof ApiNotConfiguredError)) {
        alert(`2FA reset failed: ${(e as Error).message}`);
      }
      // mock mode: fall through silently — the spinner already signals success
    } finally {
      setResetting(false);
    }
  }

  // Wait for DB acknowledgement before UI reflects the status change
  async function handleSuspendToggle() {
    if (suspending) return;
    setSuspending(true);
    try {
      await suspendUser(orgId, user.id);
    } finally {
      setSuspending(false);
    }
  }

  return (
    <tr className="border-b border-border/60 transition-colors hover:bg-muted/30">
      {/* Avatar + name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-foreground leading-tight">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-3 py-2.5">
        <Badge variant={ROLE_VARIANT[user.role]} appearance="light" size="sm">
          {user.role}
        </Badge>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <Badge variant={STATUS_VARIANT[user.status]} appearance="light" size="sm">
          {user.status}
        </Badge>
      </td>

      {/* Last login */}
      <td className="px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {user.lastLogin ? formatDateTime(user.lastLogin) : '—'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {/* Reset 2FA */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-[11px]"
            onClick={handle2FAClick}
            disabled={isInvited || resetting}
            title="Reset 2FA"
          >
            {resetting
              ? <><Loader2 className="size-3 animate-spin" /> Sending…</>
              : <><RefreshCcw className="size-3" /> Reset 2FA</>}
          </Button>

          {/* Impersonate */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-[11px]"
            onClick={() => onImpersonate(user.name)}
            disabled={isInvited || isSuspended}
            title="Impersonate user"
          >
            <LogIn className="size-3" />
            Impersonate
          </Button>

          {/* Suspend / Restore */}
          {user.role !== 'Owner' && (
            <Button
              variant="outline"
              size="sm"
              className={`gap-1 text-[11px] ${isSuspended
                ? 'border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400'
                : 'border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400'}`}
              onClick={handleSuspendToggle}
              disabled={suspending}
              title={isSuspended ? 'Restore access' : 'Suspend user'}
            >
              {suspending
                ? <><Loader2 className="size-3 animate-spin" /> Syncing…</>
                : isSuspended
                  ? <><UserCheck className="size-3" /> Restore</>
                  : <><UserX className="size-3" /> Suspend</>}
            </Button>
          )}

          {user.role === 'Owner' && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Protected
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamMembersTab() {
  const { selectedApp } = useAdmin();
  const [impersonating, setImpersonating] = useState<string | null>(null);

  if (!selectedApp) return null;

  const { id, users, billing_tier } = selectedApp;
  const activeCount    = users.filter(u => u.status === 'Active').length;
  const suspendedCount = users.filter(u => u.status === 'Suspended').length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Stats strip */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2.5 bg-muted/20">
        <span className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{users.length}</span> total members
        </span>
        <span className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-green-600">{activeCount}</span> active
        </span>
        {suspendedCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-destructive">{suspendedCount}</span> suspended
          </span>
        )}
        <span className="ml-auto">
          <Badge
            variant={billing_tier === 'Enterprise' ? 'primary' : billing_tier === 'Growth' ? 'info' : 'secondary'}
            appearance="light"
            size="sm"
          >
            {billing_tier}
          </Badge>
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {users.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No team members yet</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 border-b border-border bg-card">
              <tr>
                {['Member', 'Role', 'Status', 'Last Login', 'Actions'].map(col => (
                  <th key={col} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  orgId={id}
                  onImpersonate={name => setImpersonating(name)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast */}
      {impersonating && (
        <ImpersonateToast name={impersonating} onClose={() => setImpersonating(null)} />
      )}
    </div>
  );
}
