import { Webhook, KeyRound, Bell, Shield, Bot } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { gatewayPath } from '@/lib/platform-gateway';
import { PULSE_AI_AGENTS } from '@/types/ai-agents';
import { ORDER_SOURCE_CONNECTORS } from '@/types/order-sources';
import { LottieIcon } from '@/components/pulse-ui';

export function SettingsPage() {
  const { tenant, identity } = useCommerce();
  const { profile } = useOrganization();

  const SECTIONS = [
    {
      icon: Webhook,
      title: 'Pulse Gateway',
      description: 'Commerce sends commands only — POST /execution-plans via Gateway. Never writes Execution DB.',
      fields: [
        { label: 'Gateway base', value: '/api/gateway/v1' },
        { label: 'Execution route', value: gatewayPath('execution', '/execution-plans') },
        { label: 'Event envelope', value: 'v1 (eventName, eventVersion, correlationId)' },
      ],
    },
    {
      icon: Shield,
      title: 'Pulse Identity',
      description: 'Organization → Branches → Warehouses → Users → Roles → Invite Team.',
      fields: [
        { label: 'Organization', value: profile?.name ?? 'Not configured' },
        { label: 'Organization ID', value: profile?.id ?? tenant.organizationId },
        { label: 'Identity service', value: gatewayPath('identity', '/me') },
      ],
    },
    {
      icon: KeyRound,
      title: 'Order sources',
      description: 'All sources produce the same canonical SalesOrder.',
      fields: ORDER_SOURCE_CONNECTORS.map(c => ({
        label: c.label,
        value: c.connected ? 'Connected' : c.enabled ? 'Available' : 'Coming soon',
      })),
    },
    {
      icon: Bell,
      title: 'Notifications',
      description: 'Alerts for plan publish failures, low stock, and versioned domain events.',
      fields: [
        { label: 'ExecutionPlanPublished v1', value: 'Enabled' },
        { label: 'Low stock threshold alerts', value: 'Enabled' },
      ],
    },
  ];

  return (
    <div className="container-fluid">
      <PageToolbar title="Settings" showDate={false} />

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-2 mb-5 text-2xs text-muted-foreground font-mono flex flex-wrap gap-x-6">
        <span>tenant: {tenant.tenantId}</span>
        <span>org: {profile?.id ?? tenant.organizationId}</span>
        <span>user: {identity.user.email}</span>
      </div>

      {SECTIONS.map(section => (
        <div key={section.title} className="rounded-xl border border-border bg-card overflow-hidden mb-4 shadow-none">
          <div className="border-b border-border px-5 py-4 flex items-start gap-3">
            <section.icon className="size-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium">{section.title}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {section.fields.map(field => (
              <div key={field.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-muted-foreground">{field.label}</span>
                <span className="font-medium text-right font-mono text-2sm">{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-border bg-card overflow-hidden mb-4 shadow-none">
        <div className="border-b border-border px-5 py-4 flex items-start gap-3">
          <Bot className="size-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium">Pulse Intelligence agents</h3>
            <p className="text-sm text-muted-foreground mt-0.5">AI augments decisions — bounded contexts own state.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {PULSE_AI_AGENTS.map(agent => (
            <div key={agent.id} className="px-5 py-4 flex gap-3">
              <LottieIcon name="robot" size={40} />
              <div>
                <p className="font-medium text-sm">{agent.label}</p>
                <p className="text-2sm text-muted-foreground mt-0.5">{agent.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
