import { Modal, Platform, View } from "react-native";

import Theme from "@/constants/Theme";
import PublicProfileScreen from "@/features/public-profile/components/PublicProfileScreen";
import { usePublicProfileEntity } from "@/features/public-profile/hooks/usePublicProfileEntity";
import type { PublicProfileEntityType } from "@/features/public-profile/types";

type Props = {
  visible: boolean;
  entityType: PublicProfileEntityType | null;
  entityId: string | null;
  onClose: () => void;
};

/**
 * Full-screen overlay for party public profiles — used from the Network
 * connections hub so every party type gets the same preview as drivers.
 */
export function PartyPublicProfileModal({
  visible,
  entityType,
  entityId,
  onClose,
}: Props) {
  const { entity, loading, errorMessage } = usePublicProfileEntity(
    visible ? entityType : null,
    visible ? entityId : null,
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType={Platform.OS === "ios" ? "slide" : "fade"}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: Theme.screenBackground }}>
        <PublicProfileScreen
          entity={entity}
          loading={loading}
          errorMessage={errorMessage}
          onBack={onClose}
        />
      </View>
    </Modal>
  );
}
