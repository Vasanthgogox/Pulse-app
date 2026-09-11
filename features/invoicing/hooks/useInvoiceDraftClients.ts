import { fetchInvoiceDraftClients } from '@/features/invoicing/services/invoicePreviewClients.service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export function useInvoiceDraftClientsQuery(orgId: string | null, clientIds: string[]) {
  const ids = useMemo(
    () => Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean))).sort(),
    [clientIds],
  );
  const idsKey = ids.join(',');

  return useQuery({
    queryKey: orgId && idsKey
      ? (['q', 'invoicing', 'draft-clients', orgId, idsKey] as const)
      : (['q', 'invoicing', 'draft-clients', 'none'] as const),
    queryFn: () => fetchInvoiceDraftClients(orgId!, ids),
    enabled: Boolean(orgId) && ids.length > 0,
    staleTime: 30_000,
  });
}
