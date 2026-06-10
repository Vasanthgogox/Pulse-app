/**
 * Client profile hero — Metronic hex layout (mirrors NetworkDesktopHubHero).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { formatClientPhoneDisplay } from "@/features/clients/utils/clientManagement.util";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { BadgeCheck, Building2, Mail, MapPin, Phone, ArrowLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  client: ClientRow;
  locationLabel?: string | null;
  kycScore: number;
  onBack?: () => void;
};

function StatusPill({ label, tone }: { label: string; tone?: "green" | "muted" | "warn" }) {
  const bg =
    tone === "green" ? "#E8FFF3" : tone === "warn" ? "#FFF8DD" : "#F1F1F4";
  const text =
    tone === "green" ? "#50CD89" : tone === "warn" ? "#F6C000" : METRONIC.subtle;
  return (
    <View style={[styles.subscribedPill, { backgroundColor: bg }]}>
      <Text style={[styles.subscribedPillText, { color: text }]}>{label}</Text>
    </View>
  );
}

export function ClientProfileHubHero({
  client,
  locationLabel,
  kycScore,
  onBack,
}: Props) {
  const displayName = client.name?.trim() || "Client";
  const contactPerson = client.contact_person?.trim();
  const gstin = client.gstin?.trim();
  const pan = client.pan_number?.trim();
  const industry = (client as { industry?: string | null }).industry?.trim();
  const status = (client as { client_status?: string | null }).client_status ?? "customer";
  const inApp = client.is_integrated;
  const phoneDisplay = formatClientPhoneDisplay(client.phone);
  const phoneLine = phoneDisplay !== "—" ? phoneDisplay : null;

  return (
    <View style={styles.hero}>
      <View style={styles.heroHexOverlay} />
      {onBack ? (
        <Pressable
          style={cpStyles.heroBackCorner}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={16} color={METRONIC.text} strokeWidth={2.2} />
          <Text style={cpStyles.heroBackText}>Back</Text>
        </Pressable>
      ) : null}
      <View style={styles.heroInner}>
        <View style={[styles.heroCenter, cpStyles.heroCompactCenter]}>
          <View style={styles.heroAvatarRing}>
            <PartyAvatar
              entityType="client"
              name={displayName}
              avatarUrl={client.avatar_url}
              avatarSeed={client.avatar_seed}
              size={88}
            />
            {inApp ? (
              <View style={cpStyles.heroVerifiedBadge}>
                <BadgeCheck size={16} color={Theme.cardWhite} strokeWidth={2.2} />
              </View>
            ) : null}
          </View>

          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{displayName.toUpperCase()}</Text>
            {inApp ? (
              <BadgeCheck size={20} color={METRONIC.link} strokeWidth={2.2} />
            ) : null}
          </View>

          <View style={styles.heroMetaRow}>
            {industry ? (
              <View style={styles.heroMetaItem}>
                <Building2 size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>{industry}</Text>
              </View>
            ) : null}
            {locationLabel ? (
              <View style={styles.heroMetaItem}>
                <MapPin size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>{locationLabel}</Text>
              </View>
            ) : null}
            {client.email ? (
              <View style={styles.heroMetaItem}>
                <Mail size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  {client.email}
                </Text>
              </View>
            ) : null}
          </View>

          {contactPerson ? (
            <Text style={cpStyles.heroSubline}>{contactPerson}</Text>
          ) : null}

          <View style={cpStyles.heroTagRow}>
            <StatusPill label="CLIENT" />
            <StatusPill
              label={inApp ? "INTEGRATED" : "NOT IN APP"}
              tone={inApp ? "green" : "muted"}
            />
            <StatusPill label={status.toUpperCase()} tone="warn" />
            <StatusPill label={`KYC ${kycScore}%`} tone={kycScore >= 80 ? "green" : "warn"} />
          </View>

          {(gstin || pan || phoneLine) ? (
            <View style={styles.heroMetaRow}>
              {gstin ? (
                <Text style={styles.heroMetaText}>GSTIN {gstin}</Text>
              ) : null}
              {pan ? (
                <Text style={styles.heroMetaText}>PAN {pan}</Text>
              ) : null}
              {phoneLine ? (
                <View style={styles.heroMetaItem}>
                  <Phone size={14} color={METRONIC.subtle} strokeWidth={2} />
                  <Text style={styles.heroMetaText}>{phoneLine}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
