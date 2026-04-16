import { useLocalSearchParams } from 'expo-router';
import { SupplierDetailScreen } from '@/features/suppliers';
import { useSafeBack } from '@/lib/useSafeBack';

export default function SupplierDetailRoute() {
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';
  const autoOpenProfile = profile === '1';

  return (
    <SupplierDetailScreen
      supplierId={supplierId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
    />
  );
}
