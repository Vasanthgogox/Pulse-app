import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { createContext, useContext } from 'react';

// Context + hooks only — no Provider. The Provider (and the modal UI it renders)
// lives in BusinessConnectionRequestModalContext.tsx, which drags the network +
// indents features into any importer's graph. Hook-only consumers (e.g. the root
// tab bar, mounted from app/_layout.tsx) must import from this file so the root
// startup graph stays free of feature code — see scripts/find-startup-graph-offenders.mjs.

export type BusinessConnectionRequestModalContextValue = {
  pendingConnectionCount: number;
  pendingConnectionInvites: InboundProtocolInviteItem[];
  presentPendingConnectionRequest: () => void;
  /** Opens the full invite sheet for a specific connection request (e.g. list avatar tap). */
  presentConnectionInvite: (item: InboundProtocolInviteItem) => void;
  refreshConnectionRequests: () => Promise<void>;
};

export const BusinessConnectionRequestModalContext =
  createContext<BusinessConnectionRequestModalContextValue | null>(null);

export function useOptionalBusinessConnectionRequestModal(): BusinessConnectionRequestModalContextValue | null {
  return useContext(BusinessConnectionRequestModalContext);
}

export function useBusinessConnectionRequestModal(): BusinessConnectionRequestModalContextValue {
  const ctx = useContext(BusinessConnectionRequestModalContext);
  if (!ctx) {
    throw new Error(
      'useBusinessConnectionRequestModal must be used within BusinessConnectionRequestModalProvider',
    );
  }
  return ctx;
}
