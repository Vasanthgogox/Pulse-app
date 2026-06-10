/**
 * Profile hub — floating chat drawer overlay (does not split page content).
 */
import { useOrganization } from "@/contexts/OrganizationContext";
import { NetworkDesktopChatOverlay } from "@/features/network/components/desktop/NetworkDesktopChatOverlay";
import type { NetworkChatPartner } from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";
import type { ReactNode } from "react";
import { View } from "react-native";

type Props = {
  chatOpen: boolean;
  onCloseChat: () => void;
  partner: NetworkChatPartner | null;
  children: ReactNode;
};

export function ProfileHubChatSplitLayout({
  chatOpen,
  onCloseChat,
  partner,
  children,
}: Props) {
  const org = useOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const orgName = org?.currentOrganization?.name?.trim() || "Workspace";

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {children}
      {chatOpen && orgId && partner?.orgId ? (
        <NetworkDesktopChatOverlay
          visible
          orgId={orgId}
          orgName={orgName}
          onClose={onCloseChat}
          integratedPartners={[partner]}
          initialPartnerOrgId={partner.orgId}
          singlePartnerMode
        />
      ) : null}
    </View>
  );
}

export function profileHubChatPartnerFromParty(input: {
  linkedOrgId: string | null | undefined;
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  role?: string;
  isIntegrated: boolean;
}): NetworkChatPartner | null {
  const orgId = input.linkedOrgId?.trim();
  if (!input.isIntegrated || !orgId) return null;
  return {
    orgId,
    name: input.name.trim() || "Partner",
    logoUrl: input.avatarUrl ?? null,
    avatarSeed: input.avatarSeed ?? null,
    role: input.role,
  };
}
