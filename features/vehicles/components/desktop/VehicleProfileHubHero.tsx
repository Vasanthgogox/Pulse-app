import { PartyAvatar } from "@/components/PartyAvatar";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { ArrowLeft, Truck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  vehicle: VehicleRow;
  tripCount: number;
  onBack?: () => void;
};

function StatusPill({ label, tone }: { label: string; tone?: "green" | "muted" }) {
  const bg = tone === "green" ? "#E8FFF3" : "#F1F1F4";
  const text = tone === "green" ? "#50CD89" : METRONIC.subtle;
  return (
    <View style={[styles.subscribedPill, { backgroundColor: bg }]}>
      <Text style={[styles.subscribedPillText, { color: text }]}>{label}</Text>
    </View>
  );
}

export function VehicleProfileHubHero({ vehicle, tripCount, onBack }: Props) {
  const displayName = (vehicle.vehicle_number ?? "Vehicle").trim().toUpperCase();
  const active = (vehicle.status ?? "active").toLowerCase() !== "inactive";

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
              entityType="vehicle"
              name={displayName}
              avatarUrl={vehicle.avatar_url}
              avatarSeed={vehicle.avatar_seed}
              size={88}
            />
          </View>
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{displayName}</Text>
            <Truck size={18} color={METRONIC.link} strokeWidth={2} />
          </View>
          <View style={styles.heroMetaRow}>
            {vehicle.vehicle_type ? (
              <Text style={styles.heroMetaText}>{vehicle.vehicle_type}</Text>
            ) : null}
            {vehicle.vehicle_brand ? (
              <Text style={styles.heroMetaText}>
                {[vehicle.vehicle_brand, vehicle.vehicle_model].filter(Boolean).join(" ")}
              </Text>
            ) : null}
          </View>
          <View style={cpStyles.heroTagRow}>
            <StatusPill label="VEHICLE" />
            <StatusPill
              label={active ? "ACTIVE" : "INACTIVE"}
              tone={active ? "green" : "muted"}
            />
            <StatusPill label={vehicle.type === "owned" ? "OWNED" : "PARTNER"} />
            <StatusPill label={`${tripCount} TRIPS`} />
          </View>
        </View>
      </View>
    </View>
  );
}
