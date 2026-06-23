# Code Patterns

Copy these exactly — do not invent new styles.

## Service
```ts
// features/[domain]/services/[name].service.ts
import { supabase } from '@/lib/supabase';

export async function getThings(orgId: string): Promise<{ error: string | null; things: ThingRow[] }> {
  const { data, error } = await supabase()
    .from('things')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, things: [] };
  return { error: null, things: data ?? [] };
}
```

## Query Hook
```ts
// lib/queries/useThingsQuery.ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getThings } from '@/features/things/services/things.service';

export function useThingsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.things.list(orgId!),
    queryFn: () => getThings(orgId!),
    enabled: !!orgId,
    select: (res) => res.things,
  });
}
```

## Mutation (add/update)
```ts
const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: (data: CreateThingInput) => createThing(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.things.all(orgId) });
  },
});
```

## Screen (tab screen)
```ts
// app/(tabs)/things.tsx
import { useOrganization } from '@/contexts/OrganizationContext';
import { useThingsQuery } from '@/lib/queries/useThingsQuery';

export default function ThingsScreen() {
  const { currentOrganization } = useOrganization();
  const { data: things, isLoading } = useThingsQuery(currentOrganization?.id ?? null);

  if (isLoading) return <LoadingSpinner />;
  return <ThingsList things={things ?? []} />;
}
```

## Query Key (add to lib/queryKeys.ts)
```ts
things: {
  all: (orgId: string) => ['things', orgId] as const,
  list: (orgId: string) => ['things', orgId, 'list'] as const,
  detail: (id: string) => ['things', id] as const,
},
```

## Realtime Invalidation
```ts
useEffect(() => {
  const channel = supabase()
    .channel(`things:${orgId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'things', filter: `organization_id=eq.${orgId}` },
      () => queryClient.invalidateQueries({ queryKey: queryKeys.things.all(orgId) })
    )
    .subscribe();

  return () => { supabase().removeChannel(channel); };
}, [orgId, queryClient]);
```
