import { PartyAvatar, type PartyEntityType } from "@/components/PartyAvatar";
import { partyDirectoryStyles as styles } from "@/features/party/components/partyDirectory.styles";
import { memo } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";

type Props = {
  entityLabel: string;
  name: string;
  meta: string;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  onPress: () => void;
};

/** Metronic Teams-style party tile for the directory grid. */
export const PartyDirectoryPartyCard = memo(function PartyDirectoryPartyCard({
  entityLabel,
  name,
  meta,
  entityType,
  avatarUrl,
  avatarSeed,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.partyCard,
        pressed && styles.partyCardPressed,
        Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${entityLabel}`}
    >
      <Text style={styles.partyEntityBadge}>{entityLabel}</Text>

      <View style={styles.partyAvatarHalo}>
        <PartyAvatar
          name={name}
          avatarUrl={avatarUrl ?? null}
          avatarSeed={avatarSeed ?? null}
          entityType={entityType}
          size={40}
          shape="circle"
        />
      </View>

      <Text style={styles.partyName} numberOfLines={2}>
        {name}
      </Text>

      <View style={styles.partySectionsWrap}>
        <View style={[styles.partyMetaRow, styles.partyMetaRowLast]}>
          <Text style={styles.partyMetaLabel}>Contact</Text>
          <Text style={styles.partyMetaValue} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>

      <View style={styles.partyViewBtn}>
        <Text style={styles.partyViewBtnText}>View profile</Text>
      </View>
    </Pressable>
  );
});
