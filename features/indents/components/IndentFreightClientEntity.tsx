import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import { useIndentClientEntityAvatar } from "@/features/indents/hooks/useIndentClientEntityAvatar";

const AVATAR_SIZE = 28;

export type IndentFreightClientEntityProps = {
  label?: string;
  displayName: string;
  /** Full name for avatar initials / photo resolution (defaults to `displayName`). */
  avatarName?: string;
  clientId?: string | null;
  ownerOrgId: string | null;
  shipperOrgId: string | null | undefined;
  isOwner: boolean;
  align?: "left" | "right";
  nameLines?: number;
  style?: StyleProp<ViewStyle>;
  /** `light` for white review-hub cards; `dark` for navy freight hero strips. */
  surface?: "light" | "dark";
  /** Hide the entity sub-label when the parent row already shows a section title. */
  hideLabel?: boolean;
};

export const IndentFreightClientEntity = memo(function IndentFreightClientEntity({
  label = "CLIENT ENTITY",
  displayName,
  avatarName,
  clientId,
  ownerOrgId,
  shipperOrgId,
  isOwner,
  align = "left",
  nameLines = 1,
  style,
  surface = "light",
  hideLabel = false,
}: IndentFreightClientEntityProps) {
  const router = useRouter();
  const { fields, canOpenPublicProfile, publicProfileClientId } =
    useIndentClientEntityAvatar({
      clientId,
      ownerOrgId,
      shipperOrgId,
      isOwner,
      enabled: true,
    });

  const isRight = align === "right";
  const onLight = surface === "light";
  const resolvedAvatarName = (avatarName ?? displayName).trim() || displayName;

  const openProfile = () => {
    if (!canOpenPublicProfile || !publicProfileClientId) return;
    router.push(`/public-profile/client/${publicProfileClientId}`);
  };

  const avatar = (
    <PartyAvatar
      name={resolvedAvatarName}
      avatarUrl={fields.avatarUrl}
      avatarSeed={fields.avatarSeed}
      organizationImageUrl={fields.organizationImageUrl}
      organizationAvatarSeed={fields.organizationAvatarSeed}
      entityType="client"
      size={AVATAR_SIZE}
      initialsColorSeed={
        publicProfileClientId ?? shipperOrgId ?? resolvedAvatarName
      }
    />
  );

  return (
    <View
      style={[
        styles.root,
        isRight && styles.rootRight,
        style,
      ]}
    >
      {!hideLabel ? (
        <Text
          style={[
            onLight ? styles.labelLight : styles.labelDark,
            isRight && styles.labelRight,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.nameRow,
          isRight ? styles.nameRowRight : styles.nameRowLeft,
          hideLabel && styles.nameRowNoLabel,
        ]}
      >
        {canOpenPublicProfile ? (
          <Pressable
            onPress={openProfile}
            style={({ pressed }) => [
              styles.avatarPress,
              pressed && styles.avatarPressPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`View public profile for ${displayName}`}
            hitSlop={6}
          >
            {avatar}
          </Pressable>
        ) : (
          <View style={styles.avatarPress}>{avatar}</View>
        )}
        <Text
          style={[
            onLight ? styles.nameLight : styles.nameDark,
            isRight && styles.nameRight,
          ]}
          numberOfLines={nameLines}
        >
          {displayName}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  rootRight: {
    alignItems: "flex-end",
  },
  labelDark: {
    ...indentReviewHubText.freightGridLabelDark,
    marginBottom: 4,
  },
  labelLight: indentReviewHubText.freightGridLabelLight,
  labelRight: {
    textAlign: "right",
  },
  nameRow: {
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  nameRowNoLabel: {
    marginTop: 0,
  },
  nameRowLeft: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  nameRowRight: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  avatarPress: {
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  avatarPressPressed: {
    opacity: 0.88,
  },
  nameDark: {
    ...indentReviewHubText.freightGridValueDark,
    flex: 1,
    minWidth: 0,
  },
  nameLight: {
    ...indentReviewHubText.freightGridValueLight,
    flex: 1,
    minWidth: 0,
  },
  nameRight: {
    textAlign: "right",
  },
});
