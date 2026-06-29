import { Users, ShieldCheck, BarChart3 } from 'lucide-react';
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
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select an organisation to begin</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="compliance" className="flex h-full flex-col overflow-hidden">
      {/* Tab nav */}
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

      {/* Tab 1 — Profile & Compliance: preserve original 35/65 split */}
      <TabsContent value="compliance" className="flex-1 overflow-hidden !mt-0">
        <div className="flex h-full overflow-hidden">
          {/* Left 35%: business profile */}
          <div className="flex w-[35%] shrink-0 flex-col overflow-hidden border-r border-border">
            <BusinessProfilePanel />
          </div>
          {/* Right 65%: document viewport */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <DocumentViewportPanel />
          </div>
        </div>
      </TabsContent>

      {/* Tab 2 — Team Members */}
      <TabsContent value="team" className="flex-1 overflow-hidden !mt-0">
        <TeamMembersTab />
      </TabsContent>

      {/* Tab 3 — Usage & Governance */}
      <TabsContent value="usage" className="flex-1 overflow-auto !mt-0">
        <UsageGovernanceTab />
      </TabsContent>
    </Tabs>
  );
}
