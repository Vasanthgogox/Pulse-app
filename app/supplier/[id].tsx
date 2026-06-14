import { SupplierProfileScreen } from '@/features/suppliers/components/SupplierProfileScreen';
import { useSafeBack } from '@/lib/useSafeBack';
import { useLocalSearchParams } from 'expo-router';

export default function SupplierDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';
  return <SupplierProfileScreen supplierId={supplierId} onBack={safeBack} />;
}
