/**
 * LinkedIn-style overlapping mutual connection avatars (facepile).
 */
import { EntityAvatar as PartyAvatar } from '@/components/EntityAvatar';
import Theme from "@/constants/Theme";
import { NETWORK_DISCOVER_MUTUAL_FACE_SIZE } from "@/features/network/components/networkDiscoverDossierCard.styles";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const MAX_VISIBLE = 3;

function mutualSeeds(orgId: string, visible: number): string[] {
  return Array.from({ length: visible }, (_, i) => `${orgId}-mutual-${i}`);
}

export type MutualFace = {
  id: string;
  name: string;
  avatar_seed?: string | null;
};

export type MutualAvatarStackProps = {
  orgId: string;
  mutualCount: number;
  /** Resolved mutual orgs — when set, avatars use real names/seeds. */
  mutuals?: MutualFace[];
  onPressFace?: (face: MutualFace, index: number) => void;
  onPressOverflow?: () => void;
  /** When true, show a small caption under the stack. */
  showLabel?: boolean;
  label?: string;
  /** Avatar diameter (default NETWORK_DISCOVER_MUTUAL_FACE_SIZE). */
  faceSize?: number;
  /** Background for +N overflow chip (default dark). */
  overflowColor?: string;
  /** Tighter caption for discover cards. */
  compact?: boolean;
};

export function MutualAvatarStack({
  orgId,
  mutualCount,
  mutuals,
  onPressFace,
  onPressOverflow,
  showLabel = true,
  label,
  faceSize = NETWORK_DISCOVER_MUTUAL_FACE_SIZE,
  overflowColor = Theme.textPrimaryDark,
  compact = false,
}: MutualAvatarStackProps) {
  const visibleFaces = Math.min(MAX_VISIBLE, Math.max(0, mutualCount));
  const overflow = mutualCount > MAX_VISIBLE ? mutualCount - MAX_VISIBLE : 0;
  const resolvedFaces = useMemo(() => {
    if (mutuals?.length) {
      return mutuals.slice(0, visibleFaces);
    }
    return mutualSeeds(orgId, visibleFaces).map((seed, index) => ({
      id: seed,
      name: `Mutual ${index + 1}`,
      avatar_seed: seed,
    }));
  }, [mutuals, orgId, visibleFaces]);

  const overlap = Math.max(6, Math.round(faceSize * 0.34));
  const slotCount = visibleFaces + (overflow > 0 ? 1 : 0);
  const stackWidth =
    slotCount > 0 ? faceSize + Math.max(0, slotCount - 1) * (faceSize - overlap) : faceSize;

  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        stack: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          height: faceSize,
          minWidth: stackWidth,
          alignSelf: "flex-start",
        },
        faceWrap: {
          width: faceSize,
          height: faceSize,
          borderRadius: faceSize / 2,
          borderWidth: 2,
          borderColor: Theme.screenBackground,
          backgroundColor: Theme.surfaceGray,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        faceOverlap: {
          marginLeft: -overlap,
        },
        overflowWrap: {
          backgroundColor: overflowColor,
        },
        overflowText: {
          fontSize: Math.max(8, Math.round(faceSize * 0.36)),
          fontWeight: "800",
          color: Theme.textOnPrimary,
          letterSpacing: -0.2,
        },
      }),
    [faceSize, overlap, overflowColor, stackWidth],
  );

  if (mutualCount <= 0) return null;

  const caption =
    label ??
    `${mutualCount} mutual connection${mutualCount === 1 ? "" : "s"}`;

  const renderFace = (face: MutualFace, index: number) => {
    const inner = (
      <View
        style={[
          dynamic.faceWrap,
          index > 0 && dynamic.faceOverlap,
          { zIndex: index + 1 },
        ]}
      >
        <PartyAvatar
          name={face.name}
          initialsColorSeed={face.id}
          avatarSeed={face.avatar_seed ?? face.id}
          entityType="client"
          size={faceSize}
          borderStyle={styles.faceImage}
          style={styles.faceImage}
        />
      </View>
    );

    if (!onPressFace) {
      return (
        <View key={face.id} style={{ zIndex: index + 1 }}>
          {inner}
        </View>
      );
    }

    return (
      <Pressable
        key={face.id}
        onPress={() => onPressFace(face, index)}
        style={({ pressed }) => [{ zIndex: index + 1 }, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={face.name}
        hitSlop={4}
      >
        {inner}
      </Pressable>
    );
  };

  const overflowChip = overflow > 0 ? (
    onPressOverflow ? (
      <Pressable
        onPress={onPressOverflow}
        style={({ pressed }) => [
          dynamic.faceWrap,
          dynamic.faceOverlap,
          dynamic.overflowWrap,
          { zIndex: MAX_VISIBLE + 1 },
          pressed && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${overflow} more mutual connections`}
        hitSlop={4}
      >
        <Text style={dynamic.overflowText}>+{overflow}</Text>
      </Pressable>
    ) : (
      <View
        style={[
          dynamic.faceWrap,
          dynamic.faceOverlap,
          dynamic.overflowWrap,
          { zIndex: MAX_VISIBLE + 1 },
        ]}
      >
        <Text style={dynamic.overflowText}>+{overflow}</Text>
      </View>
    )
  ) : null;

  return (
    <View
      style={[styles.section, compact && styles.sectionCompact]}
      accessibilityLabel={caption}
      accessibilityRole="text"
    >
      <View style={dynamic.stack}>
        {resolvedFaces.map((face, index) => renderFace(face, index))}
        {overflowChip}
      </View>
      {showLabel ? (
        <Text
          style={[styles.label, compact && styles.labelCompact]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
  },
  sectionCompact: {
    gap: 2,
  },
  faceImage: {
    borderWidth: 0,
    width: "100%",
    height: "100%",
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 12,
    paddingHorizontal: 4,
    maxWidth: "100%",
  },
  labelCompact: {
    fontSize: 8,
    lineHeight: 10,
    color: Theme.textMuted,
  },
});
