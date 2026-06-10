import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { ArrowLeft, BadgeCheck, Mail, Phone, Shield } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  driver: DriverRow;
  tripCount: number;
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

export function DriverProfileHubHero({ driver, tripCount, onBack }: Props) {
  const displayName = (driver.name ?? "Driver").trim();
  const active = !driver.left_at && driver.status !== "inactive";
  const linked = Boolean(driver.user_id?.trim());

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
              entityType="driver"
              name={displayName}
              avatarUrl={driver.avatar_url}
              avatarSeed={driver.avatar_seed}
              size={88}
            />
            {linked ? (
              <View style={cpStyles.heroVerifiedBadge}>
                <BadgeCheck size={16} color={Theme.cardWhite} strokeWidth={2.2} />
              </View>
            ) : null}
          </View>
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{displayName.toUpperCase()}</Text>
          </View>
          <View style={styles.heroMetaRow}>
            {driver.phone ? (
              <View style={styles.heroMetaItem}>
                <Phone size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>{driver.phone}</Text>
              </View>
            ) : null}
            {driver.email ? (
              <View style={styles.heroMetaItem}>
                <Mail size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  {driver.email}
                </Text>
              </View>
            ) : null}
            {driver.license_number ? (
              <View style={styles.heroMetaItem}>
                <Shield size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>{driver.license_number}</Text>
              </View>
            ) : null}
          </View>
          <View style={cpStyles.heroTagRow}>
            <StatusPill label="DRIVER" />
            <StatusPill
              label={active ? "ACTIVE" : "INACTIVE"}
              tone={active ? "green" : "warn"}
            />
            <StatusPill
              label={linked ? "APP LINKED" : "NOT LINKED"}
              tone={linked ? "green" : "muted"}
            />
            <StatusPill label={`${tripCount} TRIPS`} />
          </View>
          <Text style={cpStyles.heroSubline} numberOfLines={1}>
            {driver.id}
          </Text>
        </View>
      </View>
    </View>
  );
}
