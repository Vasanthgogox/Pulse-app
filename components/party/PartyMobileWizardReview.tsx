import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

const REVIEW_CONFIRMATION_ANIMATION = require("@/assets/Animated folder/note-saved.json");

export interface PartyMobileWizardReviewProps {
  onBackToEdit: () => void;
  summaryContent: ReactNode;
  footerExtra?: ReactNode;
  reviewSaveLabel: string;
  submitting: boolean;
  organizationId: string | null;
  onConfirm: () => void;
  title?: string;
  message?: string;
}

export const PartyMobileWizardReview = memo(function PartyMobileWizardReview({
  onBackToEdit,
  summaryContent,
  footerExtra,
  reviewSaveLabel,
  submitting,
  organizationId,
  onConfirm,
  title = "Confirm details",
  message = "Review the summary below, then save to add this record to your organization.",
}: PartyMobileWizardReviewProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const summaryMaxHeight = Math.min(300, Math.round(windowHeight * 0.34));

  return (
    <View
      style={[
        styles.reviewOverlay,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
      ]}
    >
      <View style={styles.reviewCard}>
        <View style={styles.reviewAnimationWrap}>
          <LottieView
            source={REVIEW_CONFIRMATION_ANIMATION}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={styles.reviewAnimation}
          />
        </View>
        <Text style={styles.reviewCardTitle}>{title}</Text>
        <Text style={styles.reviewCardMessage}>{message}</Text>
        <ScrollView
          style={[styles.reviewSummaryScroll, { maxHeight: summaryMaxHeight }]}
          contentContainerStyle={styles.reviewSummaryScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {summaryContent}
        </ScrollView>
        {footerExtra ? (
          <View style={styles.reviewFooterExtra}>{footerExtra}</View>
        ) : null}
        <Pressable
          style={[
            styles.reviewConfirmBtn,
            (!organizationId || submitting) && styles.reviewConfirmBtnDisabled,
          ]}
          onPress={onConfirm}
          disabled={!organizationId || submitting}
          testID="party-save-btn"
        >
          {submitting ? (
            <ActivityIndicator color={Theme.buttonPrimaryText} />
          ) : (
            <Text style={styles.reviewConfirmBtnText}>{reviewSaveLabel}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.reviewEditLink}
          onPress={onBackToEdit}
          hitSlop={8}
          testID="party-edit-details-btn"
        >
          <Text style={styles.reviewEditLinkText}>← Edit details</Text>
        </Pressable>
      </View>
    </View>
  );
});
