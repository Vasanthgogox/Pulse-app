import type { ConnectionRequestRow } from '@/services/connectionRequestsService';

export type InboundPartnerDisplay = {
  organizationName: string;
  contactPerson: string;
  phone: string;
  avatarUrl?: string;
  avatarSeed?: string;
  /** Partner org owner (from SECURITY DEFINER batch RPC; not readable via RLS SELECT). */
  ownerId?: string;
};

export type InboundProtocolInviteItem = {
  id: string;
  name: string;
  /** Secondary line (phone, duplicate-contact hint). */
  subtitle?: string;
  type: string;
  partnerOrgId: string;
  /** Owner of the partner org — used to collapse duplicate-contact invites. */
  partnerOwnerId?: string;
  /** All pending request ids for this contact (recall withdraws every row). */
  linkedRequestIds?: string[];
  avatarUri: string | null;
  createdAt: string;
};

export type InboundProtocolSnapshot = {
  connectionRequestsReceived: ConnectionRequestRow[];
  connectionRequestsSent: ConnectionRequestRow[];
  partnerDisplayByOrgId: Record<string, InboundPartnerDisplay>;
  partnerAvatarUriByOrgId: Record<string, string | null>;
  partnerOwnerIdByOrgId: Record<string, string>;
};
