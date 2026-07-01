/**
 * Compact profile chrome — public-preview hero layout with optional chat action.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  NetworkProfileInviteHero,
  NetworkProfileInviteStats,
} from "@/features/network/components/NetworkProfileInviteHero";
import { networkProfileInviteStyles as inviteS } from "@/features/network/components/networkProfileInvite.styles";
import { publicProfileMobileStyles as mobileS } from "@/features/party/components/publicProfileMobile.styles";
import type { PublicProfileEntity } from "@/features/public-profile/types";
import { vehicleToPublicEntity } from "@/features/public-profile/mappers";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  partyAccentFromConnectionRole,
  type PartyRoleLabel,
} from "@/lib/partyEntityAccent";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type PartyProfileChromeModel = {
  name: string;
  subtitle: string;
  roleLabel: PartyRoleLabel;
  entityType: PartyEntityType;
  linkLabel: string;
  linkLive?: boolean;
  ratingDisplay: string;
  ratingEmpty?: boolean;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  showVerified?: boolean;
  metaChips?: { label: string }[];
  metrics: PublicProfileEntity["metrics"];
};

function entityTypeToRole(entityType: PublicProfileEntity["entityType"]): PartyRoleLabel {
  if (entityType === "supplier") return "SUPPLIER";
  if (entityType === "driver") return "DRIVER";
  return "CLIENT";
}

function ratingFromMetrics(metrics: PublicProfileEntity["metrics"]): {
  display: string;
  empty: boolean;
} {
  const ratingMetric = metrics.find(
    (m) =>
      m.suffix === "★" ||
      /rating/i.test(m.label) ||
      /trust/i.test(m.label),
  );
  if (!ratingMetric) return { display: "No rating", empty: true };
  const raw = (ratingMetric.value ?? "").trim();
  if (!raw || raw === "—") return { display: "No rating", empty: true };
  const suffix = ratingMetric.suffix ?? "";
  return {
    display: suffix ? `${raw}${suffix}` : raw,
    empty: false,
  };
}

export function publicEntityToChromeModel(entity: PublicProfileEntity): PartyProfileChromeModel {
  const roleLabel = entityTypeToRole(entity.entityType);
  const { display, empty } = ratingFromMetrics(entity.metrics);
  const linkLabel = entity.isIntegrated
    ? `ON PLATFORM ${entity.metrics[0]?.value ?? ""}`.trim()
    : "PUBLIC";

  return {
    name: entity.name,
    subtitle:
      entity.facts.find((f) => f.icon === "location")?.value?.trim() ||
      entity.subtitle?.trim() ||
      "",
    roleLabel,
    entityType: entity.entityType,
    linkLabel,
    linkLive: entity.isIntegrated,
    ratingDisplay: display,
    ratingEmpty: empty,
    avatarUrl: entity.avatarUrl,
    avatarSeed: entity.avatarSeed,
    showVerified: entity.isVerified,
    metaChips: entity.isIntegrated ? [{ label: "Verified partner" }] : [],
    metrics: entity.metrics,
  };
}

export function vehicleToChromeModel(v: VehicleRow, tripCount: number): PartyProfileChromeModel {
  const entity = vehicleToPublicEntity(v, tripCount);
  return {
    ...publicEntityToChromeModel(entity),
    roleLabel: "VEHICLE",
    entityType: "vehicle",
    name: entity.name,
    subtitle: entity.subtitle ?? "",
    linkLabel: `FLEET ${entity.metrics[2]?.value ?? "ACTIVE"}`,
  };
}

type Props = {
  model: PartyProfileChromeModel;
  onBack?: () => void;
  chatAction?: ReactNode;
};

export function PartyProfileCompactChrome({ model, onBack, chatAction }: Props) {
  const accent = partyAccentFromConnectionRole(model.roleLabel);
  const statItems = model.metrics.map((m) => ({
    label: m.label.toUpperCase(),
    value: `${m.value}${m.suffix ?? ""}`,
    live: m.tint === "positive",
  }));

  return (
    <View style={[styles.shell, mobileS.heroShell]}>
      <View style={[styles.topBar, mobileS.heroTopBar]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={[styles.chipBtn, mobileS.heroChipBtn]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <FontAwesome name="chevron-left" size={16} color={Theme.textPrimaryDark} />
          </Pressable>
        ) : (
          <View style={styles.chipBtnSpacer} />
        )}
        {chatAction ? <View style={styles.chatSlot}>{chatAction}</View> : null}
      </View>

      <View style={[styles.cardWrap, { borderColor: accent.ring }, mobileS.heroCardWrap]}>
        <NetworkProfileInviteHero
          name={model.name}
          subtitle={model.subtitle}
          roleLabel={model.roleLabel}
          linkLabel={model.linkLabel}
          linkLive={model.linkLive}
          ratingDisplay={model.ratingDisplay}
          ratingEmpty={model.ratingEmpty}
          entityType={model.entityType}
          avatarUrl={model.avatarUrl}
          avatarSeed={model.avatarSeed}
          showVerified={model.showVerified}
          metaChips={model.metaChips}
          avatarSize={68}
          compact
          style={inviteS.card}
          footer={<NetworkProfileInviteStats items={statItems} compact />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  chipBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  chipBtnSpacer: {
    width: 40,
    height: 40,
  },
  chatSlot: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: {
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
  },
});
