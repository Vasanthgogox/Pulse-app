import SupplierDetailScreen from '@/features/suppliers/components/SupplierDetailScreen';
import { useSafeBack } from '@/lib/useSafeBack';
import { useLocalSearchParams } from 'expo-router';

type DetailSubTab = 'trips' | 'cash';

function parseDetailSubTab(raw: string | undefined): DetailSubTab | undefined {
  if (raw === 'trips' || raw === 'cash') return raw;
  return undefined;
}

export default function SupplierDetailRoute() {
  const { id, tab, profile } = useLocalSearchParams<{
    id: string;
    tab?: string;
    profile?: string;
  }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';
  const tabRaw = typeof tab === 'string' ? tab : tab?.[0];
  const autoOpenProfile = profile === '1';

  return (
    <SupplierDetailScreen
      supplierId={supplierId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
      initialDetailSubTab={parseDetailSubTab(tabRaw)}
    />
  );
}
