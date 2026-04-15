/**
 * Load Board — full-page screen (root level). Trip Exchange, GIVE LOAD | GET LOAD, indents, CREATE INDENT.
 */
import { useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { LoadBoardModal } from '@/components/LoadBoardModal';
import { useSafeBack } from '@/lib/useSafeBack';

export default function LoadBoardFullScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { currentOrganization } = useOrganization();

  const handleSyncNodes = () => {
    safeBack();
    setTimeout(() => router.push('/(tabs)/network'), 100);
  };

  return (
    <LoadBoardModal
      visible
      asScreen
      onClose={safeBack}
      organizationId={currentOrganization?.id ?? null}
      onSyncNodesPress={handleSyncNodes}
      onCreateIndentPress={() => router.push('/create-indent' as import('expo-router').Href)}
      onIndentPress={(indent) => router.push(`/indent/${indent.id}` as import('expo-router').Href)}
    />
  );
}
