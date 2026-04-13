/**
 * Supabase Realtime subscriptions for transactions (ledger). Call onInvalidate when data changes (refetch once).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

function uniqueTopic(base: string) {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}

/** Subscribe to transactions for an organization; call onInvalidate when any change (refetch once). */
export function useRealtimeTransactions(organizationId: string | null, onInvalidate: () => void) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(uniqueTopic(`transactions:${organizationId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          onInvalidateRef.current();
        }
      )
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [organizationId]);
}
