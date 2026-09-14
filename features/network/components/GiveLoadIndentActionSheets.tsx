import Theme from "@/constants/Theme";
import { AwardModal } from "@/features/network/components/AwardModal";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import type { AwardQuoteResult } from "@/features/network/hooks/useAwardQuote";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import type { IndentRow } from "@/features/indents";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

export function GiveLoadIndentActionSheets({
  showSuccess,
  successMsg,
  orgId,
  pulseShareIndent,
  onClosePulseShare,
  onPulseShareSuccess,
  onBoostAfterBroadcast,
  boostSheetVisible,
  boostPostId,
  onCloseBoost,
  onBoosted,
  awardModal,
  onOpenIndent,
  insets,
}: {
  showSuccess: boolean;
  successMsg: string;
  orgId: string | null;
  pulseShareIndent: IndentRow | null;
  onClosePulseShare: () => void;
  onPulseShareSuccess: () => void;
  onBoostAfterBroadcast: (postId: string) => void;
  boostSheetVisible: boolean;
  boostPostId: string | null;
  onCloseBoost: () => void;
  onBoosted: () => void;
  awardModal: AwardQuoteResult;
  onOpenIndent: (indent: IndentRow) => void;
  insets: EdgeInsets;
}) {
  return (
    <Fragment>
      {showSuccess ? (
        <View pointerEvents="none" style={toastStyles.successOverlay}>
          <View style={toastStyles.successCard}>
            <Text style={toastStyles.successTitle}>
              {successMsg || "Success"}
            </Text>
          </View>
        </View>
      ) : null}
      {orgId ? (
        <ShareLoadSheet
          visible={pulseShareIndent != null}
          indent={pulseShareIndent}
          orgId={orgId}
          onClose={onClosePulseShare}
          onSuccess={onPulseShareSuccess}
          onBoostAfterBroadcast={onBoostAfterBroadcast}
        />
      ) : null}
      {orgId && boostPostId ? (
        <BoostSheet
          visible={boostSheetVisible}
          onClose={onCloseBoost}
          orgId={orgId}
          postId={boostPostId}
          onBoosted={onBoosted}
        />
      ) : null}
      <AwardModal
        visible={awardModal.isOpen}
        award={awardModal}
        onViewIndent={onOpenIndent}
        insets={insets}
      />
    </Fragment>
  );
}

const toastStyles = StyleSheet.create({
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  successCard: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  successTitle: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
    fontSize: 14,
  },
});
