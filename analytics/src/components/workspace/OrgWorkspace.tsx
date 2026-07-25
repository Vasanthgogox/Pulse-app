import { Building2, Users, ShieldCheck, BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BusinessProfilePanel } from './BusinessProfilePanel';
import { DocumentViewportPanel } from './DocumentViewportPanel';
import { TeamMembersTab } from './TeamMembersTab';
import { UsageGovernanceTab } from './UsageGovernanceTab';
import { useAdmin } from '@/context/AdminDataProvider';

export function OrgWorkspace() {
  const { selectedApp } = useAdmin();

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">Select an organisation</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Choose an application from the queue to review the business profile, KYC documents, team,
            and usage controls.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="compliance" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4">
        <TabsList variant="line" size="sm" className="gap-0">
          <TabsTrigger value="compliance" className="gap-2">
            <ShieldCheck className="size-3.5" />
            Profile &amp; Compliance
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="size-3.5" />
            Team Members
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {selectedApp.users.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="size-3.5" />
            Usage &amp; Governance
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="compliance" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden !mt-0">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-[36%] min-w-[280px] max-w-[420px] shrink-0 flex-col overflow-hidden border-r border-border">
            <BusinessProfilePanel />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <DocumentViewportPanel />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="team" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden !mt-0">
        <TeamMembersTab />
      </TabsContent>

      <TabsContent value="usage" className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto !mt-0">
        <UsageGovernanceTab />
      </TabsContent>
    </Tabs>
  );
}
