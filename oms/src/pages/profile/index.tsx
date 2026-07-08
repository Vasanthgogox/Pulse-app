import { Link } from 'react-router-dom';
import { Building2, Mail, Phone, Settings, Shield } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { Button } from '@/components/ui/button';
import { useUserProfile } from '@/hooks/useUserProfile';

export function ProfilePage() {
  const {
    displayName,
    email,
    phone,
    role,
    organizationName,
    isLoading,
  } = useUserProfile();

  if (isLoading) {
    return (
      <div className="container-fluid py-12 text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="container-fluid pb-8">
      <PageToolbar title="Profile" breadcrumb={['Pulse Platform', 'Commerce', 'Profile']} showDate={false} />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-card p-5 flex flex-col items-center text-center">
          <UserAvatar size="lg" showRing className="mb-3" />
          <h2 className="text-base font-semibold">{displayName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
          {role && (
            <span className="mt-3 inline-flex items-center rounded-full bg-[var(--pulse-brand-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--pulse-hero-blue)]">
              {role.replace(/_/g, ' ')}
            </span>
          )}
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link to="/settings">
              <Settings className="size-3.5" />
              Account settings
            </Link>
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-medium">Account details</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shared Pulse Identity — managed across Core and Commerce.
            </p>
          </div>
          <dl className="divide-y divide-border">
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="text-sm font-medium truncate">{email || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="text-sm font-medium">{phone?.trim() || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Building2 className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Organization</dt>
                <dd className="text-sm font-medium">{organizationName}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-3.5">
              <Shield className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className="text-sm font-medium capitalize">{role?.replace(/_/g, ' ') ?? '—'}</dd>
              </div>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
