/**
 * Org profile inside the workspace flex-card — same chrome as Account / KYC.
 */
import { WorkspaceDetailLayout } from '@/features/organization/components/workspace/WorkspaceDetailLayout';
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
  type WorkspacePanelId,
} from '@/features/organization/components/workspace/workspacePanelTypes';
import { useOrganization } from '@/contexts/OrganizationContext';
import ProfileScreen from '@/features/organization/screens/ProfileScreen';

type Props = {
  onBack: () => void;
  onOpenPanel: (panel: WorkspacePanelId) => void;
};

export function WorkspaceProfilePanel({ onBack, onOpenPanel }: Props) {
  const { currentOrganization } = useOrganization();
  const orgName = (currentOrganization?.name ?? '').trim();

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.profile}
      subtitle={orgName || WORKSPACE_PANEL_SUBTITLES.profile}
      onBack={onBack}
      fillBody
      flushBody
      contentMaxWidth={720}
    >
      <ProfileScreen
        embedded
        onClose={onBack}
        onOpenAccount={() => onOpenPanel('account')}
      />
    </WorkspaceDetailLayout>
  );
}
