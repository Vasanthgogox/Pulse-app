import { useLocalSearchParams } from 'expo-router';
import { SupplierDetailScreen } from '@/features/suppliers';
import { useSafeBack } from '@/lib/useSafeBack';

export default function SupplierDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';

  return (
    <SupplierDetailScreen
      supplierId={supplierId}
      onBack={safeBack}
    />
  );
}
