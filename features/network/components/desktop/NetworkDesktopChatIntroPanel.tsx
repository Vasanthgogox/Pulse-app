/**
 * Chat tab — integrated partners list (main pane while flex chat card is open).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { NetworkChatPartner } from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";
import { NetworkHubGlassBadge } from "@/features/network/components/NetworkHubGlassBadge";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { MessageCircle } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const INTEGRATED_PILL = {
  label: "INTEGRATED" as const,
  backgroundColor: Theme.networkBadgeIntegratedBg,
  gradientTop: Theme.networkBadgeIntegratedGradientTop,
  color: Theme.networkBadgeIntegratedText,
  borderColor: Theme.networkBadgeIntegratedBorder,
  highlightColor: Theme.networkBadgeIntegratedHighlight,
};

type Props = {
  partners: NetworkChatPartner[];
  selectedOrgId: string | null;
  onSelectPartner: (orgId: string) => void;
};

export function NetworkDesktopChatIntroPanel({
  partners,
  selectedOrgId,
  onSelectPartner,
}: Props) {
  if (partners.length === 0) {
    return (
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Integrated chat</Text>
        <Text style={styles.sectionSub}>
          No integrated partners yet. Connect with organisations on Pulse from Your
          connections — only integrated parties can use workspace chat.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.sectionToolbar}>
        <View>
          <Text style={styles.sectionTitle}>Integrated partners</Text>
          <Text style={styles.sectionSub}>
            {partners.length} on Pulse · select a partner to chat in the panel
          </Text>
        </View>
      </View>

      <View style={introStyles.grid}>
        {partners.map((partner) => {
          const active = partner.orgId === selectedOrgId;
          return (
            <Pressable
              key={partner.orgId}
              onPress={() => onSelectPartner(partner.orgId)}
              style={[introStyles.card, active && introStyles.cardActive]}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${partner.name}`}
            >
              <View style={introStyles.badgeWrap}>
                <NetworkHubGlassBadge pill={INTEGRATED_PILL} size="compact" />
              </View>
              <PartyAvatar
                name={partner.name}
                avatarUrl={partner.logoUrl}
                avatarSeed={partner.avatarSeed}
                entityType="client"
                size={48}
              />
              <Text style={introStyles.name} numberOfLines={2}>
                {partner.name}
              </Text>
              {partner.role ? (
                <Text style={introStyles.role}>{partner.role}</Text>
              ) : null}
              <View style={introStyles.chatBtn}>
                <MessageCircle size={12} color={Theme.primary} />
                <Text style={introStyles.chatBtnText}>
                  {active ? "Chatting" : "Open chat"}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const introStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexBasis: "23%",
    minWidth: 160,
    maxWidth: 220,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    gap: 6,
    position: "relative",
  },
  cardActive: {
    borderColor: METRONIC.link,
    backgroundColor: "#EEF6FF",
  },
  badgeWrap: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    textAlign: "center",
  },
  role: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: METRONIC.muted,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  chatBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
});
