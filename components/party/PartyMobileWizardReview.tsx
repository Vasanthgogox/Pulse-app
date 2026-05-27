import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

export interface PartyMobileWizardReviewProps {
  onBackToEdit: () => void;
  summaryContent: ReactNode;
  footerExtra?: ReactNode;
  reviewSaveLabel: string;
  submitting: boolean;
  organizationId: string | null;
  onConfirm: () => void;
}

export const PartyMobileWizardReview = memo(function PartyMobileWizardReview({
  onBackToEdit,
  summaryContent,
  footerExtra,
  reviewSaveLabel,
  submitting,
  organizationId,
  onConfirm,
}: PartyMobileWizardReviewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.reviewRoot,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.reviewHeader}>
        <Pressable style={styles.backBtn} onPress={onBackToEdit} hitSlop={12}>
          <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.reviewTitle}>Review</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.reviewScroll}
        keyboardShouldPersistTaps="handled"
      >
        {summaryContent}
      </ScrollView>
      {footerExtra}
      <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={{ paddingVertical: 8 }} onPress={onBackToEdit}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: Theme.textMuted }}>
            ← Edit details
          </Text>
        </Pressable>
        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#0f172a",
            paddingVertical: 14,
            borderRadius: 14,
            opacity: !organizationId || submitting ? 0.45 : 1,
          }}
          onPress={onConfirm}
          disabled={!organizationId || submitting}
          testID="party-save-btn"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Check size={22} color="#fff" strokeWidth={2.8} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#fff",
                  letterSpacing: 0.75,
                }}
              >
                {reviewSaveLabel}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
});
