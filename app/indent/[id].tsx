import { useLocalSearchParams } from 'expo-router';
import { IndentDetailScreen } from '@/features/indents';
import { useSafeBack } from '@/lib/useSafeBack';

export default function IndentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const indentId = typeof id === 'string' ? id : id?.[0] ?? '';

  return <IndentDetailScreen indentId={indentId} onBack={safeBack} />;
}
