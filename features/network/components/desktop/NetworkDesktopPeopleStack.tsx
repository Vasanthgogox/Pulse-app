/**
 * Overlapping party avatars for Projects table People column (Metronic facepile).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ProjectPersonFace } from "@/features/network/utils/networkProjectPeople.util";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

const FACE_SIZE = 26;
const MAX_VISIBLE = 3;

type Props = {
  faces: ProjectPersonFace[];
  overflow: number;
  total: number;
};

export function NetworkDesktopPeopleStack({ faces, overflow, total }: Props) {
  const overlap = 9;
  const visible = faces.slice(0, MAX_VISIBLE);
  const slotCount = visible.length + (overflow > 0 ? 1 : 0);
  const stackWidth =
    slotCount > 0 ? FACE_SIZE + Math.max(0, slotCount - 1) * (FACE_SIZE - overlap) : 0;

  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        stack: {
          flexDirection: "row",
          alignItems: "center",
          height: FACE_SIZE,
          minWidth: stackWidth,
        },
        faceSlot: {
          width: FACE_SIZE,
          height: FACE_SIZE,
        },
        faceSlotOverlap: {
          marginLeft: -overlap,
        },
        faceWrap: {
          width: FACE_SIZE,
          height: FACE_SIZE,
          borderRadius: FACE_SIZE / 2,
          borderWidth: 2,
          borderColor: Theme.cardWhite,
          backgroundColor: METRONIC.border,
          overflow: "hidden",
        },
      }),
    [stackWidth],
  );

  if (total <= 0) {
    return <Text style={styles.projectsPeopleEmpty}>—</Text>;
  }

  return (
    <View style={dynamic.stack}>
      {visible.map((face, index) => (
        <View
          key={face.id}
          style={[
            dynamic.faceSlot,
            index > 0 && dynamic.faceSlotOverlap,
            { zIndex: index + 1 },
          ]}
        >
          <View style={dynamic.faceWrap}>
            <PartyAvatar
              name={face.name}
              entityType={face.entityType}
              avatarUrl={face.avatar_url}
              avatarSeed={face.avatar_seed}
              initialsColorSeed={face.id}
              size={FACE_SIZE}
            />
          </View>
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            dynamic.faceSlot,
            visible.length > 0 && dynamic.faceSlotOverlap,
            { zIndex: visible.length + 1 },
          ]}
        >
          <View style={[dynamic.faceWrap, styles.peopleMoreFill]}>
            <Text style={styles.peopleMoreText}>+{overflow}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
