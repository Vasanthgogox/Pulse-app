import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { COMMERCE_SETUP_STEPS } from '@/lib/commerce-setup';
import { useOrganization } from '@/context/OrganizationProvider';
import { cn } from '@/lib/utils';

/** In-dashboard Commerce configuration guide — not platform org onboarding. */
export function CommerceSetupChecklist() {
  const org = useOrganization();

  if (!org.hasPlatformOrganization || org.commerceSetupComplete) {
    return null;
  }

  const counts = {
    warehouses: org.warehouses.length,
    products: org.products.length,
    customers: org.customers.length,
  };

  return (
    <section className="rounded-lg border border-[var(--pulse-brand-soft)] bg-[var(--pulse-brand-soft)]/20 p-4 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Configure Commerce</h2>
          <p className="text-2xs text-muted-foreground mt-0.5 max-w-xl">
            Your Pulse organization is ready. Add warehouses, products, and consignees to start creating orders.
          </p>
        </div>
        <Link
          to="/onboarding"
          className="text-2xs font-medium text-[var(--pulse-hero-blue)] hover:underline shrink-0"
        >
          Open setup wizard →
        </Link>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        {COMMERCE_SETUP_STEPS.map((step) => {
          const done = counts[step.doneKey] > 0;
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2.5 text-2sm transition-colors',
                  done
                    ? 'border-border/60 bg-card/80 text-muted-foreground'
                    : 'border-border bg-card hover:bg-[var(--pulse-brand-soft)]/30',
                )}
              >
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
                <span className="min-w-0 flex-1">{step.label}</span>
                {!done && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
