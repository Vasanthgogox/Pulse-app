import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/context/AdminDataProvider';
import { cn } from '@/lib/utils';
import type { UsageMetric, FeatureFlag, BillingTier } from '@/types/admin';

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

// ─── Usage metric row ─────────────────────────────────────────────────────────

function MetricRow({ metric }: { metric: UsageMetric }) {
  const barColor = metric.variant === 'danger'
    ? 'bg-destructive'
    : metric.variant === 'warning'
    ? 'bg-amber-500'
    : 'bg-primary';

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{metric.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{metric.detail}</span>
          {metric.variant !== 'default' && (
            <Badge
              variant={metric.variant === 'danger' ? 'destructive' : 'warning'}
              appearance="light"
              size="xs"
            >
              {metric.variant === 'danger' ? 'Critical' : 'High'}
            </Badge>
          )}
          <span className="min-w-[32px] text-right text-[11px] font-semibold text-foreground">
            {metric.pct}%
          </span>
        </div>
      </div>
      <Progress
        value={metric.pct}
        className="h-2"
        indicatorClassName={barColor}
      />
    </div>
  );
}

// ─── Feature flag row ─────────────────────────────────────────────────────────

function FlagRow({ flag, orgId }: { flag: FeatureFlag; orgId: string }) {
  const { toggleFeatureFlag } = useAdmin();
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-semibold text-foreground">{flag.label}</p>
          {flag.enabled && (
            <Badge variant="success" appearance="light" size="xs">On</Badge>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{flag.description}</p>
      </div>
      <Toggle
        checked={flag.enabled}
        onChange={() => toggleFeatureFlag(orgId, flag.id)}
      />
    </div>
  );
}

// ─── Billing tier card ────────────────────────────────────────────────────────

const TIER_COLOR: Record<BillingTier, string> = {
  Starter:    'border-l-secondary bg-muted/30',
  Growth:     'border-l-blue-400 bg-blue-50/30 dark:bg-blue-950/20',
  Enterprise: 'border-l-violet-400 bg-violet-50/30 dark:bg-violet-950/20',
};

const TIER_LIMITS_DISPLAY: Record<BillingTier, string[]> = {
  Starter:    ['1,000 API calls/mo', '500 transactions/mo', '5 GB storage', '3 team seats'],
  Growth:     ['10,000 API calls/mo', '5,000 transactions/mo', '50 GB storage', '10 team seats'],
  Enterprise: ['100,000 API calls/mo', 'Unlimited transactions', '500 GB storage', 'Unlimited seats'],
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export function UsageGovernanceTab() {
  const { selectedApp } = useAdmin();
  if (!selectedApp) return null;

  const { id, billing_tier, usage_metrics, feature_flags } = selectedApp;

  return (
    <div className="flex h-full flex-col gap-0 overflow-y-auto">
      <div className="grid grid-cols-1 gap-0 divide-y divide-border xl:grid-cols-2 xl:divide-x xl:divide-y-0">

        {/* ─── Left: Usage metrics ─────────────────────────────────── */}
        <div className="px-4 py-4">
          <div className="mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Resource Usage
            </h3>
          </div>

          {/* Billing tier banner */}
          <div className={cn('mb-4 rounded-lg border-l-4 px-3 py-2.5', TIER_COLOR[billing_tier])}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Current Plan
                </p>
                <p className="text-sm font-semibold text-foreground">{billing_tier}</p>
              </div>
              <Badge
                variant={billing_tier === 'Enterprise' ? 'primary' : billing_tier === 'Growth' ? 'info' : 'secondary'}
                appearance="light"
                size="md"
              >
                {billing_tier}
              </Badge>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {TIER_LIMITS_DISPLAY[billing_tier].map(l => (
                <li key={l} className="text-[10px] text-muted-foreground">· {l}</li>
              ))}
            </ul>
          </div>

          {/* Metric bars */}
          <div className="divide-y divide-border/50">
            {usage_metrics.map(m => (
              <MetricRow key={m.id} metric={m} />
            ))}
          </div>
        </div>

        {/* ─── Right: Feature flags ─────────────────────────────────── */}
        <div className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Feature Flags
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {feature_flags.filter(f => f.enabled).length} / {feature_flags.length} enabled
            </span>
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Changes take effect immediately. Use with caution — some flags bypass safety controls.
          </p>

          <div className="divide-y divide-border/50">
            {feature_flags.map(flag => (
              <FlagRow key={flag.id} flag={flag} orgId={id} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
