import { useLocalSearchParams, useRouter } from 'expo-router';
import { IndentDetailScreen } from '@/features/indents';
import { useSafeBack } from '@/lib/useSafeBack';

export default function IndentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const indentId = typeof id === 'string' ? id : id?.[0] ?? '';

  return (
    <IndentDetailScreen
      indentId={indentId}
      onBack={safeBack}
      onEditPress={(indent) =>
        router.push(
          `/create-indent?draftId=${encodeURIComponent(indent.id)}` as import('expo-router').Href
        )
      }
    />
  );
}
